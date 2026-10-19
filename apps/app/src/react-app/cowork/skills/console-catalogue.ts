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
export function catalogueDisplay({ title, titleKo, summary, summaryKo, version }: SkillDisplayFields & { version?: string }): SkillDisplayFields & { version?: string } {
  return {
    ...(title ? { title } : {}),
    ...(titleKo ? { titleKo } : {}),
    ...(summary ? { summary } : {}),
    ...(summaryKo ? { summaryKo } : {}),
    ...(version ? { version } : {}),
  };
}

/** A catalogue skill as the detail screen reads it: not installed, no tags. */
export function catalogueDetail(skill: ConsoleSkill): SkillDetail {
  return { name: skill.name, description: skill.description, tags: {}, body: skill.body, installed: null, ...catalogueDisplay(skill) };
}

type CatalogueOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  ttlMs?: number;
  failureTtlMs?: number;
  now?: () => number;
};

type Snapshot = { skills: ConsoleSkill[]; loadedAt: number; ok: boolean };

/** `key: value` per line; the Console's own reading of its frontmatter. */
export function parseConsoleFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: content };
  const data: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.+)$/);
    if (field?.[1] && field[2]) data[field[1]] = field[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { data, body: content.slice(match[0].length) };
}

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

  // A skill whose SKILL.md cannot be read is left out rather than shown half-empty.
  const loadSkill = async (name: string): Promise<ConsoleSkill | null> => {
    try {
      const { data, body } = parseConsoleFrontmatter(await fetchText(`${encodeURIComponent(name)}/SKILL.md`));
      if (data.name !== name || !data.description) return null;
      return {
        name,
        description: data.description,
        body: body.trim(),
        ...catalogueDisplay({ title: data.title, titleKo: data.title_ko, summary: data.summary, summaryKo: data.summary_ko, version: data.version }),
      };
    } catch {
      return null;
    }
  };

  const load = async (): Promise<Snapshot> => {
    try {
      const index = JSON.parse(await fetchText("index.json")) as { skills?: Array<{ name?: unknown }> };
      const names = (index.skills ?? []).map((skill) => skill.name).filter((name): name is string => typeof name === "string");
      const skills = (await Promise.all(names.map(loadSkill))).filter((skill): skill is ConsoleSkill => skill !== null);
      return { skills, loadedAt: now(), ok: true };
    } catch {
      return { skills: [], loadedAt: now(), ok: false };
    }
  };

  const current = async (): Promise<Snapshot> => {
    if (snapshot && now() - snapshot.loadedAt < (snapshot.ok ? ttlMs : failureTtlMs)) return snapshot;
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
      return currentSnapshot.skills.map(({ name, description, title, titleKo, summary, summaryKo }) => ({ name, description, tags: {}, ...catalogueDisplay({ title, titleKo, summary, summaryKo }) }));
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
