/** @jsxImportSource react */
import { useState } from "react";
import type { RecoveryActionResult } from "@/app/lib/desktop";
import { bootOverlayCanHide, useBootState, useBootOverlayVisible } from "./boot-state";
import { OwDotTicker } from "./dot-ticker";
import { t } from "@/i18n";

/**
 * Quiet, opaque boot overlay. Solid surface fill so nothing bleeds through.
 * A minimal typographic beat plus a small dot ticker. Fades once both the
 * boot hook and the first route load are ready.
 *
 * When boot fails, the only recovery offered is "restore the previous
 * version". The old build also let the user pick any other version, but the
 * candidate list came from the control plane's published-version inventory
 * (`publishedDesktopVersions`) — there is no local source for it, and the main
 * process filters an empty candidate list down to nothing. The previous
 * version is tracked locally, so that path still works.
 */
export function LoadingOverlay() {
  const visible = useBootOverlayVisible();
  const { phase, routeReady, message, error } = useBootState();
  const [actionState, setActionState] = useState<string | null>(null);

  const runRecovery = async (action: (() => Promise<RecoveryActionResult>) | undefined) => {
    if (!action) return;
    setActionState(t("boot.recovery_preparing"));
    try {
      const result = await action();
      setActionState(result.ok
        ? result.message ?? t("boot.recovery_ready")
        : result.reason ?? t("boot.recovery_failed"));
    } catch {
      setActionState(t("boot.recovery_failed"));
    }
  };

  if (!visible) return null;

  const fading = bootOverlayCanHide(phase, routeReady);

  return (
    <div
      className={`pointer-events-auto fixed inset-0 z-[1000] flex items-center justify-center bg-dls-surface transition-opacity duration-[160ms] ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      aria-live="polite"
      aria-busy={!fading}
      role="status"
    >
      <div className="flex w-full max-w-[320px] flex-col items-center gap-4 px-6 text-center">
        {error ? (
          <div className="flex w-full flex-col gap-3 text-[12px] leading-5">
            <div className="text-base font-medium text-dls-primary">{t("boot.failed_title")}</div>
            <div className="text-dls-secondary">{t("boot.failed_description")}</div>
            <button
              type="button"
              className="rounded-md bg-dls-accent px-3 py-2 font-medium text-dls-accent-foreground disabled:opacity-50"
              onClick={() => void runRecovery(window.__REDROB_ELECTRON__?.recovery?.restorePrevious)}
            >{t("boot.restore_previous")}</button>
            {actionState ? <div className="text-dls-secondary">{actionState}</div> : null}
            <details className="text-left text-dls-secondary">
              <summary className="cursor-pointer">{t("boot.technical_details")}</summary>
              <div className="mt-2 break-words">{error}</div>
            </details>
          </div>
        ) : (
          <>
            <OwDotTicker size="md" />
            <div className="text-[12px] leading-5 text-dls-secondary">
              {message || t("session.preparing_workspace")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
