import type { LibrarySkill, SkillDetail, SkillFilters } from "../services/types";
import { matchesFilters } from "./skills";

/*
 * The public Redrob Console skill catalogue, read by the browser directly. It is static
 * files behind CORS `*` (index.json + one SKILL.md per skill), so listing and previewing
 * a library skill needs no workspace connection; only installing does (the server writes
 * the file into the workspace). Offline means an empty library.
 */

export const CONSOLE_CATALOGUE_BASE_URL = "https://console.redrob.ai/skills";

/** One catalogue skill with its instructions; no profession/task/language in the catalogue. */
export type ConsoleSkill = { name: string; title?: string; description: string; body: string };

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
  const ttlMs = options.ttlMs ?? 10 * 60_000;
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
      return { name, description: data.description, body: body.trim(), ...(data.title ? { title: data.title } : {}) };
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

  const current = async (): Promise<ConsoleSkill[]> => {
    if (snapshot && now() - snapshot.loadedAt < (snapshot.ok ? ttlMs : failureTtlMs)) return snapshot.skills;
    inFlight ??= load().then((next) => {
      snapshot = next;
      inFlight = null;
      return next;
    });
    return (await inFlight).skills;
  };

  return {
    /** The library, filtered; only `q` can match because the catalogue carries no tags. */
    list: async (filters: SkillFilters = {}): Promise<LibrarySkill[]> =>
      (await current())
        .map(({ name, title, description }) => ({ name, description, tags: {}, ...(title ? { title } : {}) }))
        .filter((skill) => matchesFilters(skill, filters)),
    /** One library skill with its body, as the detail screen shows it; null when the catalogue lacks it. */
    get: async (name: string): Promise<SkillDetail | null> => {
      const skill = (await current()).find((item) => item.name === name);
      return skill ? { name, description: skill.description, tags: {}, body: skill.body, installed: null } : null;
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
