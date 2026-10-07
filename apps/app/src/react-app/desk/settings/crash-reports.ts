import { desktopBridge } from "../../../app/lib/desktop";
import { isDesktopRuntime } from "../../../app/lib/runtime-env";

type ConsentBridge = { desktopSentrySetConsent(input: { enabled: boolean }): Promise<{ enabled: boolean }> };

/**
 * Hands the person's crash-report choice to the desktop app, which sends reports only while
 * it is on. On the web there is nothing to send them, so it does nothing. Never throws: a
 * build without a crash-report address just reports `false`.
 */
export async function syncCrashReports(enabled: boolean, bridge: ConsentBridge | null = isDesktopRuntime() ? desktopBridge : null): Promise<boolean> {
  if (!bridge) return false;
  try {
    return (await bridge.desktopSentrySetConsent({ enabled })).enabled;
  } catch {
    return false;
  }
}
