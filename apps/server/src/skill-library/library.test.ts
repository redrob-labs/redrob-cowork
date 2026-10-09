import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseFrontmatter } from "../frontmatter.js";
import { listSkills } from "../skills.js";
import { createSkillLibrary, filterLibrary, installLibrarySkill, libraryFilterFrom, type SkillLibraryFetch } from "./library.js";
import snapshot from "./snapshot.json" with { type: "json" };

const offline: SkillLibraryFetch = () => Promise.reject(new Error("offline"));

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "redrob-skill-library-"));
  await mkdir(join(workspace, ".git"), { recursive: true });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("the bundled snapshot", () => {
  test("holds the Console's library and its whole taxonomy", () => {
    expect(snapshot.skills.length).toBe(75);
    expect(snapshot.skills.every((skill) => skill.profession === "lawyer")).toBe(true);
    expect(snapshot.taxonomy.professions.map((profession) => profession.id)).toContain("lawyer");
    expect(snapshot.taxonomy.languages.map((language) => language.id)).toEqual(["en", "ko", "hi"]);
    for (const skill of snapshot.skills) {
      expect(parseFrontmatter(skill.content).data.name).toBe(skill.name);
    }
  });
});

describe("filtering the library", () => {
  test("follows the Console: every filter optional, combined with AND", () => {
    const all = snapshot.skills;
    expect(filterLibrary(all, {})).toHaveLength(75);
    const korean = filterLibrary(all, { language: "ko" });
    expect(korean.length).toBeGreaterThan(0);
    expect(korean.every((skill) => skill.language === "ko")).toBe(true);
    const research = filterLibrary(all, { profession: "lawyer", task: "research", language: "en" });
    expect(research.length).toBeGreaterThan(0);
    expect(research.every((skill) => skill.task === "research" && skill.language === "en")).toBe(true);
    expect(filterLibrary(all, { profession: "designer" })).toHaveLength(0);
  });

  test("q is a case-insensitive substring of the name or the description", () => {
    const hits = filterLibrary(snapshot.skills, { q: "STATUTE" });
    expect(hits.map((skill) => skill.name)).toContain("legal-statute-tracer");
    expect(hits.every((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes("statute"))).toBe(true);
  });

  test("reads the four filters from a query string and drops empty ones", () => {
    expect(libraryFilterFrom(new URLSearchParams("profession=lawyer&task=&language=ko&q= x &other=1"))).toEqual({
      profession: "lawyer",
      language: "ko",
      q: "x",
    });
  });
});

describe("the library proxy", () => {
  test("answers from the Console and revalidates with the ETag it was given", async () => {
    const calls: Array<{ url: string; ifNoneMatch: string | null }> = [];
    const body = { version: "v1", skills: [snapshot.skills[0]].map(({ body: _body, content: _content, ...summary }) => summary) };
    const fetchImpl: SkillLibraryFetch = async (url, init) => {
      const ifNoneMatch = new Headers(init?.headers).get("if-none-match");
      calls.push({ url, ifNoneMatch });
      return ifNoneMatch === '"e1"' ? new Response(null, { status: 304 }) : json(body, { headers: { etag: '"e1"' } });
    };
    const library = createSkillLibrary({ fetchImpl, baseUrl: "https://console.test/v1", loadSnapshot: () => Promise.reject(new Error("unused")) });
    const first = await library.list({ language: "en" });
    const second = await library.list({ language: "en" });
    expect(first).toEqual({ ...body, source: "console" });
    expect(second).toEqual(first);
    expect(calls).toEqual([
      { url: "https://console.test/v1/skill-library?language=en", ifNoneMatch: null },
      { url: "https://console.test/v1/skill-library?language=en", ifNoneMatch: '"e1"' },
    ]);
  });

  test("falls back to the snapshot when the Console is unreachable or answers badly", async () => {
    for (const fetchImpl of [offline, async () => new Response("down", { status: 503 }), async () => json({ unexpected: true })]) {
      const library = createSkillLibrary({ fetchImpl });
      const list = await library.list({ profession: "lawyer", language: "ko" });
      expect(list.source).toBe("snapshot");
      expect(list.skills).toEqual(
        filterLibrary(snapshot.skills, { profession: "lawyer", language: "ko" }).map(({ body: _body, content: _content, ...summary }) => summary),
      );
      expect((await library.taxonomy()).source).toBe("snapshot");
      const one = await library.get("legal-statute-tracer");
      expect(one?.source).toBe("snapshot");
      expect(one?.body.length).toBeGreaterThan(0);
    }
  });

  test("a skill the Console does not have is not found, and is not taken from the snapshot", async () => {
    const library = createSkillLibrary({ fetchImpl: async () => new Response("{}", { status: 404 }) });
    expect(await library.get("legal-statute-tracer")).toBeNull();
    expect(await createSkillLibrary({ fetchImpl: offline }).get("no-such-skill")).toBeNull();
  });
});

describe("installing a library skill", () => {
  test("writes .opencode/skills/<name>/SKILL.md marked as from the library", async () => {
    const library = createSkillLibrary({ fetchImpl: offline });
    const result = await installLibrarySkill(workspace, library, "legal-statute-tracer");
    expect(result.path).toBe(join(workspace, ".opencode", "skills", "legal-statute-tracer", "SKILL.md"));
    const written = parseFrontmatter(await readFile(result.path, "utf8"));
    expect(written.data.name).toBe("legal-statute-tracer");
    expect(written.data.metadata).toMatchObject({ profession: "lawyer", task: "research", language: "en", source: "library" });
    const [item] = await listSkills(workspace, false);
    expect(item?.metadata).toMatchObject({ source: "library", profession: "lawyer", task: "research", language: "en" });
  });

  test("refuses with 409 when a skill of that name is already there, and leaves it alone", async () => {
    const dir = join(workspace, ".opencode", "skills", "legal-statute-tracer");
    await mkdir(dir, { recursive: true });
    const mine = "---\nname: legal-statute-tracer\ndescription: Mine\n---\n\nMy own\n";
    await writeFile(join(dir, "SKILL.md"), mine, "utf8");
    const library = createSkillLibrary({ fetchImpl: offline });
    await expect(installLibrarySkill(workspace, library, "legal-statute-tracer")).rejects.toMatchObject({ status: 409, code: "skill_exists" });
    expect(await readFile(join(dir, "SKILL.md"), "utf8")).toBe(mine);
  });

  test("404s for a name the library does not have", async () => {
    const library = createSkillLibrary({ fetchImpl: offline });
    await expect(installLibrarySkill(workspace, library, "no-such-skill")).rejects.toMatchObject({ status: 404 });
  });
});
