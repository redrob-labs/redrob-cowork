import { describe, expect, test } from "bun:test";

import type { ComposerAttachment } from "../src/app/types";
import { composerAttachmentsToRoomFileParts } from "../src/react-app/domains/session/sync/attachment-file-part";

function attachment(name: string, type: string, body: string): ComposerAttachment {
  const file = new File([body], name, { type });
  return { id: `att_${name}`, name, mimeType: type, size: file.size, kind: type.startsWith("image/") ? "image" : "file", file };
}

describe("a guest's attachments in a live room", () => {
  test("go to the room's route and come back as the host's paths", async () => {
    const calls: Array<{ workspaceId: string; sessionId: string; name: string }> = [];
    const parts = await composerAttachmentsToRoomFileParts({
      attachments: [attachment("notes.txt", "text/plain", "hello")],
      workspaceId: "ws_1",
      sessionId: "ses_1",
      client: {
        uploadRoomAttachment: async (workspaceId, sessionId, file) => {
          calls.push({ workspaceId, sessionId, name: file.name });
          return {
            filename: "notes.txt",
            mime: "text/plain",
            bytes: file.size,
            url: "file:///host/work/.opencode/redrob/inbox/cowork/ses_1/abc-notes.txt",
            workspacePath: ".opencode/redrob/inbox/cowork/ses_1/abc-notes.txt",
          };
        },
      },
    });
    expect(calls).toEqual([{ workspaceId: "ws_1", sessionId: "ses_1", name: "notes.txt" }]);
    const [note, file] = parts;
    expect(note?.type).toBe("text");
    expect(note?.type === "text" ? note.text : "").toContain(".opencode/redrob/inbox/cowork/ses_1/abc-notes.txt");
    expect(file).toMatchObject({ type: "file", url: "file:///host/work/.opencode/redrob/inbox/cowork/ses_1/abc-notes.txt", mime: "text/plain", filename: "notes.txt" });
  });

  test("a refusal names the file and keeps the host's reason", async () => {
    await expect(
      composerAttachmentsToRoomFileParts({
        attachments: [attachment("q3.pdf", "application/pdf", "%PDF")],
        workspaceId: "ws_1",
        sessionId: "ses_1",
        client: {
          uploadRoomAttachment: async () => {
            throw new Error("The host has not let you attach files");
          },
        },
      }),
    ).rejects.toThrow(/q3\.pdf.*attach files|attach files.*q3\.pdf/);
  });
});
