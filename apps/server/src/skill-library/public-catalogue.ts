import { z } from "zod";
import { parseFrontmatter } from "../frontmatter.js";
import { externalFetch } from "../server-fetch.js";
import { validateSkillName } from "../validators.js";

/** Base URL of the public Redrob Console skills catalogue (static files, no API). */
export const PUBLIC_CATALOGUE_BASE_URL = "https://console.redrob.ai/skills";

const indexSchema = z.object({
  skills: z.array(
    z.object({
      name: z.string(),
      version: z.string(),
      files: z.array(z.string()).optional(),
    }),
  ),
});

/** One catalogue entry as the Desk library lists it; the catalogue has no profession/task/language. */
export type PublicCatalogueSummary = {
  name: string;
  description: string;
  version: string;
  title?: string;
  titleKo?: string;
  summary?: string;
  summaryKo?: string;
};

/** A catalogue entry with its SKILL.md body and parsed frontmatter, for preview and install. */
export type PublicCatalogueSkill = PublicCatalogueSummary & {
  body: string;
  frontmatter: Record<string, unknown>;
  source: "console";
};

/** The library filter; only `q` applies because the catalogue carries no taxonomy fields. */
export type PublicCatalogueFilter = { q?: string; profession?: string; task?: string; language?: string };

/** Options for a catalogue instance; tests inject `fetchImpl` and `now`. */
export type PublicCatalogueOptions = {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  baseUrl?: string;
  ttlMs?: number;
  failureTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
};

type Snapshot = { skills: PublicCatalogueSkill[]; loadedAt: number; ok: boolean };

/**
 * Parses catalogue frontmatter as YAML, falling back to one `key: value` per line (the Console
 * page's own reading) when a published file is not valid YAML, e.g. an unquoted colon in a value.
 */
export function parseCatalogueFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  try {
    return parseFrontmatter(content);
  } catch {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { data: {}, body: content };
    const data: Record<string, unknown> = {};
    for (const line of (match[1] ?? "").split(/\r?\n/)) {
      const field = line.match(/^([A-Za-z_][\w-]*):\s*(.+)$/);
      if (field?.[1] && field[2]) data[field[1]] = field[2].trim();
    }
    return { data, body: content.slice(match[0].length) };
  }
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Read-only view of the public catalogue with an in-memory TTL cache; offline means an empty library. */
export function createPublicCatalogue(options: PublicCatalogueOptions = {}) {
  const fetchImpl = options.fetchImpl ?? externalFetch;
  const baseUrl = options.baseUrl ?? PUBLIC_CATALOGUE_BASE_URL;
  const ttlMs = options.ttlMs ?? 10 * 60_000;
  const failureTtlMs = options.failureTtlMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? Date.now;
  let snapshot: Snapshot | null = null;
  let inFlight: Promise<Snapshot> | null = null;

  const fetchText = async (path: string): Promise<string> => {
    const response = await fetchImpl(`${baseUrl}/${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Catalogue request failed: ${response.status} ${path}`);
    return response.text();
  };

  // A skill whose SKILL.md cannot be read or parsed is left out rather than shown half-empty.
  const loadSkill = async (name: string, version: string): Promise<PublicCatalogueSkill | null> => {
    try {
      const content = await fetchText(`${encodeURIComponent(name)}/SKILL.md`);
      const { data, body } = parseCatalogueFrontmatter(content);
      return {
        name,
        version,
        description: stringField(data, "description") ?? "",
        title: stringField(data, "title"),
        titleKo: stringField(data, "title_ko"),
        summary: stringField(data, "summary"),
        summaryKo: stringField(data, "summary_ko"),
        body,
        frontmatter: data,
        source: "console",
      };
    } catch {
      return null;
    }
  };

  const load = async (): Promise<Snapshot> => {
    try {
      const index = indexSchema.parse(JSON.parse(await fetchText("index.json")));
      const entries = index.skills.filter((entry) => {
        try {
          validateSkillName(entry.name);
          return true;
        } catch {
          return false;
        }
      });
      const skills = (await Promise.all(entries.map((entry) => loadSkill(entry.name, entry.version)))).filter(
        (skill): skill is PublicCatalogueSkill => skill !== null,
      );
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

  const toSummary = ({ body: _body, frontmatter: _frontmatter, source: _source, ...summary }: PublicCatalogueSkill) => summary;

  return {
    /** Lists the catalogue, narrowed by a case-insensitive `q` over name, title, summary and description. */
    async list(filter: PublicCatalogueFilter = {}): Promise<{ version: string; skills: PublicCatalogueSummary[] }> {
      const { skills, loadedAt, ok } = await current();
      const q = filter.q?.trim().toLowerCase();
      const matched = q
        ? skills.filter((skill) =>
            [skill.name, skill.title, skill.titleKo, skill.summary, skill.summaryKo, skill.description].some(
              (value) => value?.toLowerCase().includes(q),
            ),
          )
        : skills;
      return { version: ok ? String(loadedAt) : "", skills: matched.map(toSummary) };
    },
    /** Returns one catalogue skill with its body, or null when the catalogue does not list it. */
    async get(name: string): Promise<PublicCatalogueSkill | null> {
      const { skills } = await current();
      return skills.find((skill) => skill.name === name) ?? null;
    },
  };
}

/** The process-wide catalogue the server routes read. */
export const publicCatalogue = createPublicCatalogue();
