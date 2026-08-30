/** @jsxImportSource react */
import { useState } from "react";
import { ExternalLinkIcon, KeyRoundIcon, LinkIcon, SkipForwardIcon } from "lucide-react";

import { PageTitlebarRegion } from "@/components/page";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/react-app/design-system/text-input";
import { t } from "../../../i18n";
import { OnboardingBrandMark } from "./onboarding-brand-mark";
import { REDROB_CONSOLE_URL } from "../settings/redrob-provider";

/** What the step shows while the user is over in the browser approving a code. */
export type RedrobConnectPrompt = {
  userCode: string;
  verificationUriComplete: string;
};

type RedrobKeyStepProps = {
  busy?: boolean;
  error?: string | null;
  onSubmitKey: (apiKey: string) => void | Promise<void>;
  onOpenConsole: () => void;
  onSkip: () => void;
  /**
   * The primary path: connect through console.redrob.ai without anyone handling a key. Absent on a
   * runtime where it cannot be offered, in which case the step falls back to the paste field alone.
   */
  onConnect?: () => void | Promise<void>;
  onCancelConnect?: () => void;
  /** True from the moment connect is pressed until it settles, code shown or not. */
  connectBusy?: boolean;
  /** Present once the console has given us a code to show. */
  connectPrompt?: RedrobConnectPrompt | null;
  /**
   * Overrides the skip control's copy. First-run onboarding passes the
   * "just look around" label so skipping reads as an explicit browse-mode
   * branch (finish onboarding without a key; add one later in Settings).
   * Defaults to the existing "Skip for now" copy.
   */
  skipLabel?: string;
  skipDescription?: string;
};

/**
 * First-run onboarding step that replaces the former cloud-account sign-in.
 *
 * The primary path is "Redrob로 연결": the app asks console.redrob.ai for a short code, opens the
 * console in the system browser, and waits while the signed-in user approves it. The key arrives on
 * its own and goes to Redrob Code's auth store, so nobody has to see it, copy it, or leave it on a
 * clipboard.
 *
 * Pasting a key still works and is kept behind one press. It is what to use on a machine that cannot
 * open a browser, which is a real case, and not the first thing anyone should be asked to do.
 */
export function RedrobKeyStep({
  busy,
  error,
  onSubmitKey,
  onOpenConsole,
  onSkip,
  onConnect,
  onCancelConnect,
  connectBusy,
  connectPrompt,
  skipLabel,
  skipDescription,
}: RedrobKeyStepProps) {
  const [apiKey, setApiKey] = useState("");
  /** Opened by the user, and kept open, so a failed paste attempt does not fold away under them. */
  const [manualOpen, setManualOpen] = useState(false);
  const canSubmit = Boolean(apiKey.trim()) && !busy && !connectBusy;
  const showManual = manualOpen || !onConnect;
  const waiting = Boolean(connectBusy || connectPrompt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-muted px-4 py-10 dark:bg-background">
      <PageTitlebarRegion />

      <div className="animate-in fade-in slide-in-from-bottom-2 relative z-10 flex w-full max-w-[440px] flex-col gap-6 duration-300">
        <div className="px-1">
          <OnboardingBrandMark />
        </div>

        <div className="rounded-[28px] border border-border bg-background px-8 py-10 shadow-sm sm:px-10">
          <div className="mb-8 space-y-2.5 text-center">
            <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-foreground sm:text-[32px] sm:leading-[38px]">
              {t("welcome.redrob_key_title")}
            </h1>
            <p className="text-[15px] leading-[23px] text-muted-foreground">
              {t("welcome.redrob_key_subtitle")}
            </p>
          </div>

          <div className="space-y-4">
            {onConnect ? (
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-[15px] font-semibold"
                disabled={busy || connectBusy}
                onClick={() => void onConnect()}
                data-testid="redrob-connect"
              >
                <LinkIcon className="mr-1.5 size-4" />
                {connectBusy && !connectPrompt
                  ? t("welcome.redrob_connect_starting")
                  : t("welcome.redrob_connect_cta")}
              </Button>
            ) : null}

            {connectPrompt ? (
              <div
                className="space-y-3 rounded-2xl border border-border bg-card p-4"
                data-testid="redrob-connect-code"
              >
                <p className="text-xs text-muted-foreground">
                  {t("welcome.redrob_connect_code_label")}
                </p>
                <p className="text-center font-mono text-2xl font-semibold tracking-[0.25em] text-foreground">
                  {connectPrompt.userCode}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("welcome.redrob_connect_waiting")}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={onOpenConsole}>
                    <ExternalLinkIcon className="mr-1.5 size-3.5" />
                    {t("welcome.redrob_connect_reopen")}
                  </Button>
                  {onCancelConnect ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCancelConnect}
                      data-testid="redrob-connect-cancel"
                    >
                      {t("welcome.redrob_connect_cancel")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="text-center text-xs text-destructive">{error}</p>
            ) : null}

            {showManual ? (
              <div className="space-y-4 border-t border-border pt-4">
                <button
                  type="button"
                  className="flex w-full items-start gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/15 hover:bg-accent"
                  onClick={onOpenConsole}
                  data-testid="redrob-open-console"
                >
                  <ExternalLinkIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t("welcome.redrob_key_get_cta")}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {REDROB_CONSOLE_URL}
                    </div>
                  </div>
                </button>

                <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                  {t("welcome.redrob_key_label")}
                  <TextInput
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.currentTarget.value)}
                    placeholder={t("welcome.redrob_key_placeholder")}
                    disabled={busy || waiting}
                    autoFocus={!onConnect}
                  />
                </label>

                <Button
                  type="button"
                  variant={onConnect ? "outline" : "default"}
                  size="lg"
                  className="h-12 w-full text-[15px] font-semibold"
                  disabled={!canSubmit}
                  onClick={() => void onSubmitKey(apiKey.trim())}
                  data-testid="redrob-submit-key"
                >
                  <KeyRoundIcon className="mr-1.5 size-4" />
                  {busy ? t("welcome.redrob_key_saving") : t("welcome.redrob_key_submit")}
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setManualOpen(true)}
                  disabled={busy}
                  data-testid="redrob-paste-instead"
                >
                  <KeyRoundIcon className="mr-1.5 size-3.5" />
                  {t("welcome.redrob_connect_manual_toggle")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("welcome.redrob_connect_manual_hint")}
                </p>
              </div>
            )}

            <div className="space-y-1 pt-1 text-center">
              <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy || waiting}>
                <SkipForwardIcon className="mr-1.5 size-3.5" />
                {skipLabel ?? t("welcome.redrob_key_skip")}
              </Button>
              {skipDescription ? (
                <p className="text-xs text-muted-foreground">{skipDescription}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
