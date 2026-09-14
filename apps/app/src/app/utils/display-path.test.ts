import { describe, expect, it } from "bun:test";

import { joinDisplayPath } from "./index";

describe("joinDisplayPath", () => {
  it("does not glue POSIX separators onto a Windows root", () => {
    // The exact string the recovery page showed a user:
    //   C:\Users\USER\Redrob Work Chat/.redrob/redrob.json
    // A Windows root with forward slashes appended, because the path was interpolated. Copying that
    // out of the page gives you something that is not a path on your machine.
    const shown = joinDisplayPath("C:\\Users\\USER\\Redrob Work Chat", ".redrob", "redrob.json");

    expect(shown).toBe("C:\\Users\\USER\\Redrob Work Chat\\.redrob\\redrob.json");
    expect(shown).not.toContain("/");
  });

  it("keeps POSIX roots POSIX", () => {
    expect(joinDisplayPath("/home/user/work", ".redrob", "redrob.json")).toBe(
      "/home/user/work/.redrob/redrob.json",
    );
  });

  it("infers the separator from the root, not the running platform", () => {
    // A remote or WSL workspace root can be POSIX while the UI itself runs on Windows. Reading
    // navigator.platform would reintroduce exactly the mismatch this helper exists to remove.
    expect(joinDisplayPath("/mnt/c/work", ".redrob")).toBe("/mnt/c/work/.redrob");
    expect(joinDisplayPath("\\\\server\\share", ".redrob")).toBe("\\\\server\\share\\.redrob");
  });

  it("treats a bare drive letter as Windows", () => {
    expect(joinDisplayPath("C:", ".redrob")).toBe("C:\\.redrob");
  });

  it("does not double a separator the root already ends with", () => {
    expect(joinDisplayPath("/home/user/work/", ".redrob")).toBe("/home/user/work/.redrob");
    expect(joinDisplayPath("C:\\work\\", ".redrob")).toBe("C:\\work\\.redrob");
  });

  it("accepts a segment written with either separator", () => {
    expect(joinDisplayPath("C:\\work", ".redrob/redrob.json")).toBe(
      "C:\\work\\.redrob\\redrob.json",
    );
  });

  it("returns empty for a blank root rather than a bare separator", () => {
    // The call site renders "" when no workspace is selected; a bare "/" or "\" would read as a
    // filesystem root the config supposedly lives at.
    expect(joinDisplayPath("", ".redrob")).toBe("");
    expect(joinDisplayPath("   ", ".redrob")).toBe("");
  });
});
