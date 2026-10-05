import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { setLocale } from "../src/i18n";
import { DEFAULT_CROSS_CHECK } from "../src/react-app/desk/composer/composer-state";
import { createCheckStore, settleChecks, startChecks } from "../src/react-app/desk/thread/check-store";
import {
  checkMatters,
  checkPrompt,
  crossCheckPlan,
  DESK_CHECK_AGENT,
  parseCheckAnswer,
  runCrossCheck,
  type CrossCheckDeps,
  type TranscriptMessage,
} from "../src/react-app/desk/thread/cross-check";
import { DESK_BLOCK_TAGS, hasDeskBlocks, parseDeskBlocks, type CheckResult } from "../src/react-app/desk/thread/desk-blocks";
import { challengeReportProps, factReportProps } from "../src/react-app/desk/thread/desk-thread";
import { deskSystemText, MEMORY_OFF_INSTRUCTION } from "../src/react-app/desk/thread/memory-off";
import { toTranscript } from "../src/react-app/desk/thread/use-desk-cross-check";
import {
  answersSummary,
  answersToPrompt,
  approvalActions,
  isPlanRunPrompt,
  memorySavedFrom,
  planRunPrompt,
  planStatus,
  planToText,
  receiptItems,
} from "../src/react-app/desk/thread/thread-logic";

afterEach(() => setLocale("en"));

const fence = (tag: string, body: unknown) =>
  `\`\`\`${tag}\n${typeof body === "string" ? body : JSON.stringify(body)}\n\`\`\``;

const QUESTIONS = [
  { id: "q1", question: "What do you need at the end?", options: ["A yes or no", "A notice, ready to send"], defaultValue: 0 },
  { id: "q2", question: "What should I read?", options: ["This chat", "The project's files", "The web"], multi: true, defaultValue: [0, 1] },
];

const PLAN = {
  title: "End the Seorin MSA",
  summary: "Nothing is sent until you run it.",
  sections: [
    { heading: "How I will do it", ordered: true, items: [{ lead: "Read the contract.", text: "Clause 14 and the amendments." }, "Draft the notice."] },
    { heading: "What you will get", items: [{ text: "A notice in Korean and English." }] },
  ],
  todo: [{ label: "Read the contract" }, { label: "Write the notice", who: "Redrob Auto" }],
  note: "Fact check runs after, because you will send it.",
};

const CHECK = {
  fact: {
    summary: "2 of 3 claims hold.",
    claims: [
      { verdict: "holds", claim: "Notice by registered mail", source: "MSA 14.2" },
      { verdict: "partly", claim: "Email counts", note: "Only as a copy" },
      { verdict: "holds", claim: "30 days" },
    ],
    missed: [{ text: "Amendment 2 excludes ending the agreement." }],
  },
  challenge: {
    claim: "We can end the MSA by email.",
    rounds: [{ for: "14.5 makes any notice effective", against: "14.2 names the methods" }],
    verdict: [{ kind: "broke", text: "Email alone does not count." }, { kind: "held", text: "30 days stands." }],
    unsettled: "Whether a courier abroad counts.",
  },
};

describe("fence tags", () => {
  test("match the server's DESK_BLOCKS", () => {
    const server = readFileSync(join(import.meta.dir, "..", "..", "server", "src", "redrob-desk-agents.ts"), "utf8");
    const block = /export const DESK_BLOCKS = \{([\s\S]*?)\} as const;/.exec(server)?.[1] ?? "";
    const tags = Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]));
    expect(tags).toEqual({ ...DESK_BLOCK_TAGS });
    expect(server).toContain(`DESK_CHECK_AGENT = "${DESK_CHECK_AGENT}"`);
  });
});

