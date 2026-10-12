import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setEngineCliTemplate } from "./engine-cli.js";
import { findHandoff } from "./handoff-registry.js";
import { HandoffOpenError } from "./handoff-open.js";
import { openReplyBundle, replyFileName, writeReplyBundle } from "./handoff-reply.js";
import { createReviewCommentId, readSessionReview } from "./review-store.js";
import type { EngineSessionExport } from "./session-export.js";
import { createFakeEngine, sampleSession } from "./test-support/fake-engine.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";
import { readZip, writeZip } from "./zip.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  setEngineCliTemplate(null);
  while (cleanups.length) await cleanups.pop()?.();
});

const kim = { participantId: "par_000000000000000000000001", displayName: "Kim Jiwon" };
const handoffId = "hof_000000000000000000000001";

describe("reply bundles", () => {
  test("round-trip comments, the verdict and a continued chat with secrets redacted", () => {
    const continued = sampleSession({ text: "Use password=correcthorsebattery here" });
    const comment = { id: createReviewCommentId(), anchor: { kind: "message" as const, messageId: "msg_1" }, author: kim, text: "Fixed", createdAt: 1, origin: "local" as const };
    const { zip, redacted } = writeReplyBundle({
      replyTo: handoffId,
      originSessionId: "ses_origin",
      from: kim,
      state: { status: "approved", by: kim, at: 9 },
      comments: [comment],
      continued,
    });
    expect(redacted).toBe(1);
    const opened = openReplyBundle(zip);
    expect(opened.manifest).toMatchObject({ replyTo: handoffId, session: { id: "ses_origin" }, from: kim, state: { status: "approved" } });
    expect(opened.comments).toHaveLength(1);
    expect(JSON.stringify(opened.continued)).not.toContain("correcthorsebattery");
  });

  test("a changed or padded reply is refused", () => {
    const { zip } = writeReplyBundle({ replyTo: handoffId, originSessionId: "s", from: kim, state: { status: "open", by: null, at: 0 }, comments: [] });
    const changed = writeZip(readZip(zip).map((entry) => (entry.name === "review.json" ? { ...entry, data: Buffer.from("{}") } : entry)));
    expect(() => openReplyBundle(changed)).toThrow(HandoffOpenError);
    const padded = writeZip([...readZip(zip), { name: "files/x.md", data: Buffer.from("x") }]);
    expect(() => openReplyBundle(padded)).toThrow(HandoffOpenError);
  });

  test("names the file after the chat", () => {
    expect(replyFileName("Lease review", new Date("2026-10-08T00:00:00Z"))).toBe("lease-review-reply-2026-10-08.redrobreply");
  });
});

