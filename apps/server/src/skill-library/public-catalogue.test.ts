import { describe, expect, test } from "bun:test";
import { createPublicCatalogue, parseCatalogueFrontmatter } from "./public-catalogue.js";

const BASE = "https://catalogue.test/skills";

const files: Record<string, string> = {
  "index.json": JSON.stringify({
    skills: [
      { name: "eli5", version: "1.0.0", files: ["SKILL.md"] },
      { name: "kr-accountant-adjusting-entries", version: "1.2.0", files: ["SKILL.md"] },
      { name: "../escape", version: "1.0.0", files: ["SKILL.md"] },
    ],
  }),
  "eli5/SKILL.md": "---\nname: eli5\ndescription: Explain anything simply\ntitle: Explain like I am five\ntitle_ko: 쉽게 설명하기\nsummary: Plain answers\nsummary_ko: 쉬운 답\n---\n# ELI5\nBody text\n",
  "kr-accountant-adjusting-entries/SKILL.md": "---\nname: kr-accountant-adjusting-entries\ndescription: Korean year-end adjusting entries\ntitle: Adjusting entries\n---\nEntries body\n",
};

// A stand-in for externalFetch that serves the in-memory catalogue and counts calls.
function mockFetch(overrides: { fail?: boolean } = {}) {
  const calls: string[] = [];
  const fetchImpl = async (input: string) => {
    calls.push(input);
    if (overrides.fail) throw new Error("offline");
    const path = decodeURIComponent(input.slice(BASE.length + 1));
    const text = files[path];
    return text === undefined ? new Response("missing", { status: 404 }) : new Response(text, { status: 200 });
  };
  return { fetchImpl, calls };
}

describe("public catalogue", () => {
  test("lists every valid entry with frontmatter fields and string versions", async () => {
    const { fetchImpl } = mockFetch();
    const catalogue = createPublicCatalogue({ fetchImpl, baseUrl: BASE });
    const { skills, version } = await catalogue.list();
    expect(skills.map((skill) => skill.name)).toEqual(["eli5", "kr-accountant-adjusting-entries"]);
    expect(skills[0]).toEqual({
      name: "eli5",
      version: "1.0.0",
      description: "Explain anything simply",
      title: "Explain like I am five",
      titleKo: "쉽게 설명하기",
      summary: "Plain answers",
      summaryKo: "쉬운 답",
    });
    expect(version).not.toBe("");
  });

  test("filters by q across name, title, summary and description", async () => {
    const catalogue = createPublicCatalogue({ fetchImpl: mockFetch().fetchImpl, baseUrl: BASE });
    expect((await catalogue.list({ q: "YEAR-END" })).skills.map((s) => s.name)).toEqual(["kr-accountant-adjusting-entries"]);
    expect((await catalogue.list({ q: "쉬운" })).skills.map((s) => s.name)).toEqual(["eli5"]);
    expect((await catalogue.list({ q: "nothing-matches" })).skills).toEqual([]);
    // Taxonomy filters are ignored: the catalogue carries no such fields.
    expect((await catalogue.list({ profession: "lawyer" })).skills).toHaveLength(2);
  });

  test("get returns the body and null for an unknown name", async () => {
    const catalogue = createPublicCatalogue({ fetchImpl: mockFetch().fetchImpl, baseUrl: BASE });
    const skill = await catalogue.get("eli5");
    expect(skill?.body).toBe("# ELI5\nBody text\n");
    expect(skill?.frontmatter.name).toBe("eli5");
    expect(skill?.source).toBe("console");
    expect(await catalogue.get("missing")).toBeNull();
  });

  test("returns an empty library when the catalogue cannot be fetched", async () => {
    const catalogue = createPublicCatalogue({ fetchImpl: mockFetch({ fail: true }).fetchImpl, baseUrl: BASE });
    expect(await catalogue.list()).toEqual({ version: "", skills: [] });
    expect(await catalogue.get("eli5")).toBeNull();
  });

  test("reads a published file whose frontmatter is not valid YAML", () => {
    const { data, body } = parseCatalogueFrontmatter(
      "---\nname: kr-accountant-vat-return\nsummary: VAT return workpaper: output, input\n---\nBody\n",
    );
    expect(data).toEqual({ name: "kr-accountant-vat-return", summary: "VAT return workpaper: output, input" });
    expect(body).toBe("Body\n");
  });

  test("caches within the TTL and refetches after it", async () => {
    let clock = 0;
    const { fetchImpl, calls } = mockFetch();
    const catalogue = createPublicCatalogue({ fetchImpl, baseUrl: BASE, ttlMs: 1000, now: () => clock });
    await catalogue.list();
    const firstLoad = calls.length;
    await catalogue.list({ q: "eli5" });
    expect(calls.length).toBe(firstLoad);
    clock = 2000;
    await catalogue.list();
    expect(calls.length).toBe(firstLoad * 2);
  });
});
