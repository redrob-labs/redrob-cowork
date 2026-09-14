import { useEffect } from "react";

import { t } from "../../../i18n";
import { useBootState } from "../../shell/boot-state";
import { Page, PageTitlebarRegion } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollAreaViewport } from "@/components/ui/scroll-area";
import { OnboardingBrandMark } from "./onboarding-brand-mark";

/**
 * Last onboarding screen. It exists because "Get started" no longer opens a
 * folder dialog: the app now picks a workspace folder for the user, so the user
 * has to be TOLD which folder that is, what the app may do inside it, and how
 * to ask for work. Three short cards, then straight into the first session.
 */
export type TutorialStepProps = {
  /** Absolute path of the workspace that was just created, when known. */
  workspacePath?: string | null;
  onStart: () => void;
};

const CARDS = [
  {
    id: "folder",
    titleKey: "tutorial.folder_title",
    bodyKey: "tutorial.folder_body",
  },
  {
    id: "ask",
    titleKey: "tutorial.ask_title",
    bodyKey: "tutorial.ask_body",
  },
  {
    id: "approve",
    titleKey: "tutorial.approve_title",
    bodyKey: "tutorial.approve_body",
  },
] as const;

export function TutorialStep({ workspacePath, onStart }: TutorialStepProps) {
  const { markRouteReady } = useBootState();

  useEffect(() => {
    markRouteReady();
  }, [markRouteReady]);

  return (
    // fixed inset-0 z-50, matching RedrobKeyStep and AttributionStep.
    //
    // This step renders as an OVERLAY on top of WelcomePage, which welcome-route.tsx keeps mounted
    // underneath the whole main-stage flow. Without the fixed positioning it landed in normal document
    // flow, behind a full-height WelcomePage -- so reaching the tutorial looked like being sent back to
    // Get Started. The user then created another workspace, went through the key step and the
    // attribution survey again, and arrived back at an invisible tutorial: an endless loop with no
    // error, reported as
    // "Connect Redrob -> Approve Redrob -> How did you hear about us? -> Get started -> Create
    // workspace -> Connect Redrob".
    //
    // Its two sibling steps in the same overlay stack were already fixed; this one was not.
    <Page className="fixed inset-0 z-50 min-h-dvh overflow-y-auto bg-muted dark:bg-background">
      <PageTitlebarRegion />

      <ScrollArea className="relative z-10">
        <ScrollAreaViewport>
          <div className="flex min-h-dvh items-center justify-center px-4 py-16">
            <div className="animate-in fade-in slide-in-from-bottom-2 flex w-full max-w-[520px] flex-col gap-6 duration-300">
              <div className="px-1">
                <OnboardingBrandMark />
              </div>

              <div className="rounded-[28px] border border-border bg-background px-8 py-10 shadow-sm sm:px-10 sm:py-12">
                <div className="flex flex-col gap-2.5 text-center">
                  <h1 className="text-[26px] font-semibold leading-[32px] tracking-[-0.02em] text-foreground">
                    {t("tutorial.title")}
                  </h1>
                  <p className="text-[15px] leading-[23px] text-muted-foreground">
                    {t("tutorial.subtitle")}
                  </p>
                </div>

                <div className="mt-8 flex flex-col gap-3">
                  {CARDS.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-left"
                    >
                      <p className="text-[14px] font-semibold text-foreground">{t(card.titleKey)}</p>
                      <p className="mt-1 text-[13px] leading-[20px] text-muted-foreground">
                        {t(card.bodyKey)}
                      </p>
                      {card.id === "folder" && workspacePath ? (
                        <p className="mt-2 break-all rounded-md bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                          {workspacePath}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  size="lg"
                  className="mt-8 h-12 w-full text-[15px] font-semibold"
                  onClick={onStart}
                  data-testid="tutorial-start"
                >
                  {t("tutorial.start")}
                </Button>
              </div>
            </div>
          </div>
        </ScrollAreaViewport>
      </ScrollArea>
    </Page>
  );
}
