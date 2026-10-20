import type { LibrarySkill, SkillDetail, SkillDisplayFields } from "../services/types";

/*
 * The public Redrob Console skill catalogue, read by the browser directly. It is static
 * files behind CORS `*` (index.json + one SKILL.md per skill), so listing and previewing
 * a library skill needs no workspace connection; only installing does (the server writes
 * the file into the workspace). Offline catalogue requests surface an error so the UI can
 * distinguish a connection problem from an empty library.
 */

export const CONSOLE_CATALOGUE_BASE_URL = "https://console.redrob.ai/skills";

/** How long the catalogue and the Skills queries keep their data; one value for both. */
export const CATALOGUE_CACHE_MS = 30 * 60_000;

/** Catalogue skills Cowork never lists: not on a shelf, not in Search, not on a skill page. */
export const HIDDEN_CATALOGUE_SKILLS: ReadonlySet<string> = new Set(["caveman", "conducting-research", "eli5", "ponytail"]);

/** One catalogue skill with its instructions and localized marketplace display fields. */
export type ConsoleSkill = SkillDisplayFields & {
  name: string;
  /** Catalogue release version from the SKILL.md frontmatter, when supplied. */
  version?: string;
  description: string;
  /** The SKILL.md instructions, after the frontmatter. */
  body: string;
};

/** A catalogue skill's display fields and version, with absent ones left out rather than undefined. */
export function catalogueDisplay({ title, titleKo, summary, summaryKo, category, categoryKo, step, version }: SkillDisplayFields & { version?: string }): SkillDisplayFields & { version?: string } {
  return {
    ...(title ? { title } : {}),
    ...(titleKo ? { titleKo } : {}),
    ...(summary ? { summary } : {}),
    ...(summaryKo ? { summaryKo } : {}),
    ...(category ? { category } : {}),
    ...(categoryKo ? { categoryKo } : {}),
    ...(step !== undefined ? { step } : {}),
    ...(version ? { version } : {}),
  };
}

/** A `metadata.step` value as a positive whole number, or undefined when absent or malformed. */
function catalogueStep(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const step = Number(value);
  return step > 0 ? step : undefined;
}

/** A catalogue skill as the detail screen reads it: not installed, no tags. */
export function catalogueDetail(skill: ConsoleSkill): SkillDetail {
  return { name: skill.name, description: skill.description, tags: {}, body: skill.body, installed: null, ...catalogueDisplay(skill) };
}

/** Test seams and cache lifetimes for a catalogue instance. */
type CatalogueOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** How long a complete catalogue is served before it is refreshed. */
  ttlMs?: number;
  /** How soon a failed refresh is tried again. */
  failureTtlMs?: number;
  now?: () => number;
};

/** One catalogue read. `ok` is false only when no complete catalogue has ever loaded. */
type Snapshot = { skills: ConsoleSkill[]; expiresAt: number; ok: boolean };

/** A scalar with its outer quotes removed; a doubled `''` inside single quotes is one quote. */
function unquote(value: string): string {
  const trimmed = value.trim();
  const single = trimmed.match(/^'(.*)'$/);
  if (single) return (single[1] ?? "").replace(/''/g, "'");
  return trimmed.replace(/^"(.*)"$/, "$1");
}

/**
 * `key: value` per line; the Console's own reading of its frontmatter. Indented `key: value`
 * lines under a top-level `metadata:` go to `metadata` (where the catalogue keeps its grouping);
 * `#` comment lines are skipped and never end the block.
 */
export function parseConsoleFrontmatter(content: string): { data: Record<string, string>; metadata: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, metadata: {}, body: content };
  const data: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  let inMetadata = false;
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const nested = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.+)$/);
    if (nested) {
      if (inMetadata && nested[1] && nested[2]) metadata[nested[1]] = unquote(nested[2]);
      continue;
    }
    inMetadata = /^metadata:\s*$/.test(line);
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.+)$/);
    if (field?.[1] && field[2]) data[field[1]] = unquote(field[2]);
  }
  return { data, metadata, body: content.slice(match[0].length) };
}

