/** @jsxImportSource react */
/**
 * The `connect` onboarding step: fetch what the machine has, render the three choices.
 *
 * The container. It owns the fetch and the action dispatch; all policy is in
 * `onboarding-choice.ts` and all markup in `onboarding-choice-view.tsx`.
 */
import { useCallback, useEffect, useState } from "react";

import { t } from "@/i18n";
import { OnboardingWizardShell } from "./onboarding-wizard-shell";
import { buildOnboardingChoices, type OnboardingAction, type OnboardingChoice } from "./onboarding-choice";
import { OnboardingChoiceView } from "./onboarding-choice-view";

type Availability = {
  codex: { installed: boolean; signedIn: boolean | null };
  claude: { installed: boolean; signedIn: boolean | null };
};

export type ConnectStepProps = {
  /** Fetches GET /harness/availability. Injected so this is testable and mockable. */
  fetchAvailability: () => Promise<Availability>;
  /**
   * Copies a command to the clipboard.
   *
   * We show the command rather than running it. Spawning a visible terminal from
   * Electron means a different incantation per platform and per terminal emulator, and
   * an install or a vendor login is exactly the moment a user should see what is being
   * run on their machine. Showing it is also the only version that works everywhere.
   */
  copyCommand: (command: string) => Promise<void>;
  /** Existing Redrob connect flow. */
  onConnectRedrob: () => void | Promise<void>;
  /** Advance the wizard. */
  onDone: () => void;
  /** Back to the previous step. */
  onBack: () => void;
  redrobConnected: boolean;
};

export function ConnectStep({
  fetchAvailability,
  copyCommand,
  onConnectRedrob,
  onDone,
  onBack,
  redrobConnected,
}: ConnectStepProps) {
  const [choices, setChoices] = useState<OnboardingChoice[] | null>(null);
  const [busyChoiceId, setBusyChoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The command the user should run, shown after they pick a choice that needs one. */
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

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
            setPendingCommand(action.installCommand);
            await copyCommand(action.installCommand);
            break;
          case "run-vendor-login":
            setPendingCommand(action.command);
            await copyCommand(action.command);
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
    [copyCommand, onConnectRedrob, onDone],
  );

  /**
   * Re-probe after the user says they ran the command.
   *
   * Explicitly user-driven rather than polling: we do not know when they finished, and a
   * poll that flips the screen mid-login is worse than a button. It also RE-CHECKS rather
   * than trusting the claim, so a failed install does not mark the choice ready and send
   * the user into a dead end.
   */
  const recheck = useCallback(async () => {
    setPendingCommand(null);
    await refresh();
  }, [refresh]);

  if (!choices) {
    return (
      <OnboardingWizardShell step="connect" title={t("onboarding.connect_title")} description={t("onboarding.connect_subtitle")} onBack={onBack}>
        <p className="text-sm text-muted-foreground">{t("onboarding.connect_checking")}</p>
      </OnboardingWizardShell>
    );
  }

  return (
    <OnboardingWizardShell step="connect" title={t("onboarding.connect_title")} description={t("onboarding.connect_subtitle")} onBack={onBack}>
      <div className="flex flex-col gap-4">
        <OnboardingChoiceView choices={choices} busyChoiceId={busyChoiceId} error={error} onAct={act} />
        {pendingCommand ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-sm">{t("onboarding.connect_run_command")}</p>
            <code className="select-all rounded bg-muted px-2 py-1 text-xs">{pendingCommand}</code>
            <p className="text-xs text-muted-foreground">{t("onboarding.connect_copied")}</p>
            <button type="button" className="self-start text-sm underline" onClick={() => void recheck()}>
              {t("onboarding.connect_recheck")}
            </button>
          </div>
        ) : null}
      </div>
    </OnboardingWizardShell>
  );
}
