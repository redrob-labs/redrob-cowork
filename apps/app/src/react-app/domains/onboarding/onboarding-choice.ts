/**
 * Onboarding: which AI does this user already have?
 *
 * The first screen offers three choices side by side — Claude, ChatGPT, Redrob — and
 * the point of this module is the logic behind them, kept pure so it is testable
 * without a browser.
 *
 * THE COMPLIANCE RULE THAT SHAPES EVERY LABEL: we may not offer Claude or ChatGPT
 * login ourselves. Anthropic's compliance page forbids a third party offering Claude.ai
 * login or holding its tokens, and began blocking third-party harnesses from
 * subscription billing on 2026-04-04. So the "Claude" and "ChatGPT" choices are NOT
 * sign-in buttons. They install the vendor's own CLI if needed and then run ITS login,
 * which completes in the user's browser against the vendor. We never see a token.
 *
 * That is why every action here is one of: install the runtime, run the runtime's own
 * login, or paste the user's own API key. There is deliberately no fourth kind.
 *
 * See redrob-code `docs/PROVIDER-AUTH.md`.
 */

/** What we found on the machine for one runtime. */
export type RuntimeProbe = {
  /** Absolute path, or null when the runtime is not installed. */
  binary: string | null;
  /** Whether the runtime reports itself signed in. Null when unknown (not installed). */
  signedIn: boolean | null;
};

export type OnboardingChoiceId = "claude" | "chatgpt" | "redrob";

/**
 * The single action a choice offers right now.
 *
 * `run-vendor-login` is deliberately distinct from `connect-key`: they are different
 * promises to the user and only one of them is a thing we are allowed to host.
 */
export type OnboardingAction =
  | { kind: "install-runtime"; runtime: "codex" | "claude"; installCommand: string }
  | { kind: "run-vendor-login"; runtime: "codex" | "claude"; command: string }
  | { kind: "connect-key"; integrationId: string }
  | { kind: "connect-redrob" }
  | { kind: "already-connected" };

export type OnboardingChoice = {
  id: OnboardingChoiceId;
  title: string;
  /** One line under the title. Plain text — see the trademark note below. */
  subtitle: string;
  action: OnboardingAction;
  /** True when this choice is usable right now with no further setup. */
  ready: boolean;
  /**
   * Shown when a choice needs more than one step, so the user is not surprised
   * halfway. Empty when the choice is one step.
   */
  steps: string[];
};

/**
 * Anthropic's trademark rules permit exactly one claim in plain text: that our product
 * runs Claude Code. No logo, and "Claude" may not appear in a product or feature name.
 * So the Claude choice is titled by what the USER has ("Claude"), and the runtime is
 * named only in the body.
 */
export function buildOnboardingChoices(input: {
  codex: RuntimeProbe;
  claude: RuntimeProbe;
  /** Whether the engine already holds a Redrob credential. */
  redrobConnected: boolean;
  /** Whether the engine already holds a key for these vendors. */
  anthropicKeyConnected?: boolean;
  openaiKeyConnected?: boolean;
}): OnboardingChoice[] {
  return [
    claudeChoice(input.claude, input.anthropicKeyConnected ?? false),
    chatgptChoice(input.codex, input.openaiKeyConnected ?? false),
    redrobChoice(input.redrobConnected),
  ];
}