describe("parseDeskBlocks", () => {
  test("reads questions and keeps the prose around them", () => {
    const blocks = parseDeskBlocks(`Plan is on, so nothing runs yet.\n\n${fence("redrob-questions", QUESTIONS)}\n\nOr just tell me.`);
    expect(blocks.prose).toBe("Plan is on, so nothing runs yet.\n\nOr just tell me.");
    expect(blocks.questions?.map((question) => question.id)).toEqual(["q1", "q2"]);
    expect(blocks.questions?.[1]).toMatchObject({ multi: true, defaultValue: [0, 1] });
    expect(hasDeskBlocks(blocks)).toBe(true);
  });

  test("reads a plan, filling sections and todo", () => {
    const blocks = parseDeskBlocks(fence("redrob-plan", { title: "A plan" }));
    expect(blocks.prose).toBe("");
    expect(blocks.plan).toEqual({ title: "A plan", sections: [], todo: [] });
    expect(parseDeskBlocks(fence("redrob-plan", PLAN)).plan?.sections[0]?.items?.[1]).toBe("Draft the notice.");
  });

  test("reads a check", () => {
    const blocks = parseDeskBlocks(fence("redrob-check", CHECK));
    expect(blocks.check?.fact?.claims).toHaveLength(3);
    expect(blocks.check?.challenge?.verdict[0]?.kind).toBe("broke");
  });

  test("invalid JSON or the wrong shape stays prose", () => {
    const broken = fence("redrob-plan", "{ not json");
    expect(parseDeskBlocks(broken)).toEqual({ prose: broken });
    const wrong = fence("redrob-questions", [{ id: "q1", question: "No options" }]);
    expect(parseDeskBlocks(wrong)).toEqual({ prose: wrong });
    const empty = fence("redrob-check", {});
    expect(parseDeskBlocks(empty).check).toBeUndefined();
    const verdict = fence("redrob-check", { fact: { claims: [{ verdict: "maybe", claim: "x" }] } });
    expect(parseDeskBlocks(verdict).check).toBeUndefined();
    expect(hasDeskBlocks(parseDeskBlocks("```ts\nconst a = 1\n```"))).toBe(false);
  });

  test("several blocks in one answer; a second of the same kind stays prose", () => {
    const second = fence("redrob-plan", { title: "Second" });
    const blocks = parseDeskBlocks(`A\n${fence("redrob-questions", QUESTIONS)}\nB\n${fence("redrob-plan", PLAN)}\n${second}`);
    expect(blocks.questions).toHaveLength(2);
    expect(blocks.plan?.title).toBe("End the Seorin MSA");
    expect(blocks.prose).toBe(`A\n\nB\n\n${second}`);
  });

  test("a default that names no option is dropped", () => {
    const blocks = parseDeskBlocks(
      fence("redrob-questions", [{ id: "a", question: "Q?", options: ["x"], defaultValue: 4 }, { id: "b", question: "R?", options: ["x", "y"], multi: true, defaultValue: [1, 9] }]),
    );
    expect(blocks.questions?.[0]?.defaultValue).toBeUndefined();
    expect(blocks.questions?.[1]?.defaultValue).toEqual([1]);
  });

  test("while streaming, an open block is held back", () => {
    const blocks = parseDeskBlocks('Here it is:\n```redrob-plan\n{"title":"A', { streaming: true });
    expect(blocks).toEqual({ prose: "Here it is:", pending: true });
    expect(parseDeskBlocks('Here it is:\n```redrob-plan\n{"title":"A').pending).toBeUndefined();
  });
});

describe("answers, plan and run", () => {
  const questions = parseDeskBlocks(fence("redrob-questions", QUESTIONS)).questions ?? [];

  test("answersToPrompt reads as the person's reply", () => {
    expect(answersToPrompt(questions, { q1: 1, q2: [0, 2] })).toBe(
      "What do you need at the end? A notice, ready to send.\nWhat should I read? This chat, The web.",
    );
    expect(answersToPrompt(questions, { q1: null, q2: [] })).toBe("Go ahead with what fits best.");
    expect(answersSummary(questions, { q1: 0, q2: [1] })).toBe("Answered: A yes or no, The project's files");
  });

  test("Run sends the plan behind 'Run this plan.'", () => {
    const plan = parseDeskBlocks(fence("redrob-plan", PLAN)).plan;
    if (!plan) throw new Error("no plan");
    const text = planToText(plan);
    expect(text).toContain("# End the Seorin MSA");
    expect(text).toContain("1. Read the contract. Clause 14 and the amendments.");
    expect(text).toContain("2. Draft the notice.");
    expect(text).toContain("- Write the notice (Redrob Auto)");
    const prompt = planRunPrompt(text);
    expect(prompt.startsWith("Run this plan.\n\n# End the Seorin MSA")).toBe(true);
    expect(isPlanRunPrompt(prompt)).toBe(true);
    expect(isPlanRunPrompt("Run the tests")).toBe(false);
  });

  test("Run and Keep move the plan; a run that finished is done", () => {
    expect(planStatus({ local: "draft", isLatest: true, busy: false })).toBe("draft");
    expect(planStatus({ local: "kept", isLatest: false, busy: false })).toBe("kept");
    expect(planStatus({ local: "running", isLatest: false, busy: true })).toBe("running");
    expect(planStatus({ local: "running", isLatest: false, busy: false })).toBe("done");
  });
});

