import { describe, expect, test } from "bun:test";

import type { SkillRow } from "../skills/skills";
import { POPULAR_SKILLS } from "../skills/popular-skills";
import { SKILL_PICK_COUNT, skillPicks } from "./skill-picks";

function row(name: string, installed = false): SkillRow {
  return {
    name,
    description: `${name} skill`,
    tags: {},
    origin: installed ? "mine" : "library",
    installed: installed ? { name, description: "", origin: "mine", tags: {} } : null,
  } as SkillRow;
}

describe("hero composer skill picks", () => {
  const rows = [...POPULAR_SKILLS.en, ...POPULAR_SKILLS.ko].map((name) => row(name));

  test("shows the first five of this language's popular list, in order", () => {
    expect(skillPicks(rows, "en", []).map((r) => r.name)).toEqual(POPULAR_SKILLS.en.slice(0, SKILL_PICK_COUNT));
    expect(skillPicks(rows, "ko", []).map((r) => r.name)).toEqual(POPULAR_SKILLS.ko.slice(0, SKILL_PICK_COUNT));
  });

  test("an attached skill leaves the strip and the next one moves up", () => {
    const first = POPULAR_SKILLS.en[0] as string;
    const names = skillPicks(rows, "en", [first]).map((r) => r.name);
    expect(names).not.toContain(first);
    expect(names).toEqual(POPULAR_SKILLS.en.slice(1, SKILL_PICK_COUNT + 1));
  });

  test("a name the catalogue does not have is skipped", () => {
    const missing = POPULAR_SKILLS.en[1] as string;
    const names = skillPicks(rows.filter((r) => r.name !== missing), "en", []).map((r) => r.name);
    expect(names).not.toContain(missing);
    // The strip fills from what is left of the list, never past it.
    expect(names).toHaveLength(Math.min(SKILL_PICK_COUNT, POPULAR_SKILLS.en.length - 1));
  });
});
