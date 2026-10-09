import { z } from "zod";

import { ApiError } from "../errors.js";
import { REDROB_CONSOLE_API_BASE_URL } from "../redrob-device.js";
import { externalFetch } from "../server-fetch.js";
import { listSkills, renderSkillDocument, upsertSkill } from "../skills.js";

/*
 * The Redrob Console's default skill library, for the Skills screen.
 *
 * The library is public (no key) and changes only when the Console deploys, so each answer is kept
 * with its ETag and revalidated with If-None-Match. When the Console cannot be reached, or answers
 * with something this server cannot read, the answer comes from snapshot.json: the library as it was
 * when this build was made (scripts/skill-library/build-snapshot.mjs). Filtering the snapshot follows
 * the Console's own rules, so a filter means the same thing either way.
 */

const REQUEST_TIMEOUT_MS = 15_000;

const label = z.object({ en: z.string(), ko: z.string() });

const taxonomySchema = z.object({
  professions: z.array(
    z.object({ id: z.string(), label, tasks: z.array(z.object({ id: z.string(), label })) }),
  ),
  languages: z.array(z.object({ id: z.string(), label })),
});

const summarySchema = z.object({
  name: z.string(),
  description: z.string(),
  profession: z.string(),
  task: z.string(),
  language: z.string(),
  family: z.string(),
  version: z.number(),
});

const listSchema = z.object({ version: z.string(), skills: z.array(summarySchema) });

const detailSchema = summarySchema.extend({ body: z.string(), content: z.string() });

const snapshotSchema = z.object({ version: z.string(), taxonomy: taxonomySchema, skills: z.array(detailSchema) });

export type SkillTaxonomy = z.infer<typeof taxonomySchema>;
export type LibrarySkillSummary = z.infer<typeof summarySchema>;
export type LibrarySkill = z.infer<typeof detailSchema>;
export type SkillLibrarySnapshot = z.infer<typeof snapshotSchema>;

/** Where an answer came from: the Console, or the copy this build ships. */
export type LibrarySource = "console" | "snapshot";

export type LibraryFilter = { profession?: string; task?: string; language?: string; q?: string };

export type SkillLibraryFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type SkillLibraryDeps = {
  fetchImpl?: SkillLibraryFetch;
  baseUrl?: string;
  /** The bundled copy. Read the first time it is needed. */
  loadSnapshot?: () => Promise<unknown>;
};

const FILTER_KEYS = ["profession", "task", "language", "q"] as const;

/** The filter from a query string: the four the Console takes, empty ones dropped. */
export function libraryFilterFrom(params: URLSearchParams): LibraryFilter {
  const filter: LibraryFilter = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (value) filter[key] = value;
  }
  return filter;
}

/** The Console's filter (apps/api/src/skills/library.ts listLibrary): every field optional, AND. */
export function filterLibrary<T extends LibrarySkillSummary>(skills: readonly T[], filter: LibraryFilter): T[] {
  const query = filter.q?.trim().toLowerCase();
  return skills.filter(
    (skill) =>
      (!filter.profession || skill.profession === filter.profession) &&
      (!filter.task || skill.task === filter.task) &&
      (!filter.language || skill.language === filter.language) &&
      (!query || skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query)),
  );
}

function summaryOf(skill: LibrarySkill): LibrarySkillSummary {
  const { name, description, profession, task, language, family, version } = skill;
  return { name, description, profession, task, language, family, version };
}

const loadBundledSnapshot = async (): Promise<unknown> =>
  (await import("./snapshot.json", { with: { type: "json" } })).default;

export function createSkillLibrary(deps: SkillLibraryDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? externalFetch;
  const base = (deps.baseUrl ?? REDROB_CONSOLE_API_BASE_URL).replace(/\/+$/, "");
  const cache = new Map<string, { etag: string; body: unknown }>();
  let snapshot: Promise<SkillLibrarySnapshot> | null = null;

  const readSnapshot = () => {
    snapshot ??= (deps.loadSnapshot ?? loadBundledSnapshot)().then((value) => snapshotSchema.parse(value));
    return snapshot;
  };

  /** The Console's answer, or null when it cannot give one (404 is reported as `missing`). */
  async function fromConsole<T>(route: string, schema: z.ZodType<T>): Promise<T | "missing" | null> {
    const cached = cache.get(route);
    try {
      const response = await fetchImpl(`${base}${route}`, {
        headers: { accept: "application/json", ...(cached ? { "if-none-match": cached.etag } : {}) },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 304 && cached) return schema.parse(cached.body);
      if (response.status === 404) return "missing";
      if (!response.ok) return null;
      const body: unknown = await response.json();
      const parsed = schema.parse(body);
      const etag = response.headers.get("etag");
      if (etag) cache.set(route, { etag, body });
      return parsed;
    } catch {
      return null;
    }
  }

  return {
    async list(filter: LibraryFilter = {}): Promise<{ version: string; skills: LibrarySkillSummary[]; source: LibrarySource }> {
      const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => Boolean(value))).toString();
      const live = await fromConsole(`/skill-library${query ? `?${query}` : ""}`, listSchema);
      if (live && live !== "missing") return { ...live, source: "console" };
      const copy = await readSnapshot();
      return { version: copy.version, skills: filterLibrary(copy.skills, filter).map(summaryOf), source: "snapshot" };
    },

    async taxonomy(): Promise<SkillTaxonomy & { source: LibrarySource }> {
      const live = await fromConsole("/skill-library/taxonomy", taxonomySchema);
      if (live && live !== "missing") return { ...live, source: "console" };
      return { ...(await readSnapshot()).taxonomy, source: "snapshot" };
    },

    /** One skill with its instructions, or null when neither the Console nor the copy has it. */
    async get(name: string): Promise<(LibrarySkill & { source: LibrarySource }) | null> {
      const live = await fromConsole(`/skill-library/${encodeURIComponent(name)}`, detailSchema);
      if (live === "missing") return null;
      if (live) return { ...live, source: "console" };
      const skill = (await readSnapshot()).skills.find((entry) => entry.name === name);
      return skill ? { ...skill, source: "snapshot" } : null;
    },
  };
}

export type SkillLibrary = ReturnType<typeof createSkillLibrary>;

/**
 * Adds a library skill to the workspace as `.opencode/skills/<name>/SKILL.md`, marked as from the
 * library. A skill of that name already there is never replaced: the person's own, a team skill, or
 * the same library skill added before.
 */
export async function installLibrarySkill(
  workspaceRoot: string,
  library: Pick<SkillLibrary, "get">,
  name: string,
): Promise<{ path: string; skill: LibrarySkill }> {
  const existing = await listSkills(workspaceRoot, false);
  if (existing.some((skill) => skill.name === name)) {
    throw new ApiError(409, "skill_exists", `A skill named ${name} is already installed`);
  }
  const skill = await library.get(name);
  if (!skill) throw new ApiError(404, "library_skill_not_found", `No library skill named ${name}`);
  const content = renderSkillDocument({
    name: skill.name,
    description: skill.description,
    body: skill.body,
    metadata: {
      profession: skill.profession,
      task: skill.task,
      language: skill.language,
      family: skill.family,
      version: skill.version,
      source: "library",
    },
  });
  const result = await upsertSkill(workspaceRoot, { name: skill.name, content });
  return { path: result.path, skill };
}
