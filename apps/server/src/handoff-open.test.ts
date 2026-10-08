import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setEngineCliTemplate } from "./engine-cli.js";
import { applyDecisions, buildHandoffDraft, writeHandoffBundle } from "./handoff-bundle.js";
import { HandoffOpenError, describeBundle, openHandoffBundle, transcriptSeedSession, writeCarriedFiles } from "./handoff-open.js";
import { createReviewCommentId, readSessionReview, type SessionReview } from "./review-store.js";
import { readEngineSessionExport, type EngineSessionExport } from "./session-export.js";
import { createFakeEngine, sampleSession } from "./test-support/fake-engine.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";
import { readZip, writeZip } from "./zip.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  setEngineCliTemplate(null);
  while (cleanups.length) await cleanups.pop()?.();
});

const kim = { participantId: "par_000000000000000000000001", displayName: "Kim Jiwon" };

async function bundleFor(options: { session?: EngineSessionExport; review?: SessionReview; files?: Record<string, string> } = {}) {
  const engine = await createFakeEngine();
  cleanups.push(() => rm(engine.root, { recursive: true, force: true }));
  const root = engine.root;
  for (const [name, content] of Object.entries(options.files ?? { "memo.md": "The memo.\n" })) await writeFile(join(root, name), content);
  const session =
    options.session ??
    sampleSession({ directory: root, tools: Object.keys(options.files ?? { "memo.md": "" }).map((filePath) => ({ tool: "write", filePath })) });
  const draft = await buildHandoffDraft({
    exported: session,
    review: options.review ?? { comments: [], state: { status: "open", by: null, at: 0 } },
    workspaceRoot: root,
    sessionDirectory: root,
    skills: [{ name: "house-style", content: "---\nname: house-style\ndescription: House style\n---\nNumbered clauses." }],
    commands: [{ name: "weekly-update", template: "Write the weekly update" }],
    includeRead: [],
  });
  return writeHandoffBundle(applyDecisions(draft, { keep: new Set(), exclude: new Set() }), {
    from: kim,
    to: "Park",
    ask: "review",
    note: "Check clause 4",
    workspaceName: "Client A",
    sessionTitle: "Lease review",
    sessionId: session.info.id,
    redrobCodeVersion: "0.1.0",
  });
}

function rezip(zip: Buffer, change: (entries: Array<{ name: string; data: Buffer }>) => Array<{ name: string; data: Buffer }>) {
  return writeZip(change(readZip(zip)));
}

