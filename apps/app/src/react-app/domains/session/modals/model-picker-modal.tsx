import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Mic,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useInRouterContext, useNavigate } from "react-router";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { currentLocale, t } from "@/i18n";
import { recommendedModels } from "@/app/lib/featured-models";
import { MODEL_GUIDE_PATH } from "@/components/model-select";
import { cn } from "@/lib/utils";
import { modelEquals } from "../../../../app/utils";
import type { ModelOption, ModelRef } from "../../../../app/types";
import {
  formatModelPriceRange,
  formatTokenCount,
  formatUsdAmount,
  type RedrobPriceBand,
} from "../../../../app/lib/redrob-pricing";
import { useRedrobPricingQuery } from "../../../infra/redrob-pricing-query";
import { ProviderIcon } from "../../../design-system/provider-icon";
import { abilityWords, bandWord, goodFor, questionCost, readsAtOnce } from "./model-words";
import {
  CAPABILITY_FLAGS,
  DEFAULT_MODEL_SORT,
  EMPTY_FILTERS,
  NEED_FLAGS,
  bandFacets,
  buildModelRows,
  friendlyGroups,
  nextSort,
  orderedRows,
  vendorFacets,
  visibleRows,
  type ModelCapabilityFlag,
  type ModelFilters,
  type ModelRow,
  type ModelSort,
  type ModelSortKey,
} from "./model-table";

// Translation KEYS, not display text. A module-level constant holding UI copy
// would have to call `t()` in its initializer, which resolves before the user's
// locale is known and freezes the English string for the process lifetime. The
// key travels through the `subtitle` prop instead and is translated in
// `resolveModelPickerSubtitle`, at render time.
export const MODEL_PICKER_DEFAULT_SUBTITLE = "model_picker.session_subtitle";
export const MODEL_PICKER_UNAVAILABLE_SUBTITLE = "model_picker.unavailable_subtitle";
/** Opened from Settings, where a pick changes the model new chats start with, not this chat's. */
export const MODEL_PICKER_SETTINGS_SUBTITLE = "model_picker.settings_subtitle";

export function resolveModelPickerSubtitle(subtitle: string | undefined) {
  return t(subtitle ?? MODEL_PICKER_DEFAULT_SUBTITLE);
}

export type ModelPickerModalProps = {
  open: boolean;
  options: ModelOption[];
  disabledProviders?: string[];
  query: string;
  setQuery: (value: string) => void;
  subtitle?: string;
  target: "default" | "session";
  current: ModelRef;
  onSelect: (model: ModelRef) => void;
  onBehaviorChange: (model: ModelRef, value: string | null) => void;
  onToggleProvider?: (providerId: string, enabled: boolean) => void;
  onOpenSettings: () => void;
  onClose: (options?: { restorePromptFocus?: boolean }) => void;
  /** Show only this provider's models, as a provider's "Browse models" in Settings does. */
  providerId?: string | null;
  /** That provider's name, for the title. */
  providerName?: string;
};

export type ModelPickerEmptyState = {
  messageKey: string;
  showConnectProvider: boolean;
};

/**
 * Kept as a row count rather than a provider-group count.
 *
 * The picker no longer groups by provider - it is one table - so "how many groups are showing" is not a
 * question it can ask. The distinction the state itself makes is unchanged and is the one that matters:
 * a query that matched nothing is the reader's search to fix, an empty catalogue is a provider to
 * connect, and offering "connect a provider" to someone whose search simply missed is a dead end.
 */
export function resolveModelPickerEmptyState(input: {
  providerGroupCount: number;
  query: string;
}): ModelPickerEmptyState | null {
  if (input.providerGroupCount > 0) return null;
  if (input.query.trim()) {
    return { messageKey: "models.no_models_match_search", showConnectProvider: false };
  }
  return { messageKey: "models.no_models_available", showConnectProvider: true };
}

const CAPABILITY_ICONS: Partial<Record<ModelCapabilityFlag, typeof Wrench>> = {
  tools: Wrench,
  reasoning: Sparkles,
  imageInput: ImageIcon,
  fileInput: FileText,
  audioInput: Mic,
  structuredOutputs: Braces,
};

