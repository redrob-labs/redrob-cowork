import { useQuery } from "@tanstack/react-query";

import { fetchRedrobPricing, type RedrobPricing } from "@/app/lib/redrob-pricing";

/**
 * Published rates change on a release cadence, not per minute, so this is
 * cached for an hour. A failure is not retried into a loop: with no pricing the
 * UI simply shows no price label.
 */
const REDROB_PRICING_CACHE_MS = 60 * 60 * 1000;

export const redrobPricingQueryKey = ["redrob", "pricing"] as const;

const EMPTY_PRICING: RedrobPricing = { byModelId: {}, costProfiles: [] };

export function useRedrobPricingQuery(input?: { enabled?: boolean }) {
  return useQuery({
    queryKey: redrobPricingQueryKey,
    enabled: input?.enabled ?? true,
    staleTime: REDROB_PRICING_CACHE_MS,
    gcTime: REDROB_PRICING_CACHE_MS,
    retry: 1,
    queryFn: async () => {
      try {
        return await fetchRedrobPricing();
      } catch {
        // Offline, or the console is unreachable. Price labels disappear; the
        // model list itself must keep working.
        return EMPTY_PRICING;
      }
    },
  });
}