describe("receipt", () => {
  const labels = (items: ReturnType<typeof receiptItems>) => items.map((item) => [item.label, item.sub ?? null, item.busy ?? false]);
  const result = parseDeskBlocks(fence("redrob-check", CHECK)).check;

  test("a plain answer is not checked", () => {
    expect(labels(receiptItems({ planned: false, fact: "off", challenge: "off" }))).toEqual([
      ["Redrob Auto", null, false],
      ["Not checked", "a quick answer", false],
    ]);
  });

  test("a planned answer with checks running", () => {
    expect(labels(receiptItems({ model: "claude-opus-5", planned: true, fact: "running", challenge: "running" }))).toEqual([
      ["claude-opus-5", "by Redrob Auto", false],
      ["Plan followed", null, false],
      ["Fact check running", null, true],
      ["Challenge running", null, true],
    ]);
  });

  test("checks done: to fix, and holds up", () => {
    const items = receiptItems({ planned: false, fact: "done", challenge: "done", result });
    expect(labels(items).slice(1)).toEqual([
      ["Fact check: 2 to fix", null, false],
      ["Challenged", "1 to change", false],
    ]);
    expect(items.map((item) => item.tone)).toEqual([undefined, "differ", "differ"]);
    const clean: CheckResult = { fact: { claims: [{ verdict: "holds", claim: "x" }], missed: [] } };
    expect(receiptItems({ planned: false, fact: "done", challenge: "off", result: clean })[1]).toMatchObject({
      label: "Fact check: holds up",
      tone: "agree",
    });
  });
});