const CAPABILITY_LABEL_KEYS: Record<ModelCapabilityFlag, string> = {
  tools: "model_table.cap_tools",
  reasoning: "model_table.cap_reasoning",
  imageInput: "model_table.cap_image",
  fileInput: "model_table.cap_file",
  audioInput: "model_table.cap_audio",
  structuredOutputs: "model_table.cap_structured",
  longContext: "model_words.need_long",
};

/** "What do you need?", in the reader's words rather than the spec sheet's. */
const NEED_LABEL_KEYS: Partial<Record<ModelCapabilityFlag, string>> = {
  tools: "model_words.need_tools",
  reasoning: "model_words.need_reason",
  imageInput: "model_words.need_images",
  longContext: "model_words.need_long",
  audioInput: "model_words.need_audio",
};

const BAND_LABEL_KEYS: Record<RedrobPriceBand, string> = {
  budget: "model_table.band_budget",
  standard: "model_table.band_standard",
  premium: "model_table.band_premium",
  frontier: "model_table.band_frontier",
};

export function ModelPickerModal(props: ModelPickerModalProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [sort, setSort] = useState<ModelSort>(DEFAULT_MODEL_SORT);
  const [filters, setFilters] = useState<ModelFilters>(EMPTY_FILTERS);
  /**
   * Off by default: the list leads with what a model is for, what it roughly costs and how much it
   * reads, in words. The switch brings back the spec-sheet table, with tokens and dollars, for whoever
   * is comparing figures.
   */
  const [technical, setTechnical] = useState(false);

  const disabledSet = useMemo(
    () => new Set(props.disabledProviders ?? []),
    [props.disabledProviders],
  );

  useEffect(() => {
    if (!props.open) return;
    props.setQuery("");
    setSort(DEFAULT_MODEL_SORT);
    setFilters(EMPTY_FILTERS);
    setTechnical(false);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [props.open]);

  const { data: pricing } = useRedrobPricingQuery({ enabled: props.open });

  const scope = props.providerId ?? null;
  const rows = useMemo(
    () =>
      buildModelRows(
        scope ? props.options.filter((option) => option.providerID === scope) : props.options,
        pricing,
      ).map((row) => (disabledSet.has(row.providerId) ? { ...row, disabled: true } : row)),
    [props.options, pricing, disabledSet, scope],
  );
  const recommended = useMemo(
    () => recommendedModels(pricing?.featured ?? [], currentLocale()),
    [pricing],
  );
  const notes = useMemo(() => new Map(recommended.map((entry) => [entry.modelId, entry])), [recommended]);

  // Facets come from the WHOLE set, not from what is currently showing: a rail whose options vanish as
  // you tick them cannot be un-ticked back to where you were.
  const vendors = useMemo(() => vendorFacets(rows), [rows]);
  const bands = useMemo(() => bandFacets(rows), [rows]);

  const shown = useMemo(() => visibleRows(rows, filters, props.query), [rows, filters, props.query]);
  const { auto, rest } = useMemo(() => orderedRows(shown, sort), [shown, sort]);
  const groups = useMemo(
    () => friendlyGroups(shown, recommended.map((entry) => entry.modelId)),
    [shown, recommended],
  );

  const emptyState = resolveModelPickerEmptyState({
    providerGroupCount: shown.length,
    query: props.query,
  });

  const handleSelect = useCallback(
    (row: ModelRow) => {
      if (row.disabled) return;
      props.onSelect({ providerID: row.providerId, modelID: row.modelId });
      props.onClose({ restorePromptFocus: true });
    },
    [props.onSelect, props.onClose],
  );

  const toggleIn = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const filterCount = filters.vendors.size + filters.bands.size + filters.capabilities.size;

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [props.open]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      {/*
        Wide, and the padding is off.

        This lists several hundred models against each other, which is a comparison, and a comparison
        needs columns. At `max-w-lg` there was room for a name and nothing else, so every fact went onto
        its own line and one row grew to 8 lines - 323 of those is not a list anyone reads.

        The `lg:` copy is the one that does the work, and leaving it out is why the first attempt at this
        stayed narrow: `DialogContent` caps itself at `lg:max-w-md`, and a `sm:` override does not beat a
        `lg:` rule at large widths - both apply and the later breakpoint wins. Tailwind-merge cannot
        collapse them either, because they are different variants. So all three are written.

        `p-0` because a table supplies its own edges, and the viewport cap follows the one existing
        precedent for a genuinely large surface in this app, the image lightbox. Below `lg` the primitive
        turns this into a full-width bottom sheet regardless.
      */}
      {/*
        `gap-0` because the primitive's default gap sits between the header and the body, and with `p-0`
        that reads as an empty band under the title rather than as spacing: the header already carries its
        own padding and a bottom border, so the gap separates two things that are separated.
      */}
      <DialogContent className="flex max-h-[calc(100vh-2rem)] min-h-0 w-full max-w-[min(94vw,80rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,80rem)] lg:w-[min(94vw,80rem)] lg:max-w-[min(94vw,80rem)]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pe-8">
            <div className="min-w-0">
              <DialogTitle>
                {scope && props.providerName ? t("model_words.title_provider", { provider: props.providerName }) : t("models.title")}
              </DialogTitle>
              <DialogDescription>{resolveModelPickerSubtitle(props.subtitle)}</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <GuideLink onNavigate={() => props.onClose()} />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--dls-accent)]"
                  checked={technical}
                  onChange={(event) => setTechnical(event.target.checked)}
                  data-testid="model-picker-technical"
                />
                {t("model_words.technical")}
              </label>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* Filter rail. Hidden on narrow viewports, where the sheet has no room for two panes. */}
          <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-e border-border px-3 py-3 lg:flex">
            <div className="flex items-center justify-between pb-2">
              <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("model_table.filters")}
              </span>
              {filterCount > 0 ? (
                <button
                  type="button"
                  className="text-2xs text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  {t("model_table.clear")}
                </button>
              ) : null}
            </div>

            {technical ? null : (
              <FacetGroup title={t("model_words.ask_need")}>
                {NEED_FLAGS.map((flag) => (
                  <FacetCheck
                    key={flag}
                    checked={filters.capabilities.has(flag)}
                    label={t(NEED_LABEL_KEYS[flag] ?? CAPABILITY_LABEL_KEYS[flag])}
                    onToggle={() =>
                      setFilters((prev) => ({
                        ...prev,
                        capabilities: toggleIn(prev.capabilities, flag),
                      }))
                    }
                  />
                ))}
              </FacetGroup>
            )}

            <FacetGroup title={technical ? t("model_table.price_band") : t("model_words.ask_spend")}>
              {bands.map(({ band, count }) => (
                <FacetCheck
                  key={band}
                  checked={filters.bands.has(band)}
                  label={technical ? t(BAND_LABEL_KEYS[band]) : (bandWord(band) ?? band)}
                  count={count}
                  onToggle={() =>
                    setFilters((prev) => ({ ...prev, bands: toggleIn(prev.bands, band) }))
                  }
                />
              ))}
            </FacetGroup>

            {technical ? (
            <FacetGroup title={t("model_table.capabilities")}>
              {CAPABILITY_FLAGS.map((flag) => (
                <FacetCheck
                  key={flag}
                  checked={filters.capabilities.has(flag)}
                  label={t(CAPABILITY_LABEL_KEYS[flag])}
                  onToggle={() =>
                    setFilters((prev) => ({
                      ...prev,
                      capabilities: toggleIn(prev.capabilities, flag),
                    }))
                  }
                />
              ))}
            </FacetGroup>
            ) : null}

            <FacetGroup title={technical ? t("model_table.vendor") : t("model_words.ask_lab")}>
              {vendors.map((vendor) => (
                <FacetCheck
                  key={vendor.id}
                  checked={filters.vendors.has(vendor.id)}
                  label={vendor.name}
                  count={vendor.count}
                  onToggle={() =>
                    setFilters((prev) => ({ ...prev, vendors: toggleIn(prev.vendors, vendor.id) }))
                  }
                />
              ))}
            </FacetGroup>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.2)]"
                  placeholder={technical ? t("models.search_placeholder") : t("model_words.search")}
                  value={props.query}
                  onChange={(event) => props.setQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {emptyState ? (
                <div className="space-y-3 px-4 py-10 text-center">
                  <div className="text-sm text-muted-foreground">{t(emptyState.messageKey)}</div>
                  {emptyState.showConnectProvider ? (
                    <Button variant="outline" onClick={props.onOpenSettings}>
                      {t("models.connect_provider")}
                    </Button>
                  ) : null}
                </div>
              ) : !technical ? (
                <FriendlyModelList
                  groups={groups}
                  notes={notes}
                  current={props.current}
                  onSelect={handleSelect}
                />
              ) : (
                <table className="w-full min-w-full table-fixed caption-bottom border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10 bg-popover">
                    <tr>
                      <SortHeader
                        label={t("model_table.col_model")}
                        sortKey="model"
                        sort={sort}
                        onSort={setSort}
                        // The one elastic column: ids run long, and the others are short and fixed.
                        className="w-auto"
                      />
                      <SortHeader
                        label={t("model_table.col_vendor")}
                        sortKey="vendor"
                        sort={sort}
                        onSort={setSort}
                        className="w-[10rem]"
                      />
                      <SortHeader
                        label={t("model_table.col_price")}
                        sortKey="price"
                        sort={sort}
                        onSort={setSort}
                        className="w-[7rem]"
                      />
                      <SortHeader
                        label={t("model_table.col_context")}
                        sortKey="context"
                        sort={sort}
                        onSort={setSort}
                        numeric
                        className="w-[7rem]"
                      />
                      <th className="w-[9rem] border-b border-border px-3 py-2 text-start text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {t("model_table.col_capabilities")}
                      </th>
                      <SortHeader
                        label={t("model_table.col_cost")}
                        sortKey="cost"
                        sort={sort}
                        onSort={setSort}
                        numeric
                        className="w-[8rem]"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {/*
                      `auto` above the sort, not inside it. It is the default and the recommendation, and
                      in the old list it led only because "Auto" starts with an A - any other order
                      buried the router among 322 alternatives.
                    */}
                    {auto.map((row) => (
                      <ModelTableRow
                        key={row.key}
                        row={row}
                        pinned
                        selected={modelEquals(props.current, {
                          providerID: row.providerId,
                          modelID: row.modelId,
                        })}
                        pricingLabel={formatModelPriceRange(pricing?.byModelId[row.modelId])}
                        onSelect={handleSelect}
                      />
                    ))}
                    {rest.map((row) => (
                      <ModelTableRow
                        key={row.key}
                        row={row}
                        selected={modelEquals(props.current, {
                          providerID: row.providerId,
                          modelID: row.modelId,
                        })}
                        pricingLabel={formatModelPriceRange(pricing?.byModelId[row.modelId])}
                        onSelect={handleSelect}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/*
          `mx-0 mb-0` because `DialogFooter` carries `-mx-6 -mb-6` to escape the dialog's own `p-6`, and
          this dialog is `p-0`. Left alone it hung 24px past the left edge and clipped its own first
          character - visible on screen as "howing 61 of 61".
        */}
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t border-border px-5 py-3">
          <span className="me-auto self-center text-xs text-muted-foreground">
            {t("model_table.count").replace("{shown}", String(shown.length)).replace("{total}", String(rows.length))}
          </span>
          <DialogClose render={<Button variant="outline" />}>{t("models.done")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-3">
      <div className="pb-1 text-2xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function FacetCheck({
  checked,
  label,
  count,
  onToggle,
}: {
  checked: boolean;
  label: string;
  count?: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex items-center gap-2 rounded-md px-1.5 py-1 text-start text-sm text-foreground/90 hover:bg-foreground/5"
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded border",
          checked ? "border-transparent bg-[var(--dls-accent)] text-[var(--dls-accent-fg)]" : "border-border",
        )}
      >
        {checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      {/* Wraps rather than truncating: the friendly labels are short questions, and "Work with my files..." hid the point. */}
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      {count === undefined ? null : (
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
  className,
}: {
  label: string;
  sortKey: ModelSortKey;
  sort: ModelSort;
  onSort: (sort: ModelSort) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("border-b border-border p-0", className)}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, sortKey))}
        className={cn(
          "flex w-full items-center gap-1 px-3 py-2 text-2xs font-semibold uppercase tracking-[0.1em] transition-colors hover:text-foreground",
          numeric ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>{label}</span>
        {active ? <Arrow size={12} /> : null}
      </button>
    </th>
  );
}

/**
 * One line per model, and one line only.
 *
 * Every fact is a cell, so the eye compares down a column instead of reading 8 lines per model. The id
 * is NOT repeated beside the name: it was printed twice per row, and the name is derived from it. A
 * long id truncates rather than wrapping, because wrapping is what split `anthropic/claude-opus-` from
 * its `4`.
 */
function ModelTableRow({
  row,
  selected,
  pinned,
  pricingLabel,
  onSelect,
}: {
  row: ModelRow;
  selected: boolean;
  pinned?: boolean;
  pricingLabel: string | null;
  onSelect: (row: ModelRow) => void;
}) {
  const cost = formatUsdAmount(row.turnCostUsd ?? undefined);
  const context = formatTokenCount(row.contextTokens ?? undefined);
  return (
    <tr
      onClick={() => onSelect(row)}
      aria-selected={selected}
      aria-disabled={row.disabled || undefined}
      className={cn(
        "cursor-pointer border-b border-border/60 transition-colors",
        selected ? "bg-[rgba(var(--dls-accent-rgb),0.10)]" : "hover:bg-foreground/[0.04]",
        row.disabled && "cursor-not-allowed opacity-50",
        pinned && "bg-foreground/[0.03]",
      )}
    >
      <td className="px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <Check size={13} className="shrink-0 text-[var(--dls-accent)]" />
          ) : (
            <span aria-hidden className="w-[13px] shrink-0" />
          )}
          <ProviderIcon providerId={row.modelId} size={14} className="shrink-0" />
          <span className="min-w-0 truncate font-medium text-foreground" title={row.modelId}>
            {row.title}
          </span>
          {pinned ? (
            <span className="shrink-0 rounded bg-[var(--dls-accent)] px-1.5 py-px text-2xs font-medium text-[var(--dls-accent-fg)]">
              {t("model_table.recommended")}
            </span>
          ) : null}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
        {row.vendorName || row.vendorId || "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground" title={pricingLabel ?? undefined}>
        {row.priceBand ? t(BAND_LABEL_KEYS[row.priceBand]) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-end tabular-nums text-muted-foreground">
        {context ?? "—"}
      </td>
      <td className="px-3 py-1.5">
        <span className="flex items-center gap-1.5">
          {CAPABILITY_FLAGS.filter((flag) => row.capabilities.has(flag)).map((flag) => {
            const Icon = CAPABILITY_ICONS[flag];
            if (!Icon) return null;
            return (
              <Icon
                key={flag}
                size={13}
                className="shrink-0 text-muted-foreground"
                aria-label={t(CAPABILITY_LABEL_KEYS[flag])}
              />
            );
          })}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-end tabular-nums text-muted-foreground">
        {cost ?? "—"}
      </td>
    </tr>
  );
}

/** "Recommended best models", to the Model Guide. A plain link outside a router, so a test can render the dialog. */
function GuideLink(props: { onNavigate: () => void }) {
  const inRouter = useInRouterContext();
  const className = "inline-flex items-center gap-1 text-xs font-medium text-[var(--dls-accent)] hover:underline";
  const label = (
    <>
      {t("model_words.not_sure")} {t("model_select.guide_link")}
      <ArrowRight size={13} aria-hidden />
    </>
  );
  if (!inRouter) {
    return (
      <a className={className} href={`#${MODEL_GUIDE_PATH}`} onClick={props.onNavigate}>
        {label}
      </a>
    );
  }
  return <RoutedGuideLink className={className} onNavigate={props.onNavigate}>{label}</RoutedGuideLink>;
}

function RoutedGuideLink(props: { className: string; onNavigate: () => void; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={props.className}
      onClick={() => {
        props.onNavigate();
        navigate(MODEL_GUIDE_PATH);
      }}
    >
      {props.children}
    </button>
  );
}

type RecommendedEntry = { modelId: string; name?: string; lab: string; note: string };

/**
 * The default view: Auto, the recommended models, then every other model under the lab that makes it.
 *
 * Each row says what the model is for, roughly what a question costs, and how much it can read, in
 * words. The table with the figures is behind "Show technical details".
 */
function FriendlyModelList(props: {
  groups: ReturnType<typeof friendlyGroups>;
  notes: ReadonlyMap<string, RecommendedEntry>;
  current: ModelRef;
  onSelect: (row: ModelRow) => void;
}) {
  const row = (item: ModelRow) => (
    <FriendlyModelRow
      key={item.key}
      row={item}
      entry={props.notes.get(item.modelId)}
      selected={modelEquals(props.current, { providerID: item.providerId, modelID: item.modelId })}
      onSelect={props.onSelect}
    />
  );
  return (
    <div className="flex flex-col pb-3" role="listbox" aria-label={t("models.title")}>
      {props.groups.auto.map(row)}
      {props.groups.recommended.length ? (
        <>
          <GroupHeading>{t("model_words.group_recommended")}</GroupHeading>
          {props.groups.recommended.map(row)}
        </>
      ) : null}
      {props.groups.labs.map((lab) => (
        <div key={lab.id}>
          <GroupHeading>{lab.id === "other" ? t("model_words.group_misc") : lab.name}</GroupHeading>
          {lab.rows.map(row)}
        </div>
      ))}
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-b border-border/60 bg-popover px-5 pb-1.5 pt-4 text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </div>
  );
}

function FriendlyModelRow(props: {
  row: ModelRow;
  entry?: RecommendedEntry;
  selected: boolean;
  onSelect: (row: ModelRow) => void;
}) {
  const { row } = props;
  const band = bandWord(row.priceBand);
  const cost = questionCost(row.questionCostUsd);
  const reads = readsAtOnce(row.contextTokens);
  const abilities = abilityWords(row);
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.selected}
      aria-disabled={row.disabled || undefined}
      data-model={row.modelId}
      onClick={() => props.onSelect(row)}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/40 px-5 py-3 text-start transition-colors",
        props.selected ? "bg-[rgba(var(--dls-accent-rgb),0.10)]" : "hover:bg-foreground/[0.04]",
        row.disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <ProviderIcon providerId={row.isAuto ? row.providerId : row.vendorId || row.modelId} size={18} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-foreground">{props.entry?.name ?? row.title}</span>
          <span className="text-xs text-muted-foreground">{props.entry?.lab ?? row.vendorName}</span>
          {row.isAuto ? (
            <span className="rounded bg-[var(--dls-accent)] px-1.5 py-px text-2xs font-medium text-[var(--dls-accent-fg)]">
              {t("model_table.recommended")}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{goodFor(row, props.entry?.note)}</span>
        {abilities.length || reads ? (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {abilities.map((word) => (
              <span key={word} className="rounded-full border border-border/70 px-2 py-px text-2xs text-muted-foreground">
                {word}
              </span>
            ))}
            {reads ? (
              <span className="rounded-full border border-border/70 px-2 py-px text-2xs text-muted-foreground">{reads}</span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-end">
        {band ? <span className="text-xs font-medium text-foreground">{band}</span> : null}
        {cost ? <span className="text-2xs text-muted-foreground">{cost}</span> : null}
        {props.selected ? <Check size={14} className="mt-1 text-[var(--dls-accent)]" aria-hidden /> : null}
      </span>
    </button>
  );
}
