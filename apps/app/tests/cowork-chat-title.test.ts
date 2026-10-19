import { describe, expect, test } from "bun:test";

import {
  CHAT_TITLE_MAX_WORDS,
  cleanGeneratedTitle,
  getDisplaySessionTitle,
  isBlockMarkerTitle,
  isPromptDerivedTitle,
  shortTitleFromPrompt,
  shownChatTitle,
} from "../src/app/lib/session-title";
import { firstPromptText, namingAnswer, runTitlePass, sessionsToTitle, type TitlePassDeps } from "../src/react-app/cowork/thread/use-chat-titles";
import { answersToPrompt, planRunPrompt } from "../src/react-app/cowork/thread/thread-logic";

// Chat titles stay under 7 words, named from the subject rather than the prompt's opening; a title
// that is a Cowork block's fence line is never shown.

const words = (title: string) => title.split(/\s+/).filter(Boolean).length;

describe("shortTitleFromPrompt", () => {
  test("drops filler openers and keeps the subject", () => {
    const title = shortTitleFromPrompt("Deep research, deep think and tell me where you predict the US-China AI race will be in 2035.");
    expect(title.startsWith("US-China AI race")).toBe(true);
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
  });

  test("caps at six words, never ends on a connecting word, no ellipsis; empty stays empty", () => {
    const title = shortTitleFromPrompt("Compare the pricing models of the three largest cloud vendors for startups");
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
    expect(title).not.toMatch(/\u2026|\.\.\.|\b(of|the|and|for)$/);
    expect(shortTitleFromPrompt("   ")).toBe("");
  });

  test("Korean prompts are capped by word too", () => {
    const title = shortTitleFromPrompt("2026ë…„ êµ­ë‚´ ì „ê¸°ì°¨ ë°°í„°ë¦¬ ì‹œìž¥ ì ìœ ìœ¨ ë³€í™”ì™€ ì£¼ìš” ì—…ì²´ ì „ëžµì„ ì •ë¦¬í•´ì¤˜");
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
    expect(title.startsWith("2026ë…„")).toBe(true);
  });
});

describe("cleanGeneratedTitle", () => {
  test("strips quotes, labels and closing punctuation", () => {
    expect(cleanGeneratedTitle('Title: "US-China AI race to 2035."')).toBe("US-China AI race to 2035");
    expect(cleanGeneratedTitle("**Solid-state battery outlook**\n")).toBe("Solid-state battery outlook");
  });

  test("refuses blocks, JSON and long answers", () => {
    expect(cleanGeneratedTitle("```redrob-check\n{}\n```")).toBe("");
    expect(cleanGeneratedTitle('{"title":"x"}')).toBe("");
    expect(cleanGeneratedTitle("This is a very long sentence that is clearly not a short chat title")).toBe("");
    expect(cleanGeneratedTitle("")).toBe("");
  });
});

describe("isPromptDerivedTitle", () => {
  const prompt = "Research and write a short brief on solid-state batteries";
  test("the prompt's own opening words, with or without a trailing mark", () => {
    expect(isPromptDerivedTitle("Research and write a short brief ~", prompt)).toBe(true);
    expect(isPromptDerivedTitle("Research and write a short brief\u2026", prompt)).toBe(true);
  });
  test("markers and the default title count as prompt-made", () => {
    expect(isPromptDerivedTitle("```redrob-questions", prompt)).toBe(true);
    expect(isPromptDerivedTitle("New session", prompt)).toBe(true);
    expect(isPromptDerivedTitle("", prompt)).toBe(true);
  });
  test("a title the person chose is left alone", () => {
    expect(isPromptDerivedTitle("Battery notes for Q3", prompt)).toBe(false);
  });
});

describe("block marker titles", () => {
  test("fence lines and bare block names are markers; ordinary titles are not", () => {
    expect(isBlockMarkerTitle("```redrob-questions")).toBe(true);
    expect(isBlockMarkerTitle("  ```redrob-plan  ")).toBe(true);
    expect(isBlockMarkerTitle("redrob-questions")).toBe(true);
    expect(isBlockMarkerTitle("~~~")).toBe(true);
    expect(isBlockMarkerTitle("Redrob questions for the board")).toBe(false);
    expect(isBlockMarkerTitle("")).toBe(false);
    expect(isBlockMarkerTitle(null)).toBe(false);
  });

  test("the display falls back instead of showing a marker", () => {
    expect(getDisplaySessionTitle("```redrob-questions", "Fallback")).toBe("Fallback");
    expect(getDisplaySessionTitle("A real title", "Fallback")).toBe("A real title");
    expect(shownChatTitle("```redrob-questions")).toBe("");
    expect(shownChatTitle(undefined)).toBe("");
  });
});

