/**
 * Tests for the onboarding choice logic.
 *
 * These encode the compliance boundary as much as the UX: the assertions about what we
 * must NOT offer are the ones that matter if someone later "simplifies" this into a
 * sign-in button.
 */
import { describe, expect, test } from "bun:test";
import {
  buildOnboardingChoices,
  recommendedChoice,
  whyNotOneClick,
  type RuntimeProbe,
} from "./onboarding-choice";

const missing: RuntimeProbe = { binary: null, signedIn: null };
const installed: RuntimeProbe = { binary: "/bin/x", signedIn: false };
const ready: RuntimeProbe = { binary: "/bin/x", signedIn: true };

function build(input: Partial<Parameters<typeof buildOnboardingChoices>[0]> = {}) {
  return buildOnboardingChoices({ codex: missing, claude: missing, redrobConnected: false, ...input });
}

describe("the three choices", () => {
  test("always offers exactly Claude, ChatGPT and Redrob", () => {
    expect(build().map((c) => c.id)).toEqual(["claude", "chatgpt", "redrob"]);
  });

  test("Redrob always works, with nothing to install", () => {
    const redrob = build().find((c) => c.id === "redrob")!;
    expect(redrob.steps).toEqual([]);
    expect(redrob.action.kind).toBe("connect-redrob");
  });
});

describe("what we are allowed to offer", () => {
  test("NEVER offers a vendor login of our own", () => {
    // The rule: Anthropic forbids a third party offering Claude login or holding its
    // tokens. Every action must be install, run THEIR login, or a user's own key.
    const allowed = new Set(["install-runtime", "run-vendor-login", "connect-key", "connect-redrob", "already-connected"]);
    for (const probe of [missing, installed, ready]) {
      for (const choice of build({ codex: probe, claude: probe })) {
        expect(allowed.has(choice.action.kind)).toBe(true);
      }
    }
  });

  test("an installed but signed-out runtime runs the VENDOR's login command", () => {
    const claude = build({ claude: installed }).find((c) => c.id === "claude")!;
    expect(claude.action).toEqual({ kind: "run-vendor-login", runtime: "claude", command: "claude" });
    const chatgpt = build({ codex: installed }).find((c) => c.id === "chatgpt")!;
    expect(chatgpt.action).toEqual({ kind: "run-vendor-login", runtime: "codex", command: "codex login" });
  });

  test("never puts a vendor name in a product or feature name", () => {
    // Anthropic's trademark rules permit exactly one plain-text claim: that the product
    // runs Claude Code. Titles are what the USER has, never our feature naming.
    const titles = build({ claude: ready, codex: ready }).map((c) => c.title);
    expect(titles).toEqual(["Claude", "ChatGPT", "Redrob"]);
  });
});

describe("three states per runtime", () => {
  test("not installed offers an install, with every step named up front", () => {
    const claude = build().find((c) => c.id === "claude")!;
    expect(claude.action.kind).toBe("install-runtime");
    expect(claude.ready).toBe(false);
    // Naming all three steps matters: a user who is told "install" and then hit with a
    // login they did not expect reads it as the app failing.
    expect(claude.steps).toHaveLength(3);
  });

  test("installed and signed in is ready with no action", () => {
    const chatgpt = build({ codex: ready }).find((c) => c.id === "chatgpt")!;
    expect(chatgpt.ready).toBe(true);
    expect(chatgpt.action.kind).toBe("already-connected");
    expect(chatgpt.steps).toEqual([]);
  });

  test("a stored API key counts as connected even with no runtime installed", () => {
    const claude = build({ anthropicKeyConnected: true }).find((c) => c.id === "claude")!;
    expect(claude.ready).toBe(true);
    expect(claude.subtitle).toContain("API key");
  });

  test("an installed runtime takes precedence over a stored key", () => {
    // The runtime path spends the user's subscription; the key path bills per token.
    // Preferring the key when both exist would quietly cost them money.
    const claude = build({ claude: ready, anthropicKeyConnected: true }).find((c) => c.id === "claude")!;
    expect(claude.subtitle).toContain("already signed in");
  });
});

describe("recommendedChoice", () => {
  test("prefers a runtime the user is already signed into", () => {
    expect(recommendedChoice(build({ codex: ready }))).toBe("chatgpt");
    expect(recommendedChoice(build({ claude: ready }))).toBe("claude");
  });

  test("prefers a one-step runtime over Redrob", () => {
    expect(recommendedChoice(build({ claude: installed }))).toBe("claude");
  });

  test("falls back to Redrob only when nothing else is close", () => {
    // Redrob is ours, so recommending it whenever it is merely available would use
    // detection to steer users off access they already paid for.
    expect(recommendedChoice(build())).toBe("redrob");
    expect(recommendedChoice(build({ redrobConnected: true }))).toBe("redrob");
  });

  test("does not recommend Redrob just because it is connected", () => {
    expect(recommendedChoice(build({ codex: ready, redrobConnected: true }))).toBe("chatgpt");
  });
});

describe("whyNotOneClick", () => {
  test("explains the extra step for a vendor choice", () => {
    // A user who came for "Sign in with Claude" and found an install step will assume
    // the feature is broken unless told why.
    const claude = build().find((c) => c.id === "claude")!;
    expect(whyNotOneClick(claude)).toContain("their own app");
  });

  test("says nothing when the choice is already usable", () => {
    expect(whyNotOneClick(build({ codex: ready }).find((c) => c.id === "chatgpt")!)).toBeNull();
    expect(whyNotOneClick(build().find((c) => c.id === "redrob")!)).toBeNull();
  });
});
