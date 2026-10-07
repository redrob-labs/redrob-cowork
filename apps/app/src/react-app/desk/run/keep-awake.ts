import { setDesktopKeepAwake } from "../../../app/lib/desktop";
import { isDesktopRuntime } from "../../../app/utils";
import { LOCAL_PREFERENCES_KEY } from "../../kernel/local-preferences-storage";
import type { RunEventsState } from "./run-events";

/** "Keep this computer awake during a run" starts on. */
export const DEFAULT_KEEP_AWAKE = true;

/** Whether any chat has a run under way that has not answered yet. */
export function runIsBusy(state: Pick<RunEventsState, "live">): boolean {
  return Object.keys(state.live).length > 0;
}

export type KeepAwakeSync = {
  setBusy(busy: boolean): void;
  setEnabled(enabled: boolean): void;
};

/**
 * Asks to stay awake while a run is busy and the setting is on, and to stop as soon as
 * either is not. `send` hears only changes. Until the first one it has not heard anything,
 * so the first answer is always sent: a reloaded window clears a hold the last one left.
 */
export function createKeepAwakeSync(send: (on: boolean) => void, enabled: boolean): KeepAwakeSync {
  let busy = false;
  let on = enabled;
  let sent: boolean | null = null;
  const apply = () => {
    const want = busy && on;
    if (want === sent) return;
    sent = want;
    send(want);
  };
  return {
    setBusy(next) {
      busy = next;
      apply();
    },
    setEnabled(next) {
      on = next;
      apply();
    },
  };
}

/** The setting as `LocalProvider` last saved it; read once, when the first run event arrives. */
export function readKeepAwakePreference(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    const raw = storage?.getItem(LOCAL_PREFERENCES_KEY);
    if (!raw) return DEFAULT_KEEP_AWAKE;
    const parsed: unknown = JSON.parse(raw);
    const value = parsed && typeof parsed === "object" ? Reflect.get(parsed, "deskKeepAwake") : undefined;
    return typeof value === "boolean" ? value : DEFAULT_KEEP_AWAKE;
  } catch {
    return DEFAULT_KEEP_AWAKE;
  }
}

function sendToDesktop(on: boolean) {
  if (!isDesktopRuntime()) return;
  void setDesktopKeepAwake(on).catch(() => undefined);
}

let shared: KeepAwakeSync | null = null;

/** The one sync for the app: run events set busy, Settings sets enabled. */
export function deskKeepAwake(): KeepAwakeSync {
  shared ??= createKeepAwakeSync(
    sendToDesktop,
    readKeepAwakePreference(typeof window === "undefined" ? null : window.localStorage),
  );
  return shared;
}