describe("naming pass", () => {
  test("marker titles first, then newest untried root chats, capped", () => {
    const sessions = [
      { id: "a", title: "Fine" },
      { id: "b", title: "Child", parentID: "a" },
      { id: "c", title: "```redrob-plan" },
      { id: "d", title: "Other" },
    ];
    expect(sessionsToTitle(sessions, new Set(["d"]))).toEqual(["c", "a"]);
    expect(sessionsToTitle(sessions, new Set(), 1)).toEqual(["c"]);
  });

  test("the first prompt skips assistant, synthetic and hidden Cowork sends", () => {
    const messages = [
      { info: { role: "assistant" }, parts: [{ type: "text", text: "hi" }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "system note", synthetic: true }] },
      { info: { role: "user" }, parts: [{ type: "text", text: planRunPrompt("the plan") }] },
      { info: { role: "user" }, parts: [{ type: "text", text: answersToPrompt([], {}) }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "Compare the vendors" }] },
    ];
    expect(firstPromptText(messages)).toBe("Compare the vendors");
    expect(firstPromptText([])).toBe("");
  });

  test("the naming answer is read only once it has finished", () => {
    const running = [{ info: { role: "assistant", time: {} }, parts: [{ type: "text", text: "Vendor" }] }];
    const done = [{ info: { role: "assistant", time: { completed: 1 } }, parts: [{ type: "text", text: "Vendor comparison" }] }];
    expect(namingAnswer(running)).toBeNull();
    expect(namingAnswer(done)).toBe("Vendor comparison");
  });
});


describe("title pass", () => {
  test("one chat at a time; a person's title is kept, a Rename mid-request wins, a failed rename is retried, children are deleted", async () => {
    const prompt = "Research the US-China AI race to 2035 and write a brief";
    const ruled = shortTitleFromPrompt(prompt);
    const sessions = [
      { id: "c1", title: "redrob-plan" },
      { id: "c2", title: "My own title" },
      { id: "c3", title: "redrob-questions" },
      { id: "c4", title: "redrob-plan" },
    ];
    const titles = new Map<string, string>();
    const tried = new Set<string>();
    const created: string[] = [];
    const deleted: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let c3Failures = 1;
    const step = async <T>(work: () => T): Promise<T> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return work();
    };
    const deps: TitlePassDeps = {
      sessions: () => sessions,
      messages: (id) =>
        step(() =>
          id.startsWith("child")
            ? [{ info: { role: "assistant", time: { completed: 2 } }, parts: [{ type: "text", text: "US-China AI race" }] }]
            : [{ info: { role: "user" }, parts: [{ type: "text", text: prompt }] }],
        ),
      title: (id) => step(() => (id === "c4" ? "Renamed by me" : titles.get(id) ?? "")),
      rename: (id, title) =>
        step(() => {
          if (id === "c3" && c3Failures-- > 0) throw new Error("reconnecting");
          titles.set(id, title);
        }),
      createChild: (parentId) => step(() => (created.push(`child-${parentId}`), `child-${parentId}`)),
      prompt: () => step(() => true),
      deleteChild: (id) => step(() => void deleted.push(id)),
      sleep: async () => {},
      tried,
      remember: (id) => void tried.add(id),
    };
    await runTitlePass(deps, new AbortController().signal);
    expect(maxInFlight).toBe(1);
    expect(titles.get("c1")).toBe("US-China AI race");
    expect(titles.has("c2")).toBe(false);
    expect(titles.has("c3")).toBe(false);
    expect(titles.get("c4")).toBe(ruled);
    expect([...tried].sort()).toEqual(["c1", "c2", "c4"]);
    // The next pass retries only the chat whose rename failed.
    await runTitlePass(deps, new AbortController().signal);
    expect(titles.get("c3")).toBe("US-China AI race");
    expect(deleted).toEqual(created);
    expect(created).toEqual(["child-c1", "child-c4", "child-c3"]);
    // An aborted pass does nothing.
    const aborted = new AbortController();
    aborted.abort();
    await runTitlePass({ ...deps, tried: new Set(), remember: () => {} }, aborted.signal);
    expect(created).toHaveLength(3);
  });
});
