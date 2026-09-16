import type { ProviderListResponse } from "@opencode-ai/sdk/v2/client";
import { isProviderExposed } from "@/react-app/domains/settings/redrob-provider";

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
  authMethods?: Record<string, readonly { type: string }[]>,
): ProviderListResponse => {
  const disabled = new Set(disabledProviders.flatMap((id) => {
    const trimmed = id.trim();
    return trimmed ? [trimmed] : [];
  }));
  // The choke point feeding the model picker and every provider list. It offers
  // every provider whose credential the connect flow can actually collect --
  // see isProviderExposed for why that is a capability test rather than a list
  // of names -- and drops anything explicitly disabled for this install.
  //
  // `connected` and `default` carry ids only, so the facts come from `all`,
  // which is the same response's catalogue entry for that id.
  const connectedIds = new Set(value.connected.map((id) => id.trim()));
  // OAuth was part of the rule from the start and was never actually supplied here, so a provider
  // reachable ONLY by OAuth was judged on its env vars and silently withheld. Passed in rather than
  // fetched, because this stays a pure function.
  const hasOAuth = (id: string) =>
    (authMethods?.[id.trim()] ?? []).some((method) => method.type === "oauth");
  const factsById = new Map(
    value.all.map((provider) => [
      provider.id.trim(),
      {
        id: provider.id,
        env: Array.isArray(provider.env) ? provider.env : [],
        connected: connectedIds.has(provider.id.trim()),
        hasOAuth: hasOAuth(provider.id),
      },
    ]),
  );
  const isAllowed = (id: string) => {
    const trimmed = id.trim();
    if (disabled.has(trimmed)) return false;
    // An id that is connected but absent from the catalogue still counts as
    // connected: the engine resolved it somehow, and hiding a working provider
    // would be a regression.
    const facts = factsById.get(trimmed) ?? {
      id,
      connected: connectedIds.has(trimmed),
      hasOAuth: hasOAuth(trimmed),
    };
    return isProviderExposed(facts);
  };
  return {
    all: value.all.filter((provider) => isAllowed(provider.id)),
    connected: value.connected.filter((id) => isAllowed(id)),
    default: Object.fromEntries(
      Object.entries(value.default).filter(([id]) => isAllowed(id)),
    ),
  };
};
