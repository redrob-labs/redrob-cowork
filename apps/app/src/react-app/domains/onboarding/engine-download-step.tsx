/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  engineDoctor,
  engineInstall,
  type EngineDoctorResult,
} from "../../../app/lib/desktop";
import { isDesktopRuntime } from "../../../app/utils";
import { t } from "../../../i18n";
import { OnboardingWizardShell } from "./onboarding-wizard-shell";

type EngineDownloadStepProps = {
  onBack: () => void;
  onContinue: () => void;
};

type EnginePhase =
  | "checking"
  | "present"
  | "download"
  | "downloading"
  | "success"
  | "error"
  | "unavailable";

/**
 * Second onboarding step: make sure the local engine binary the app needs is
 * available. Reuses the existing desktop surface (`engineDoctor` / `engineInstall`
 * re-exported from app/lib/desktop) rather than inventing new IPC. On non-desktop
 * runtimes engine acquisition is unavailable, so we show a note and still allow
 * Continue (the wizard must not hard-block).
 */
export function EngineDownloadStep({ onBack, onContinue }: EngineDownloadStepProps) {
  const desktop = isDesktopRuntime();
  const [phase, setPhase] = useState<EnginePhase>(desktop ? "checking" : "unavailable");
  const [doctor, setDoctor] = useState<EngineDoctorResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runDoctor = useCallback(async (): Promise<EngineDoctorResult | null> => {
    try {
      const result = await engineDoctor();
      setDoctor(result);
      return result;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    void (async () => {
      const result = await runDoctor();
      if (cancelled) return;
      if (result && result.found && result.supportsServe) {
        setPhase("present");
      } else {
        setPhase("download");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desktop, runDoctor]);

  const handleInstall = useCallback(async () => {
    setPhase("downloading");
    setErrorMessage(null);
    try {
      const result = await engineInstall();
      if (!result.ok) {
        setErrorMessage(result.stderr.trim() || t("onboarding.engine_error_generic"));
        setPhase("error");
        return;
      }
      const confirmed = await runDoctor();
      if (confirmed && confirmed.found && confirmed.supportsServe) {
        setPhase("success");
      } else {
        setErrorMessage(
          confirmed?.notes.join(" ") || t("onboarding.engine_error_generic"),
        );
        setPhase("error");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setPhase("error");
    }
  }, [runDoctor]);

  return (
    <OnboardingWizardShell
      step="engine"
      title={t("onboarding.engine_title")}
      description={t("onboarding.engine_subtitle")}
      onBack={phase === "downloading" ? null : onBack}
    >
      <div className="space-y-5">
        {phase === "checking" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Loader2Icon className="size-5 shrink-0 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t("onboarding.engine_checking")}
            </span>
          </div>
        ) : null}

        {phase === "present" || phase === "success" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-success-muted/40 bg-success-soft/40 p-4">
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success-ink" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {phase === "success"
                  ? t("onboarding.engine_success")
                  : t("onboarding.engine_present")}
              </div>
              {doctor?.version ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t("onboarding.engine_version", { version: doctor.version })}
                </div>
              ) : null}
              {doctor?.resolvedPath ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t("onboarding.engine_path", { path: doctor.resolvedPath })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase === "download" ? (
          <p className="text-center text-[15px] leading-[23px] text-muted-foreground">
            {t("onboarding.engine_download_hint")}
          </p>
        ) : null}

        {phase === "downloading" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Loader2Icon className="size-5 shrink-0 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t("onboarding.engine_downloading")}
            </span>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {t("onboarding.engine_error")}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {errorMessage || t("onboarding.engine_error_generic")}
              </div>
            </div>
          </div>
        ) : null}

        {phase === "unavailable" ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {t("onboarding.engine_unavailable")}
          </p>
        ) : null}

        {phase === "download" ? (
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-[15px] font-semibold"
            onClick={() => void handleInstall()}
            data-testid="onboarding-engine-download"
          >
            <DownloadIcon className="mr-1.5 size-4" />
            {t("onboarding.engine_download_cta")}
          </Button>
        ) : null}

        {phase === "error" ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 w-full text-[15px] font-semibold"
            onClick={() => void handleInstall()}
            data-testid="onboarding-engine-retry"
          >
            <RotateCcwIcon className="mr-1.5 size-4" />
            {t("onboarding.engine_retry")}
          </Button>
        ) : null}

        {phase === "present" ||
        phase === "success" ||
        phase === "error" ||
        phase === "unavailable" ? (
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-[15px] font-semibold"
            onClick={onContinue}
            data-testid="onboarding-engine-continue"
          >
            {t("onboarding.continue")}
          </Button>
        ) : null}
      </div>
    </OnboardingWizardShell>
  );
}
