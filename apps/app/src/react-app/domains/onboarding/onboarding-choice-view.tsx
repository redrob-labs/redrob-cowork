/** @jsxImportSource react */
/**
 * The first-run "which AI do you already have?" screen.
 *
 * Presentational only — every decision lives in `onboarding-choice.ts`, which is pure
 * and tested. This file renders what that returns and calls back; it holds no policy,
 * so the compliance rules cannot drift by someone editing markup.
 */
import { Button } from "@/components/ui/button";

import {
  recommendedChoice,
  whyNotOneClick,
  type OnboardingAction,
  type OnboardingChoice,
} from "./onboarding-choice";

export type OnboardingChoiceViewProps = {
  choices: OnboardingChoice[];
  busyChoiceId: string | null;
  error: string | null;
  onAct: (action: OnboardingAction, choiceId: string) => void | Promise<void>;
};

/** The button text for one action. Reads as what will happen, not as a generic verb. */
function actionLabel(action: OnboardingAction): string {
  switch (action.kind) {
    case "install-runtime":
      return action.runtime === "claude" ? "Install Claude Code" : "Install Codex";
    case "run-vendor-login":
      // Says whose flow opens, because that is the surprising part.
      return action.runtime === "claude" ? "Open Claude sign-in" : "Open ChatGPT sign-in";
    case "connect-key":
      return "Paste an API key";
    case "connect-redrob":
      return "Use Redrob";
    case "already-connected":
      return "Continue";
  }
}

export function OnboardingChoiceView({ choices, busyChoiceId, error, onAct }: OnboardingChoiceViewProps) {
  const recommended = recommendedChoice(choices);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Connect your AI</h2>
        <p className="text-sm text-muted-foreground">
          Use an account you already have, or Redrob&apos;s own models.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {choices.map((choice) => {
          const why = whyNotOneClick(choice);
          const busy = busyChoiceId === choice.id;
          return (
            <section
              key={choice.id}
              aria-labelledby={`onboarding-${choice.id}-title`}
              className={`flex flex-col gap-3 rounded-lg border p-4 ${
                choice.id === recommended ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 id={`onboarding-${choice.id}-title`} className="font-medium">
                  {choice.title}
                </h3>
                {choice.id === recommended ? (
                  <span className="text-xs text-primary">Recommended</span>
                ) : null}
              </div>

              <p className="text-sm text-muted-foreground">{choice.subtitle}</p>

              {choice.steps.length > 0 ? (
                <ol className="list-decimal pl-4 text-xs text-muted-foreground">
                  {choice.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}

              <Button
                variant={choice.id === recommended ? "default" : "outline"}
                disabled={busy}
                onClick={() => void onAct(choice.action, choice.id)}
              >
                {busy ? "Working…" : actionLabel(choice.action)}
              </Button>

              {why ? <p className="text-xs text-muted-foreground">{why}</p> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
