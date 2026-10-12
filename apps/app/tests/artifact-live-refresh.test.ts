import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { completedWritesFingerprint, deriveOpenTargets } from "../src/react-app/domains/session/artifacts/open-target";

function tool(callId: string, toolName: string, state: "input-available" | "output-available", input: unknown, output?: unknown): UIMessage {
  return {
    id: `msg_${callId}`,
    role: "assistant",
    parts: [
      state === "output-available"
        ? { type: "dynamic-tool", toolName, toolCallId: callId, state, input, output }
        : { type: "dynamic-tool", toolName, toolCallId: callId, state, input },
    ],
  };
}

describe("artifact live refresh", () => {
  test("a second write to the same page changes the fingerprint, though the targets stay the same", () => {
    const first = [tool("c1", "write", "output-available", { filePath: "site/index.html" }, { filePath: "site/index.html" })];
    const second = [...first, tool("c2", "write", "output-available", { filePath: "site/index.html" }, { filePath: "site/index.html" })];

    expect(deriveOpenTargets(first).map((target) => target.value)).toEqual(deriveOpenTargets(second).map((target) => target.value));
    expect(completedWritesFingerprint(second)).not.toBe(completedWritesFingerprint(first));
  });

  test("a write still running, or a read, does not count", () => {
    const base = [tool("c1", "write", "output-available", { filePath: "a.html" }, { filePath: "a.html" })];
    expect(completedWritesFingerprint([...base, tool("c2", "edit", "input-available", { filePath: "a.html" })])).toBe(
      completedWritesFingerprint(base),
    );
    expect(completedWritesFingerprint([...base, tool("c3", "read", "output-available", { filePath: "a.html" }, "<html>")])).toBe(
      completedWritesFingerprint(base),
    );
  });

  test("the engine's image tool counts as a write, and its saved picture becomes an artifact", () => {
    const messages = [
      tool("c1", "image_generate", "output-available", { prompt: "A red square" }, "Generated artifacts/a-red-square.png with google/gemini-2.5-flash-image."),
    ];
    expect(completedWritesFingerprint(messages)).toBe("c1");
    const image = deriveOpenTargets(messages).find((target) => target.value === "artifacts/a-red-square.png");
    expect(image?.preview).toBe("image");
  });

  // With #174 the mp3 also previews as "audio"; on its own it is an artifact that opens in the OS app.
  test("the engine's speech tool counts as a write, and its mp3 becomes an artifact", () => {
    const messages = [
      tool("c1", "speech_generate", "output-available", { text: "Hello" }, "Saved artifacts/hello.mp3: 5 characters spoken with elevenlabs/eleven-multilingual-v2 (sarah)."),
    ];
    expect(completedWritesFingerprint(messages)).toBe("c1");
    expect(deriveOpenTargets(messages).map((target) => target.value)).toContain("artifacts/hello.mp3");
  });
});
