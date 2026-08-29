/** @jsxImportSource react */
import { resolveExtensionIconSrc } from "@/react-app/design-system/extension-icon-src";
import { useShellConfig } from "../../shell/shell-config";

/**
 * Compact brand lockup shared across the onboarding wizard steps: the
 * existing mark asset (`/redrob-mark.svg`) next to the app name, at a small
 * fixed size so it reads as a quiet header rather than a splash logo. Reuses
 * the same icon + text pairing `welcome-page.tsx` already established,
 * factored out so every step shows the same compact identity.
 */
export function OnboardingBrandMark() {
  const { config } = useShellConfig();

  return (
    <div className="flex items-center gap-2">
      <img
        src={resolveExtensionIconSrc("/redrob-mark.svg")}
        alt=""
        width={20}
        height={20}
        className="shrink-0 dark:invert"
        aria-hidden="true"
      />
      <span className="text-[13px] font-semibold tracking-tight text-foreground">
        {config.appName}
      </span>
    </div>
  );
}
