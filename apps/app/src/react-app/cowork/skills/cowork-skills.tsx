/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { Badge, Button, EmptyState, Skeleton, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { openExternal } from "../connectors/cowork-connectors";
import { PreviewPage } from "../preview/preview-note";
import { previewKey, usePreviewServices } from "../preview/preview";
import type { SkillOrigin, TeamSkillsState } from "../services/types";
import { CoworkShell } from "../shell/cowork-shell";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import { CONSOLE_SKILLS_URL, marketplaceReady, shelvesOf, shouldRestoreListFocus, skillRows } from "./skills";
import { installSkill } from "./use-skills";
import { runSkill } from "./cowork-skill";
import { useCoworkStartStore } from "./start-chat";
import { CATALOGUE_CACHE_MS, consoleCatalogue } from "./console-catalogue";
import { SkillShelf } from "./skill-tile";

/** The localized label for where a skill came from. */
export function originLabel(origin: SkillOrigin): string {
  switch (origin) {
    case "library": return t("cowork.skills_origin_library");
    case "team": return t("cowork.skills_origin_team");
    case "mine": return t("cowork.skills_origin_mine");
  }
}

/** A small tone-coded badge naming a skill's origin. */
export function OriginBadge(props: { /** Origin rendered by this badge. */ origin: SkillOrigin }) {
  return <Badge size="sm" tone={props.origin === "team" ? "info" : props.origin === "mine" ? "success" : "neutral"}>{originLabel(props.origin)}</Badge>;
}

/** What the team check says when it is something to act on. */
export function teamStatusText(state: TeamSkillsState | null): string | null {
  if (!state) return null;
  if (state.conflicts.length) return t("cowork.skills_team_conflicts", { names: state.conflicts.join(", ") });
  if (state.status === "not_connected") return t("cowork.skills_team_not_connected");
  if (state.status === "not_member") return t("cowork.skills_team_not_member");
  return null;
}


/** The catalogue notice appears only after installed rows are ready; with nothing to show it stands in for the page. */
export function shouldShowLibraryNotice(rows: readonly unknown[] | null, libraryError: boolean): boolean {
  return rows !== null && (libraryError || rows.length === 0);
}

/** Round 10: shaped like the page it stands in for - a row of square workflow cards, then a row of skill circles. */
function SkillsSkeleton() {
  return (
    <div className="cowork-skills__loading" aria-busy="true">
      <span className="sr-only">{t("cowork.skills_loading_label")}</span>
      <section className="cowork-skills__shelf">
        <Skeleton variant="text" width={180} />
        <div className="cowork-skills__skeleton-row">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="cowork-skills__skeleton-card">
              <Skeleton variant="rect" width={160} height={160} />
              <Skeleton variant="text" width={120} />
              <Skeleton variant="text" width={140} />
            </div>
          ))}
        </div>
      </section>
      <section className="cowork-skills__shelf">
        <Skeleton variant="text" width={140} />
        <div className="cowork-skills__skeleton-row">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="cowork-skills__skeleton-tile">
              <Skeleton variant="circle" width={72} height={72} />
              <Skeleton variant="text" width={112} />
              <Skeleton variant="text" width={128} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** `/skills`: installed skills first, then horizontally scrolling catalogue shelves. */