describe("opening a bundle", () => {
  test("reads what it carries and describes it", async () => {
    const { zip } = await bundleFor();
    const opened = openHandoffBundle(zip);
    expect(opened.files.map((file) => file.relativePath)).toEqual(["memo.md"]);
    expect(opened.skills.map((skill) => skill.name)).toEqual(["house-style"]);
    expect(opened.commands.map((command) => command.name)).toEqual(["weekly-update"]);
    expect(describeBundle(opened)).toMatchObject({ from: kim, ask: "review", note: "Check clause 4", to: "Park", session: { title: "Lease review", messages: 2 } });
  });

  test("a changed file, an unlisted file, a missing file or a forged digest is refused", async () => {
    const { zip } = await bundleFor();
    const changed = rezip(zip, (entries) => entries.map((entry) => (entry.name === "files/memo.md" ? { ...entry, data: Buffer.from("changed") } : entry)));
    expect(() => openHandoffBundle(changed)).toThrow(HandoffOpenError);
    const added = rezip(zip, (entries) => [...entries, { name: "files/extra.md", data: Buffer.from("x") }]);
    expect(() => openHandoffBundle(added)).toThrow(HandoffOpenError);
    const missing = rezip(zip, (entries) => entries.filter((entry) => entry.name !== "files/memo.md"));
    expect(() => openHandoffBundle(missing)).toThrow(HandoffOpenError);
    const forged = rezip(zip, (entries) =>
      entries.map((entry) => {
        if (entry.name !== "manifest.json") return entry;
        const manifest = JSON.parse(entry.data.toString());
        manifest.digest = "0".repeat(64);
        return { ...entry, data: Buffer.from(JSON.stringify(manifest)) };
      }),
    );
    expect(() => openHandoffBundle(forged)).toThrow(HandoffOpenError);
  });

  test("a bundle may not carry plugins, env files or paths outside its layout", async () => {
    const { zip } = await bundleFor();
    for (const name of ["files/.env", "files/.opencode/plugins/x.ts", "workspace/agents/x.md", "opencode.json"]) {
      const evil = rezip(zip, (entries) => [...entries, { name, data: Buffer.from("x") }]);
      expect(() => openHandoffBundle(evil)).toThrow(HandoffOpenError);
    }
  });

  test("a newer format asks for an update; something else is not a handoff", async () => {
    const { zip } = await bundleFor();
    const newer = rezip(zip, (entries) =>
      entries.map((entry) => (entry.name === "manifest.json" ? { ...entry, data: Buffer.from(JSON.stringify({ ...JSON.parse(entry.data.toString()), v: 2 })) } : entry)),
    );
    expect(() => openHandoffBundle(newer)).toThrow(/newer/);
    expect(() => openHandoffBundle(writeZip([{ name: "a.txt", data: Buffer.from("x") }]))).toThrow(HandoffOpenError);
    expect(() => openHandoffBundle(Buffer.from("plain text, not a zip at all"))).toThrow(HandoffOpenError);
  });

  test("carried files never replace one already in the folder", async () => {
    const engine = await createFakeEngine();
    cleanups.push(() => rm(engine.root, { recursive: true, force: true }));
    await writeFile(join(engine.root, "memo.md"), "mine");
    await expect(writeCarriedFiles(engine.root, [{ relativePath: "memo.md", kind: "produced", data: Buffer.from("theirs") }])).rejects.toThrow(
      HandoffOpenError,
    );
    expect(await readFile(join(engine.root, "memo.md"), "utf8")).toBe("mine");
  });

  test("the fallback seed is a valid export holding the transcript", () => {
    const seed = transcriptSeedSession({ title: "Lease review", transcript: "# Lease\n\n## User\n\nRead it", fromName: "Kim", engineVersion: "0.1.0", directory: "/x" });
    expect(() => readEngineSessionExport(seed)).not.toThrow();
    expect(String(seed.messages[0]?.parts[0]?.text)).toContain("Read it");
  });
});

