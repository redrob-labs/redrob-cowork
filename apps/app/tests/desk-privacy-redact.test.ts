import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createSendRedactor, previewRedaction } from "../src/react-app/desk/privacy/privacy-send";
import { createPrivacyMapStore, readStoredPrivacy, weekKey } from "../src/react-app/desk/privacy/privacy-store";
import { PLACEHOLDER_INSTRUCTION, foundCategories, redact, restore, type RedactCategory } from "../src/react-app/desk/privacy/redact";

const STRICT = { level: "strict" as const, names: ["Kim Minjun", "김민준", "Seorin"] };

/** What each kind looks like, and the placeholder it should go as, at Strict. */
const CAUGHT: Array<[string, RedactCategory, string]> = [
  ["Write to kim.minjun@acme.co.kr today", "email", "[EMAIL_1]"],
  ["주민등록번호 900101-1234568 확인", "rrn", "[RRN_1]"],
  ["RRN 9001011234568 on file", "rrn", "[RRN_1]"],
  ["사업자등록번호 220-81-12341", "brn", "[BRN_1]"],
  ["Card 4111 1111 1111 1111 expires", "card", "[CARD_1]"],
  ["Call 010-1234-5678 after six", "phone", "[PHONE_1]"],
  ["Call +82 10 1234 5678", "phone", "[PHONE_1]"],
  ["사무실 02-345-6789로 전화", "phone", "[PHONE_1]"],
  ["US office +1 415 555 2671", "phone", "[PHONE_1]"],
  ["입금 계좌 110-123-456789 신한", "account", "[ACCOUNT_1]"],
  ["account number 12345678901234 at the bank", "account", "[ACCOUNT_1]"],
  ["서울특별시 강남구 테헤란로 123 3층", "address", "[ADDRESS_1]"],
  ["Ship to 221 Baker Street tomorrow", "address", "[ADDRESS_1]"],
  ["Ask Kim Minjun first", "name", "[NAME_1]"],
  ["김민준 변호사에게 보내 주세요", "name", "[NAME_1]"],
];

/** Shapes that look close and are not private details. */
const LEFT_ALONE = [
  "The meeting is on 2026-10-05 at 14:00.",
  "Invoice total 1,250,000원, due 2026.11.30",
  "RRN 9001011234567 has a bad checksum",
  "사업자번호 2208112345 는 체크섬이 맞지 않습니다",
  "Order 4111 1111 1111 1112 is not a card",
  "Clause 14.2 of the 2024 agreement",
  "Version 1.18.31 shipped",
];

describe("redact", () => {
  test.each(CAUGHT)("%s → %s", (text, category, placeholder) => {
    const result = redact(text, STRICT);
    expect(result.found).toEqual([category]);
    expect(result.text).toContain(placeholder);
    expect(Object.values(result.map)).toHaveLength(1);
  });

  test.each(LEFT_ALONE)("left alone: %s", (text) => {
    const result = redact(text, STRICT);
    expect(result.found).toEqual([]);
    expect(result.text).toBe(text);
  });

  test("the level decides what is swapped", () => {
    const text = "kim@acme.kr, 계좌 110-123-456789, Kim Minjun";
    expect(redact(text, { level: "off", names: STRICT.names }).text).toBe(text);
    expect(foundCategories(redact(text, { level: "standard", names: STRICT.names }).found)).toEqual(["email"]);
    expect(foundCategories(redact(text, { level: "high", names: STRICT.names }).found)).toEqual(["email", "account"]);
    expect(foundCategories(redact(text, { level: "strict", names: STRICT.names }).found)).toEqual(["email", "account", "name"]);
  });

  test("restore puts every real detail back", () => {
    const text = "Email kim@acme.kr about 900101-1234568 and call 010-1234-5678. Kim Minjun signs.";
    const sent = redact(text, STRICT);
    expect(sent.text).toBe("Email [EMAIL_1] about [RRN_1] and call [PHONE_1]. [NAME_1] signs.");
    for (const original of ["kim@acme.kr", "900101-1234568", "010-1234-5678", "Kim Minjun"]) expect(sent.text).not.toContain(original);
    expect(restore(sent.text, sent.map)).toBe(text);
    // A placeholder the chat never made stays as it is.
    expect(restore("[EMAIL_9] and [EMAIL_1]", sent.map)).toBe("[EMAIL_9] and kim@acme.kr");
  });

  test("a detail keeps its placeholder across the chat, and a new one gets the next number", () => {
    const first = redact("kim@acme.kr", STRICT);
    const second = redact("again kim@acme.kr, and lee@acme.kr", STRICT, first.map);
    expect(second.text).toBe("again [EMAIL_1], and [EMAIL_2]");
  });
});

