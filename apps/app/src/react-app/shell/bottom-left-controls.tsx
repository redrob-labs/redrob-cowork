/** @jsxImportSource react */
import { useSyncExternalStore } from "react";
import { LanguagesIcon, MoonIcon, SunIcon } from "lucide-react";
import { useLocation } from "react-router";

import { getResolvedThemeMode, setThemeMode, subscribeToTheme } from "@/app/theme";
import { cn } from "@/lib/utils";
import { currentLocale, setLocale, subscribeToLocale, t, type Language } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Read the active language via the i18n locale store so the cluster re-renders
 * (and re-labels itself) whenever the language changes anywhere in the app.
 */
function useLanguage(): Language {
  return useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
}

/**
 * Read the resolved (light | dark) theme via the shared theme store, matching
 * the toaster's subscription pattern in `@/components/ui/sonner`.
 */
function useResolvedTheme() {
  return useSyncExternalStore(subscribeToTheme, getResolvedThemeMode, getResolvedThemeMode);
}

/**
 * Persistent bottom-left control cluster: toggles the UI language
 * (English <-> 한국어) and the light/dark theme. Both toggles reuse the same
 * setters the Settings > Appearance sections use (`setLocale` from `@/i18n`
 * and `setThemeMode` from `@/app/theme`), so changes apply app-wide and
 * persist across reloads without introducing competing state.
 */
export function BottomLeftControls() {
  const { pathname } = useLocation();
  const language = useLanguage();
  const resolvedTheme = useResolvedTheme();
  const isWelcomeRoute = pathname === "/welcome";

  const nextLanguage: Language = language === "ko" ? "en" : "ko";
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  const languageLabel = t("shell.controls.toggle_language");
  const themeLabel =
    resolvedTheme === "dark"
      ? t("shell.controls.switch_to_light")
      : t("shell.controls.switch_to_dark");

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-3 z-40 flex items-center gap-1.5",
        isWelcomeRoute ? "bottom-3" : "bottom-14",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={languageLabel}
              className="pointer-events-auto"
              onClick={() => setLocale(nextLanguage)}
            >
              <LanguagesIcon />
            </Button>
          }
        />
        <TooltipContent>{languageLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={themeLabel}
              className="pointer-events-auto"
              onClick={() => setThemeMode(nextTheme)}
            >
              {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
            </Button>
          }
        />
        <TooltipContent>{themeLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
