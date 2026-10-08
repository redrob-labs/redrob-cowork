import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setEngineCliTemplate } from "./engine-cli.js";
import {
  applyDecisions,
  buildHandoffDraft,
  bundleFilePath,
  contentsDigest,
  deskBlocksOf,
  handoffFileName,
  isNeverCarried,
  sessionFiles,
  transcriptMarkdown,
  writeHandoffBundle,
  type HandoffManifest,
} from "./handoff-bundle.js";
import { findHandoff } from "./handoff-registry.js";
import { emptyReview } from "./review-store.js";
import { createFakeEngine, sampleSession } from "./test-support/fake-engine.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";
import { findSecretsInText, redactMatches } from "./text-secrets.js";
import { ZipError, readZip, writeZip } from "./zip.js";

const dirs: string[] = [];
afterEach(async () => {
  setEngineCliTemplate(null);
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const kim = { participantId: "par_000000000000000000000001", displayName: "Kim Jiwon" };

describe("secrets in text", () => {
  test("finds values by shape, not words in prose", () => {
    const text = [
      "Remember to rotate the password next week.",
      "Authorization: Bearer abcdefghijklmnop1234",
      "export OPENAI=sk-proj-abcdefghijklmnopqrstu",
      'config: { "password": "hunter2hunter2" }',
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlMTIz",
    ].join("\n");
    const found = findSecretsInText(text);
    expect(found.map((match) => match.kind)).toEqual(["bearer", "token", "assignment", "jwt"]);
    const redacted = redactMatches(text, found);
    expect(redacted).toContain("rotate the password next week");
    expect(redacted).not.toContain("hunter2hunter2");
    expect(redacted).not.toContain("sk-proj-");
  });

  test("a private key block is one finding", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----";
    expect(findSecretsInText(`x ${pem} y`)).toHaveLength(1);
  });

  test("redacting inside JSON keeps it JSON", () => {
    const value = JSON.stringify({ text: 'token="abcdefghij\\"rest' });
    const redacted = redactMatches(value, findSecretsInText(value));
    expect(() => JSON.parse(redacted)).not.toThrow();
  });
});

describe("zip", () => {
  test("round-trips names, bytes and UTF-8", () => {
    const zip = writeZip([
      { name: "manifest.json", data: Buffer.from("{}") },
      { name: "files/계약서.txt", data: Buffer.from("본문") },
    ]);
    const entries = readZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["manifest.json", "files/계약서.txt"]);
    expect(entries[1]?.data.toString("utf8")).toBe("본문");
  });

  test("refuses unsafe names, duplicates, and damage", () => {
    expect(() => writeZip([{ name: "../x", data: Buffer.alloc(0) }])).toThrow(ZipError);
    expect(() => writeZip([{ name: "/abs", data: Buffer.alloc(0) }])).toThrow(ZipError);
    expect(() => writeZip([{ name: "a", data: Buffer.alloc(0) }, { name: "a", data: Buffer.alloc(0) }])).toThrow(ZipError);
    const zip = writeZip([{ name: "a.txt", data: Buffer.from("hello") }]);
    const corrupt = Buffer.from(zip);
    corrupt[30 + 5] = 0x58;
    expect(() => readZip(corrupt)).toThrow(ZipError);
    expect(() => readZip(Buffer.from("not a zip at all, definitely not"))).toThrow(ZipError);
  });
});

describe("what a session touched", () => {
  test("separates written files from read ones, relative to the session folder", () => {
    const session = sampleSession({
      directory: "/work",
      tools: [
        { tool: "read", filePath: "lease.pdf" },
        { tool: "write", filePath: "/work/memo.docx" },
        { tool: "read", filePath: "/work/memo.docx" },
        { tool: "edit", filePath: "notes/a.md" },
      ],
    });
    expect(sessionFiles(session, "/work")).toEqual({ produced: ["/work/memo.docx", "/work/notes/a.md"], read: ["/work/lease.pdf"] });
  });

  test("files outside the workspace and config that runs code are never carried", () => {
    expect(bundleFilePath("/work/memo.docx", "/work")).toBe("files/memo.docx");
    expect(bundleFilePath("/etc/passwd", "/work")).toBeNull();
    expect(bundleFilePath("/work/.env.local", "/work")).toBeNull();
    expect(bundleFilePath("/work/.opencode/plugins/x.ts", "/work")).toBeNull();
    expect(isNeverCarried("opencode.json")).toBe(true);
    expect(isNeverCarried("keys/server.pem")).toBe(true);
  });

  test("transcript and desk blocks read the conversation", () => {
    const plan = { title: "Plan", todo: [{ id: "s1", label: "Read" }] };
    const session = sampleSession({ text: `Here.\n\n\`\`\`redrob-plan\n${JSON.stringify(plan)}\n\`\`\`` });
    expect(transcriptMarkdown(session)).toContain("## User\n\nRead clause 4");
    expect(deskBlocksOf(session)).toEqual([{ messageId: session.messages[1]!.info.id, plan }]);
  });
});

