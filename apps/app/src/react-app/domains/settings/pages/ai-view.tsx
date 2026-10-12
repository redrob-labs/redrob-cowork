/** @jsxImportSource react */
import { useState } from "react";
import { Button } from "@/components/ui/button";

import { t } from "@/i18n";
import { RedrobPaySheet } from "../../billing/redrob-pay-sheet";
import { ProviderIcon } from "../../../design-system/provider-icon";
import { SettingsNotice, SettingsStatusBadge } from "../settings-section";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemFootnote,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
  LayoutStack,
} from "../settings-layout";

type ConnectedProvider = {
  id: string;
  name: string;
  source?: "env" | "api" | "config" | "custom";
};

export type AiSettingsViewProps = {
  busy: boolean;
  providerAuthBusy: boolean;
  connectedProviders: ConnectedProvider[];
  disconnectingProviderId: string | null;
  providerConnectError: string | null;
  providerDisconnectStatus: string | null;
  providerDisconnectError: string | null;
  onOpenProviderAuth: () => void | Promise<void>;
  /** Opens the model list: one provider's models, or every connected provider's when no id is given. */
  onBrowseModels: (providerId?: string) => void;
  /** How many models each connected provider offers, by provider id. */
  modelCounts: Record<string, number>;
  onDisconnectProvider: (providerId: string) => void | Promise<void>;
  canDisconnectProvider: (provider: ConnectedProvider) => boolean;
  canAddProviders: boolean;
};

function providerSourceLabel(source?: ConnectedProvider["source"]) {
  if (source === "env") return t("settings.provider_source_env");
  if (source === "api") return t("settings.provider_source_api");
  if (source === "config") return t("settings.provider_source_config");
  if (source === "custom") return t("settings.provider_source_config");
  return null;
}

function providerSourceBadgeClassName(input: { source?: ConnectedProvider["source"] }) {
  if (input.source === "env") {
    return "shrink-0 rounded-full border border-warning-muted bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning-ink";
  }
  return "shrink-0 rounded-full border border-dls-border bg-dls-sidebar/40 px-2 py-0.5 text-2xs font-medium text-muted-foreground";
}

/** What a provider is to the person reading, in a sentence, instead of its id. */
function providerLine(provider: ConnectedProvider): string {
  if (provider.id === "redrob") return t("settings.ai_redrob_line");
  return t("settings.ai_account_line", { provider: provider.name });
}

/**
 * Settings, AI: where the models come from, and what each source gives you.
 *
 * Providers are the parent and models belong to them, so the page reads as "your accounts, and what
 * each one gives you". The full model list used to be a section of its own beside the providers; it is
 * now each provider's "Browse models", plus one "Browse all models" for every connected provider at once.
 */
export function AiSettingsView(props: AiSettingsViewProps) {
  const total = Object.values(props.modelCounts).reduce((sum, count) => sum + count, 0);
  // Redrob leads: it is included and is where Redrob Auto lives. The rest keep the order they came in.
  const providers = [...props.connectedProviders].sort((a, b) => Number(b.id === "redrob") - Number(a.id === "redrob"));
  return (
    <LayoutStack>
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.ai_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.ai_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>

        <div className="space-y-2">
          {providers.map((provider) => {
            const sourceLabel = providerSourceLabel(provider.source);
            const count = props.modelCounts[provider.id] ?? 0;
            return (
              <LayoutSectionItem
                key={provider.id}
                className="flex-row flex-wrap items-center justify-between gap-3 rounded-2xl border border-dls-border px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 basis-80 items-center gap-3" data-provider={provider.id}>
                  <ProviderIcon providerId={provider.id} size={22} className="text-dls-text" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-dls-text">{provider.name}</span>
                      <SettingsStatusBadge tone="ready" label={t("settings.ai_connected")} />
                      {sourceLabel ? (
                        <span className={providerSourceBadgeClassName({ source: provider.source })}>{sourceLabel}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{providerLine(provider)}</div>
                    {count > 0 ? (
                      <div className="text-xs text-muted-foreground">{t("settings.ai_model_count", { count })}</div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {count > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => props.onBrowseModels(provider.id)}
                      disabled={props.busy}
                      data-testid={`ai-browse-${provider.id}`}
                    >
                      {t("settings.ai_browse")}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => void props.onDisconnectProvider(provider.id)}
                    disabled={
                      props.busy ||
                      props.providerAuthBusy ||
                      props.disconnectingProviderId !== null ||
                      !props.canDisconnectProvider(provider)
                    }
                  >
                    {props.disconnectingProviderId === provider.id
                      ? t("settings.disconnecting")
                      : props.canDisconnectProvider(provider)
                        ? t("settings.disconnect")
                        : t("settings.managed_by_env")}
                  </Button>
                </div>
              </LayoutSectionItem>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {props.canAddProviders ? (
            <Button
              variant="outline"
              onClick={() => void props.onOpenProviderAuth()}
              disabled={props.busy || props.providerAuthBusy}
              data-testid="ai-connect-account"
            >
              {props.providerAuthBusy ? t("settings.loading_providers") : t("settings.ai_connect")}
            </Button>
          ) : (
            <span />
          )}
          {total > 0 ? (
            <Button onClick={() => props.onBrowseModels()} disabled={props.busy} data-testid="ai-browse-all">
              {t("settings.ai_browse_all", { count: total })}
            </Button>
          ) : null}
        </div>

        {props.providerConnectError ? (
          <SettingsNotice tone="error">{props.providerConnectError}</SettingsNotice>
        ) : null}
        {props.providerDisconnectStatus ? (
          <SettingsNotice>{props.providerDisconnectStatus}</SettingsNotice>
        ) : null}
        {props.providerDisconnectError ? (
          <SettingsNotice tone="error">{props.providerDisconnectError}</SettingsNotice>
        ) : null}

        <LayoutSectionItemFootnote>{t("settings.ai_keys_footnote")}</LayoutSectionItemFootnote>
      </LayoutSection>

      {/* ---- Credit and payment ---- */}
      <RedrobCreditSection />

    </LayoutStack>
  );
}

/**
 * Where a first payment or a top-up starts, without anyone hunting for the console.
 *
 * Self-contained on purpose: it owns nothing but the sheet's open state, so it needs no props from
 * the settings route and adds no wiring to it. The sheet is the only thing that talks about money,
 * and it hands off to the console rather than pretending Work can charge a card.
 */
function RedrobCreditSection() {
  const [payOpen, setPayOpen] = useState(false);

  return (
    <LayoutSection>
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("settings.redrob_credit_title")}</LayoutSectionTitle>
        <LayoutSectionDescription>{t("settings.redrob_credit_desc")}</LayoutSectionDescription>
      </LayoutSectionHeader>

      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("billing.pay_status_unknown")}</LayoutSectionItemTitle>
          <LayoutSectionItemHeaderActions>
            <Button onClick={() => setPayOpen(true)} data-testid="redrob-credit-open-pay">
              {t("settings.redrob_credit_cta")}
            </Button>
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
      </LayoutSectionItem>

      <RedrobPaySheet open={payOpen} onOpenChange={setPayOpen} />
    </LayoutSection>
  );
}