/** A cached reader of the public catalogue; one shared instance serves the app. */
export function createConsoleCatalogue(options: CatalogueOptions = {}) {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl ?? CONSOLE_CATALOGUE_BASE_URL;
  // Matches the Skills queries' gcTime, so a cached page and the catalogue expire together.
  const ttlMs = options.ttlMs ?? CATALOGUE_CACHE_MS;
  const failureTtlMs = options.failureTtlMs ?? 60_000;
  const now = options.now ?? Date.now;
  let snapshot: Snapshot | null = null;
  let inFlight: Promise<Snapshot> | null = null;

  const fetchText = async (path: string): Promise<string> => {
    const response = await fetchImpl(`${baseUrl}/${path}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Catalogue request failed: ${response.status} ${path}`);
    return response.text();
  };

  // A request failure rejects (so the whole refresh fails); a SKILL.md with malformed
  // frontmatter is left out, since retrying cannot fix it and it must not hide the rest.
  const loadSkill = async (name: string): Promise<ConsoleSkill | null> => {
    const { data, metadata, body } = parseConsoleFrontmatter(await fetchText(`${encodeURIComponent(name)}/SKILL.md`));
    if (data.name !== name || !data.description) return null;
    return {
      name,
      description: data.description,
      body: body.trim(),
      ...catalogueDisplay({
        title: data.title,
        titleKo: data.title_ko,
        summary: data.summary,
        summaryKo: data.summary_ko,
        category: metadata.category,
        categoryKo: metadata.category_ko,
        step: catalogueStep(metadata.step),
        version: data.version,
      }),
    };
  };

  // Publishes a catalogue only when every member was read. A failed refresh keeps the last
  // complete catalogue (or reports unavailable) and is retried after the shorter failure TTL.
  const load = async (): Promise<Snapshot> => {
    try {
      const index = JSON.parse(await fetchText("index.json")) as { skills?: Array<{ name?: unknown }> };
      const names = [...new Set((index.skills ?? []).map((skill) => skill.name).filter((name): name is string => typeof name === "string" && !HIDDEN_CATALOGUE_SKILLS.has(name)))];
      const skills = (await Promise.all(names.map(loadSkill))).filter((skill): skill is ConsoleSkill => skill !== null);
      return { skills, expiresAt: now() + ttlMs, ok: true };
    } catch {
      const retryAt = now() + failureTtlMs;
      return snapshot?.ok ? { ...snapshot, expiresAt: retryAt } : { skills: [], expiresAt: retryAt, ok: false };
    }
  };

  const current = async (): Promise<Snapshot> => {
    if (snapshot && now() < snapshot.expiresAt) return snapshot;
    inFlight ??= load().then((next) => {
      snapshot = next;
      inFlight = null;
      return next;
    });
    return inFlight;
  };

  return {
    /** The whole library; rejects when the catalogue cannot be reached. */
    list: async (): Promise<LibrarySkill[]> => {
      const currentSnapshot = await current();
      if (!currentSnapshot.ok) throw new Error("The skill catalogue is not available");
      return currentSnapshot.skills.map(({ name, description, title, titleKo, summary, summaryKo, category, categoryKo, step }) => ({
        name,
        description,
        tags: {},
        ...catalogueDisplay({ title, titleKo, summary, summaryKo, category, categoryKo, step }),
      }));
    },
    /** One library skill with its body, as the detail screen shows it; null when unavailable. */
    get: async (name: string): Promise<SkillDetail | null> => {
      const currentSnapshot = await current();
      if (!currentSnapshot.ok) return null;
      const skill = currentSnapshot.skills.find((item) => item.name === name);
      return skill ? catalogueDetail(skill) : null;
    },
    /** Cached catalogue detail only; never starts network work. */
    peek: (name: string): SkillDetail | null => {
      if (!snapshot?.ok) return null;
      const skill = snapshot.skills.find((item) => item.name === name);
      return skill ? catalogueDetail(skill) : null;
    },
    /** Loads the catalogue in the background so Skills paints from memory; never throws. */
    warm: async (): Promise<void> => {
      await current().catch(() => undefined);
    },
    /** Drops the cache; tests and a manual refresh. */
    reset: () => {
      snapshot = null;
      inFlight = null;
    },
  };
}

/** The app-wide catalogue instance the Cowork services read. */
export const consoleCatalogue = createConsoleCatalogue();