export function SkillsScreen() {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const [busy, setBusy] = useState<string | null>(null);
  const restoredFocusKey = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const requestChat = useCoworkStartStore((state) => state.request);

  const installed = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000, gcTime: CATALOGUE_CACHE_MS, retry: 2, placeholderData: keepPreviousData });
  const library = useQuery({ queryKey: previewKey(scope, "library"), queryFn: () => services.skills.library(), staleTime: 5 * 60_000, gcTime: CATALOGUE_CACHE_MS, retry: false, placeholderData: keepPreviousData });
  const team = useQuery({ queryKey: previewKey(scope, "team"), queryFn: () => services.skills.teamState(), staleTime: 60_000 });
  // Round 10: unknown until a result arrives; the preview note never paints while loading.
  const preview = installed.data?.preview;
  const ready = marketplaceReady({ hasData: Boolean(installed.data) }, library);
  const rows = useMemo(
    () => installed.data && ready ? skillRows({ installed: installed.data.data, library: library.data?.data ?? null, filters: {}, installedOnly: false }) : null,
    [installed.data, library.data, ready],
  );
  const shelves = useMemo(() => rows ? shelvesOf(rows, locale) : [], [rows, locale]);
  const count = installed.data?.data.length;
  const teamText = teamStatusText(team.data?.data ?? null);
  const fromPath = "/skills";
  const canUse = preview === false && Boolean(workspaceId);
  const deps = { skills: services.skills, queryClient, scope, showToast };

  const add = (name: string) => {
    setBusy(name);
    void installSkill(deps, name).finally(() => setBusy(null));
  };
  const use = canUse ? (name: string) => void runSkill({ workspaceId, request: requestChat, navigate }, name) : undefined;
  const retryLibrary = () => {
    consoleCatalogue.reset();
    void library.refetch();
  };

  useEffect(() => {
    const state = location.state as { fromSkill?: string } | null;
    if (!shouldRestoreListFocus(location.key, restoredFocusKey.current)) return;
    const target = state?.fromSkill
      ? document.querySelector<HTMLElement>(`[data-skill="${CSS.escape(state.fromSkill)}"] .cowork-skill-tile__link`)
      : null;
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    restoredFocusKey.current = location.key;
  }, [location.key, location.state, rows]);

  const libraryNotice = shouldShowLibraryNotice(rows, library.isError) ? (
    <section className="cowork-skills__notice">
      <h2>{t("cowork.skills_library_offline_title")}</h2>
      <p>{t("cowork.skills_library_offline_text")}</p>
      <Button size="sm" variant="secondary" onClick={retryLibrary}>{t("cowork.skills_retry")}</Button>
    </section>
  ) : null;

  const tileProps = { locale, busy, canAdd: preview === false, fromPath, onAdd: add, ...(use ? { onUse: use } : {}) };

  return (
    <CoworkShell
      current="skills"
      title={t("cowork.nav_skills")}
      meta={count === undefined ? undefined : t("cowork.skills_meta", { count })}
    >
      <PreviewPage note={t("cowork.skills_preview_note")} preview={preview} wide>
        {rows !== null && count === 0 ? (
          <div className="cowork-skills__explainer">
            <h2 className="cowork-skills__explainer-title">{t("cowork.skills_explainer_title")}</h2>
            <p className="cowork-skills__explainer-body">{t("cowork.skills_explainer_body")}</p>
          </div>
        ) : null}
        {teamText ? (
          <p className="cowork-settings__description">
            {teamText}{" "}
            <a className="cowork-settings__action" href={CONSOLE_SKILLS_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => { event.preventDefault(); openExternal(CONSOLE_SKILLS_URL); }}>
              {t("cowork.skills_open_console")}{icons.external({ width: 12, height: 12, "aria-hidden": true })}
            </a>
          </p>
        ) : null}
        {rows === null ? (
          installed.isError ? (
            <div>
              <EmptyState title={t("cowork.preview_error_title")} description={t("cowork.settings_try_again")} />
              <Button size="sm" variant="secondary" onClick={() => void installed.refetch()}>{t("cowork.skills_retry")}</Button>
            </div>
          ) : <SkillsSkeleton />
        ) : rows.length === 0 ? (
          libraryNotice
        ) : (
          <div className="cowork-skills__marketplace">
            {shelves.map((shelf) => <SkillShelf key={shelf.id} id={shelf.id} rows={shelf.rows} {...tileProps} />)}
            {libraryNotice}
          </div>
        )}
      </PreviewPage>
    </CoworkShell>
  );
}
