import type { ProviderListResponse } from "@opencode-ai/sdk/v2/client";
import { isRedrobOnlyProviderId } from "@/react-app/domains/settings/redrob-provider";

const PINNED_PROVIDER_ORDER = ["opencode", "openai", "anthropic"] as const;

export const providerPriorityRank = (id: string) => {
  const normalized = id.trim().toLowerCase();
  const index = PINNED_PROVIDER_ORDER.indexOf(
    normalized as (typeof PINNED_PROVIDER_ORDER)[number],
  );
  return index === -1 ? PINNED_PROVIDER_ORDER.length : index;
};

export const compareProviders = (
  a: { id: string; name?: string },
  b: { id: string; name?: string },
) => {
  const rankDiff = providerPriorityRank(a.id) - providerPriorityRank(b.id);
  if (rankDiff !== 0) return rankDiff;

  const aName = (a.name ?? a.id).trim();
  const bName = (b.name ?? b.id).trim();
  return aName.localeCompare(bName);
};

export const filterProviderList = (
  value: ProviderListResponse,
  disabledProviders: string[],
): ProviderListResponse => {
  const disabled = new Set(disabledProviders.flatMap((id) => {
    const trimmed = id.trim();
    return trimmed ? [trimmed] : [];
  }));
  // Keep only the Redrob allowlist (single source of truth) and drop any
  // explicitly disabled provider. This is the choke point feeding the model
  // picker and every provider list, so no other provider ever surfaces.
  const isAllowed = (id: string) => isRedrobOnlyProviderId(id) && !disabled.has(id.trim());
  return {
    all: value.all.filter((provider) => isAllowed(provider.id)),
    connected: value.connected.filter((id) => isAllowed(id)),
    default: Object.fromEntries(
      Object.entries(value.default).filter(([id]) => isAllowed(id)),
    ),
  };
};
