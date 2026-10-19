import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { previewKey, usePreviewServices } from "../preview/preview";
import { CATALOGUE_CACHE_MS } from "./console-catalogue";
import { skillRows, type SkillRow } from "./skills";
import { POPULAR_SKILLS } from "./popular-skills";
import { availableWorkflows } from "./workflows";

/**
 * The installed list and the public catalogue, joined into marketplace rows. Shared by the Skills
 * page and a workflow page on the same query keys, so moving between them paints from the cache.
 * `rows` stays null until both are ready; `preview` is undefined until the installed list resolves.
 */
export function useMarketplaceRows() {
  const { services, scope } = usePreviewServices();
  // No placeholder on the workspace-keyed installed list: a new workspace must never paint the
  // previous one's private skills. The public catalogue may carry over while it refreshes.
  const installed = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000, gcTime: CATALOGUE_CACHE_MS, retry: 2 });
  const library = useQuery({ queryKey: previewKey(scope, "library"), queryFn: () => services.skills.library(), staleTime: 5 * 60_000, gcTime: CATALOGUE_CACHE_MS, retry: false, placeholderData: keepPreviousData });
  // Paint only once the installed list has data and the catalogue has settled (loaded or failed),
  // so the page never flashes "Your skills" alone before the catalogue arrives.
  const ready = Boolean(installed.data) && !library.isPending;
  const rows = useMemo(
    () => installed.data && ready ? skillRows({ installed: installed.data.data, library: library.data?.data ?? null }) : null,
    [installed.data, library.data, ready],
  );
  return { services, scope, installed, library, rows, preview: installed.data?.preview };
}

/** The Popular shelf's rows: the curated list for this language, in order; missing names skipped. */
export function popularRows(rows: readonly SkillRow[], locale: string): SkillRow[] {
  const byName = new Map(rows.map((row) => [row.name, row]));
  const list = locale.startsWith("ko") ? POPULAR_SKILLS.ko : POPULAR_SKILLS.en;
  return list.flatMap((name) => {
    const row = byName.get(name);
    return row ? [row] : [];
  });
}

/**
 * Page order: Your skills (installed, in origin order), then the featured workflows, then Popular.
 * Every other skill is a workflow page or a Search away.
 */
export function marketplaceSections(rows: readonly SkillRow[], locale: string) {
  return {
    yours: rows.filter((row) => row.installed !== null),
    workflows: availableWorkflows(rows),
    popular: popularRows(rows, locale),
  };
}
