"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useInRouterContext, useNavigate } from "react-router";

import type { ModelBehaviorOption, ModelOption, ModelRef } from "@/app/types";
import { getModelBehaviorSummary } from "@/app/lib/model-behavior";
import { curateModelOptions, type CuratedModelRow } from "@/app/lib/featured-models";
import { inferModelVendor } from "@/app/lib/model-vendor";
import { formatPriceTier, type RedrobPricing } from "@/app/lib/redrob-pricing";
import { useRedrobPricingQuery } from "@/react-app/infra/redrob-pricing-query";
import { ProviderIcon } from "@/react-app/design-system/provider-icon";
import { REDROB_MODEL_ID as AUTO_MODEL_ID } from "@/react-app/domains/settings/redrob-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/react-app/shell/workspace-provider";
import { getConnectedProviderItems, useProviderListQuery } from "@/react-app/infra/provider-list-query";
import { mergeModelOptions } from "@/react-app/domains/connections/provider-auth/assigned-model-options";
import { isRedrobOnlyProviderId } from "@/react-app/domains/settings/redrob-provider";
import { newProvidersEvent } from "@/app/lib/provider-events";
import { currentLocale, t } from "@/i18n"

function getProviderDisplayName(providerId: string) {
  return providerId
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function useModelOptions(
  open: boolean,
  fallbackOptions: readonly ModelOption[],
) {
  const { client, opencodeBaseUrl, selectedWorkspaceRoot } = useWorkspace();

  const { data, refetch } = useProviderListQuery({
    client,
    baseUrl: opencodeBaseUrl,
    directory: selectedWorkspaceRoot,
    enabled: Boolean(client),
  });

  React.useEffect(() => {
    if (!open || !client) return;
    void refetch();
  }, [client, open, refetch]);

  React.useEffect(() => {
    if (!client) return;
    const handler = () => {
      void refetch();
    };
    window.addEventListener(newProvidersEvent, handler);
    return () => window.removeEventListener(newProvidersEvent, handler);
  }, [client, refetch]);

  return React.useMemo(() => {
    // No provider filter here on purpose: filterProviderList already decided
    // which providers this app offers, and a second, different rule in the
    // picker is how the two drift apart.
    const options = getConnectedProviderItems(data)
      .flatMap((provider) =>
        Object.entries(provider.models).map(([id, model]) => {
          const summary = getModelBehaviorSummary(provider.id, model, null, provider.name);
          return {
            providerID: provider.id,
            modelID: id,
            title: model.name,
            description: provider.name,
            behaviorTitle: summary.title,
            behaviorLabel: summary.label,
            behaviorDescription: summary.description,
            behaviorValue: summary.value,
            behaviorOptions: summary.options,
            isFree: false,
          };
        }),
      );

    return mergeModelOptions(options, fallbackOptions);
  }, [data, fallbackOptions]);
}

type ModelSelectItem = {
  id: string;
  option: ModelOption;
};

export type ModelSelectGroup = {
  value: string;
  items: ModelSelectItem[];
};

function groupByProvider(modelOptions: ModelOption[], selected?: ModelRef): ModelSelectGroup[] {
  const groups = new Map<string, ModelSelectItem[]>();

  for (const option of modelOptions) {
    const providerLabel = option.description ?? getProviderDisplayName(option.providerID);
    const item: ModelSelectItem = {
      id: `${option.providerID}:${option.modelID}`,
      option,
    };
    const existing = groups.get(providerLabel);

    if (existing) {
      existing.push(item);
      continue;
    }

    groups.set(providerLabel, [item]);
  }

  return [...groups.entries()]
    .map(([providerLabel, options]) => ({
      value: providerLabel,
      items: [...options].sort((a, b) => {
        // `auto` leads, unconditionally. It is the router and the app default, and it used to lead only
        // when it happened to be the current selection - pick anything else and the recommended choice
        // dropped into alphabetical position among several hundred alternatives.
        const aAuto = a.option.modelID === AUTO_MODEL_ID;
        const bAuto = b.option.modelID === AUTO_MODEL_ID;
        if (aAuto !== bAuto) return aAuto ? -1 : 1;
        // Then the model in use. Alphabetical order alone buried the current
        // selection somewhere in the middle of the list, so the one row a reader wants to
        // confirm was the hardest one to find.
        const aSelected = selected ? isSameModel(selected, a.option) : false;
        const bSelected = selected ? isSameModel(selected, b.option) : false;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return a.option.title.localeCompare(b.option.title);
      }),
    }))
    .sort((a, b) => {
      // The group holding `auto` leads, then the group holding the current model, for the same reason.
      const aHasAuto = a.items.some((item) => item.option.modelID === AUTO_MODEL_ID);
      const bHasAuto = b.items.some((item) => item.option.modelID === AUTO_MODEL_ID);
      if (aHasAuto !== bHasAuto) return aHasAuto ? -1 : 1;
      const aHasSelected = selected ? a.items.some((item) => isSameModel(selected, item.option)) : false;
      const bHasSelected = selected ? b.items.some((item) => isSameModel(selected, item.option)) : false;
      if (aHasSelected !== bHasSelected) return aHasSelected ? -1 : 1;
      return a.value.localeCompare(b.value);
    });
}

function isSameModel(a: ModelRef, b: ModelRef) {
  return a.providerID === b.providerID && a.modelID === b.modelID;
}

/**
 * Secondary line for a model row. A router provider reports every model under
 * its own id, so showing only the provider name repeats the group label and
 * hides who actually made the model. The vendor is named first when the model
 * id identifies one.
 */
function modelRowSubtitle(option: ModelOption): string {
  const providerLabel = option.description ?? getProviderDisplayName(option.providerID);
  const vendor = inferModelVendor(option.modelID);
  if (!vendor) return providerLabel;
  if (vendor.name.toLowerCase() === providerLabel.toLowerCase()) return providerLabel;
  return `${vendor.name} · ${providerLabel}`;
}

function thinkingOptionsFor(option: ModelOption): ModelBehaviorOption[] {
  return (option.behaviorOptions ?? []).filter((item) => item.value != null);
}

function overlaySelectedBehavior(
  options: readonly ModelOption[],
  value: ModelRef,
  behavior: {
    value: string | null;
    label?: string;
    options: { value: string | null; label: string }[];
  },
): ModelOption[] {
  return options.map((option) => {
    if (!isSameModel(value, option)) return option;
    const fallbackOptions: ModelBehaviorOption[] = behavior.options.map((item) => ({
      value: item.value,
      label: item.label,
      description: "",
    }));
    return {
      ...option,
      behaviorValue: behavior.value ?? option.behaviorValue,
      behaviorLabel: behavior.label ?? option.behaviorLabel,
      behaviorOptions: (option.behaviorOptions?.length ?? 0) > 0
        ? option.behaviorOptions
        : fallbackOptions,
    };
  });
}

interface ModelSelectProps {
  open: boolean;
  value: ModelRef;
  hideValue?: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (model: ModelRef, variant?: string | null) => void;
  disabled?: boolean;
  /** Models available before a workspace OpenCode client exists. */
  fallbackOptions?: readonly ModelOption[];
  behaviorValue?: string | null;
  behaviorLabel?: string;
  behaviorOptions?: { value: string | null; label: string }[];
}

/** The Desk work column (AppShell's `main`), or the default clipping ancestors outside the Desk frame. */
function deskWorkColumn(): Element | "clipping-ancestors" {
  if (typeof document === "undefined") return "clipping-ancestors";
  return document.getElementById("rr-shell-main") ?? "clipping-ancestors";
}

/** Where "Recommended best models" goes: the Model Guide, on its By profession tab. */
export const MODEL_GUIDE_PATH = "/guide?tab=profession";

const GUIDE_LINK_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent";

function GuideLinkLabel() {
  return (
    <>
      <span className="min-w-0">
        <span className="block">{t("model_select.guide_link")}</span>
        <span className="block font-normal text-muted-foreground">{t("model_select.guide_link_hint")}</span>
      </span>
      <ChevronRight className="size-3.5 shrink-0" aria-hidden />
    </>
  );
}

/** Routes within the app, so the open chat and its state survive the trip to the guide. */
function RoutedGuideLink(props: { onNavigate: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={GUIDE_LINK_CLASS}
      onClick={() => {
        props.onNavigate();
        navigate(MODEL_GUIDE_PATH);
      }}
    >
      <GuideLinkLabel />
    </button>
  );
}

/**
 * "Recommended best models". Outside a router (a test, or a surface rendered on its own) it is a
 * plain link, so the menu never depends on where it is mounted.
 */
function GuideLink(props: { onNavigate: () => void }) {
  if (useInRouterContext()) return <RoutedGuideLink onNavigate={props.onNavigate} />;
  return (
    <a className={GUIDE_LINK_CLASS} href={`#${MODEL_GUIDE_PATH}`} onClick={props.onNavigate}>
      <GuideLinkLabel />
    </a>
  );
}

/**
 * What the open menu shows: the rows, then "Recommended best models". Separate from the popover so it
 * can be rendered and checked on its own.
 */
export function ModelMenu(props: {
  /** Curated rows, or `null` to list `groups` (Redrob not connected). */
  rows: CuratedModelRow[] | null;
  groups: ModelSelectGroup[];
  value: ModelRef;
  pricing: RedrobPricing | undefined;
  onSelect: (option: ModelOption) => void;
  onNavigate: () => void;
}) {
  const renderRow = (key: string, option: ModelOption, row?: CuratedModelRow) => {
    const vendor = inferModelVendor(option.modelID);
    const checked = isSameModel(props.value, option);
    // One price band, from the console, so "is this one expensive?" needs no arithmetic. Auto has none:
    // a router has no single rate.
    const tier = isRedrobOnlyProviderId(option.providerID)
      ? formatPriceTier(props.pricing?.byModelId[option.modelID])
      : null;
    const subtitle = row?.kind === "featured" && row.lab ? row.lab : modelRowSubtitle(option);
    return (
      <button
        key={key}
        type="button"
        role="option"
        aria-selected={checked}
        data-checked={checked}
        data-kind={row?.kind}
        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => props.onSelect(option)}
      >
        <ProviderIcon
          providerId={vendor?.id ?? option.providerID}
          providerName={vendor?.name ?? option.description}
          className="mt-0.5 size-4 shrink-0 opacity-80"
          size={16}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{option.title}</span>
            <span className="shrink-0 truncate text-xs text-muted-foreground">{subtitle}</span>
            {row?.kind === "current" ? (
              <span className="shrink-0 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">
                {t("model_select.current")}
              </span>
            ) : null}
          </span>
          {row?.note ? (
            <span className="block truncate text-xs text-muted-foreground">{row.note}</span>
          ) : null}
        </span>
        {tier ? (
          <span className="mt-0.5 shrink-0 font-mono text-2xs text-muted-foreground" title={t("pricing.tier_hint")}>
            {tier}
          </span>
        ) : null}
        <Check className={`mt-0.5 size-3.5 shrink-0 ${checked ? "text-foreground" : "invisible"}`} aria-hidden />
      </button>
    );
  };

  // 26rem, capped at the viewport: room for the model name, its lab and a line on what it is for,
  // without the popover turning into a page.
  return (
    <div className="flex max-h-[min(32rem,var(--available-height))] w-[min(92vw,26rem)] min-w-0 flex-col overflow-hidden rounded-2xl bg-popover shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div role="listbox" aria-label={t("session.change_model")} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {props.rows
          ? props.rows.map((row) => renderRow(`${row.kind}:${row.option.providerID}:${row.option.modelID}`, row.option, row))
          : props.groups.map((group) => (
              <div key={group.value} role="group" aria-label={group.value}>
                {props.groups.length > 1 ? (
                  <div className="px-2.5 pb-1 pt-2 text-2xs font-medium text-muted-foreground">{group.value}</div>
                ) : null}
                {group.items.map((item) => renderRow(item.id, item.option))}
              </div>
            ))}
        {!props.rows && props.groups.length === 0 ? (
          <div className="px-2.5 py-3 text-xs text-muted-foreground">{t("model_select.none_found")}</div>
        ) : null}
      </div>
      <div className="border-t border-border p-1.5">
        <GuideLink onNavigate={props.onNavigate} />
      </div>
    </div>
  );
}

