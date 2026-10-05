/** @jsxImportSource react */
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModelGuide, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import type { ModelCatalog } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import { PreviewPage, PreviewState } from "./preview-note";
import { previewKey, usePreviewServices } from "./preview";

/** The header meta: the edition the rankings come from. */
export function guideMeta(catalog: Pick<ModelCatalog, "source">): string {
  const { source } = catalog;
  return `${source.name}, ${source.edition}. ${source.note}.`;
}

/**
 * The Model Guide on the sample catalog. In Redrob Cowork every message goes to Redrob Auto,
 * so the guide explains how it chooses; there is no model to pick here.
 */
export function GuideView(props: { catalog: ModelCatalog; locale: string; onUse: () => void }) {
  return (
    <>
      <p className="desk-settings__note">
        {icons.sparkle({ width: 14, height: 14, "aria-hidden": true })}
        {t("desk.preview_guide_auto")}
      </p>
      <ModelGuide
        professions={props.catalog.professions}
        source={props.catalog.source}
        locale={props.locale}
        defaultProfession="lawyer"
        title={t("desk.nav_guide")}
        lede={t("desk.preview_guide_lede")}
        simpleLabel={t("desk.preview_guide_simple")}
        advancedLabel={t("desk.preview_guide_advanced")}
        professionLabel={t("desk.preview_guide_profession")}
        taskLabel={t("desk.preview_guide_task")}
        promptLabel={t("desk.preview_guide_prompt")}
        outputLabel={t("desk.preview_guide_output")}
        illustrativeLabel={t("desk.preview_guide_illustrative")}
        effortLabel={t("desk.preview_guide_effort")}
        rankedLabel={t("desk.preview_guide_ranked")}
        emptyTitle={t("desk.preview_guide_empty_title")}
        emptyText={t("desk.preview_guide_empty_text")}
        useLabel={t("desk.preview_guide_use")}
        onUse={props.onUse}
      />
    </>
  );
}

/** `/guide`: sample rankings from the Redrob Leaderboard. */
export function GuideScreen() {
  const { services, scope } = usePreviewServices();
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const query = useQuery({ queryKey: previewKey(scope, "catalog"), queryFn: () => services.catalog.get(), staleTime: Infinity });
  const catalog = query.data?.data;
  return (
    <DeskShell current="guide" title={t("desk.nav_guide")} meta={catalog ? guideMeta(catalog) : undefined} measure={false}>
      <PreviewPage note={t("desk.preview_guide_note")} wide>
        <PreviewState query={query}>
          {(data) => (
            <GuideView
              catalog={data}
              locale={locale}
              onUse={() => showToast(t("desk.preview_guide_use_title"), t("desk.preview_guide_use_text"))}
            />
          )}
        </PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
