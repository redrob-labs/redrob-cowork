/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { desktopBridge } from "@/app/lib/desktop";
import type {
  DesktopIntegrationResult,
  DesktopIntegrationStatus,
} from "@/app/lib/desktop-types";
import { t } from "@/i18n";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
} from "./settings-layout";

function statusDescription(status: DesktopIntegrationStatus) {
  if (status.state === "integrated") {
    return t("settings.desktop_integration_desc_integrated");
  }
  if (status.state === "managed_externally") {
    return t("settings.desktop_integration_desc_managed_externally");
  }
  if (status.state === "needs_repair" && status.ownership === "external") {
    return status.issues.includes("desktop-entry")
      ? t("settings.desktop_integration_desc_needs_repair_manager")
      : t("settings.desktop_integration_desc_managed_externally_select");
  }
  if (status.state === "needs_repair") {
    return t("settings.desktop_integration_desc_needs_repair");
  }
  return t("settings.desktop_integration_desc_not_integrated");
}

function statusLabel(status: DesktopIntegrationStatus) {
  if (status.state === "integrated") return t("settings.desktop_integration_status_integrated");
  if (status.state === "managed_externally") return t("settings.desktop_integration_status_managed_externally");
  if (status.state === "needs_repair") return t("settings.desktop_integration_status_needs_repair");
  return t("settings.desktop_integration_status_not_integrated");
}

export function DesktopIntegrationSection() {
  const [status, setStatus] = useState<DesktopIntegrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setStatus(await desktopBridge.desktopIntegrationStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async (action: () => Promise<DesktopIntegrationResult>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setStatus(result.status);
      if (!result.ok) setError(result.error ?? t("settings.desktop_integration_failed"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }, []);

  if (!status?.supported) return null;

  const externallyManaged = status.ownership === "external";
  const redrobManaged = status.ownership === "redrob";

  return (
    <LayoutSection>
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("settings.desktop_integration_title")}</LayoutSectionTitle>
        <LayoutSectionDescription>
          {t("settings.desktop_integration_desc")}
        </LayoutSectionDescription>
      </LayoutSectionHeader>

      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{statusLabel(status)}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>{statusDescription(status)}</LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            {status.ownership === "none" ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run(() => desktopBridge.desktopIntegrationInstall())}
              >
                {t("settings.desktop_integration_action_integrate")}
              </Button>
            ) : null}
            {redrobManaged ? (
              <>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => desktopBridge.desktopIntegrationInstall())}
                >
                  {t("settings.desktop_integration_action_repair")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(() => desktopBridge.desktopIntegrationRemove())}
                >
                  {t("settings.desktop_integration_action_remove")}
                </Button>
              </>
            ) : null}
            {externallyManaged && status.state === "needs_repair" ? (
              <Button
                size="sm"
                disabled={busy || status.issues.includes("desktop-entry")}
                onClick={() => void run(() => (
                  desktopBridge.desktopIntegrationInstall({ useExternalLauncher: true })
                ))}
              >
                {t("settings.desktop_integration_action_use_manager_launcher")}
              </Button>
            ) : null}
            {externallyManaged ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
                {t("settings.desktop_integration_action_recheck")}
              </Button>
            ) : null}
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
        <p className="break-all text-xs text-muted-foreground">{status.appImagePath}</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </LayoutSectionItem>
    </LayoutSection>
  );
}
