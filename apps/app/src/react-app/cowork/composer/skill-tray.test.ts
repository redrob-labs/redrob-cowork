import { describe, expect, test } from "bun:test";

import { attachSkill, detachSkill, humanizeSkillName, withSkillTokens } from "./skill-tray";

describe("composer skill tray", () => {
  test("prepends attached skills as [skill name] tokens, in order", () => {
    expect(withSkillTokens("review this", ["kr-lawyer-nda", "pdf"])).toBe("[skill kr-lawyer-nda] [skill pdf] review this");
  });

  test("leaves the text alone when nothing is attached", () => {
    expect(withSkillTokens("review this", [])).toBe("review this");
    expect(withSkillTokens("review this", undefined)).toBe("review this");
  });

  test("a skill alone is still a message", () => {
    expect(withSkillTokens("", ["pdf"]).trim()).toBe("[skill pdf]");
  });

  test("attaching twice keeps one, detaching removes only that one", () => {
    expect(attachSkill(attachSkill([], "pdf"), "pdf")).toEqual(["pdf"]);
    expect(detachSkill(["pdf", "documents-docx"], "pdf")).toEqual(["documents-docx"]);
  });

  test("an unknown skill gets a readable fallback title", () => {
    expect(humanizeSkillName("kr-lawyer-nda")).toBe("Kr lawyer nda");
  });
});
