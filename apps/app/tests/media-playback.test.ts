import { describe, expect, test } from "bun:test";

import { getPlayableMediaKind } from "../src/components/chat/utils";
import { getArtifactsFromMessages } from "../src/lib/artifacts";
import {
  deriveOpenTargets,
  isCollectibleArtifactTarget,
  playableMediaPreview,
} from "../src/react-app/domains/session/artifacts/open-target";

function writeTool(filePath: string) {
  return {
    id: `msg_${filePath}`,
    role: "assistant" as const,
    parts: [{
      type: "dynamic-tool" as const,
      toolName: "write",
      toolCallId: `call_${filePath}`,
      state: "output-available" as const,
      input: { filePath },
      output: { filePath },
    }],
  };
}

describe("audio and video playback", () => {
  test("an audio or video file the agent wrote becomes a playable artifact", () => {
    const targets = deriveOpenTargets([writeTool("out/narration.mp3"), writeTool("out/demo.webm")]);
    const audio = targets.find((target) => target.value === "out/narration.mp3");
    const video = targets.find((target) => target.value === "out/demo.webm");

    expect(audio?.preview).toBe("audio");
    expect(video?.preview).toBe("video");
    expect(isCollectibleArtifactTarget({ ...audio!, exists: true })).toBe(true);
    expect(isCollectibleArtifactTarget({ ...video!, exists: true })).toBe(true);
  });

  test("only formats the app can decode get a player; the rest still open in the OS app", () => {
    for (const name of ["a.mp3", "a.wav", "a.ogg", "a.m4a", "a.flac", "a.opus"]) {
      expect(playableMediaPreview(name)).toBe("audio");
    }
    for (const name of ["a.mp4", "a.webm", "a.mov"]) {
      expect(playableMediaPreview(name)).toBe("video");
    }
    for (const name of ["a.mkv", "a.avi", "a.wma", "a.mid"]) {
      expect(playableMediaPreview(name)).toBeNull();
    }
    expect(deriveOpenTargets([writeTool("clip.mkv")])[0]?.preview).toBe("external");
  });

  test("the files strip opens a recording in the player, and an undecodable one in the OS app", () => {
    const artifacts = getArtifactsFromMessages([{
      id: "msg_1",
      role: "assistant",
      parts: [{ type: "text", text: "Created artifacts/narration.mp3 and artifacts/raw.mkv." }],
    }]);

    expect(artifacts.find((artifact) => artifact.path === "artifacts/narration.mp3")?.legacy_target.preview).toBe("audio");
    expect(artifacts.find((artifact) => artifact.path === "artifacts/raw.mkv")?.legacy_target.preview).toBe("external");
  });

  test("chat plays audio and video in place only from a URL that stays on this machine", () => {
    expect(getPlayableMediaKind({ mediaType: "audio/mpeg", url: "data:audio/mpeg;base64,SUQz" })).toBe("audio");
    expect(getPlayableMediaKind({ mediaType: "video/mp4", url: "file:///Users/me/ws/demo.mp4" })).toBe("video");
    expect(getPlayableMediaKind({ mediaType: "audio/wav", url: "blob:http://localhost/clip" })).toBe("audio");
    expect(getPlayableMediaKind({ mediaType: "audio/mpeg", url: "https://example.com/a.mp3" })).toBeNull();
    expect(getPlayableMediaKind({ mediaType: "image/png", url: "data:image/png;base64,AA==" })).toBeNull();
    expect(getPlayableMediaKind({ mediaType: "audio/mpeg", url: "not a url" })).toBeNull();
  });
});
