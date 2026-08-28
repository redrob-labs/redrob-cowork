import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PUBLIC_DESKTOP_DISTRIBUTION, resolveDesktopDistribution } from "./desktop-distribution.mjs";

describe("resolveDesktopDistribution", () => {
  it("always resolves the local-first public distribution", () => {
    assert.equal(resolveDesktopDistribution(), PUBLIC_DESKTOP_DISTRIBUTION);
    assert.equal(PUBLIC_DESKTOP_DISTRIBUTION.flavor, "public");
    assert.equal(PUBLIC_DESKTOP_DISTRIBUTION.appName, "Redrob Work");
    assert.equal(PUBLIC_DESKTOP_DISTRIBUTION.appIdentifier, "io.redrob.work");
    assert.equal(PUBLIC_DESKTOP_DISTRIBUTION.protocolScheme, "redrob");
  });

  it("exposes no sign-in or activation gate", () => {
    assert.equal("requireSignin" in PUBLIC_DESKTOP_DISTRIBUTION, false);
    assert.equal("requireActivation" in PUBLIC_DESKTOP_DISTRIBUTION, false);
  });
});
