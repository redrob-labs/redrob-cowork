import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { RedrobServerError, type RedrobHandoffPreview } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import { HandoffForm, handoffFailureText } from "../src/react-app/desk/handoff/handoff-dialog";
import {
  entryLabel,
  findingWhere,
  formatBytes,
  handoffRequest,
  initialChoices,
  isOptional,
  liveFindings,
  optionalEntries,
  toggle,
} from "../src/react-app/desk/handoff/handoff-logic";

const PREVIEW: RedrobHandoffPreview = {
  session: { id: "ses_1", title: "Lease review" },
  from: { participantId: "par_000000000000000000000001", displayName: "Kim Jiwon" },
  entries: [
    { path: "session/engine.json", kind: "engine", bytes: 100, scannable: true },
    { path: "session/transcript.md", kind: "transcript", bytes: 50, scannable: true },
    { path: "files/memo.md", kind: "produced", bytes: 2048, scannable: true },
    { path: "files/scan.png", kind: "produced", bytes: 4096, scannable: false },
    { path: "workspace/skills/house-style/SKILL.md", kind: "skill", bytes: 30, scannable: true },
  ],
  readCandidates: ["lease.pdf"],
  missing: ["gone.md"],
  findings: [
    { id: "fnd_a", path: "files/memo.md", kind: "assignment", masked: "abc••••78", line: 3 },
    { id: "fnd_b", path: "session/engine.json", kind: "token", masked: "sk-••••xy", line: 40 },
  ],
  unscanned: ["files/scan.png"],
  fingerprint: "fp",
};

describe("handoff logic", () => {
  test("the request carries choices and the preview's fingerprint, without empty text", () => {
    const choices = { ...initialChoices(), ask: "continue" as const, to: "  ", note: " Over to you ", keep: ["fnd_a"] };
    expect(handoffRequest(choices, "fp")).toEqual({ ask: "continue", note: "Over to you", includeRead: [], keep: ["fnd_a"], exclude: [], fingerprint: "fp" });
  });

  test("only files and the library are optional", () => {
    expect(isOptional("produced")).toBe(true);
    expect(isOptional("skill")).toBe(true);
    expect(isOptional("engine")).toBe(false);
    expect(isOptional("transcript")).toBe(false);
    const { files, library } = optionalEntries(PREVIEW);
    expect(files.map((entry) => entry.path)).toEqual(["files/memo.md", "files/scan.png"]);
    expect(library.map((entry) => entry.path)).toEqual(["workspace/skills/house-style/SKILL.md"]);
  });

  test("leaving a file out stops its findings asking", () => {
    expect(liveFindings(PREVIEW, ["files/memo.md"]).map((finding) => finding.id)).toEqual(["fnd_b"]);
  });

  test("labels and sizes read plainly", () => {
    expect(entryLabel("files/notes/a.md")).toBe("notes/a.md");
    expect(entryLabel("workspace/skills/house-style/SKILL.md")).toBe("house-style");
    expect(entryLabel("workspace/commands/weekly.json")).toBe("weekly");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(findingWhere(PREVIEW.findings[1]!)).toBe(t("desk.handoff_where_chat"));
    expect(findingWhere(PREVIEW.findings[0]!)).toBe(t("desk.handoff_where_file", { name: "memo.md", line: 3 }));
    expect(toggle(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a", false)).toEqual(["b"]);
  });

  test("a stale preview and an engine failure say what to do", () => {
    expect(handoffFailureText(new RedrobServerError(409, "handoff_preview_stale", "x"))).toBe(t("desk.handoff_failed_stale"));
    expect(handoffFailureText(new RedrobServerError(502, "engine_export_failed", "x"))).toBe(t("desk.handoff_failed_engine"));
    expect(handoffFailureText(new Error("x"))).toBe(t("desk.settings_try_again"));
  });
});

describe("the handoff form", () => {
  test("shows what goes, what is secret, what was not checked, and what is missing", () => {
    const html = renderToStaticMarkup(<HandoffForm preview={PREVIEW} choices={initialChoices()} onChange={() => {}} onIncludeRead={() => {}} />);
    expect(html).toContain("memo.md");
    expect(html).toContain("house-style");
    expect(html).toContain("lease.pdf");
    expect(html).toContain("abc••••78");
    expect(html).toContain(t("desk.handoff_secrets_title", { count: 2 }));
    expect(html).toContain(t("desk.handoff_unscanned_title"));
    expect(html).toContain("gone.md");
    expect(html).toContain(t("desk.handoff_privacy_note"));
  });

  test("with every finding's file left out, nothing asks about secrets", () => {
    const choices = { ...initialChoices(), exclude: ["files/memo.md", "files/scan.png"] };
    const preview = { ...PREVIEW, findings: PREVIEW.findings.filter((finding) => finding.path === "files/memo.md") };
    const html = renderToStaticMarkup(<HandoffForm preview={preview} choices={choices} onChange={() => {}} onIncludeRead={() => {}} />);
    expect(html).not.toContain(t("desk.handoff_secrets_text"));
    expect(html).not.toContain(t("desk.handoff_unscanned_title"));
  });
});
