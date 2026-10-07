/**
 * "Keep this computer awake during a run": one `powerSaveBlocker` hold, started when the
 * renderer says a run is busy and the setting is on, stopped when it says otherwise.
 * `prevent-app-suspension` keeps the system awake and still lets the screen turn off.
 * Asking twice for the same state does nothing, so there is never more than one hold.
 */
export function createKeepAwake(blocker) {
  let id = null;
  return {
    set(on) {
      if (on && id === null) {
        id = blocker.start("prevent-app-suspension");
      } else if (!on && id !== null) {
        if (blocker.isStarted(id)) blocker.stop(id);
        id = null;
      }
      return id !== null;
    },
  };
}
