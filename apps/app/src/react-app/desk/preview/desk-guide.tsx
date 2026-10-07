/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ModelGuide, ProtectionStatus, SectionMark, Skeleton, Table, icons, type TableColumn } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { ModelCatalog } from "../services/types";
import { desktopFetchViaMain } from "../../../app/lib/desktop";
import {
  estimatedCostFor,
  fetchRedrobPricing,
  formatModelPriceRange,
  formatTokenCount,
  formatUsdAmount,
  type RedrobModelPricing,
  type RedrobPricing,
} from "../../../app/lib/redrob-pricing";
import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { autoModel, guideGroups, guideModelCount, guideProfile, modelLabel, type GuideGroup } from "../guide/guide";
import { DeskShell } from "../shell/desk-shell";

/** The header meta: the edition the rankings come from. */
export function guideMeta(catalog: Pick<ModelCatalog, "source">): string {
  const { source } = catalog;
  return `${source.name}, ${source.edition}. ${source.note}.`;
}

/**
 * The Model Guide on the sample catalog. In Redrob Cowork every message goes to Redrob Auto,
 * so the guide explains how it chooses; there is no model to pick here.
 */
export function GuideView(props: { catalog: ModelCatalog; locale: string; onUse: () => void }) {
  return (
    <>
      <p className="desk-settings__note">
        {icons.sparkle({ width: 14, height: 14, "aria-hidden": true })}
        {t("desk.preview_guide_auto")}
      </p>
      <ModelGuide
        professions={props.catalog.professions}
        source={props.catalog.source}
        locale={props.locale}
        defaultProfession="lawyer"
        title={t("desk.nav_guide")}
        lede={t("desk.preview_guide_lede")}
        simpleLabel={t("desk.preview_guide_simple")}
        advancedLabel={t("desk.preview_guide_advanced")}
        professionLabel={t("desk.preview_guide_profession")}
        taskLabel={t("desk.preview_guide_task")}
        promptLabel={t("desk.preview_guide_prompt")}
        outputLabel={t("desk.preview_guide_output")}
        illustrativeLabel={t("desk.preview_guide_illustrative")}
        effortLabel={t("desk.preview_guide_effort")}
        rankedLabel={t("desk.preview_guide_ranked")}
        emptyTitle={t("desk.preview_guide_empty_title")}
        emptyText={t("desk.preview_guide_empty_text")}
        useLabel={t("desk.preview_guide_use")}
        onUse={props.onUse}
      />
    </>
  );
}

/** One band's models: what each is good at, how much it reads, and what it costs. */
function bandColumns(input: { profileLabel: string | null; profileId: string | null }): Array<TableColumn<RedrobModelPricing>> {
  return [
    {
      key: "label",
      header: t("desk.guide_model"),
      wrap: true,
      render: (model) => <b>{modelLabel(model)}</b>,
    },
    {
      key: "strengths",
      header: t("desk.guide_good_at"),
      grow: true,
      wrap: true,
      render: (model) => model.strengths.join(", "),
    },
    {
      key: "context",
      header: t("desk.guide_reads"),
      align: "right",
      render: (model) => <span className="desk-preview__figure">{formatTokenCount(model.capabilities.maxContextTokens) ?? ""}</span>,
    },
    {
      key: "price",
      header: t("desk.guide_price"),
      align: "right",
      render: (model) => <span className="desk-preview__figure">{formatModelPriceRange(model) ?? ""}</span>,
    },
    ...(input.profileId
      ? [
          {
            key: "request",
            header: input.profileLabel ?? t("desk.guide_per_request"),
            align: "right" as const,
            render: (model: RedrobModelPricing) => (
              <span className="desk-preview__figure">{formatUsdAmount(estimatedCostFor(model, input.profileId ?? "")?.costUsd) ?? ""}</span>
            ),
          },
        ]
      : []),
  ];
}

function bandLabel(band: GuideGroup["band"]): string {
  switch (band) {
    case "budget":
      return t("desk.guide_band_budget");
    case "standard":
      return t("desk.guide_band_standard");
    case "premium":
      return t("desk.guide_band_premium");
    case "frontier":
      return t("desk.guide_band_frontier");
    case "other":
      return t("desk.guide_band_unbanded");
  }
}

/** The guide on the console's published catalogue: Auto first, then every model by price band. */
export function PricingGuideView(props: { pricing: RedrobPricing }) {
  const groups = guideGroups(props.pricing);
  if (!groups.length) return <EmptyState title={t("desk.guide_empty_title")} description={t("desk.guide_empty_text")} />;
  const auto = autoModel(props.pricing);
  const profile = guideProfile(props.pricing);
  const autoCost = auto && profile ? formatUsdAmount(estimatedCostFor(auto, profile.id)?.costUsd) : null;
  return (
    <>
      <ProtectionStatus
        size="lg"
        tone="safe"
        icon={icons.sparkle({ width: 28, height: 28, "aria-hidden": true })}
        title={t("desk.guide_auto_title")}
      >
        {t("desk.guide_auto_text")}
        {autoCost && profile ? ` ${t("desk.guide_auto_cost", { cost: autoCost, profile: profile.label })}` : ""}
      </ProtectionStatus>
      <p className="desk-settings__lede">{t("desk.guide_lede")}</p>
      {groups.map((group) => (
        <section key={group.band} className="desk-settings__group">
          <SectionMark label={bandLabel(group.band)} as="heading" level={2} trailing={group.models.length} />
          <Table
            caption={bandLabel(group.band)}
            columns={bandColumns({ profileId: profile?.id ?? null, profileLabel: profile?.label ?? null })}
            rows={group.models}
          />
        </section>
      ))}
      <p className="desk-settings__note">{t("desk.guide_price_note")}</p>
    </>
  );
}

/** Reads the catalogue through the desktop app where it can, which a browser origin cannot. */
export function guideFetch(desktop: boolean): typeof fetch {
  if (!desktop) return fetch;
  return (input: RequestInfo | URL, init?: RequestInit) => desktopFetchViaMain(input, init);
}

export const GUIDE_QUERY_KEY = ["desk-guide", "pricing"];

/** `/guide`: Auto and the models it chooses from, from the console's published prices. */
export function GuideScreen() {
  const query = useQuery({
    queryKey: GUIDE_QUERY_KEY,
    queryFn: () => fetchRedrobPricing(guideFetch(isDesktopRuntime())),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const count = query.data ? guideModelCount(query.data) : undefined;
  return (
    <DeskShell
      current="guide"
      title={t("desk.nav_guide")}
      meta={count === undefined ? undefined : t("desk.guide_meta", { count })}
      measure={false}
    >
      <div className="desk-settings__main desk-preview--wide">
        {query.isLoading ? (
          <Skeleton variant="text" lines={6} />
        ) : !query.data ? (
          <EmptyState title={t("desk.guide_error_title")} description={t("desk.settings_try_again")} />
        ) : (
          <PricingGuideView pricing={query.data} />
        )}
      </div>
    </DeskShell>
  );
}
