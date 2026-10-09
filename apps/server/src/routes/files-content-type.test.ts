import { describe, expect, test } from "bun:test";

import { contentTypeForPath } from "./files.js";

describe("workspace file content types", () => {
  test("audio and video are served as media, so the app can play them", () => {
    expect(contentTypeForPath("out/narration.mp3")).toBe("audio/mpeg");
    expect(contentTypeForPath("out/NARRATION.WAV")).toBe("audio/wav");
    expect(contentTypeForPath("out/clip.m4a")).toBe("audio/mp4");
    expect(contentTypeForPath("out/demo.mp4")).toBe("video/mp4");
    expect(contentTypeForPath("out/demo.webm")).toBe("video/webm");
  });

  test("everything else is unchanged", () => {
    expect(contentTypeForPath("report.pdf")).toBe("application/pdf");
    expect(contentTypeForPath("page.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeForPath("archive.mkv")).toBe("application/octet-stream");
    expect(contentTypeForPath("no-extension")).toBe("application/octet-stream");
  });
});