describe("cross-check", () => {
  test("checkMatters", () => {
    expect(checkMatters("")).toBe(false);
    expect(checkMatters("Sure, here is a haiku about rain.")).toBe(false);
    expect(checkMatters("x".repeat(700))).toBe(true);
    expect(checkMatters("It costs $1,200 a month.")).toBe(true);
    expect(checkMatters("The notice must reach them by October 31.")).toBe(true);
    expect(checkMatters("Clause 14.2 requires registered mail.")).toBe(true);
    expect(checkMatters("I wrote Notice.docx for you.")).toBe(true);
    expect(checkMatters("Done.", "Draft an email to the client")).toBe(true);
    expect(checkMatters("계약서 제14조에 따르면 등기우편이어야 합니다.")).toBe(true);
  });

  test("levels: off skips, always runs, auto runs when it matters", () => {
    const quick = { question: "Hi", answer: "Hello." };
    const matters = { question: "Hi", answer: "Clause 14.2 requires registered mail." };
    expect(crossCheckPlan({ factCheck: "off", challenge: "off" }, matters)).toEqual({ fact: false, challenge: false });
    expect(crossCheckPlan({ factCheck: "always", challenge: "always" }, quick)).toEqual({ fact: true, challenge: true });
    expect(crossCheckPlan(DEFAULT_CROSS_CHECK, quick)).toEqual({ fact: false, challenge: false });
    expect(crossCheckPlan(DEFAULT_CROSS_CHECK, matters)).toEqual({ fact: true, challenge: true });
    expect(crossCheckPlan({ factCheck: "auto", challenge: "off" }, matters)).toEqual({ fact: true, challenge: false });
  });

  test("the check prompt names the checks, the question and the answer", () => {
    const prompt = checkPrompt({ question: "Can we email?", answer: "No.", plan: { fact: true, challenge: false } });
    expect(prompt).toContain("Run a Fact check on the answer below.");
    expect(prompt).toContain("Can we email?");
    expect(prompt).toContain("No.");
  });

  test("check-store: pending is taken once; checks run, then settle", () => {
    const store = createCheckStore();
    store.getState().expect("s1", { question: "Q", planned: true });
    expect(store.getState().take("s1")).toEqual({ question: "Q", planned: true });
    expect(store.getState().take("s1")).toBeNull();

    store.getState().start("m1", { planned: true, fact: true, challenge: false });
    expect(store.getState().answers.m1).toEqual({ planned: true, fact: "running", challenge: "off" });
    store.getState().settle("m1", { fact: { claims: [], missed: [] } });
    expect(store.getState().answers.m1).toMatchObject({ fact: "done", challenge: "off" });

    const running = startChecks({ planned: false, fact: true, challenge: true });
    expect(settleChecks(running, null)).toEqual({ planned: false, fact: "failed", challenge: "failed" });
    expect(settleChecks(running, { challenge: parseCheckAnswer(fence("redrob-check", CHECK))?.challenge })).toMatchObject({
      fact: "failed",
      challenge: "done",
    });
    store.getState().settle("unknown", null);
    expect(store.getState().answers.unknown).toBeUndefined();
  });

  test("the check result maps onto FactCheckReport and ChallengeReport", () => {
    const result = parseCheckAnswer(`Here:\n${fence("redrob-check", CHECK)}`);
    if (!result?.fact || !result.challenge) throw new Error("no result");
    const fact = factReportProps(result.fact);
    expect(fact.summary).toBe("2 of 3 claims hold.");
    expect(fact.claims?.map((claim) => claim.verdict)).toEqual(["holds", "partly", "holds"]);
    expect(fact.missed).toEqual([{ text: "Amendment 2 excludes ending the agreement." }]);
    expect(fact.verdicts?.wrong).toEqual(["danger", "Not in that source"]);
    const challenge = challengeReportProps(result.challenge);
    expect(challenge).toMatchObject({ claim: "We can end the MSA by email.", state: "done", unsettled: "Whether a courier abroad counts." });
    expect(challenge.rounds).toHaveLength(1);
    expect(parseCheckAnswer("No block here.")).toBeNull();
  });

  test("runCrossCheck asks the check agent in a child session and settles the answer", async () => {
    const calls: string[] = [];
    const store = createCheckStore();
    const chat: TranscriptMessage[] = [
      { id: "u1", role: "user", completed: false, text: "Can we end it by email?" },
      { id: "a1", role: "assistant", completed: true, finish: "stop", text: "No. Clause 14.2 requires registered mail." },
    ];
    let polls = 0;
    const deps: CrossCheckDeps = {
      messages: async (sessionId) => {
        calls.push(`messages:${sessionId}`);
        if (sessionId === "s1") return chat;
        polls += 1;
        return polls < 2
          ? [{ id: "c1", role: "assistant", completed: false, text: "" }]
          : [{ id: "c1", role: "assistant", completed: true, finish: "stop", text: fence("redrob-check", CHECK) }];
      },
      createCheckSession: async (parentId) => {
        calls.push(`create:${parentId}`);
        return "check-1";
      },
      prompt: async (sessionId, _text, agent) => {
        calls.push(`prompt:${sessionId}:${agent}`);
      },
      sleep: async () => {},
      start: store.getState().start,
      settle: store.getState().settle,
    };
    await runCrossCheck(deps, { sessionId: "s1", question: "Can we end it by email?", planned: false, levels: DEFAULT_CROSS_CHECK });
    expect(calls).toEqual(["messages:s1", "create:s1", "prompt:check-1:redrob-check", "messages:check-1", "messages:check-1"]);
    expect(store.getState().answers.a1).toMatchObject({ fact: "done", challenge: "done" });

    const quiet = createCheckStore();
    await runCrossCheck(
      { ...deps, start: quiet.getState().start, settle: quiet.getState().settle, createCheckSession: async () => { throw new Error("not called"); } },
      { sessionId: "s1", question: "Q", planned: true, levels: { factCheck: "off", challenge: "off" } },
    );
    expect(quiet.getState().answers.a1).toEqual({ planned: true, fact: "off", challenge: "off" });
  });

  test("a failing check settles as failed rather than throwing", async () => {
    const store = createCheckStore();
    await runCrossCheck(
      {
        messages: async () => [{ id: "a1", role: "assistant", completed: true, text: "Clause 3 applies." }],
        createCheckSession: async () => {
          throw new Error("offline");
        },
        prompt: async () => {},
        sleep: async () => {},
        start: store.getState().start,
        settle: store.getState().settle,
      },
      { sessionId: "s1", question: "Q", planned: false, levels: { factCheck: "always", challenge: "off" } },
    );
    expect(store.getState().answers.a1).toMatchObject({ fact: "failed", challenge: "off" });
  });

  test("toTranscript reads engine messages", () => {
    const transcript = toTranscript([
      {
        info: { id: "a1", sessionID: "s1", role: "assistant", time: { created: 1, completed: 2 }, finish: "stop", parentID: "u1", modelID: "m", providerID: "p", mode: "x", agent: "redrob-run", path: { cwd: "/", root: "/" }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [
          { id: "p1", sessionID: "s1", messageID: "a1", type: "text", text: "Hello" },
          { id: "p2", sessionID: "s1", messageID: "a1", type: "text", text: "hidden", synthetic: true },
        ],
      },
    ]);
    expect(transcript).toEqual([{ id: "a1", role: "assistant", completed: true, finish: "stop", text: "Hello" }]);
  });
});

describe("approvals and memory", () => {
  test("Approve answers once, Reject rejects, Always only in Developer mode", () => {
    const replies: string[] = [];
    const respond = (id: string, reply: string) => replies.push(`${id}:${reply}`);
    const plain = approvalActions("p1", respond, false);
    plain.onApprove();
    plain.onReject();
    expect(plain.onAlways).toBeUndefined();
    const developer = approvalActions("p2", respond, true);
    developer.onAlways?.();
    expect(replies).toEqual(["p1:once", "p1:reject", "p2:always"]);
  });

  test("memory off adds its instruction to the system text", () => {
    expect(deskSystemText("none", undefined)).toBe(MEMORY_OFF_INSTRUCTION);
    expect(deskSystemText("none", "Env")).toBe(`Env\n\n${MEMORY_OFF_INSTRUCTION}`);
    expect(deskSystemText("all", "Env")).toBe("Env");
    expect(deskSystemText("project", undefined)).toBeUndefined();
    expect(MEMORY_OFF_INSTRUCTION).toContain("Do not read or save memory for this chat.");
  });

  test("a saved memory is read from the postMemory capability call", () => {
    const saved = {
      type: "dynamic-tool",
      toolName: "redrob-cloud_execute_capability",
      state: "output-available",
      input: { name: "redrob.postMemory", body: JSON.stringify({ content: "Filings by 16:00." }) },
    };
    expect(memorySavedFrom(saved)).toBe("Filings by 16:00.");
    expect(memorySavedFrom({ ...saved, state: "input-available" })).toBeNull();
    expect(memorySavedFrom({ ...saved, input: { name: "redrob.getMemorySearch", body: { content: "x" } } })).toBeNull();
    expect(memorySavedFrom({ type: "dynamic-tool", toolName: "redrob_execute", state: "output-available", input: { id: "postMemory", body: { content: "Kim signs." } } })).toBe("Kim signs.");
  });

  test("Korean strings come through t()", () => {
    setLocale("ko");
    expect(planRunPrompt("x").startsWith("이 계획대로 실행해 주세요.")).toBe(true);
    expect(receiptItems({ planned: false, fact: "off", challenge: "off" }).map((item) => item.label)).toEqual(["레드롭 자동", "확인하지 않음"]);
  });
});