/**
 * The model menu under the composer.
 *
 * It shows Redrob Auto, then one recommended model per major lab, then the model in use if it is
 * neither. Each row has a line saying what the model is for. It used to list every model from every
 * connected provider, which through Redrob alone is several hundred. That asks the reader to already
 * know which model is good at what. The comparison behind the recommendations is one click away in
 * the Model Guide.
 *
 * The full list and adding providers are in Settings, under AI, for Developer mode. The command palette
 * and a session error's "Change model" still open the full list directly.
 *
 * With Redrob not connected there is nothing to recommend, so the menu lists the connected providers'
 * own models instead.
 */
export function ModelSelect({
  open,
  value,
  hideValue = false,
  onOpenChange,
  onChange,
  disabled = false,
  fallbackOptions = [],
  behaviorValue = null,
  behaviorLabel,
  behaviorOptions = [],
}: ModelSelectProps) {
  const catalogOptions = useModelOptions(open, fallbackOptions);
  const { data: pricing } = useRedrobPricingQuery({ enabled: open });
  const modelOptions = React.useMemo(
    () => overlaySelectedBehavior(catalogOptions, value, {
      value: behaviorValue,
      label: behaviorLabel,
      options: behaviorOptions,
    }),
    [behaviorLabel, behaviorOptions, behaviorValue, catalogOptions, value],
  );

  const selectedOption = modelOptions?.find((option) =>
    isSameModel(value, {
      providerID: option.providerID,
      modelID: option.modelID,
    }),
  );

  const curated = React.useMemo(
    () => curateModelOptions({ options: modelOptions, featured: pricing?.featured ?? [], value, locale: currentLocale() }),
    [modelOptions, pricing, value],
  );
  const groups = React.useMemo(() => groupByProvider(modelOptions, value), [modelOptions, value]);
  // The button reads the same name as the menu row, so picking GPT-6 Astra does not show `gpt-6-astra`.
  const shownTitle =
    curated?.find((row) => isSameModel(row.option, value))?.option.title ?? selectedOption?.title ?? value.modelID;

  /**
   * Picking a model picks the model.
   *
   * It used to open the effort submenu instead whenever the model had variants, so choosing a model was
   * two clicks across two panes and was not committed until an effort level was also chosen. People read
   * the first click as the selection - it looks like one - and could not tell what the second pane was
   * for. Effort is now its own control beside the model button, so this path has one job.
   */
  const handleSelect = (option: ModelOption) => {
    onChange({ providerID: option.providerID, modelID: option.modelID });
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              type="button"
              disabled={disabled}
              aria-label={t("session.change_model")}
              aria-keyshortcuts="Meta+Alt+/"
              className="flex h-9 max-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
            />
          }
        >
          <span className="max-w-48 truncate">
            {hideValue
              ? t("model_select.select_model")
              : (shownTitle || t("model_select.select_model"))}
          </span>
          {/*
            No effort chip here any more. Effort is its own button beside this one - `EffortSelect` -
            so this control shows the model and nothing else. Two settings on one button, one of them
            read-only, is what made the interaction unreadable.
          */}
          <ChevronDown className="h-3 w-3" />
        </TooltipTrigger>
        <TooltipContent>
          {t("session.change_model")}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="flex max-h-(--available-height) w-auto flex-row gap-1.5 overflow-visible bg-transparent p-0 shadow-none ring-0"
        align="start"
        // Inside the Desk frame the menu stays in the work column; it used to run over the side panel.
        collisionBoundary={open ? deskWorkColumn() : undefined}
      >
        <ModelMenu
          rows={curated}
          groups={groups}
          value={value}
          pricing={pricing}
          onSelect={handleSelect}
          onNavigate={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
