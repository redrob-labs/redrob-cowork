import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RedrobWorkPrivacyGate } from "../opencode-plugins/redrob-privacy-gate.js";
import { startServer } from "../server.js";
import type { ServerConfig } from "../types.js";
import { readPrivacyRules } from "./gate.js";
import { emptyLabelMap, labelText, restoreDeep, restoreText, shiftDates, type PrivacyRules } from "./labels.js";

const HIGH: PrivacyRules = { level: "high", names: [["김지원", "Jiwon Kim"], ["Acme Robotics"]] };

describe("labels", () => {
  test("a legal clause goes out with no identifiers and comes back whole; amounts and dates stay", () => {
    const map = emptyLabelMap();
    const clause =
      "제3조 (지급) 김지원님은 2026년 10월 31일까지 Acme Robotics에 ₩12,500,000을 국민은행 계좌 123-456-789012로 지급한다. 연락처: 010-1234-5678, jiwon@example.com";
    const out = labelText(clause, HIGH, map);
    for (const secret of ["김지원", "Acme Robotics", "123-456-789012", "010-1234-5678", "jiwon@example.com"]) {
      expect(out.text).not.toContain(secret);
    }
    expect(out.text).toContain("[PERSON_1]님은");
    expect(out.text).toContain("[ORG_1]에");
    expect(out.text).toContain("₩12,500,000");
    expect(out.text).toContain("2026년 10월 31일");
    expect(out.text).toContain("제3조");
    expect(restoreText(out.text, map).text).toBe(clause);
  });

  test("every form of a person shares one label, across texts in the same chat", () => {
    const map = emptyLabelMap();
    const a = labelText("김지원 signed. Later Jiwon Kim confirmed, and jiwon  kim paid.", HIGH, map).text;
    const b = labelText("김지원님께 보냈습니다.", HIGH, map).text;
    expect(a).toBe("[PERSON_1] signed. Later [PERSON_1] confirmed, and [PERSON_1] paid.");
    expect(b).toBe("[PERSON_1]님께 보냈습니다.");
    // A Latin form must be a whole word.
    expect(labelText("Kimchi and Jiwon Kimberly", HIGH, map).text).toBe("Kimchi and Jiwon Kimberly");
  });

  test("a financial statement keeps its figures; identifiers become labels", () => {
    const map = emptyLabelMap();
    const statement = "Revenue 4,210,000,000원 (+12.5%). Payable to Acme Robotics, BRN 220-81-62517, card 4111 1111 1111 1111.";
    const out = labelText(statement, HIGH, map).text;
    expect(out).toContain("4,210,000,000원 (+12.5%)");
    expect(out).toMatch(/\[ORG_1\]/);
    expect(out).toMatch(/\[BRN_1\]/);
    expect(out).toMatch(/\[CARD_1\]/);
  });

  test("the levels: off does nothing, standard leaves names, strict labels titles next to names", () => {
    const text = "대표 김지원 (jiwon@example.com)";
    expect(labelText(text, { ...HIGH, level: "off" }, emptyLabelMap()).text).toBe(text);
    expect(labelText(text, { ...HIGH, level: "standard" }, emptyLabelMap()).text).toBe("대표 김지원 ([EMAIL_1])");
    expect(labelText(text, { ...HIGH, level: "strict", transforms: { titlesNearNames: true } }, emptyLabelMap()).text).toBe(
      "[TITLE_1] [PERSON_1] ([EMAIL_1])",
    );
  });

  test("restore tolerates garbled labels and reports the ones this chat never made", () => {
    const map = emptyLabelMap();
    labelText("김지원", HIGH, map);
    const result = restoreText("[PERSON 1], PERSON_1, ［PERSON_1］ and [NAME_1] but not [PERSON_7]", map);
    expect(result.text).toBe("김지원, 김지원, 김지원 and 김지원 but not [PERSON_7]");
    expect(result.unmapped).toEqual(["[PERSON_7]"]);
    expect(restoreDeep({ to: ["[PERSON_1]"], n: 3 }, map)).toEqual({ to: ["김지원"], n: 3 });
  });

  test("the policy's transforms: amounts rounded, dates moved by the chat's fixed offset and back", () => {
    const rules: PrivacyRules = { level: "high", names: [], transforms: { roundAmounts: true, shiftDates: true } };
    const map = emptyLabelMap(10);
    const out = labelText("Due 2026-10-31 and 2026년 11월 3일: ₩12,345,678 and 9,876,543원", rules, map).text;
    expect(out).toBe("Due 2026-11-10 and 2026년 11월 13일: ₩12,000,000 and 9,900,000원");
    // The gap between the dates is unchanged, and a restore moves them back.
    expect(restoreText("2026-11-10", map).text).toBe("2026-10-31");
    expect(shiftDates("2026-02-27", 2)).toBe("2026-03-01");
  });

  test("the workspace config is read the way the app and the team policy write it", () => {
    expect(readPrivacyRules({}).level).toBe("standard");
    expect(readPrivacyRules({ deskPrivacy: { level: "high", names: ["Seorin"] } }).names).toEqual([["Seorin"]]);
    expect(
      readPrivacyRules({ deskPrivacy: { level: "strict", names: ["a", "b"], aliases: [["a", "b"]], transforms: { roundAmounts: true } } }),
    ).toMatchObject({ level: "strict", names: [["a", "b"]], transforms: { roundAmounts: true, titlesNearNames: true } });
  });
});