describe("the draft and the bundle", () => {
  async function workspaceWithFiles() {
    const root = await temp("redrob-handoff-ws-");
    await writeFile(join(root, "memo.md"), "Draft memo. api_key=abcd1234efgh5678\n");
    await writeFile(join(root, "lease.txt"), "The lease.\n");
    await writeFile(join(root, "scan.bin"), Buffer.from([0, 1, 2, 3]));
    return root;
  }

  test("finds secrets, lists read files without carrying them, and notes what it could not scan", async () => {
    const root = await workspaceWithFiles();
    const exported = sampleSession({
      directory: root,
      text: "Use token: abcdefghijkl12345",
      tools: [
        { tool: "write", filePath: "memo.md" },
        { tool: "write", filePath: "scan.bin" },
        { tool: "write", filePath: "gone.md" },
        { tool: "read", filePath: "lease.txt" },
      ],
    });
    const draft = await buildHandoffDraft({
      exported,
      review: emptyReview(),
      workspaceRoot: root,
      sessionDirectory: root,
      skills: [{ name: "house-style", content: "# House style" }, { name: "../evil", content: "x" }],
      commands: [{ name: "weekly-update", template: "Write the update" }],
      includeRead: [],
    });
    const paths = draft.entries.map((entry) => entry.path);
    expect(paths).toContain("files/memo.md");
    expect(paths).toContain("workspace/skills/house-style/SKILL.md");
    expect(paths).toContain("workspace/commands/weekly-update.json");
    expect(paths).not.toContain("files/lease.txt");
    expect(paths.some((path) => path.includes("evil"))).toBe(false);
    expect(draft.readCandidates).toEqual(["lease.txt"]);
    expect(draft.missing).toEqual(["gone.md"]);
    expect(draft.unscanned).toEqual(["files/scan.bin"]);
    expect(draft.findings.map((finding) => finding.path)).toContain("files/memo.md");
    expect(draft.findings.some((finding) => finding.path === "session/engine.json")).toBe(true);
    expect(draft.findings.every((finding) => !finding.masked.includes("abcd1234efgh5678"))).toBe(true);

    const withRead = await buildHandoffDraft({
      exported,
      review: emptyReview(),
      workspaceRoot: root,
      sessionDirectory: root,
      skills: [],
      commands: [],
      includeRead: ["lease.txt"],
    });
    expect(withRead.entries.map((entry) => entry.path)).toContain("files/lease.txt");
    expect(withRead.fingerprint).not.toBe(draft.fingerprint);
  });

  test("redacts by default, keeps what the sender keeps, and refuses to drop the transcript", async () => {
    const root = await workspaceWithFiles();
    const exported = sampleSession({ directory: root, tools: [{ tool: "write", filePath: "memo.md" }] });
    const draft = await buildHandoffDraft({ exported, review: emptyReview(), workspaceRoot: root, sessionDirectory: root, skills: [], commands: [], includeRead: [] });
    const memoFinding = draft.findings.find((finding) => finding.path === "files/memo.md");
    expect(memoFinding).toBeDefined();

    const redacted = applyDecisions(draft, { keep: new Set(), exclude: new Set() });
    expect(redacted.find((entry) => entry.path === "files/memo.md")?.data.toString()).toContain("[REDACTED]");
    const kept = applyDecisions(draft, { keep: new Set([memoFinding!.id]), exclude: new Set() });
    expect(kept.find((entry) => entry.path === "files/memo.md")?.data.toString()).toContain("abcd1234efgh5678");
    const without = applyDecisions(draft, { keep: new Set(), exclude: new Set(["files/memo.md"]) });
    expect(without.some((entry) => entry.path === "files/memo.md")).toBe(false);
    expect(() => applyDecisions(draft, { keep: new Set(), exclude: new Set(["session/transcript.md"]) })).toThrow();
  });

  test("the bundle opens with a manifest whose digest matches its contents", async () => {
    const root = await workspaceWithFiles();
    const exported = sampleSession({ directory: root });
    const draft = await buildHandoffDraft({ exported, review: emptyReview(), workspaceRoot: root, sessionDirectory: root, skills: [], commands: [], includeRead: [] });
    const { manifest, zip } = writeHandoffBundle(applyDecisions(draft, { keep: new Set(), exclude: new Set() }), {
      from: kim,
      to: "Park",
      ask: "review",
      note: "Check clause 4",
      workspaceName: "Client A",
      sessionTitle: "Lease review",
      sessionId: exported.info.id,
      redrobCodeVersion: "0.1.0",
    });
    const entries = readZip(zip);
    expect(entries[0]?.name).toBe("manifest.json");
    const opened = JSON.parse(entries[0]!.data.toString("utf8")) as HandoffManifest;
    expect(opened).toMatchObject({ format: "redrob-handoff", v: 1, ask: "review", to: "Park", note: "Check clause 4", from: kim });
    expect(opened.digest).toBe(contentsDigest(opened.contents));
    expect(opened.contents.map((entry) => entry.path).sort()).toEqual(entries.slice(1).map((entry) => entry.name).sort());
    expect(manifest.id).toMatch(/^hof_[a-f0-9]{24}$/);
  });

  test("file names come from the title", () => {
    expect(handoffFileName("Lease review: Seorin MSA", new Date("2026-10-08T00:00:00Z"))).toBe("lease-review-seorin-msa-2026-10-08.redrobhandoff");
    expect(handoffFileName("계약 검토", new Date("2026-10-08T00:00:00Z"))).toMatch(/\.redrobhandoff$/);
    expect(handoffFileName("!!!", new Date("2026-10-08T00:00:00Z"))).toBe("session-2026-10-08.redrobhandoff");
  });
});

