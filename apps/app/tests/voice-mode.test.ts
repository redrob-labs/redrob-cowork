import { describe, expect, test } from "bun:test";

import { voiceModePhase } from "../src/react-app/domains/session/voice/voice-mode";

describe("voice mode phase", () => {
  test("is hidden while voice chat is off, whatever the mic or playback is doing", () => {
    expect(voiceModePhase({ talk: false, mic: "recording", readStatus: "playing" })).toEqual({
      visible: false,
      phase: "idle",
    });
  });

  test("recording reads as listening and wins over playback", () => {
    expect(voiceModePhase({ talk: true, mic: "recording", readStatus: "playing" })).toEqual({
      visible: true,
      phase: "listening",
    });
  });

  test("transcribing reads as thinking", () => {
    expect(voiceModePhase({ talk: true, mic: "transcribing", readStatus: "idle" })).toEqual({
      visible: true,
      phase: "thinking",
    });
  });

  test("preparing the spoken answer (loading) also reads as thinking", () => {
    expect(voiceModePhase({ talk: true, mic: "idle", readStatus: "loading" })).toEqual({
      visible: true,
      phase: "thinking",
    });
  });

  test("playing the answer reads as speaking", () => {
    expect(voiceModePhase({ talk: true, mic: "idle", readStatus: "playing" })).toEqual({
      visible: true,
      phase: "speaking",
    });
  });

  test("voice on but nothing happening is a visible idle, waiting for the user", () => {
    expect(voiceModePhase({ talk: true, mic: "idle", readStatus: "idle" })).toEqual({
      visible: true,
      phase: "idle",
    });
  });
});
