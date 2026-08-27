/** @jsxImportSource react */
import { useState } from "react";
import { ExternalLinkIcon, KeyRoundIcon, SkipForwardIcon } from "lucide-react";

import {
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/react-app/design-system/text-input";
import { t } from "../../../i18n";
import { REDROB_CONSOLE_URL } from "../settings/redrob-provider";

type RedrobKeyStepProps = {
  busy?: boolean;
  error?: string | null;
  onSubmitKey: (apiKey: string) => void | Promise<void>;
  onOpenConsole: () => void;
  onSkip: () => void;
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
 * The product is Redrob-provider-only, so the primary path is: go to
 * console.redrob.ai, issue a REDROB_API_KEY, and paste it here. The key is
 * stored via the same env-backed Redrob provider connect path used in
 * Settings (REDROB_API_KEY), so no separate credential store is introduced.
 */
export function RedrobKeyStep({
  busy,
  error,
  onSubmitKey,
  onOpenConsole,
  onSkip,
  skipLabel,
  skipDescription,
}: RedrobKeyStepProps) {
  const [apiKey, setApiKey] = useState("");
  const canSubmit = Boolean(apiKey.trim()) && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <PageBackground />
      <PageTitlebarRegion />

      <div className="relative z-10 mx-6 w-full max-w-md rounded-3xl border border-border bg-background px-8 py-10">
        <PageHeader className="mb-8 text-center">
          <PageTitle>{t("welcome.redrob_key_title")}</PageTitle>
          <PageDescription>{t("welcome.redrob_key_subtitle")}</PageDescription>
        </PageHeader>

        <div className="space-y-4">
          <button
            type="button"
            className="flex w-full items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
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
              disabled={busy}
              autoFocus
            />
          </label>

          {error ? (
            <p className="text-center text-xs text-destructive">{error}</p>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="h-11 w-full text-[15px] font-semibold"
            disabled={!canSubmit}
            onClick={() => void onSubmitKey(apiKey.trim())}
            data-testid="redrob-submit-key"
          >
            <KeyRoundIcon className="mr-1.5 size-4" />
            {busy ? t("welcome.redrob_key_saving") : t("welcome.redrob_key_submit")}
          </Button>

          <div className="space-y-1 pt-1 text-center">
            <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy}>
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
  );
}