describe("handoff routes", () => {
  test("preview, then a bundle that matches it; a stale preview is refused", async () => {
    const harness = await startRouteTestServer();
    const engine = await createFakeEngine();
    dirs.push(engine.root);
    try {
      await mkdir(harness.workspace, { recursive: true });
      await writeFile(join(harness.workspace, "memo.md"), "password=correcthorsebattery\n");
      const session = sampleSession({ directory: harness.workspace, tools: [{ tool: "write", filePath: "memo.md" }] });
      await engine.seed(session);
      setEngineCliTemplate({ bin: engine.bin, env: { XDG_DATA_HOME: engine.dataHome } });
      await harness.host("PUT", "/profile", { displayName: "Kim Jiwon" });

      const base = `/workspace/workspace/sessions/${session.info.id}/handoff`;
      const preview = await harness.collaborator("POST", `${base}/preview`, {});
      expect(preview.status).toBe(200);
      const body = (await preview.json()) as { fingerprint: string; findings: Array<{ id: string; path: string }>; from: { displayName: string } };
      expect(body.from.displayName).toBe("Kim Jiwon");
      expect(body.findings.some((finding) => finding.path === "files/memo.md")).toBe(true);

      expect((await harness.collaborator("POST", base, { ask: "review", fingerprint: "stale" })).status).toBe(409);
      expect((await harness.collaborator("POST", base, { ask: "nope", fingerprint: body.fingerprint })).status).toBe(400);

      const created = await harness.collaborator("POST", base, { ask: "continue", to: "Park", note: "Over to you", fingerprint: body.fingerprint });
      expect(created.status).toBe(200);
      expect(created.headers.get("content-type")).toBe("application/zip");
      expect(created.headers.get("content-disposition")).toContain(".redrobhandoff");
      const entries = readZip(Buffer.from(await created.arrayBuffer()));
      const manifest = JSON.parse(entries[0]!.data.toString("utf8")) as HandoffManifest;
      expect(manifest.ask).toBe("continue");
      expect(entries.find((entry) => entry.name === "files/memo.md")?.data.toString()).toContain("[REDACTED]");
      expect(await findHandoff(harness.config, manifest.id, "sent")).toMatchObject({ sessionId: session.info.id, to: "Park" });

      const viewer = harness.as(await harness.issueToken("viewer"));
      expect((await viewer("POST", `${base}/preview`, {})).status).toBe(403);
      expect((await harness.collaborator("POST", "/workspace/workspace/sessions/ses_unknown0000000000000000/handoff/preview", {})).status).toBe(502);
    } finally {
      await harness.cleanup();
    }
  });
});
