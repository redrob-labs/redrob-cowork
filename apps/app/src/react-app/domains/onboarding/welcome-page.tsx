/** @jsxImportSource react */
import { useEffect } from "react";

import { t } from "../../../i18n";
import { useBootState } from "../../shell/boot-state";
import {
  Page,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollAreaViewport } from "@/components/ui/scroll-area";
import { OnboardingBrandMark } from "./onboarding-brand-mark";

type WelcomePageProps = {
  onGetStarted: () => void;
  getStartedLabel?: string;
  busy?: boolean;
  error?: string | null;
  manualFolder?: string;
  onManualFolderChange?: (value: string) => void;
  onUseManualFolder?: () => void;
  showManualFolder?: boolean;
};

export function WelcomePage({
  onGetStarted,
  getStartedLabel,
  busy,
  error,
  manualFolder,
  onManualFolderChange,
  onUseManualFolder,
  showManualFolder,
}: WelcomePageProps) {
  const { markRouteReady } = useBootState();

  // The boot splash overlay stays mounted (and swallows clicks) until the
  // first route marks itself ready. Welcome is a terminal route, so mark it
  // immediately.
  useEffect(() => {
    markRouteReady();
  }, [markRouteReady]);

  return (
    <Page className="min-h-dvh bg-muted dark:bg-background">
      <PageTitlebarRegion />

      <ScrollArea className="relative z-10">
        <ScrollAreaViewport>
          <div className="flex min-h-dvh items-center justify-center px-4 py-16">
            <div className="animate-in fade-in slide-in-from-bottom-2 flex w-full max-w-[440px] flex-col gap-6 duration-300">
              <div className="px-1">
                <OnboardingBrandMark />
              </div>

              <div className="rounded-[28px] border border-border bg-background px-8 py-10 shadow-sm sm:px-10 sm:py-12">
                <div className="flex flex-col gap-2.5 text-center">
                  <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-foreground sm:text-[32px] sm:leading-[38px]">
                    {t("welcome.title")}
                  </h1>
                  <p className="text-[15px] leading-[23px] text-muted-foreground">
                    {t("welcome.subtitle")}
                  </p>
                </div>

                <div className="mt-10 flex flex-col gap-3">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full text-[15px] font-semibold"
                    onClick={onGetStarted}
                    disabled={busy}
                    data-testid="welcome-get-started"
                  >
                    {busy
                      ? t("welcome.creating_workspace")
                      : (getStartedLabel || t("welcome.get_started"))}
                  </Button>

                  {error ? (
                    <p className="text-center text-xs text-destructive">{error}</p>
                  ) : null}

                  {showManualFolder ? (
                    <div className="rounded-2xl border border-dashed border-border p-3">
                      <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                        {t("welcome.manual_folder_label")}
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-ring"
                          value={manualFolder ?? ""}
                          onChange={(event) => onManualFolderChange?.(event.target.value)}
                          placeholder={t("welcome.manual_folder_placeholder")}
                        />
                      </label>
                      <Button
                        className="mt-2 w-full"
                        variant="outline"
                        onClick={onUseManualFolder}
                        disabled={busy || !manualFolder?.trim()}
                      >
                        {t("welcome.use_folder_button")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </ScrollAreaViewport>
      </ScrollArea>
    </Page>
  );
}
