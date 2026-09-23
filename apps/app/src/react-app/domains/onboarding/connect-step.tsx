/** @jsxImportSource react */
/**
 * The `connect` onboarding step: fetch what the machine has, render the three choices.
 *
 * The container. It owns the fetch and the action dispatch; all policy is in
 * `onboarding-choice.ts` and all markup in `onboarding-choice-view.tsx`.
 */
import { useCallback, useEffect, useState } from "react";

import { buildOnboardingChoices, type OnboardingAction, type OnboardingChoice } from "./onboarding-choice";
import { OnboardingChoiceView } from "./onboarding-choice-view";

type Availability = {
  codex: { installed: boolean; signedIn: boolean | null };
  claude: { installed: boolean; signedIn: boolean | null };
};

export type ConnectStepProps = {
  /** Fetches GET /harness/availability. Injected so this is testable and mockable. */
  fetchAvailability: () => Promise<Availability>;
  /** Runs an install or a vendor login in a terminal the user can see. */
  runInTerminal: (command: string) => Promise<void>;
  /** Existing Redrob connect flow. */
  onConnectRedrob: () => void | Promise<void>;
  /** Advance the wizard. */
  onDone: () => void;
  redrobConnected: boolean;
};

export function ConnectStep({
  fetchAvailability,
  runInTerminal,
  onConnectRedrob,
  onDone,
  redrobConnected,
}: ConnectStepProps) {
  const [choices, setChoices] = useState<OnboardingChoice[] | null>(null);
  const [busyChoiceId, setBusyChoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const availability = await fetchAvailability();
      setChoices(
        buildOnboardingChoices({
          codex: { binary: availability.codex.installed ? "codex" : null, signedIn: availability.codex.signedIn },
          claude: { binary: availability.claude.installed ? "claude" : null, signedIn: availability.claude.signedIn },
          redrobConnected,
        }),
      );
      setError(null);
    } catch {
      // Detection failing must not block onboarding: fall back to "nothing detected",
      // which still offers all three choices and still lets the user continue. A blank
      // screen here would strand a user whose only real option is Redrob anyway.
      setChoices(
        buildOnboardingChoices({
          codex: { binary: null, signedIn: null },
          claude: { binary: null, signedIn: null },
          redrobConnected,
        }),
      );
      setError("Could not check what is installed on this computer. You can still choose below.");
    }
  }, [fetchAvailability, redrobConnected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = useCallback(
    async (action: OnboardingAction, choiceId: string) => {
      setBusyChoiceId(choiceId);
      try {
        switch (action.kind) {
          case "install-runtime":
            await runInTerminal(action.installCommand);
            // Re-probe rather than assuming success: an install can fail, and marking the
            // choice ready on optimism would send the user into a dead end.
            await refresh();
            break;
          case "run-vendor-login":
            await runInTerminal(action.command);
            await refresh();
            break;
          case "connect-redrob":
            await onConnectRedrob();
            break;
          case "connect-key":
          case "already-connected":
            onDone();
            break;
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusyChoiceId(null);
      }
    },
    [onConnectRedrob, onDone, refresh, runInTerminal],
  );

  if (!choices) return <p className="text-sm text-muted-foreground">Checking this computer…</p>;

  return <OnboardingChoiceView choices={choices} busyChoiceId={busyChoiceId} error={error} onAct={act} />;
}
