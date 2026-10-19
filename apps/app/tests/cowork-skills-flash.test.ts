import { describe, expect, test } from "bun:test";

import { seedSkillDetail } from "../src/react-app/cowork/skills/skills";
import type { CoworkSkill, SkillDetail } from "../src/react-app/cowork/services/types";

const catalogue = (name: string): SkillDetail => ({
  name,
  title: "US NDA",
  titleKo: "미국 비밀유지계약",
  summary: "Mutual or one-way NDA.",
  version: "1.0.0",
  description: "Use when drafting an NDA.",
  tags: {},
  body: "Steps",
  installed: null,
});
const mine = (name: string): CoworkSkill => ({ name, description: "Local description", origin: "library", tags: { language: "en" }, scope: "project" });

describe("skills first paint", () => {
  test("a skill page seeds from the catalogue and the installed cache", () => {
    expect(seedSkillDetail("us-lawyer-nda", null, null)).toBeNull();
    expect(seedSkillDetail("us-lawyer-nda", null, [])).toBeNull();
    const library = seedSkillDetail("us-lawyer-nda", catalogue("us-lawyer-nda"), []);
    expect(library?.installed).toBeNull();
    expect(library?.title).toBe("US NDA");
    const added = seedSkillDetail("us-lawyer-nda", catalogue("us-lawyer-nda"), [mine("us-lawyer-nda")]);
    expect(added?.installed).toEqual({ origin: "library", scope: "project" });
    expect(added?.description).toBe("Local description");
    expect(added?.title).toBe("US NDA");
    expect(added?.version).toBe("1.0.0");
    // Installed but not in the catalogue (the person's own skill) still seeds, so Use never flips to Add.
    expect(seedSkillDetail("my-skill", null, [mine("my-skill")])?.installed?.origin).toBe("library");
    // The installed skill's own title wins over the catalogue's, as it does in the list.
    expect(seedSkillDetail("us-lawyer-nda", catalogue("us-lawyer-nda"), [{ ...mine("us-lawyer-nda"), title: "My NDA" }])?.title).toBe("My NDA");
  });
});