describe("the round trip", () => {
  test("hand off, open, comment, continue, reply, apply: comments land on the sender's messages and the continuation beside", async () => {
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    const engine = await createFakeEngine();
    cleanups.push(() => rm(engine.root, { recursive: true, force: true }));
    setEngineCliTemplate({ bin: engine.bin, env: { XDG_DATA_HOME: engine.dataHome } });
    await harness.host("PUT", "/profile", { displayName: "Park Hyunjin" });
    const raw = (path: string, body: Buffer) =>
      fetch(`${harness.base}${path}`, {
        method: "POST",
        headers: { "X-Redrob-Host-Token": harness.config.hostToken, "Content-Type": "application/zip" },
        body: new Uint8Array(body),
      });

    // Sender: a chat in the default workspace, handed off.
    await writeFile(join(harness.workspace, "memo.md"), "The memo.\n");
    const original = sampleSession({ directory: harness.workspace, tools: [{ tool: "write", filePath: "memo.md" }] });
    await engine.seed(original);
    const base = `/workspace/workspace/sessions/${original.info.id}/handoff`;
    const { fingerprint } = (await (await harness.collaborator("POST", `${base}/preview`, {})).json()) as { fingerprint: string };
    const bundle = Buffer.from(await (await harness.collaborator("POST", base, { ask: "continue", fingerprint })).arrayBuffer());

    // Receiver (same machine, so the chat is rekeyed): opens it, comments on the answer, continues.
    const { digest } = (await (await raw("/handoff/inspect", bundle)).json()) as { digest: string };
    const project = ((await (await harness.host("POST", "/workspaces/local", { name: "Handoff", managed: true })).json()) as { workspace: { id: string } }).workspace;
    const opened = (await (await raw(`/workspace/${project.id}/handoff/open?digest=${digest}`, bundle)).json()) as { sessionId: string };
    expect(opened.sessionId).not.toBe(original.info.id);
    const received = JSON.parse(await readFile(join(engine.dataHome, "fake", `${opened.sessionId}.json`), "utf8")) as EngineSessionExport;
    const receivedAnswer = received.messages[1]!.info.id;
    expect(receivedAnswer).not.toBe(original.messages[1]!.info.id);
    const reviewBase = `/workspace/${project.id}/sessions/${opened.sessionId}/review`;
    expect((await harness.collaborator("POST", `${reviewBase}/comments`, { anchor: { kind: "message", messageId: receivedAnswer }, text: "Clause 4 is fine" })).status).toBe(201);
    await harness.collaborator("PUT", `${reviewBase}/state`, { status: "approved" });
    await harness.collaborator("POST", `/workspace/${project.id}/sessions/${opened.sessionId}/handoff/continue`, {});
    const replyResponse = await harness.collaborator("POST", `/workspace/${project.id}/sessions/${opened.sessionId}/handoff/reply`, { includeContinuation: true });
    expect(replyResponse.status).toBe(200);
    expect(replyResponse.headers.get("content-disposition")).toContain(".redrobreply");
    const reply = Buffer.from(await replyResponse.arrayBuffer());

    // Sender: inspects and applies the reply.
    const inspected = (await (await raw("/handoff/reply/inspect", reply)).json()) as { digest: string; target: { sessionId: string }; reply: { comments: number; continued: unknown } };
    expect(inspected.target.sessionId).toBe(original.info.id);
    expect(inspected.reply.continued).not.toBeNull();
    expect((await raw(`/handoff/reply/apply?digest=nope`, reply)).status).toBe(409);
    const applied = (await (await raw(`/handoff/reply/apply?digest=${inspected.digest}`, reply)).json()) as {
      added: number;
      state: { status: string };
      continuationSessionId: string;
    };
    expect(applied.added).toBe(1);
    expect(applied.state.status).toBe("approved");

    const review = await readSessionReview(harness.config, "workspace", original.info.id);
    const clause = review.comments.find((comment) => comment.text === "Clause 4 is fine");
    expect(clause?.origin).toBe("reply");
    expect(clause?.anchor.messageId).toBe(original.messages[1]!.info.id);
    expect(clause?.author.displayName).toBe("Park Hyunjin");

    const continuation = JSON.parse(await readFile(join(engine.dataHome, "fake", `${applied.continuationSessionId}.json`), "utf8")) as EngineSessionExport;
    expect(continuation.info.title).toBe("Park Hyunjin's continuation");
    expect(applied.continuationSessionId).not.toBe(original.info.id);
    const untouched = JSON.parse(await readFile(join(engine.dataHome, "fake", `${original.info.id}.json`), "utf8")) as EngineSessionExport;
    expect(untouched.info.title).toBe("Lease review");

    const sent = await findHandoff(harness.config, JSON.parse(readZip(bundle)[0]!.data.toString()).id, "sent");
    expect(sent && "lastReplyAt" in sent && typeof sent.lastReplyAt).toBe("number");
  });

  test("a reply for a handoff this computer never sent is refused", async () => {
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    const { zip } = writeReplyBundle({ replyTo: handoffId, originSessionId: "s", from: kim, state: { status: "open", by: null, at: 0 }, comments: [] });
    const response = await fetch(`${harness.base}/handoff/reply/inspect`, {
      method: "POST",
      headers: { "X-Redrob-Host-Token": harness.config.hostToken, "Content-Type": "application/zip" },
      body: new Uint8Array(zip),
    });
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code: string }).code).toBe("reply_unknown_handoff");
  });
});
