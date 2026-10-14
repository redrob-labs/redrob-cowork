/**
 * Hook for the session display preferences stored in local prefs — currently the "show thinking"
 * toggle — with set/toggle/reset helpers. A thin typed wrapper over the local-provider prefs store.
 */
import { useCallback } from "react";

import { DEFAULT_SHOW_THINKING, useLocal } from "../../../kernel/local-provider";

type BooleanUpdater = boolean | ((current: boolean) => boolean);

export function useSessionDisplayPreferences() {
  const { prefs, setPrefs } = useLocal();

  const setShowThinking = useCallback(
    (value: BooleanUpdater) => {
      setPrefs((previous) => ({
        ...previous,
        showThinking:
          typeof value === "function" ? value(previous.showThinking) : value,
      }));
    },
    [setPrefs],
  );

  const toggleShowThinking = useCallback(() => {
    setShowThinking((current) => !current);
  }, [setShowThinking]);

  const resetSessionDisplayPreferences = useCallback(() => {
    setShowThinking(DEFAULT_SHOW_THINKING);
  }, [setShowThinking]);

  return {
    showThinking: prefs.showThinking,
    setShowThinking,
    toggleShowThinking,
    resetSessionDisplayPreferences,
  };
}
