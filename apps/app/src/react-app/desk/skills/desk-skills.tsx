/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { Badge, Button, EmptyState, Input, Select, Skeleton, Switch, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { openExternal } from "../connectors/desk-connectors";
import { PreviewPage } from "../preview/preview-note";
import { previewKey, usePreviewServices } from "../preview/preview";
import type { SkillFilters, SkillOrigin, SkillTaxonomy, TeamSkillsState } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { useDeskConnection } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";
import { canRemoveSkill, CONSOLE_SKILLS_URL, skillRows, tagLabels, type SkillRow } from "./skills";
import { installSkill, removeSkill } from "./use-skills";
import { runSkill } from "./desk-skill";
import { useDeskStartStore } from "./start-chat";
import { albumArtBase } from "../preview/model-chart-home";
import { resolveExtensionIconSrc } from "../../design-system/extension-icon-src";

const ICON = { width: 14, height: 14, "aria-hidden": true };
const ALL = "all";

/** `/skill/<name>`. */
export function skillPath(name: string): string {
  return `/skill/${encodeURIComponent(name)}`;
}

export function originLabel(origin: SkillOrigin): string {
  switch (origin) {
    case "library":
      return t("desk.skills_origin_library");
    case "team":
      return t("desk.skills_origin_team");
    case "mine":
      return t("desk.skills_origin_mine");
  }
}

export function OriginBadge(props: { origin: SkillOrigin }) {
  return (
    <Badge size="sm" tone={props.origin === "team" ? "info" : props.origin === "mine" ? "success" : "neutral"}>
      {originLabel(props.origin)}
    </Badge>
  );
}

/** A filter picked. A new profession clears a task that is not one of its own. */
export function withFilter(filters: SkillFilters, key: "profession" | "task" | "language", value: string, taxonomy: SkillTaxonomy | null): SkillFilters {
  const next: SkillFilters = { ...filters };
  if (value === ALL || !value) delete next[key];
  else next[key] = value;
  if (key === "profession") {
    const tasks = taxonomy?.professions.find((profession) => profession.id === next.profession)?.tasks ?? [];
    if (!tasks.some((task) => task.id === next.task)) delete next.task;
  }
  return next;
}

/**
 * Round 33: browse-by-category tiles for non-technical users, in place of the three
 * jargon dropdowns as the PRIMARY browse. Each profession is an album-art tile (the
 * same artwork language as Trending AI); picking one sets the profession filter, and
 * picking the active one again clears it. The dropdowns stay below as a quiet "refine".
 */
export function SkillCategoryTiles(props: {
  taxonomy: SkillTaxonomy | null;
  active: string | undefined;
  locale: string;
  onPick: (professionId: string | undefined) => void;
}) {
  const professions = props.taxonomy?.professions ?? [];
  if (professions.length === 0) return null;
  const label = (value: { en: string; ko: string }) => (props.locale.startsWith("ko") ? value.ko : value.en);
  return (
    <div className="desk-skills__categories" role="group" aria-label={t("desk.skills_browse_heading")}>
      {professions.map((profession) => {
        const base = albumArtBase("picked-for-your-profession", profession.id);
        const isActive = props.active === profession.id;
        return (
          <button
            key={profession.id}
            type="button"
            className="desk-skills__category"
            data-active={isActive ? "true" : undefined}
            aria-pressed={isActive}
            onClick={() => props.onPick(isActive ? undefined : profession.id)}
          >
            <span className="desk-skills__category-art" aria-hidden="true">
              {base ? (
                <img
                  src={resolveExtensionIconSrc(`${base}.png`)}
                  srcSet={`${resolveExtensionIconSrc(`${base}.png`)} 1x, ${resolveExtensionIconSrc(`${base}@2x.png`)} 2x, ${resolveExtensionIconSrc(`${base}@3x.png`)} 3x`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : null}
            </span>
            <span className="desk-skills__category-label">{label(profession.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** What the team check says, when it is something to act on; null when there is nothing to say. */
export function teamStatusText(state: TeamSkillsState | null): string | null {
  if (!state) return null;
  if (state.conflicts.length) return t("desk.skills_team_conflicts", { names: state.conflicts.join(", ") });
  if (state.status === "not_connected") return t("desk.skills_team_not_connected");
  if (state.status === "not_member") return t("desk.skills_team_not_member");
  return null;
}

export function SkillFiltersView(props: {
  filters: SkillFilters;
  installedOnly: boolean;
  taxonomy: SkillTaxonomy | null;
  locale: string;
  onFilters: (filters: SkillFilters) => void;
  onInstalledOnly: (on: boolean) => void;
}) {
  const { filters, taxonomy } = props;
  const label = (value: { en: string; ko: string }) => (props.locale.startsWith("ko") ? value.ko : value.en);
  const all = { value: ALL, label: t("desk.skills_all") };
  const profession = taxonomy?.professions.find((entry) => entry.id === filters.profession);
  const set = (key: "profession" | "task" | "language") => (_event: unknown, option?: { value: string | number }) =>
    props.onFilters(withFilter(filters, key, String(option?.value ?? ALL), taxonomy));
  return (
    <div className="flex flex-col gap-3">
      <div className="desk-skills__filters">
        <Select
          id="desk-skills-profession"
          label={t("desk.skills_profession")}
          size="sm"
          value={filters.profession ?? ALL}
          options={[all, ...(taxonomy?.professions ?? []).map((entry) => ({ value: entry.id, label: label(entry.label) }))]}
          onChange={set("profession")}
        />
        <Select
          id="desk-skills-task"
          label={t("desk.skills_task")}
          size="sm"
          value={filters.task ?? ALL}
          disabled={!profession}
          options={[all, ...(profession?.tasks ?? []).map((entry) => ({ value: entry.id, label: label(entry.label) }))]}
          onChange={set("task")}
        />
        <Select
          id="desk-skills-language"
          label={t("desk.skills_language")}
          size="sm"
          value={filters.language ?? ALL}
          options={[all, ...(taxonomy?.languages ?? []).map((entry) => ({ value: entry.id, label: label(entry.label) }))]}
          onChange={set("language")}
        />
      </div>
      <div className="desk-skills__filters">
        <Input
          id="desk-skills-search"
          type="search"
          size="sm"
          aria-label={t("desk.skills_search")}
          placeholder={t("desk.skills_search")}
          value={filters.q ?? ""}
          onChange={(event) => props.onFilters({ ...filters, q: event.target.value })}
        />
        <Switch
          size="sm"
          label={t("desk.skills_installed_only")}
          checked={props.installedOnly}
          onChange={(event) => props.onInstalledOnly(event.target.checked)}
        />
      </div>
    </div>
  );
}

export type SkillsViewProps = {
  rows: SkillRow[];
  taxonomy: SkillTaxonomy | null;
  locale: string;
  /** True while nothing matches because of the filters, not because there are no skills. */
  filtered: boolean;
  busy: string | null;
  /** False with no connected workspace: the library still lists, but there is nowhere to install to. */
  canAdd?: boolean;
  hrefFor: (name: string) => string;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  /** Round 32: "Use" an installed skill (start a Plan chat). Absent on sample data. */
  onUse?: (name: string) => void;
};

/** The skills, each a link to its page, with what it is filed under and where it came from. */
export function SkillsView(props: SkillsViewProps) {
  if (!props.rows.length) {
    return props.filtered ? (
      <EmptyState title={t("desk.skills_none_match_title")} description={t("desk.skills_none_match_text")} />
    ) : (
      <EmptyState title={t("desk.skills_empty_title")} description={t("desk.skills_empty_text")} />
    );
  }
  return (
    <ul className="desk-preview__list" aria-label={t("desk.nav_skills")}>
      {props.rows.map((row) => {
        const tags = tagLabels(row.tags, props.taxonomy, props.locale);
        return (
          <li key={row.name} className="desk-skills__row">
            <div className="desk-settings__text">
              <Link className="desk-skills__name" to={props.hrefFor(row.name)}>
                {row.title ?? row.name}
              </Link>
              {row.description ? <span className="desk-settings__description">{row.description}</span> : null}
              <span className="desk-preview__meta">
                <OriginBadge origin={row.origin} />
                {tags.map((tag) => (
                  <Badge key={tag} size="sm" variant="outline">
                    {tag}
                  </Badge>
                ))}
              </span>
            </div>
            <span className="desk-skills__actions">
              {row.installed === null ? (
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={icons.plus(ICON)}
                  loading={props.busy === row.name}
                  disabled={props.canAdd === false}
                  aria-label={t("desk.skill_add_label", { name: row.name })}
                  onClick={() => props.onAdd(row.name)}
                >
                  {t("desk.skill_add")}
                </Button>
              ) : (
                <>
                  {/* Round 32: an installed skill leads with "Use" (run it now). Remove is
                      demoted to a quieter secondary action, and only when it can be removed
                      (team / out-of-project skills keep their guard). */}
                  {props.onUse ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={icons.play(ICON)}
                      aria-label={t("desk.skills_use_label", { name: row.name })}
                      onClick={() => props.onUse?.(row.name)}
                    >
                      {t("desk.skills_use")}
                    </Button>
                  ) : null}
                  {canRemoveSkill(row.installed) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={props.busy === row.name}
                      aria-label={t("desk.skill_remove_label", { name: row.name })}
                      onClick={() => props.onRemove(row.name)}
                    >
                      {t("desk.skill_remove")}
                    </Button>
                  ) : null}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** `/skills`: the library, the team's skills and the person's own, real where a server is connected. */
export function SkillsScreen() {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const openModal = useFrameStore((state) => state.openModal);
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const [filters, setFilters] = useState<SkillFilters>({});
  const [installedOnly, setInstalledOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Round 32: an installed skill's primary action is "Use" (start a Plan chat),
  // wired the same way the skill detail page's Run does.
  const navigate = useNavigate();
  const useWorkspaceId = useDeskConnection((state) => state.workspaceId);
  const requestChat = useDeskStartStore((state) => state.request);
  // The library is asked without the search, which is matched here as it is typed.
  const { q, ...tags } = filters;
  /*
    "Skills sometimes appears and sometimes does not": both queries used the defaults, so a transient
    server error or a routine refetch (filter change, refocus, 5-min staleTime) dropped `data` and the
    list blanked. keepPreviousData keeps the last good rows on screen while a refetch (incl. a new
    filter key) is in flight, and a short retry rides out a transient listSkills or catalogue
    failure instead of surfacing it as an empty or error screen.
  */
  const installed = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000, retry: 2, placeholderData: keepPreviousData });
  const library = useQuery({
    queryKey: [...previewKey(scope, "library"), tags],
    queryFn: () => services.skills.library(tags),
    staleTime: 5 * 60_000,
    enabled: !installedOnly,
    retry: 2,
    placeholderData: keepPreviousData,
  });
  const taxonomy = useQuery({ queryKey: previewKey(scope, "taxonomy"), queryFn: () => services.skills.taxonomy(), staleTime: 5 * 60_000 });
  const team = useQuery({ queryKey: previewKey(scope, "team"), queryFn: () => services.skills.teamState(), staleTime: 60_000 });
  const preview = installed.data?.preview ?? true;
  const deps = { skills: services.skills, queryClient, scope, showToast };
  const act = (run: typeof installSkill) => (name: string) => {
    setBusy(name);
    void run(deps, name).finally(() => setBusy(null));
  };
  // The library is the Console's public catalogue, fetched by the browser directly, so it shows
  // with or without a workspace connection. The installed list is the connected workspace's; with
  // no connection it is empty and installing is refused.
  const rows = installed.data ? skillRows({ installed: installed.data.data, library: library.data?.data ?? null, filters, installedOnly }) : null;
  const effectiveTaxonomy = taxonomy.data?.data ?? null;
  const teamText = teamStatusText(team.data?.data ?? null);
  const count = installed.data?.data.length;

  return (
    <DeskShell
      current="skills"
      title={t("desk.nav_skills")}
      meta={count === undefined ? undefined : t("desk.skills_meta", { count })}
      actions={
        <Button size="sm" variant="secondary" iconLeft={icons.plus(ICON)} onClick={() => openModal({ kind: "skill" })}>
          {t("desk.skill_new")}
        </Button>
      }
    >
      <PreviewPage note={t("desk.skills_preview_note")} preview={preview}>
        {/*
          Round 32: a warm "What's a skill?" explainer for non-technical users, in place
          of the bare one-line lede. Plain language + a concrete example so the page does
          not assume the reader already knows what a skill is.
        */}
        <div className="desk-skills__explainer">
          <h2 className="desk-skills__explainer-title">{t("desk.skills_explainer_title")}</h2>
          <p className="desk-skills__explainer-body">{t("desk.skills_explainer_body")}</p>
        </div>
        {/*
          Round 33: browse-by-category album-art tiles as the primary browse (reuses the
          Trending AI tile language). Picking a profession sets the filter; the dropdowns
          below become a quiet refine for task/language/search.
        */}
        <h3 className="desk-skills__browse-heading">{t("desk.skills_browse_heading")}</h3>
        <SkillCategoryTiles
          taxonomy={effectiveTaxonomy}
          active={filters.profession}
          locale={locale}
          onPick={(professionId) => setFilters(withFilter(filters, "profession", professionId ?? ALL, effectiveTaxonomy))}
        />
        {teamText ? (
          <p className="desk-settings__description">
            {teamText}{" "}
            <a
              className="desk-settings__action"
              href={CONSOLE_SKILLS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                event.preventDefault();
                openExternal(CONSOLE_SKILLS_URL);
              }}
            >
              {t("desk.skills_open_console")}
              {icons.external({ width: 12, height: 12, "aria-hidden": true })}
            </a>
          </p>
        ) : null}
        <SkillFiltersView
          filters={filters}
          installedOnly={installedOnly}
          taxonomy={effectiveTaxonomy}
          locale={locale}
          onFilters={setFilters}
          onInstalledOnly={setInstalledOnly}
        />
        {rows === null ? (
          /*
            Skeleton ONLY on the very first load, before the INSTALLED list has arrived (rows is null
            only then). It used to also skeleton on `!installedOnly && library.isLoading`, which blanked
            the whole screen every time the library query re-fetched - on a filter change, on refocus,
            or when its 5-min staleTime expired - so the skills "sometimes showed and sometimes did not".
            Once the installed list is in, rows is non-null (installed-only, or installed+library), so we
            render it and let the uninstalled library stream in without hiding what is already there.
          */
          installed.isError ? (
            <EmptyState title={t("desk.preview_error_title")} description={t("desk.settings_try_again")} />
          ) : (
            <Skeleton variant="text" lines={5} />
          )
        ) : (
          <SkillsView
            rows={rows}
            taxonomy={effectiveTaxonomy}
            locale={locale}
            filtered={Boolean(q?.trim() || tags.profession || tags.task || tags.language)}
            busy={busy}
            canAdd={!preview}
            hrefFor={skillPath}
            onAdd={act(installSkill)}
            onRemove={act(removeSkill)}
            onUse={!preview && useWorkspaceId ? (name) => void runSkill({ workspaceId: useWorkspaceId, request: requestChat, navigate }, name) : undefined}
          />
        )}
      </PreviewPage>
    </DeskShell>
  );
}