describe("one send", () => {
  test("text parts are redacted, file parts left alone, and the map is kept for the chat", () => {
    const store = createPrivacyMapStore();
    const redactor = createSendRedactor(STRICT, {});
    const parts = redactor.parts([
      { type: "text" as const, text: "Email kim@acme.kr" },
      { type: "file" as const, url: "file:///contract.pdf", mime: "application/pdf" },
    ]);
    expect(parts).toEqual([
      { type: "text", text: "Email [EMAIL_1]" },
      { type: "file", url: "file:///contract.pdf", mime: "application/pdf" },
    ]);
    // The notes and the check question share the map: the same detail, the same placeholder.
    expect(redactor.text("Note: kim@acme.kr prefers mornings")).toBe("Note: [EMAIL_1] prefers mornings");
    expect(redactor.instruction()).toBe(PLACEHOLDER_INSTRUCTION);
    store.getState().remember("s1", redactor.map, redactor.found, Date.UTC(2026, 9, 5));
    expect(store.getState().maps.s1).toEqual({ "[EMAIL_1]": "kim@acme.kr" });
    expect(store.getState().keptThisWeek(Date.UTC(2026, 9, 6))).toBe(2);
    expect(store.getState().keptThisWeek(Date.UTC(2026, 9, 14))).toBe(0);
  });

  test("nothing found adds no instruction; Strict preview counts what will be hidden", () => {
    expect(createSendRedactor(STRICT, {}).instruction()).toBeNull();
    expect(previewRedaction("Ask Seorin and kim@acme.kr", STRICT, {})).toHaveLength(2);
  });

  test("a fork reads the chat's placeholders", () => {
    const store = createPrivacyMapStore();
    store.getState().remember("s1", { "[EMAIL_1]": "kim@acme.kr" }, ["email"]);
    store.getState().share("s1", "fork-1");
    expect(store.getState().maps["fork-1"]).toEqual({ "[EMAIL_1]": "kim@acme.kr" });
  });
});

describe("stored settings", () => {
  test("default to Standard; read the level, names, setBy and lock from the workspace", () => {
    expect(readStoredPrivacy({})).toEqual({ level: "standard", names: [], setBy: null, locked: false });
    expect(readStoredPrivacy({ deskPrivacy: { level: "strict", names: ["Seorin", 3, ""], setBy: "Park", locked: true } })).toEqual({
      level: "strict",
      names: ["Seorin"],
      setBy: "Park",
      locked: true,
    });
    expect(readStoredPrivacy({ deskPrivacy: { level: "max" } }).level).toBe("standard");
  });

  test("weeks start on Monday", () => {
    expect(weekKey(Date.UTC(2026, 9, 5))).toBe("2026-W41");
    expect(weekKey(Date.UTC(2026, 9, 11))).toBe("2026-W41");
    expect(weekKey(Date.UTC(2026, 9, 12))).toBe("2026-W42");
  });
});

describe("wiring", () => {
  const src = (path: string) => readFileSync(join(import.meta.dir, "..", "src", path), "utf8");

  test("the send path no longer redacts: redrob-server's privacy gate labels everything the model reads", () => {
    const route = src("react-app/shell/session-route.tsx");
    // Redacting here as well would label typed text twice, with two maps, and still miss attachments
    // and tool results; the gate (apps/server/src/opencode-plugins/redrob-privacy-gate.ts) covers all of it.
    expect(route).not.toContain("createSendRedactor");
    expect(route).toContain("const parts = draftParts;");
    expect(route).toContain("const requestText = writtenRequest;");
    // The Strict confirm still asks before anything is sent, and unreadable settings still mean the default.
    expect(route).toContain("previewRedaction(text, privacySettings, previousPlaceholders)");
    expect(route).toContain(".catch(() => ({ level: DEFAULT_PRIVACY_LEVEL, names: [] }))");
    const runtime = readFileSync(join(import.meta.dir, "..", "..", "server", "src", "redrob-runtime-config.ts"), "utf8");
    expect(runtime).toContain("redrobPrivacyGatePluginPath()");
  });

  test("the chat shows the real details, in answers, the person's messages, edits and copies", () => {
    const list = src("components/chat/message-list.tsx");
    expect(list).toContain("const groupText = restore(group.text, placeholders)");
    expect(list).toContain("renderUserTextWithSkillChips(restore(part.text, placeholders), highlightQuery)");
    expect(list).toContain("restore(getMessagesText([message]), placeholders)");
    expect(src("react-app/domains/session/surface/session-surface.tsx")).toContain("restore(transcriptToText(renderedMessages)");
  });
});
