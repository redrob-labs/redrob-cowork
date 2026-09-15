/** @jsxImportSource react */
import { useCallback, useReducer, useState } from "react";
import { CreditCardIcon, ExternalLinkIcon, RefreshCwIcon, WalletIcon } from "lucide-react";

import { openDesktopUrl } from "@/app/lib/desktop";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { t } from "@/i18n";
import { readRedrobKeyStatus } from "../onboarding/redrob-key-connect";
import { createRedrobServerClient } from "../../../app/lib/redrob-server";
import { resolveRedrobConnection } from "../../shell/redrob-connection";
import { REDROB_CONSOLE_BILLING_URL } from "../settings/redrob-provider";
import {
  redrobCheckoutUrl,
  redrobPayInitialState,
  redrobPayReducer,
  redrobPayStatusKey,
  type RedrobPaymentRefusal,
  type RedrobPayState,
} from "./redrob-pay";

/**
 * The pay sheet: what Redrob Cowork says about money.
 *
 * It explains the two things the user needs before leaving the app, the amount and the status, and
 * then hands off. The payment itself happens on the console's own checkout, in the system browser,
 * on Stripe. No card field exists in this app and none is proxied through it.
 *
 * The sheet never reports success. Work has no authenticated way to read a balance (see
 * `redrob-pay.ts`), so "check again" re-reads the one thing it can verify, whether Redrob Code still
 * holds a workspace key, and the status line stays honest about the rest. The console ends the
 * handoff by letting the next request through, which the user sees by sending their message again.
 */

/** Injected by the suites. Resolves to whether Redrob Code still holds a workspace key. */
export type RedrobPayRecheck = () => Promise<boolean>;

async function recheckRedrobKey(): Promise<boolean> {
  const { normalizedBaseUrl, resolvedToken, resolvedHostToken } = await resolveRedrobConnection();
  if (!normalizedBaseUrl || !(resolvedToken || resolvedHostToken)) {
    throw new Error("redrob_server_unavailable");
  }
  const status = await readRedrobKeyStatus(
    createRedrobServerClient({
      baseUrl: normalizedBaseUrl,
      token: resolvedToken || undefined,
      hostToken: resolvedHostToken || undefined,
    }),
  );
  return status.connected;
}

export type RedrobPaySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the console refused, when the sheet was opened by a refusal rather than by the user. */
  refusal?: RedrobPaymentRefusal | null;
  /** Overridable so the suites do not reach the local server. */
  recheck?: RedrobPayRecheck;
  /** Overridable so the suites do not reach the browser. */
  openCheckout?: (url: string) => void;
};

export type RedrobPayPanelProps = {
  state: RedrobPayState;
  onOpenCheckout: () => void;
  onRecheck: () => void;
};

/**
 * The sheet's body, separated from the sheet so it can be rendered and asserted on its own: the
 * sheet itself is a portal and leaves nothing behind in static markup.
 */
export function RedrobPayPanel({ state, onOpenCheckout, onRecheck }: RedrobPayPanelProps) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6"
      data-testid="redrob-pay-panel"
    >
      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground">{t("billing.pay_amount_title")}</h3>
        <p className="mt-1 text-sm text-foreground">{t("billing.pay_amount_desc")}</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground">{t("billing.pay_status_title")}</h3>
        <p className="mt-1 text-sm text-foreground" data-testid="redrob-pay-status">
          {t(redrobPayStatusKey(state))}
        </p>
        {state.refusal ? (
          <div className="mt-3 border-t border-border pt-3">
            <h4 className="text-xs font-medium text-muted-foreground">
              {t("billing.pay_console_detail")}
            </h4>
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
              {state.refusal.detail}
            </p>
          </div>
        ) : null}
      </section>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          className="h-11 w-full text-sm font-semibold"
          onClick={onOpenCheckout}
          data-testid="redrob-pay-open-checkout"
        >
          <CreditCardIcon className="mr-1.5 size-4" />
          {state.handedOff ? t("billing.pay_reopen_checkout") : t("billing.pay_open_checkout")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full text-sm"
          disabled={state.checking}
          onClick={onRecheck}
          data-testid="redrob-pay-recheck"
        >
          <RefreshCwIcon className="mr-1.5 size-4" />
          {t("billing.pay_recheck")}
        </Button>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalLinkIcon className="size-3.5 shrink-0" />
          {REDROB_CONSOLE_BILLING_URL}
        </p>
      </div>
    </div>
  );
}

export function RedrobPaySheet({
  open,
  onOpenChange,
  refusal = null,
  recheck = recheckRedrobKey,
  openCheckout,
}: RedrobPaySheetProps) {
  const [state, dispatch] = useReducer(redrobPayReducer, refusal, redrobPayInitialState);

  const handleOpenCheckout = useCallback(() => {
    const url = redrobCheckoutUrl();
    if (openCheckout) openCheckout(url);
    else void openDesktopUrl(url).catch(() => undefined);
    dispatch({ type: "checkout-opened" });
  }, [openCheckout]);

  const handleRecheck = useCallback(async () => {
    dispatch({ type: "recheck-started" });
    try {
      dispatch({ type: "recheck-settled", keyConnected: await recheck() });
    } catch {
      dispatch({ type: "recheck-failed" });
    }
  }, [recheck]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 p-0" data-testid="redrob-pay-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <WalletIcon className="size-4 text-muted-foreground" />
            {t("billing.pay_title")}
          </SheetTitle>
          <SheetDescription>{t("billing.pay_subtitle")}</SheetDescription>
        </SheetHeader>

        <RedrobPayPanel
          state={state}
          onOpenCheckout={handleOpenCheckout}
          onRecheck={() => void handleRecheck()}
        />
      </SheetContent>
    </Sheet>
  );
}

export type RedrobPayNoticeProps = {
  refusal: RedrobPaymentRefusal;
  /** Overridable so the suites can render the sheet without a browser or a local server. */
  recheck?: RedrobPayRecheck;
  openCheckout?: (url: string) => void;
};

/**
 * What a user sees in the transcript when the console refuses for want of credit.
 *
 * The engine's own error text is already in the transcript above this; the notice says what it means
 * and puts the top-up one press away, so nobody has to go and find the console to keep working.
 */
export function RedrobPayNotice({ refusal, recheck, openCheckout }: RedrobPayNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-warning-muted bg-warning-soft px-4 py-3 md:px-10"
      data-testid="redrob-pay-notice"
    >
      <div className="flex items-start gap-2">
        <WalletIcon className="mt-0.5 size-4 shrink-0 text-warning-ink" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t("billing.pay_notice_title")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("billing.pay_notice_desc")}</p>
        </div>
      </div>
      <div>
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="redrob-pay-notice-cta"
        >
          <CreditCardIcon className="mr-1.5 size-3.5" />
          {t("billing.pay_notice_cta")}
        </Button>
      </div>
      <RedrobPaySheet
        open={open}
        onOpenChange={setOpen}
        refusal={refusal}
        recheck={recheck}
        openCheckout={openCheckout}
      />
    </div>
  );
}
