/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ModelGuide, ProtectionStatus, SectionMark, Skeleton, Table, Tabs, icons, type TableColumn } from "@redrob-labs/ui";
import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";

import { currentLocale, subscribeToLocale, t, type Language } from "../../../i18n";
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
import { guideLanguages, guideOutputs, guideProfessions, loadGuideResearch, type GuideResearch } from "../guide/model-guide";
import { DeskShell } from "../shell/desk-shell";

/** "Use this" in the guide: Auto picks, so it explains that instead of switching anything. */
function AutoPicksNote() {
  return (
    <ProtectionStatus
      tone="safe"
      icon={icons.sparkle({ width: 20, height: 20, "aria-hidden": true })}
      title={t("desk.preview_guide_use_title")}
    >
      {t("desk.preview_guide_use_text")}
    </ProtectionStatus>
  );
}

/**
 * "By profession": the researched top five for each task, in the language the work is done in. In Redrob Cowork
 * every message goes to Redrob Auto, so the guide shows what Auto chooses from; there is no model to pick here.
 */
export function ProfessionGuideView(props: { research: GuideResearch; locale: Language }) {
  const [explained, setExplained] = useState(false);
  return (
    <>
      <p className="desk-settings__note">
        {icons.sparkle({ width: 14, height: 14, "aria-hidden": true })}
        {t("desk.preview_guide_auto")}
      </p>
      <ModelGuide
        professions={guideProfessions(props.research, props.locale)}
        weights={props.research.weights}
        locale={props.locale}
        defaultProfession="lawyer"
        languages={guideLanguages()}
        defaultLanguage={props.locale}
        title={t("desk.nav_guide")}
        lede={t("desk.guide_profession_lede")}
        method={t("desk.guide_method")}
        methodLabel={t("desk.guide_method_label")}
        simpleLabel={t("desk.preview_guide_simple")}
        advancedLabel={t("desk.preview_guide_advanced")}
        professionLabel={t("desk.preview_guide_profession")}
        taskLabel={t("desk.preview_guide_task")}
        languageLabel={t("desk.guide_language_label")}
        outputs={guideOutputs()}
        deliverableLabel={t("desk.guide_output_label")}
        anyOutputLabel={t("desk.guide_output_any")}
        benchmarkLabel={t("desk.guide_benchmark")}
        benchmarkNote={t("desk.guide_benchmark_note")}
        harnessLabel={(harness) => t("desk.guide_on_harness", { harness })}
        rankLabel={(place, task) => t("desk.guide_rank", { place, task })}
        effortUnit=""
        topLabel={t("desk.guide_top")}
        rangeLabel={t("desk.guide_range")}
        effortLabel={t("desk.preview_guide_effort")}
        effortHint={t("desk.guide_effort_hint")}
        perLabel={t("desk.guide_per_month")}
        effortNote={(note) => [
          t(note.custom ? "desk.guide_effort_note_custom" : "desk.guide_effort_note_ranked", { effort: note.level.label ?? "" }),
          " ",
          note.price,
          note.price ? note.per : null,
        ]}
        rankedLabel={t("desk.preview_guide_ranked")}
        kindLabels={{
          measured: t("desk.guide_kind_measured"),
          published: t("desk.guide_kind_published"),
          derived: t("desk.guide_kind_derived"),
          estimate: t("desk.guide_kind_estimate"),
        }}
        comingSoonLabel={t("desk.guide_coming_soon")}
        missingLabel={t("desk.guide_missing")}
        toolsLabel={t("desk.guide_tools")}
        sourcesLabel={t("desk.guide_sources")}
        emptyTitle={t("desk.preview_guide_empty_title")}
        emptyText={t("desk.preview_guide_empty_text")}
        useLabel={t("desk.preview_guide_use")}
        onUse={() => setExplained(true)}
      />
      {explained ? <AutoPicksNote /> : null}
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
export const GUIDE_RESEARCH_KEY = ["desk-guide", "research"];

export type GuideTab = "profession" | "price";

/** "October 2026" from the research's `asOf` day: an edition is monthly, so the day says nothing to a reader. */
export function guideEdition(asOf: string, locale: Language): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${asOf}T00:00:00Z`));
}

/**
 * `/guide`: by profession, the researched top five per task; by price, Auto and the models it chooses from.
 *
 * The tab is in the URL (`?tab=price`), so a link can open either one. The model menu's "Recommended best
 * models" opens `?tab=profession`. That has to win even when the guide is already open on By price, which
 * local state could not do, because the screen stays mounted.
 */
export function GuideScreen() {
  const [params, setParams] = useSearchParams();
  const tab: GuideTab = params.get("tab") === "price" ? "price" : "profession";
  const setTab = (next: GuideTab) => setParams({ tab: next }, { replace: true });
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const pricing = useQuery({
    queryKey: GUIDE_QUERY_KEY,
    queryFn: () => fetchRedrobPricing(guideFetch(isDesktopRuntime())),
    staleTime: 60 * 60 * 1000,
    retry: 1,
    enabled: tab === "price",
  });
  const research = useQuery({
    queryKey: GUIDE_RESEARCH_KEY,
    queryFn: () => loadGuideResearch(guideFetch(isDesktopRuntime())),
    // An edition changes monthly; an hour keeps a long-open window from showing last month's.
    staleTime: 60 * 60 * 1000,
  });
  const count = pricing.data ? guideModelCount(pricing.data) : undefined;
  const meta =
    tab === "profession"
      ? research.data && t("desk.guide_profession_meta", { edition: guideEdition(research.data.asOf, locale) })
      : count === undefined
        ? undefined
        : t("desk.guide_meta", { count });
  return (
    <DeskShell current="guide" title={t("desk.nav_guide")} meta={meta} measure={false}>
      <div className="desk-settings__main desk-preview--wide">
        <Tabs
          label={t("desk.guide_tabs")}
          value={tab}
          onChange={(id) => setTab(id === "price" ? "price" : "profession")}
          items={[
            { id: "profession", label: t("desk.guide_tab_profession") },
            { id: "price", label: t("desk.guide_tab_price") },
          ]}
        >
          {tab === "profession" ? (
          research.isLoading ? (
            <Skeleton variant="text" lines={6} />
          ) : !research.data ? (
            <EmptyState title={t("desk.guide_profession_error")} description={t("desk.settings_try_again")} />
          ) : (
            <ProfessionGuideView research={research.data} locale={locale} />
          )
        ) : pricing.isLoading ? (
          <Skeleton variant="text" lines={6} />
        ) : !pricing.data ? (
          <EmptyState title={t("desk.guide_error_title")} description={t("desk.settings_try_again")} />
        ) : (
          <PricingGuideView pricing={pricing.data} />
        )}
        </Tabs>
      </div>
    </DeskShell>
  );
}
