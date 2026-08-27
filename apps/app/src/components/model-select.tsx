"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Settings2 } from "lucide-react";

import type { ModelBehaviorOption, ModelOption, ModelRef } from "@/app/types";
import { getModelBehaviorSummary } from "@/app/lib/model-behavior";
import { ProviderIcon } from "@/react-app/design-system/provider-icon";
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
    const options = getConnectedProviderItems(data)
      .filter((provider) => isRedrobOnlyProviderId(provider.id))
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

    return mergeModelOptions(options, fallbackOptions).filter((option) =>
      isRedrobOnlyProviderId(option.providerID),
    );
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

function groupByProvider(modelOptions: ModelOption[]): ModelSelectGroup[] {
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
      items: [...options].sort((a, b) => a.option.title.localeCompare(b.option.title)),
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function isSameModel(a: ModelRef, b: ModelRef) {
  return a.providerID === b.providerID && a.modelID === b.modelID;
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
  const [thinkingFor, setThinkingFor] = React.useState<ModelOption | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const catalogOptions = useModelOptions(open, fallbackOptions);
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

    if (thinkingFor) {
      return;
    }

    focusSearchInput();
  }, [focusSearchInput, open, thinkingFor]);

  const selectedOption = modelOptions?.find((option) =>
    isSameModel(value, {
      providerID: option.providerID,
      modelID: option.modelID,
    }),
  );

  const groups = React.useMemo(() => groupByProvider(modelOptions), [modelOptions]);

  const applyModel = (option: ModelOption, behavior?: string | null) => {
    onChange({ providerID: option.providerID, modelID: option.modelID }, behavior);
    if (behavior !== undefined) {
      onBehaviorChange?.(behavior);
    }
    setSearch("");
    setThinkingFor(null);
    onOpenChange(false);
  };

  const handleSelect = (option: ModelOption) => {
    const thinking = thinkingOptionsFor(option);
    if (thinking.length > 0 && onBehaviorChange) {
      setThinkingFor(option);
      return;
    }
    applyModel(option);
  };

  const thinkingOptions = thinkingFor ? thinkingOptionsFor(thinkingFor) : [];
  const thinkingValue =
    thinkingFor && isSameModel(value, thinkingFor)
      ? (behaviorValue ?? thinkingFor.behaviorValue)
      : (thinkingFor?.behaviorValue ?? null);

  const handleConnectProvider = React.useCallback(() => {
    onOpenChange(false);
    setSearch("");
    window.dispatchEvent(new Event(openProviderAuthEvent));
  }, [onOpenChange]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);

        if (!nextOpen) {
          setSearch("");
          setThinkingFor(null);
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              type="button"
              disabled={disabled}
              aria-label="Change model"
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
          <ChevronDown className="h-3 w-3" />
        </TooltipTrigger>
        <TooltipContent>
          Change model
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="flex h-80 max-h-(--available-height) w-auto flex-row gap-1.5 overflow-visible bg-transparent p-0 shadow-none ring-0"
        align="start"
        initialFocus={false}
      >
        <div className="flex h-full w-72 min-w-72 flex-col overflow-hidden rounded-3xl bg-popover shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
        <Command items={groups} value={search} onValueChange={setSearch}>
          <CommandHeader>
            <CommandInput
              ref={searchInputRef}
              placeholder="Search models..."
            />
          </CommandHeader>
          <CommandEmpty>No models found.</CommandEmpty>
          <CommandList>
            {(group: ModelSelectGroup) => (
              <CommandGroup
                key={group.value}
                items={group.items}
              >
                <CommandGroupLabel>
                  {group.value}
                </CommandGroupLabel>
                <CommandCollection>
                  {(item: ModelSelectItem) => {
                    const option = item.option;
                    const hasThinking =
                      Boolean(onBehaviorChange) && thinkingOptionsFor(option).length > 0;
                    return (
                      <CommandItem
                        className="gap-2"
                        key={item.id}
                        value={`${option.providerID}:${option.modelID} ${option.title} ${option.description ?? ""}`}
                        onClick={() => handleSelect(option)}
                        data-checked={isSameModel(value, option)}
                        data-open={thinkingFor ? isSameModel(thinkingFor, option) : undefined}
                      >
                        <ProviderIcon
                          providerId={option.providerID}
                          providerName={option.description}
                          className="size-3.5 opacity-70"
                          size={14}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">
                            {option.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.description ??
                              getProviderDisplayName(option.providerID)}
                          </span>
                        </span>
                        {hasThinking ? (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                      </CommandItem>
                    );
                  }}
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
              Connect more providers
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
              All models
            </button>
          </div>
        </Command>
        </div>
        {thinkingFor ? (
          <div
            data-slot="model-thinking-submenu"
            className="flex h-full w-44 min-w-44 flex-col overflow-hidden rounded-3xl bg-popover shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10"
          >
            <div className="border-b border-border px-3 py-2">
              <span className="block truncate text-sm font-medium">{thinkingFor.title}</span>
              <span className="block truncate text-xs text-muted-foreground">Thinking</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {thinkingOptions.map((option) => {
                const selected = option.value === thinkingValue
                  || (thinkingValue == null && option.value === thinkingOptions[0]?.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => applyModel(thinkingFor, option.value)}
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{option.label}</span>
                    {selected ? <Check className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
