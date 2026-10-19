/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Badge, Button, EmptyState, Input, Skeleton, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { openExternal } from "../connectors/cowork-connectors";
import { PreviewPage } from "../preview/preview-note";
import { previewKey, usePreviewServices } from "../preview/preview";
import type { SkillOrigin, TeamSkillsState } from "../services/types";
import { CoworkShell } from "../shell/cowork-shell";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import { CONSOLE_SKILLS_URL, shelvesOf, shouldRestoreListFocus, skillRows, type SkillShelfId } from "./skills";
import { installSkill } from "./use-skills";
import { runSkill } from "./cowork-skill";
import { useCoworkStartStore } from "./start-chat";
import { consoleCatalogue } from "./console-catalogue";
import { SHELF_LABEL, SkillGrid, SkillShelf } from "./skill-tile";

const ICON = { width: 14, height: 14, "aria-hidden": true };
const SHELF_IDS: readonly SkillShelfId[] = ["yours", "lawyer", "accountant", "vc", "everyday"];

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

function SkillsSkeleton() {
  return (
    <div className="cowork-skills__loading" aria-busy="true">
      <span className="sr-only">{t("cowork.skills_loading_label")}</span>
      {[0, 1].map((shelf) => (
        <section key={shelf} className="cowork-skills__shelf">
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
      ))}
    </div>
  );
}

/** `/skills`: installed skills first, then horizontally scrolling catalogue shelves. */
export function SkillsScreen() {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const openModal = useFrameStore((state) => state.openModal);
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const restoredFocusKey = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const requestChat = useCoworkStartStore((state) => state.request);

  const installed = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000, retry: 2, placeholderData: keepPreviousData });
  const library = useQuery({ queryKey: previewKey(scope, "library"), queryFn: () => services.skills.library(), staleTime: 5 * 60_000, retry: 2, placeholderData: keepPreviousData });
  const team = useQuery({ queryKey: previewKey(scope, "team"), queryFn: () => services.skills.teamState(), staleTime: 60_000 });
  const preview = installed.data?.preview ?? true;
  const rows = useMemo(
    () => installed.data ? skillRows({ installed: installed.data.data, library: library.data?.data ?? null, filters: search.trim() ? { q: search } : {}, installedOnly: false }) : null,
    [installed.data, library.data, search],
  );
  const shelves = useMemo(() => rows ? shelvesOf(rows, locale) : [], [rows, locale]);
  const selectedId = searchParams.get("shelf");
  const selectedShelf = SHELF_IDS.includes(selectedId as SkillShelfId) ? shelves.find((shelf) => shelf.id === selectedId) : undefined;
  const count = installed.data?.data.length;
  const teamText = teamStatusText(team.data?.data ?? null);
  const fromPath = `/skills${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const canUse = !preview && Boolean(workspaceId);
  const deps = { skills: services.skills, queryClient, scope, showToast };

  const add = (name: string) => {
    setBusy(name);
    void installSkill(deps, name).finally(() => setBusy(null));
  };
  const use = canUse ? (name: string) => void runSkill({ workspaceId, request: requestChat, navigate }, name) : undefined;
  const showShelf = (id: SkillShelfId) => setSearchParams({ shelf: id }, { state: { focusShelfHeading: id } });
  const showAll = () => setSearchParams({}, selectedShelf ? { state: { returnToShelf: selectedShelf.id } } : undefined);
  const retryLibrary = () => {
    consoleCatalogue.reset();
    void library.refetch();
  };

  useEffect(() => {
    const state = location.state as { focusShelfHeading?: SkillShelfId; fromSkill?: string; returnToShelf?: SkillShelfId } | null;
    if (!shouldRestoreListFocus(location.key, restoredFocusKey.current)) return;
    const target = state?.fromSkill
      ? document.querySelector<HTMLElement>(`[data-skill="${CSS.escape(state.fromSkill)}"] .cowork-skill-tile__link`)
      : state?.focusShelfHeading
        ? document.getElementById(`skill-shelf-full-${state.focusShelfHeading}`)
        : state?.returnToShelf
          ? document.getElementById(`skill-shelf-${state.returnToShelf}-see-all`)
          : null;
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    restoredFocusKey.current = location.key;
  }, [location.key, location.state, rows]);

  const tileProps = { locale, busy, canAdd: !preview, fromPath, onAdd: add, ...(use ? { onUse: use } : {}) };

  return (
    <CoworkShell
      current="skills"
      title={t("cowork.nav_skills")}
      meta={count === undefined ? undefined : t("cowork.skills_meta", { count })}
      actions={
        <>
          <Input
            className="cowork-skills__header-search"
            id="cowork-skills-search"
            type="search"
            size="sm"
            aria-label={t("cowork.skills_search")}
            placeholder={t("cowork.skills_search")}
            value={search}
            onChange={(event) => { setSearch(event.target.value); if (selectedId) showAll(); }}
          />
          <Button size="sm" variant="secondary" iconLeft={icons.plus(ICON)} onClick={() => openModal({ kind: "skill" })}>{t("cowork.skill_new")}</Button>
        </>
      }
    >
      <PreviewPage note={t("cowork.skills_preview_note")} preview={preview}>
        {count === 0 ? (
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
          <EmptyState
            title={search.trim() ? t("cowork.skills_none_match_title") : t("cowork.skills_empty_title")}
            description={search.trim() ? t("cowork.skills_none_match_search") : t("cowork.skills_empty_text")}
          />
        ) : selectedShelf ? (
          <div className="cowork-skills__marketplace">
            <div>
              <div className="cowork-skills__full-heading">
                <Button size="sm" variant="ghost" iconLeft={icons.arrowLeft(ICON)} onClick={showAll}>{t("cowork.skills_back_to_all")}</Button>
                <h2 id={`skill-shelf-full-${selectedShelf.id}`} tabIndex={-1}>{SHELF_LABEL[selectedShelf.id]()}</h2>
              </div>
              <SkillGrid rows={selectedShelf.rows} label={SHELF_LABEL[selectedShelf.id]()} {...tileProps} />
            </div>
          </div>
        ) : search.trim() ? (
          <div className="cowork-skills__marketplace">
            <section className="cowork-skills__shelf" aria-labelledby="skills-results-heading">
              <div className="cowork-skills__shelf-heading"><h2 id="skills-results-heading">{t("cowork.skills_results")}</h2></div>
              <SkillGrid rows={rows} label={t("cowork.skills_results")} {...tileProps} />
            </section>
          </div>
        ) : (
          <div className="cowork-skills__marketplace">
            {shelves.map((shelf) => <SkillShelf key={shelf.id} id={shelf.id} rows={shelf.rows} onSeeAll={showShelf} {...tileProps} />)}
            {library.isError ? (
              <section className="cowork-skills__notice">
                <h2>{t("cowork.skills_library_offline_title")}</h2>
                <p>{t("cowork.skills_library_offline_text")}</p>
                <Button size="sm" variant="secondary" onClick={retryLibrary}>{t("cowork.skills_retry")}</Button>
              </section>
            ) : null}
          </div>
        )}
      </PreviewPage>
    </CoworkShell>
  );
}
