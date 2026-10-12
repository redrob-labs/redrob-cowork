import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { queueInternals } from "./cowork-queue.js";
import { assertGuestFileParts } from "./guest-access.js";
import { loopbackFetch } from "./server-fetch.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
  queueInternals.queues.clear();
  for (const timer of queueInternals.drains.values()) clearInterval(timer);
  queueInternals.drains.clear();
});

const SESSION = "ses_shared0000000000000000";
const kim = { participantId: "par_000000000000000000000009", displayName: "Kim Jiwon" };
const lee = { participantId: "par_00000000000000000000000c", displayName: "Lee Minji" };

describe("a guest's file parts", () => {
  const dir = "/work/.opencode/redrob/inbox/cowork/ses_1";
  const body = (url: string) => ({ parts: [{ type: "text", text: "see" }, { type: "file", url, mime: "text/plain", filename: "a" }] });
  test("only inline images and files in the chat's own folder", () => {
    expect(() => assertGuestFileParts(body(pathToFileURL(`${dir}/x-report.pdf`).href), dir)).not.toThrow();
    expect(() => assertGuestFileParts(body("data:image/png;base64,iVBORw0KGgo="), dir)).not.toThrow();
    expect(() => assertGuestFileParts(body("file:///etc/passwd"), dir)).toThrow();
    expect(() => assertGuestFileParts(body(pathToFileURL(`${dir}/../ses_2/x.pdf`).href), dir)).toThrow();
    expect(() => assertGuestFileParts(body(pathToFileURL(`${dir}-evil/x.pdf`).href), dir)).toThrow();
    expect(() => assertGuestFileParts(body("https://example.com/a.pdf"), dir)).toThrow();
    expect(() => assertGuestFileParts(body("data:text/plain;base64,aGk="), dir)).toThrow();
    expect(() => assertGuestFileParts({ parts: [{ type: "text", text: "no files" }] }, dir)).not.toThrow();
  });
});

describe("attachments in a room", () => {
  test("a guest with attach uploads into the chat's folder and sends it; nothing else gets through", async () => {
    const prompts: Array<Record<string, unknown>> = [];
    const engine = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (request.method === "POST" && url.pathname.endsWith("/prompt_async")) {
          prompts.push((await request.json()) as Record<string, unknown>);
          return Response.json(true);
        }
        if (url.pathname === "/session/status") return Response.json({ [SESSION]: { type: "busy" } });
        return Response.json([]);
      },
    });
    cleanups.push(() => engine.stop(true));
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    harness.config.workspaces[0]!.baseUrl = `http://127.0.0.1:${engine.port}`;
    const base = `/workspace/workspace/sessions/${SESSION}/room`;
    await harness.host("POST", base, {});
    const withAttach = (await (await harness.host("POST", `${base}/guests`, { participant: kim, capabilities: ["send", "attach"] })).json()) as { token: string };
    const without = (await (await harness.host("POST", `${base}/guests`, { participant: lee })).json()) as { token: string };

    const upload = (token: string, name: string, text = "quarterly numbers") => {
      const form = new FormData();
      form.append("file", new File([text], name, { type: "text/plain" }));
      return loopbackFetch(`${harness.base}${base}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    };

    const refused = await upload(without.token, "notes.txt");
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe("guest_capability_missing");

    const sent = await upload(withAttach.token, "../../Q3 notes.txt");
    expect(sent.status).toBe(201);
    const file = (await sent.json()) as { filename: string; url: string; workspacePath: string; bytes: number };
    expect(file.filename).toBe("Q3 notes.txt");
    expect(file.bytes).toBe(17);
    expect(file.workspacePath).toMatch(new RegExp(`^\\.opencode/redrob/inbox/cowork/${SESSION}/[^/]+-Q3 notes\\.txt$`));
    expect(fileURLToPath(file.url)).toBe(join(harness.workspace, file.workspacePath));
    expect(await readFile(fileURLToPath(file.url), "utf8")).toBe("quarterly numbers");

    const asKim = harness.as(withAttach.token);
    const prompt = `/w/workspace/opencode/session/${SESSION}/prompt_async`;
    const part = (url: string) => ({ parts: [{ type: "text", text: "read this" }, { type: "file", url, mime: "text/plain", filename: "x" }] });
    expect((await asKim("POST", prompt, part(file.url))).status).toBe(200);
    expect(prompts).toHaveLength(1);
    const forged = await asKim("POST", prompt, part(pathToFileURL(join(harness.workspace, "secret.txt")).href));
    expect(forged.status).toBe(403);
    expect(((await forged.json()) as { code: string }).code).toBe("guest_file_forbidden");
    expect(prompts).toHaveLength(1);

    // The shared queue takes the uploaded file, and refuses a forged one before it waits.
    expect((await asKim("POST", `${base}/queue`, { body: part(file.url) })).status).toBe(201);
    expect((await asKim("POST", `${base}/queue`, { body: part("file:///etc/hosts") })).status).toBe(403);

    // The host is not checked: its files are its own.
    expect((await harness.owner("POST", prompt, part(pathToFileURL(join(harness.workspace, "secret.txt")).href))).status).toBe(200);
  });
});
