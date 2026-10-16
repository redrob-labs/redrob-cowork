/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ModelGuide, ProtectionStatus, SectionMark, Skeleton, Table, icons, type TableColumn } from "@redrob-labs/ui";
import { useSyncExternalStore, useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import type { ModelRef } from "../../../app/types";
import { currentLocale, subscribeToLocale, t, type Language } from "../../../i18n";
import { useLocalOptional } from "../../kernel/local-provider";
import { markNewChatUsesDefault } from "../../kernel/model-config";
import { desktopFetchViaMain } from "../../../app/lib/desktop";
import {
  estimatedCostFor,
  formatModelPriceRange,
  formatTokenCount,
  formatUsdAmount,
  type RedrobModelPricing,
  type RedrobPricing,
} from "../../../app/lib/redrob-pricing";
import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { autoModel, guideGroups, guideProfile, modelLabel, type GuideGroup } from "../guide/guide";
import {
  guideLanguages,
  guideOutputs,
  guideProfessions,
  guideUse,
  loadGuideResearch,
  type GuideResearch,
  type GuideUse,
} from "../guide/model-guide";
import { CoworkShell } from "../shell/cowork-shell";
import { ModelChartHome, type ChartPick } from "./model-chart-home";
import { ChartDetail } from "./chart-detail";
import { CHART_MODELS } from "./chart-models";

/**
 * Says what "Use this" did, as a toast beside where the person is looking rather than a note at the foot of a
 * long page: new chats start on the pick (with a way to start one), or why this pick cannot be used here.
 */
export function announceUse(use: GuideUse, startChat?: () => void): void {
  if (!use.ok) {
    toast.warning(t("cowork.guide_use_unavailable_title", { model: use.name }), {
      description: use.reason === "elsewhere" ? t("cowork.guide_use_elsewhere", { harness: use.harness }) : t("cowork.guide_use_not_on_redrob"),
    });
    return;
  }
  toast.success(t("cowork.guide_use_done_title", { model: use.name }), {
    description: [use.effort ? t("cowork.guide_use_done_effort", { effort: use.effort }) : null, t("cowork.guide_use_done_text")]
      .filter(Boolean)
      .join(" "),
    ...(startChat ? { action: { label: t("cowork.guide_use_new_chat"), onClick: startChat } } : {}),
  });
}

/**
 * "By profession": the researched top five for each task, in the language the work is done in. "Use this"
 * starts new chats on the pick (`onChoose`); chats that exist keep their model. Without `onChoose` (a screen
 * rendered on its own) it only says what it would do.
 */
export function ProfessionGuideView(props: {
  research: GuideResearch;
  locale: Language;
  onChoose?: (model: ModelRef, variant: string | null) => void;
  onStartChat?: () => void;
}) {
  // Round 8, item 10: the chart-style browse layer. Null = the Spotify/Apple-Music home (banners +
  // tiles); a pick drills into the existing ModelGuide ranking for that profession or output.
  const [pick, setPick] = useState<ChartPick | null>(null);
  // Round 37 (item 8): opening a chart (or switching charts) kept the shell's
  // scroll position, so a detail could open scrolled to the middle. The scrolling
  // container is the DS shell's #rr-shell-main; reset it to the top whenever the
  // pick changes (enter a detail, switch charts, or return to the home).
  useEffect(() => {
    document.getElementById("rr-shell-main")?.scrollTo({ top: 0 });
  }, [pick]);
  if (!pick) {
    return <ModelChartHome research={props.research} locale={props.locale} onOpen={setPick} />;
  }
  return (
    <ChartDetail
      section={pick.section ?? "picked-for-your-profession"}
      tileId={pick.tileId ?? (pick.kind === "profession" ? pick.id : pick.kind === "output" ? pick.value : pick.value)}
      title={pick.label}
      onBack={() => setPick(null)}
      onUse={(modelId) => {
        // The chart ids are editorial slugs, not live model refs (model-ranking wiring is a later
        // session), so Use starts a fresh chat and tells the user which model it picked. The special
        // "__auto__" id is the Redrob Auto router Featured card, which picks per budget rather than
        // naming a fixed model.
        toast.success(
          modelId === "__auto__"
            ? t("cowork.chart_detail_auto_done")
            : t("cowork.chart_detail_use_done", { model: CHART_MODELS[modelId]?.name ?? modelId }),
        );
        props.onStartChat?.();
      }}
    />
  );
}

/** One band's models: what each is good at, how much it reads, and what it costs. */
function bandColumns(input: { profileLabel: string | null; profileId: string | null }): Array<TableColumn<RedrobModelPricing>> {
  return [
    {
      key: "label",
      header: t("cowork.guide_model"),
      wrap: true,
      render: (model) => <b>{modelLabel(model)}</b>,
    },
    {
      key: "strengths",
      header: t("cowork.guide_good_at"),
      grow: true,
      wrap: true,
      render: (model) => model.strengths.join(", "),
    },
    {
      key: "context",
      header: t("cowork.guide_reads"),
      align: "right",
      render: (model) => <span className="cowork-preview__figure">{formatTokenCount(model.capabilities.maxContextTokens) ?? ""}</span>,
    },
    {
      key: "price",
      header: t("cowork.guide_price"),
      align: "right",
      render: (model) => <span className="cowork-preview__figure">{formatModelPriceRange(model) ?? ""}</span>,
    },
    ...(input.profileId
      ? [
          {
            key: "request",
            header: input.profileLabel ?? t("cowork.guide_per_request"),
            align: "right" as const,
            render: (model: RedrobModelPricing) => (
              <span className="cowork-preview__figure">{formatUsdAmount(estimatedCostFor(model, input.profileId ?? "")?.costUsd) ?? ""}</span>
            ),
          },
        ]
      : []),
  ];
}

function bandLabel(band: GuideGroup["band"]): string {
  switch (band) {
    case "budget":
      return t("cowork.guide_band_budget");
    case "standard":
      return t("cowork.guide_band_standard");
    case "premium":
      return t("cowork.guide_band_premium");
    case "frontier":
      return t("cowork.guide_band_frontier");
    case "other":
      return t("cowork.guide_band_unbanded");
  }
}

/** The guide on the console's published catalogue: Auto first, then every model by price band. */
export function PricingGuideView(props: { pricing: RedrobPricing }) {
  const groups = guideGroups(props.pricing);
  if (!groups.length) return <EmptyState title={t("cowork.guide_empty_title")} description={t("cowork.guide_empty_text")} />;
  const auto = autoModel(props.pricing);
  const profile = guideProfile(props.pricing);
  const autoCost = auto && profile ? formatUsdAmount(estimatedCostFor(auto, profile.id)?.costUsd) : null;
  return (
    <>
      <ProtectionStatus
        size="lg"
        tone="safe"
        icon={icons.sparkle({ width: 28, height: 28, "aria-hidden": true })}
        title={t("cowork.guide_auto_title")}
      >
        {t("cowork.guide_auto_text")}
        {autoCost && profile ? ` ${t("cowork.guide_auto_cost", { cost: autoCost, profile: profile.label })}` : ""}
      </ProtectionStatus>
      <p className="cowork-settings__lede">{t("cowork.guide_lede")}</p>
      {groups.map((group) => (
        <section key={group.band} className="cowork-settings__group">
          <SectionMark label={bandLabel(group.band)} as="heading" level={2} trailing={group.models.length} />
          <Table
            caption={bandLabel(group.band)}
            columns={bandColumns({ profileId: profile?.id ?? null, profileLabel: profile?.label ?? null })}
            rows={group.models}
          />
        </section>
      ))}
      <p className="cowork-settings__note">{t("cowork.guide_price_note")}</p>
    </>
  );
}

/** Reads the catalogue through the desktop app where it can, which a browser origin cannot. */
export function guideFetch(desktop: boolean): typeof fetch {
  if (!desktop) return fetch;
  return (input: RequestInfo | URL, init?: RequestInit) => desktopFetchViaMain(input, init);
}

export const GUIDE_QUERY_KEY = ["cowork-guide", "pricing"];
export const GUIDE_RESEARCH_KEY = ["cowork-guide", "research"];

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
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const local = useLocalOptional();
  const navigate = useNavigate();
  // New chats start on the default model; chats that exist keep theirs.
  const chooseForNewChats = local
    ? (model: ModelRef, variant: string | null) => {
        local.setPrefs((current) => ({ ...current, defaultModel: model, modelVariant: variant }));
        markNewChatUsesDefault();
      }
    : undefined;
  // Round 11 (Trending AI): the "By price" view was dropped and the header + tab strip removed, so
  // the screen is the profession chart only. The pricing query and tab state are gone with them.
  const research = useQuery({
    queryKey: GUIDE_RESEARCH_KEY,
    queryFn: () => loadGuideResearch(guideFetch(isDesktopRuntime())),
    // An edition changes monthly; an hour keeps a long-open window from showing last month's.
    staleTime: 60 * 60 * 1000,
  });
  return (
    <CoworkShell current="guide" measure={false} headless>
      <div className="cowork-settings__main cowork-preview--wide">
        {research.isLoading ? (
          <Skeleton variant="text" lines={6} />
        ) : !research.data ? (
          <EmptyState title={t("cowork.guide_profession_error")} description={t("cowork.settings_try_again")} />
        ) : (
          <ProfessionGuideView research={research.data} locale={locale} onChoose={chooseForNewChats} onStartChat={() => navigate("/chat")} />
        )}
      </div>
    </CoworkShell>
  );
}
