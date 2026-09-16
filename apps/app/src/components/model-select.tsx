"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Settings2 } from "lucide-react";

import type { ModelBehaviorOption, ModelOption, ModelRef } from "@/app/types";
import { getModelBehaviorSummary } from "@/app/lib/model-behavior";
import { matchesModelQuery } from "@/app/lib/model-search";
import { inferModelVendor } from "@/app/lib/model-vendor";
import {
  estimatedCostFor,
  formatModelPriceRange,
  formatPriceTier,
  formatTokenCount,
  formatUsdAmount,
} from "@/app/lib/redrob-pricing";
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
import {
  Command,
  CommandCollection,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandHeader,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { openModelPickerEvent, openProviderAuthEvent } from "@/react-app/shell/new-providers-listener";
import { newProvidersEvent } from "@/app/lib/provider-events";
import { t } from "@/i18n"

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

type ModelSelectGroup = {
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

/** Match a picker row against the search query. Groups always pass through. */
function filterModelItem(item: unknown, query: string): boolean {
  const option = (item as ModelSelectItem | undefined)?.option;
  if (!option) return true;
  return matchesModelQuery(option, query);
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
  /** When set, "All models" opens the full picker scoped to this session. */
  sessionId?: string;
  /** Models available before a workspace OpenCode client exists. */
  fallbackOptions?: readonly ModelOption[];
  behaviorValue?: string | null;
  behaviorLabel?: string;
  behaviorOptions?: { value: string | null; label: string }[];
  onBehaviorChange?: (value: string | null) => void;
}

export function ModelSelect({
  open,
  value,
  hideValue = false,
  onOpenChange,
  onChange,
  disabled = false,
  sessionId,
  fallbackOptions = [],
  behaviorValue = null,
  behaviorLabel,
  behaviorOptions = [],
  onBehaviorChange,
}: ModelSelectProps) {
  const [search, setSearch] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
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
  const focusSearchInput = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = searchInputRef.current;

      if (!input) {
        return;
      }

      input.focus();
      input.select();
    });
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    focusSearchInput();
  }, [focusSearchInput, open]);

  const selectedOption = modelOptions?.find((option) =>
    isSameModel(value, {
      providerID: option.providerID,
      modelID: option.modelID,
    }),
  );

  const groups = React.useMemo(() => groupByProvider(modelOptions, value), [modelOptions, value]);
  // One provider means the group label repeats on every row and buys nothing,
  // so the list renders flat. Grouping returns as soon as a second provider is
  // connected.
  const flatItems = React.useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const flatten = groups.length <= 1;

  const applyModel = (option: ModelOption, behavior?: string | null) => {
    onChange({ providerID: option.providerID, modelID: option.modelID }, behavior);
    if (behavior !== undefined) {
      onBehaviorChange?.(behavior);
    }
    setSearch("");
    onOpenChange(false);
  };

  /**
   * Picking a model picks the model.
   *
   * It used to open the effort submenu instead whenever the model had variants, so choosing a model was
   * two clicks across two panes and was not committed until an effort level was also chosen. People read
   * the first click as the selection - it looks like one - and could not tell what the second pane was
   * for. Effort is now its own control beside the model button, so this path has one job.
   */
  const handleSelect = (option: ModelOption) => {
    applyModel(option);
  };

  const handleConnectProvider = React.useCallback(() => {
    onOpenChange(false);
    setSearch("");
    window.dispatchEvent(new Event(openProviderAuthEvent));
  }, [onOpenChange]);

  const renderItem = (item: ModelSelectItem) => {
    const option = item.option;
    const vendor = inferModelVendor(option.modelID);
    // Published console rate, input / output per million tokens. Absent when the
    // catalog is unreachable or the model is not a Redrob one — never a zero.
    const modelPricing = isRedrobOnlyProviderId(option.providerID)
      ? pricing?.byModelId[option.modelID]
      : undefined;
    const price = formatModelPriceRange(modelPricing);
    // The rate alone does not say whether it is expensive; the band does, and
    // the console publishes it.
    const tier = formatPriceTier(modelPricing);
    // What one short question costs, in dollars. A rate per million tokens is
    // not a number anyone converts in their head, which is the whole complaint
    // this answers.
    const chatCost = formatUsdAmount(estimatedCostFor(modelPricing, "chat")?.costUsd);
    const context = formatTokenCount(modelPricing?.capabilities.maxContextTokens);
    return (
      <CommandItem
        className="gap-2"
        key={item.id}
        value={`${option.providerID}:${option.modelID} ${option.title} ${option.description ?? ""}`}
        onClick={() => handleSelect(option)}
        data-checked={isSameModel(value, option)}
      >
        <ProviderIcon
          providerId={vendor?.id ?? option.providerID}
          providerName={vendor?.name ?? option.description}
          className="size-3.5 opacity-70"
          size={14}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-foreground">{option.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {modelRowSubtitle(option)}
          </span>
        </span>
        {context ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {t("pricing.context_window", { tokens: context })}
          </span>
        ) : null}
        {tier ? (
          <span
            className="shrink-0 font-mono text-[10px] text-muted-foreground"
            title={t("pricing.tier_hint")}
          >
            {tier}
          </span>
        ) : null}
        {chatCost ? (
          <span
            className="shrink-0 font-mono text-[10px] text-muted-foreground"
            title={t("pricing.per_request_hint")}
          >
            {t("pricing.per_request", { amount: chatCost })}
          </span>
        ) : price ? (
          <span
            className="shrink-0 font-mono text-[10px] text-muted-foreground"
            title={t("pricing.per_million_hint")}
          >
            {price}
          </span>
        ) : null}
      </CommandItem>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);

        if (!nextOpen) {
          setSearch("");
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              type="button"
              disabled={disabled}
              aria-label={t("session.change_model")}
              aria-keyshortcuts="Meta+Alt+/"
              className="flex h-9 max-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-gray-10 transition-colors hover:bg-gray-3 hover:text-gray-12 disabled:pointer-events-none disabled:opacity-60"
            />
          }
        >
          <span className="max-w-48 truncate">
            {hideValue
              ? "Select model"
              : (selectedOption?.title ?? value.modelID ?? "Select model")}
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
        className="flex h-80 max-h-(--available-height) w-auto flex-row gap-1.5 overflow-visible bg-transparent p-0 shadow-none ring-0"
        align="start"
        initialFocus={false}
      >
        {/*
          Wider than the 288px it was.

          Each row carries a model name, its vendor, a context figure, a price band and a per-request
          estimate, and at 288px the name itself truncated to a stub - `aion-la...` - which is the one
          field the row exists to show. 26rem fits the name and keeps the popover a popover; the full
          table is a click away behind "All models". Capped at the viewport so a narrow window still
          gets a usable menu rather than one hanging off the edge.
        */}
        <div className="flex h-full w-[min(92vw,26rem)] min-w-0 flex-col overflow-hidden rounded-3xl bg-popover shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
        <Command
          items={flatten ? flatItems : groups}
          filter={filterModelItem}
          value={search}
          onValueChange={setSearch}
        >
          <CommandHeader>
            <CommandInput
              ref={searchInputRef}
              placeholder={t("settings.search_models")}
            />
          </CommandHeader>
          <CommandEmpty>{t("model_select.none_found")}</CommandEmpty>
          <CommandList>
            {flatten
              ? (item: ModelSelectItem) => renderItem(item)
              : (group: ModelSelectGroup) => (
                  <CommandGroup key={group.value} items={group.items}>
                    <CommandGroupLabel>{group.value}</CommandGroupLabel>
                    <CommandCollection>
                      {(item: ModelSelectItem) => renderItem(item)}
                    </CommandCollection>
                  </CommandGroup>
                )}
          </CommandList>
          {/* Always offered: with no organization policy, adding a provider is
              never restricted. */}
          <div className="border-t border-border px-2 py-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={handleConnectProvider}
            >
              {t("model_select.connect_more")}
            </button>
          </div>
          {/* Link to full model picker */}
          <div className="border-t border-border px-2 py-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onOpenChange(false);
                setSearch("");
                window.dispatchEvent(new CustomEvent(openModelPickerEvent, sessionId ? { detail: { sessionId } } : undefined));
              }}
            >
              <Settings2 className="size-3.5" />
              {t("model_picker.all_models")}
            </button>
          </div>
        </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