describe("handoff open routes", () => {
  async function setup() {
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    const engine = await createFakeEngine();
    cleanups.push(() => rm(engine.root, { recursive: true, force: true }));
    setEngineCliTemplate({ bin: engine.bin, env: { XDG_DATA_HOME: engine.dataHome } });
    const raw = (path: string, body: Buffer) =>
      fetch(`${harness.base}${path}`, {
        method: "POST",
        headers: { "X-Redrob-Host-Token": harness.config.hostToken, "Content-Type": "application/zip" },
        body: new Uint8Array(body),
      });
    const project = async (name: string) => {
      const response = await harness.host("POST", "/workspaces/local", { name, managed: true, preset: "starter" });
      expect(response.status).toBe(201);
      return ((await response.json()) as { workspace: { id: string; path: string } }).workspace;
    };
    return { harness, engine, raw, project };
  }

  test("inspect, then open: files, library, chat and comments land in the new project", async () => {
    const { harness, engine, raw, project } = await setup();
    const commentId = createReviewCommentId();
    const session = sampleSession({ directory: "/sender", tools: [{ tool: "write", filePath: "/sender/memo.md" }] });
    const { zip, manifest } = await bundleFor({
      review: {
        comments: [{ id: commentId, anchor: { kind: "message", messageId: session.messages[1]!.info.id }, author: kim, text: "See clause 4", createdAt: 1, origin: "local" }],
        state: { status: "changes_requested", by: kim, at: 5 },
      },
    });

    const inspected = await raw("/handoff/inspect", zip);
    expect(inspected.status).toBe(200);
    const { digest, compatibility, alreadyOpened } = (await inspected.json()) as { digest: string; compatibility: string; alreadyOpened: unknown };
    expect(compatibility).toBe("same");
    expect(alreadyOpened).toBeNull();

    const target = await project("Handoff: Lease review");
    expect((await raw(`/workspace/${target.id}/handoff/open?digest=wrong`, zip)).status).toBe(409);
    const opened = await raw(`/workspace/${target.id}/handoff/open?digest=${digest}`, zip);
    expect(opened.status).toBe(201);
    const result = (await opened.json()) as { sessionId: string; fallback: boolean };
    expect(result.fallback).toBe(false);
    expect(await readFile(join(target.path, "memo.md"), "utf8")).toBe("The memo.\n");
    expect(await readFile(join(target.path, ".opencode", "skills", "house-style", "SKILL.md"), "utf8")).toContain("Numbered clauses");

    const stored = JSON.parse(await readFile(join(engine.dataHome, "fake", `${result.sessionId}.json`), "utf8")) as EngineSessionExport;
    expect(stored.info.directory).toBe(target.path);
    const review = await readSessionReview(harness.config, target.id, result.sessionId);
    expect(review.comments.map((comment) => [comment.text, comment.origin, comment.author.displayName])).toEqual([["See clause 4", "handoff", "Kim Jiwon"]]);
    expect(review.state.status).toBe("changes_requested");

    const status = await harness.collaborator("GET", `/workspace/${target.id}/sessions/${result.sessionId}/handoff`);
    const { handoff } = (await status.json()) as { handoff: { id: string; ask: string; continuedAt?: number } };
    expect(handoff).toMatchObject({ id: manifest.id, ask: "review" });
    expect(handoff.continuedAt).toBeUndefined();
    const continued = await harness.collaborator("POST", `/workspace/${target.id}/sessions/${result.sessionId}/handoff/continue`, {});
    expect(((await continued.json()) as { handoff: { continuedAt: number } }).handoff.continuedAt).toBeNumber();

    // Opening the same file again lands a second, rekeyed chat rather than merging into the first.
    const again = (await (await raw("/handoff/inspect", zip)).json()) as { alreadyOpened: { sessionId: string } | null };
    expect(again.alreadyOpened?.sessionId).toBe(result.sessionId);
    const second = await project("Handoff: Lease review");
    const reopened = (await (await raw(`/workspace/${second.id}/handoff/open?digest=${digest}`, zip)).json()) as { sessionId: string };
    expect(reopened.sessionId).not.toBe(result.sessionId);
    const secondReview = await readSessionReview(harness.config, second.id, reopened.sessionId);
    const rekeyed = JSON.parse(await readFile(join(engine.dataHome, "fake", `${reopened.sessionId}.json`), "utf8")) as EngineSessionExport;
    expect(secondReview.comments[0]?.anchor.messageId).toBe(rekeyed.messages[1]?.info.id);
  });

  test("an engine that cannot read the export gets the transcript instead", async () => {
    const { raw, project, engine } = await setup();
    const session = sampleSession({ directory: "/sender" });
    session.info.version = "refuse";
    const { zip } = await bundleFor({ session, files: {} });
    const { digest } = (await (await raw("/handoff/inspect", zip)).json()) as { digest: string };
    const target = await project("Handoff");
    const opened = (await (await raw(`/workspace/${target.id}/handoff/open?digest=${digest}`, zip)).json()) as { sessionId: string; fallback: boolean };
    expect(opened.fallback).toBe(true);
    const stored = JSON.parse(await readFile(join(engine.dataHome, "fake", `${opened.sessionId}.json`), "utf8")) as EngineSessionExport;
    expect(String(stored.messages[0]?.parts[0]?.text)).toContain("Read clause 4");
  });

  test("only the person at this machine opens a handoff", async () => {
    const { harness } = await setup();
    const { zip } = await bundleFor();
    const response = await fetch(`${harness.base}/handoff/inspect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${harness.config.token}`, "Content-Type": "application/zip" },
      body: new Uint8Array(zip),
    });
    expect(response.status).toBe(401);
    const byPath = await harness.host("POST", "/handoff/inspect", { path: "/etc/passwd" });
    expect(byPath.status).toBe(400);
  });
});
