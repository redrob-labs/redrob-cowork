import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { handoffLinkForPath, handoffLinksFromArgv, isHandoffFilePath } from "./handoff-file-links.mjs";

describe("handoff file links", () => {
  it("knows a handoff file by its extension, in any case", () => {
    assert.equal(isHandoffFilePath("/a/Lease.RedrobHandoff"), true);
    assert.equal(isHandoffFilePath("/a/lease-reply.redrobreply"), true);
    assert.equal(isHandoffFilePath("/a/lease.zip"), false);
    assert.equal(isHandoffFilePath(undefined), false);
  });

  it("turns a path into the app's own open-handoff link", () => {
    const link = handoffLinkForPath("/Users/me/lease review.redrobhandoff", "redrob");
    assert.equal(link, `redrob://open-handoff?file=${encodeURIComponent(path.resolve("/Users/me/lease review.redrobhandoff"))}`);
  });

  it("takes only existing handoff files from argv, never flags or the executable", () => {
    const exists = (entry) => entry !== "/missing.redrobhandoff";
    const links = handoffLinksFromArgv(
      ["/Applications/Redrob.app", "--inspect", "/a/one.redrobhandoff", "/missing.redrob handoff", "/missing.redrobhandoff", "redrob://x"],
      { scheme: "redrob-dev", exists },
    );
    assert.deepEqual(links, [`redrob-dev://open-handoff?file=${encodeURIComponent(path.resolve("/a/one.redrobhandoff"))}`]);
  });
});