function claudeChoice(probe: RuntimeProbe, keyConnected: boolean): OnboardingChoice {
  if (probe.binary && probe.signedIn) {
    return {
      id: "claude",
      title: "Claude",
      subtitle: "Runs Claude Code, already signed in on this computer.",
      action: { kind: "already-connected" },
      ready: true,
      steps: [],
    };
  }
  if (probe.binary) {
    return {
      id: "claude",
      title: "Claude",
      subtitle: "Runs Claude Code. Sign in through Anthropic to use your plan.",
      // Their flow, in their browser. We never hold the token.
      action: { kind: "run-vendor-login", runtime: "claude", command: "claude" },
      ready: false,
      steps: ["Sign in to Claude in the window that opens", "Come back here"],
    };
  }
  if (keyConnected) {
    return {
      id: "claude",
      title: "Claude",
      subtitle: "Connected with your own Anthropic API key.",
      action: { kind: "already-connected" },
      ready: true,
      steps: [],
    };
  }
  return {
    id: "claude",
    title: "Claude",
    subtitle: "Install Claude Code to use your Claude plan, or paste an Anthropic API key.",
    action: {
      kind: "install-runtime",
      runtime: "claude",
      installCommand: "npm install -g @anthropic-ai/claude-code",
    },
    ready: false,
    steps: ["Install Claude Code", "Sign in to Claude in the window that opens", "Come back here"],
  };
}

function chatgptChoice(probe: RuntimeProbe, keyConnected: boolean): OnboardingChoice {
  if (probe.binary && probe.signedIn) {
    return {
      id: "chatgpt",
      title: "ChatGPT",
      subtitle: "Runs Codex, already signed in on this computer.",
      action: { kind: "already-connected" },
      ready: true,
      steps: [],
    };
  }
  if (probe.binary) {
    return {
      id: "chatgpt",
      title: "ChatGPT",
      subtitle: "Runs Codex. Sign in with ChatGPT to use your plan.",
      action: { kind: "run-vendor-login", runtime: "codex", command: "codex login" },
      ready: false,
      steps: ["Sign in with ChatGPT in the window that opens", "Come back here"],
    };
  }
  if (keyConnected) {
    return {
      id: "chatgpt",
      title: "ChatGPT",
      subtitle: "Connected with your own OpenAI API key.",
      action: { kind: "already-connected" },
      ready: true,
      steps: [],
    };
  }
  return {
    id: "chatgpt",
    title: "ChatGPT",
    subtitle: "Install Codex to use your ChatGPT plan, or paste an OpenAI API key.",
    action: { kind: "install-runtime", runtime: "codex", installCommand: "npm install -g @openai/codex" },
    ready: false,
    steps: ["Install Codex", "Sign in with ChatGPT in the window that opens", "Come back here"],
  };
}

function redrobChoice(connected: boolean): OnboardingChoice {
  return {
    id: "redrob",
    title: "Redrob",
    subtitle: connected
      ? "Connected. Nothing else to install."
      : "Use Redrob's own models. Nothing to install.",
    action: connected ? { kind: "already-connected" } : { kind: "connect-redrob" },
    ready: connected,
    steps: [],
  };
}

/**
 * Which choice to highlight, given what is on the machine.
 *
 * Prefers a runtime the user has ALREADY signed into: that is the one where they pay
 * nothing extra and set nothing up, which is the whole reason to detect at all. Redrob
 * is the fallback because it is the one choice that always works — but it is only
 * recommended when nothing else is ready, so detection never becomes a way to steer a
 * user off access they already have.
 */
export function recommendedChoice(choices: OnboardingChoice[]): OnboardingChoiceId {
  const ready = choices.find((choice) => choice.ready && choice.id !== "redrob");
  if (ready) return ready.id;
  const oneStep = choices.find(
    (choice) => choice.id !== "redrob" && choice.action.kind === "run-vendor-login",
  );
  if (oneStep) return oneStep.id;
  return "redrob";
}

/**
 * One line explaining why a choice is not a single click, for a user who expected a
 * sign-in button.
 *
 * Worth saying out loud rather than leaving the UI silent: a user who came looking for
 * "Sign in with Claude" and found an install step will otherwise assume the feature is
 * broken or missing.
 */
export function whyNotOneClick(choice: OnboardingChoice): string | null {
  if (choice.action.kind === "install-runtime" || choice.action.kind === "run-vendor-login") {
    return choice.id === "claude"
      ? "Anthropic requires that you sign in through their own app, so we open it for you instead of asking for your password."
      : "OpenAI requires that you sign in through their own app, so we open it for you instead of asking for your password.";
  }
  return null;
}
