import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  MAX_SPEECH_CHUNK,
  speakableText,
  splitForSpeech,
  startReadAloud,
  stopReadAloud,
  useReadAloudStore,
  voiceAllowedForPrivacy,
} from "../src/react-app/domains/session/voice/read-aloud";

/** A stand-in for HTMLAudioElement: records what was played and lets a test end playback. */
class FakeAudio {
  static played: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor(readonly src: string) {
    FakeAudio.played.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const realAudio = globalThis.Audio;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  FakeAudio.played = [];
  Object.assign(globalThis, { Audio: FakeAudio });
  stopReadAloud();
  useReadAloudStore.setState({ error: null });
});

afterEach(() => {
  stopReadAloud();
  Object.assign(globalThis, { Audio: realAudio });
});

function fakeClient() {
  const asked: string[] = [];
  return {
    asked,
    speakText: (_workspaceId: string, text: string) => {
      asked.push(text);
      return Promise.resolve({ data: new ArrayBuffer(4), contentType: "audio/mpeg", filename: null });
    },
  };
}

describe("read aloud", () => {
  test("a reply is read as prose: code left out, links by label, formatting dropped", () => {
    const spoken = speakableText(
      "## Summary\n\nRevenue is **up 12%** — see [the report](artifacts/q3.md).\n\n```ts\nconst x = 1\n```\n\n- First `item`\n- Second",
    );
    expect(spoken).toBe("Summary\nRevenue is up 12% — see the report.\nFirst item\nSecond");
    expect(speakableText("```\nonly code\n```")).toBe("");
  });

  test("long text is split under the engine's limit, at sentence ends where it can be", () => {
    const sentence = "이것은 문장입니다. ";
    const text = sentence.repeat(1_000);
    const chunks = splitForSpeech(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect([...chunk].length).toBeLessThanOrEqual(MAX_SPEECH_CHUNK);
      expect(chunk.endsWith(".")).toBe(true);
    }
    expect(chunks.join(" ").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
    expect(splitForSpeech("Short one.")).toEqual(["Short one."]);
  });

  test("a sentence longer than the limit is still cut to fit", () => {
    const chunks = splitForSpeech("word ".repeat(2_000));
    expect(chunks.length).toBe(3);
    for (const chunk of chunks) expect([...chunk].length).toBeLessThanOrEqual(MAX_SPEECH_CHUNK);
  });

  test("plays each piece in order, then goes idle", async () => {
    const client = fakeClient();
    const reading = startReadAloud(client, "ws", "msg_1", "One. ".repeat(1_000));
    for (let played = 0; played < 2; played += 1) {
      while (FakeAudio.played.length <= played) await tick();
      expect(useReadAloudStore.getState()).toMatchObject({ activeId: "msg_1" });
      FakeAudio.played[played].onended?.();
    }
    await reading;
    expect(client.asked.length).toBe(2);
    expect(useReadAloudStore.getState()).toMatchObject({ activeId: null, status: "idle", error: null });
  });

  test("starting another reply stops the first, and stop silences it", async () => {
    const client = fakeClient();
    void startReadAloud(client, "ws", "msg_1", "First reply.");
    while (FakeAudio.played.length < 1) await tick();
    const first = FakeAudio.played[0];

    void startReadAloud(client, "ws", "msg_2", "Second reply.");
    expect(first.paused).toBe(true);
    while (FakeAudio.played.length < 2) await tick();
    expect(useReadAloudStore.getState().activeId).toBe("msg_2");

    stopReadAloud();
    expect(FakeAudio.played[1].paused).toBe(true);
    expect(useReadAloudStore.getState()).toMatchObject({ activeId: null, status: "idle" });
  });

  test("voice is allowed at Off and Standard privacy, and not at High or Strict", () => {
    expect(voiceAllowedForPrivacy({ deskPrivacy: { level: "off" } })).toBe(true);
    expect(voiceAllowedForPrivacy({ deskPrivacy: { level: "standard" } })).toBe(true);
    expect(voiceAllowedForPrivacy({})).toBe(true);
    expect(voiceAllowedForPrivacy({ deskPrivacy: { level: "high" } })).toBe(false);
    expect(voiceAllowedForPrivacy({ deskPrivacy: { level: "strict" } })).toBe(false);
  });

  test("each request names the workspace, which the server checks privacy against", async () => {
    const seen: string[] = [];
    void startReadAloud(
      {
        speakText: (workspaceId) => {
          seen.push(workspaceId);
          return Promise.resolve({ data: new ArrayBuffer(4), contentType: "audio/mpeg", filename: null });
        },
      },
      "ws_42",
      "msg_1",
      "Hello.",
    );
    while (FakeAudio.played.length < 1) await tick();
    expect(seen).toEqual(["ws_42"]);
  });

  test("a refusal from the engine is reported, not swallowed", async () => {
    await startReadAloud(
      { speakText: () => Promise.reject(new Error("Connect Redrob to generate speech")) },
      "ws",
      "msg_1",
      "Hello.",
    );
    expect(useReadAloudStore.getState()).toMatchObject({ activeId: null, error: "Connect Redrob to generate speech" });
  });
});
