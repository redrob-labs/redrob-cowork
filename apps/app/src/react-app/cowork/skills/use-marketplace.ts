import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { previewKey, usePreviewServices } from "../preview/preview";
import { CATALOGUE_CACHE_MS } from "./console-catalogue";
import { marketplaceReady, skillRows } from "./skills";

/**
 * The installed list and the public catalogue, joined into marketplace rows. Shared by the Skills
 * page and a workflow page on the same query keys, so moving between them paints from the cache.
 * `rows` stays null until both are ready (round 10 flash fix); `preview` is undefined until the
 * installed list resolves.
 */
export function useMarketplaceRows() {
  const { services, scope } = usePreviewServices();
  const installed = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000, gcTime: CATALOGUE_CACHE_MS, retry: 2, placeholderData: keepPreviousData });
  const library = useQuery({ queryKey: previewKey(scope, "library"), queryFn: () => services.skills.library(), staleTime: 5 * 60_000, gcTime: CATALOGUE_CACHE_MS, retry: false, placeholderData: keepPreviousData });
  const ready = marketplaceReady({ hasData: Boolean(installed.data) }, library);
  const rows = useMemo(
    () => installed.data && ready ? skillRows({ installed: installed.data.data, library: library.data?.data ?? null, filters: {}, installedOnly: false }) : null,
    [installed.data, library.data, ready],
  );
  return { services, scope, installed, library, rows, preview: installed.data?.preview };
}
