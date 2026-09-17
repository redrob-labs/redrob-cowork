import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  FileText,
  Image as ImageIcon,
  Mic,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";

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
import { t } from "@/i18n";
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
import {
  CAPABILITY_FLAGS,
  DEFAULT_MODEL_SORT,
  EMPTY_FILTERS,
  bandFacets,
  buildModelRows,
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

const CAPABILITY_ICONS: Record<ModelCapabilityFlag, typeof Wrench> = {
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

  const disabledSet = useMemo(
    () => new Set(props.disabledProviders ?? []),
    [props.disabledProviders],
  );

  useEffect(() => {
    if (!props.open) return;
    props.setQuery("");
    setSort(DEFAULT_MODEL_SORT);
    setFilters(EMPTY_FILTERS);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [props.open]);

  const { data: pricing } = useRedrobPricingQuery({ enabled: props.open });

  const rows = useMemo(
    () =>
      buildModelRows(props.options, pricing).map((row) =>
        disabledSet.has(row.providerId) ? { ...row, disabled: true } : row,
      ),
    [props.options, pricing, disabledSet],
  );

  // Facets come from the WHOLE set, not from what is currently showing: a rail whose options vanish as
  // you tick them cannot be un-ticked back to where you were.
  const vendors = useMemo(() => vendorFacets(rows), [rows]);
  const bands = useMemo(() => bandFacets(rows), [rows]);

  const shown = useMemo(() => visibleRows(rows, filters, props.query), [rows, filters, props.query]);
  const { auto, rest } = useMemo(() => orderedRows(shown, sort), [shown, sort]);

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
          <DialogTitle>{t("models.title")}</DialogTitle>
          <DialogDescription>{resolveModelPickerSubtitle(props.subtitle)}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* Filter rail. Hidden on narrow viewports, where the sheet has no room for two panes. */}
          <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-e border-border px-3 py-3 lg:flex">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("model_table.filters")}
              </span>
              {filterCount > 0 ? (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  {t("model_table.clear")}
                </button>
              ) : null}
            </div>

            <FacetGroup title={t("model_table.price_band")}>
              {bands.map(({ band, count }) => (
                <FacetCheck
                  key={band}
                  checked={filters.bands.has(band)}
                  label={t(BAND_LABEL_KEYS[band])}
                  count={count}
                  onToggle={() =>
                    setFilters((prev) => ({ ...prev, bands: toggleIn(prev.bands, band) }))
                  }
                />
              ))}
            </FacetGroup>

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

            <FacetGroup title={t("model_table.vendor")}>
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
                  placeholder={t("models.search_placeholder")}
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
                      <th className="w-[9rem] border-b border-border px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
      <div className="pb-1 text-[11px] font-medium text-muted-foreground">{title}</div>
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
      className="flex items-center gap-2 rounded-md px-1.5 py-1 text-start text-[13px] text-foreground/90 hover:bg-foreground/5"
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded border",
          checked ? "border-transparent bg-[var(--dls-accent)] text-[var(--dls-accent-fg)]" : "border-border",
        )}
      >
        {checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count === undefined ? null : (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{count}</span>
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
          "flex w-full items-center gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors hover:text-foreground",
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
            <span className="shrink-0 rounded bg-[var(--dls-accent)] px-1.5 py-px text-[10px] font-medium text-[var(--dls-accent-fg)]">
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