/* ---------- The engine plugin against a real redrob-server ---------- */

const dirs: string[] = [];
const savedEnv = {
  REDROB_RUNTIME_DB: process.env.REDROB_RUNTIME_DB,
  REDROB_DATA_DIR: process.env.REDROB_DATA_DIR,
  REDROB_DISABLE_SCHEDULER: process.env.REDROB_DISABLE_SCHEDULER,
  REDROB_SERVER_URL: process.env.REDROB_SERVER_URL,
  REDROB_SERVER_TOKEN: process.env.REDROB_SERVER_TOKEN,
};

afterEach(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function gateWithServer(privacy: Record<string, unknown>) {
  const workspace = await temp("redrob-gate-ws-");
  const dataDir = await temp("redrob-gate-data-");
  process.env.REDROB_DATA_DIR = dataDir;
  process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
  process.env.REDROB_DISABLE_SCHEDULER = "1";
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: "test-token",
    hostToken: "host-token",
    configPath: join(dataDir, "config.json"),
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: [],
    workspaces: [{ id: "workspace", name: "workspace", path: workspace, preset: "default", workspaceType: "local" }],
    authorizedRoots: [workspace],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
  const server = (await startServer(config)) as { port: number; stop: (force?: boolean) => void };
  const base = `http://127.0.0.1:${server.port}`;
  const issued = await fetch(`${base}/tokens`, {
    method: "POST",
    headers: { "X-Redrob-Host-Token": "host-token", "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "owner" }),
  });
  const owner = ((await issued.json()) as { token: string }).token;
  await fetch(`${base}/workspace/workspace/config`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${owner}`, "Content-Type": "application/json" },
    body: JSON.stringify({ redrob: { deskPrivacy: privacy } }),
  });
  // What the engine is launched with (embedded.ts): the server's URL and its token.
  process.env.REDROB_SERVER_URL = base;
  process.env.REDROB_SERVER_TOKEN = "test-token";
  const hooks = await RedrobWorkPrivacyGate({ directory: workspace });
  return { server, hooks };
}

const TEXT_FILE = `data:text/plain;base64,${Buffer.from("Invoice for 김지원, 010-9876-5432").toString("base64")}`;

function history() {
  return [
    {
      info: { id: "m1", sessionID: "ses_gate", role: "user" },
      parts: [
        { type: "text", text: "Summarise the contract for 김지원 (jiwon@example.com)." },
        // Text an attachment became (the office plugin runs first).
        { type: "text", text: "Extracted from contract.docx: Jiwon Kim agrees to pay ₩5,000,000.", synthetic: true },
        { type: "file", mime: "text/plain", filename: "invoice.txt", url: TEXT_FILE },
        { type: "file", mime: "image/png", filename: "scan.png", url: "data:image/png;base64,iVBORw0KGgo=" },
      ],
    },
    {
      info: { id: "m2", sessionID: "ses_gate", role: "assistant" },
      parts: [
        { type: "tool", tool: "read", state: { status: "completed", output: "notes.md: call 김지원님 on 010-1234-5678" } },
        { type: "tool", tool: "crm_lookup", state: { status: "completed", output: '{"owner":"Jiwon Kim","email":"jiwon@example.com"}' } },
      ],
    },
  ];
}

describe("the privacy gate in the engine", () => {
  test("labels typed text, attachments, file reads and connector results; leaves out what it cannot read", async () => {
    const { server, hooks } = await gateWithServer({ level: "high", names: ["김지원", "Jiwon Kim"], aliases: [["김지원", "Jiwon Kim"]] });
    try {
      const output = { messages: history() as Array<{ info: Record<string, unknown>; parts: Array<Record<string, any>> }> };
      await hooks["experimental.chat.messages.transform"]({}, output);
      const sent = JSON.stringify(output.messages);
      for (const secret of ["김지원", "Jiwon Kim", "jiwon@example.com", "010-1234-5678"]) expect(sent).not.toContain(secret);
      const [user, assistant] = output.messages;
      expect(user!.parts[0]!.text).toBe("Summarise the contract for [PERSON_1] ([EMAIL_1]).");
      expect(user!.parts[1]!.text).toBe("Extracted from contract.docx: [PERSON_1] agrees to pay ₩5,000,000.");
      expect(Buffer.from(user!.parts[2]!.url.split(",")[1], "base64").toString()).toBe("Invoice for [PERSON_1], [PHONE_1]");
      expect(user!.parts[3]).toMatchObject({ type: "text", synthetic: true });
      expect(user!.parts[3]!.text).toContain("scan.png");
      expect(assistant!.parts[0]!.state.output).toBe("notes.md: call [PERSON_1]님 on [PHONE_2]");
      expect(assistant!.parts[1]!.state.output).toBe('{"owner":"[PERSON_1]","email":"[EMAIL_1]"}');

      // The system text: team notes labelled, and the instruction to keep labels added.
      const system = { system: ["Team note: send drafts to 김지원 first."] };
      await hooks["experimental.chat.system.transform"]({ sessionID: "ses_gate" }, system);
      expect(system.system[0]).toBe("Team note: send drafts to [PERSON_1] first.");
      expect(system.system.at(-1)).toContain("[PERSON_1]");

      // A tool the agent calls gets the real values; the answer the person reads, too.
      const call = { args: { to: "[EMAIL_1]", body: "Dear [PERSON_1], see attached." } };
      await hooks["tool.execute.before"]({ sessionID: "ses_gate" }, call);
      expect(call.args).toEqual({ to: "jiwon@example.com", body: "Dear 김지원, see attached." });
      const answer = { text: "[PERSON_1] must pay ₩5,000,000; call [PHONE 2]." };
      await hooks["experimental.text.complete"]({ sessionID: "ses_gate" }, answer);
      expect(answer.text).toBe("김지원 must pay ₩5,000,000; call 010-1234-5678.");

      // Chat titles come from a model call that skips the messages hook, so they are turned off.
      const config: Record<string, any> = { agent: {} };
      await hooks.config(config);
      expect(config.agent.title).toEqual({ disable: true });
    } finally {
      server.stop(true);
    }
  });

  test("with protection off nothing changes; at Standard an attachment it cannot read still goes", async () => {
    const off = await gateWithServer({ level: "off" });
    try {
      const output = { messages: history() };
      const before = JSON.stringify(output.messages);
      await off.hooks["experimental.chat.messages.transform"]({}, output);
      expect(JSON.stringify(output.messages)).toBe(before);
      const config: Record<string, any> = {};
      await off.hooks.config(config);
      expect(config.agent).toBeUndefined();
    } finally {
      off.server.stop(true);
    }
    const standard = await gateWithServer({ level: "standard" });
    try {
      const output = { messages: history() as Array<{ parts: Array<Record<string, any>> }> };
      await standard.hooks["experimental.chat.messages.transform"]({}, output);
      expect(output.messages[0]!.parts[3]).toMatchObject({ type: "file", filename: "scan.png" });
      expect(output.messages[0]!.parts[0]!.text).toBe("Summarise the contract for 김지원 ([EMAIL_1]).");
    } finally {
      standard.server.stop(true);
    }
  });

  test("fails closed: when the server cannot label, the request is not sent", async () => {
    process.env.REDROB_SERVER_URL = "http://127.0.0.1:9";
    process.env.REDROB_SERVER_TOKEN = "x";
    const hooks = await RedrobWorkPrivacyGate({ directory: "/nowhere" });
    await expect(hooks["experimental.chat.messages.transform"]({}, { messages: history() })).rejects.toThrow(/nothing was sent/);
    delete process.env.REDROB_SERVER_URL;
    await expect(hooks["experimental.chat.system.transform"]({ sessionID: "s" }, { system: ["x"] })).rejects.toThrow(
      /nothing was sent/,
    );
    // Restoring an answer never loses it.
    const answer = { text: "[PERSON_1] said hi" };
    await hooks["experimental.text.complete"]({ sessionID: "s" }, answer);
    expect(answer.text).toBe("[PERSON_1] said hi");
  });
});
