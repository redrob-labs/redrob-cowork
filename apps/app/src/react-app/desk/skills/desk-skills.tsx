/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Badge, Button, EmptyState, Input, Select, Skeleton, Switch, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { openExternal } from "../connectors/desk-connectors";
import { PreviewPage } from "../preview/preview-note";
import { previewKey, usePreviewServices } from "../preview/preview";
import type { SkillFilters, SkillOrigin, SkillTaxonomy, TeamSkillsState } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import { canRemoveSkill, CONSOLE_SKILLS_URL, skillRows, tagLabels, type SkillRow } from "./skills";
import { installSkill, removeSkill } from "./use-skills";

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
  hrefFor: (name: string) => string;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
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
                {row.name}
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
                  aria-label={t("desk.skill_add_label", { name: row.name })}
                  onClick={() => props.onAdd(row.name)}
                >
                  {t("desk.skill_add")}
                </Button>
              ) : canRemoveSkill(row.installed) ? (
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
  // The library is asked without the search, which is matched here as it is typed.
  const { q, ...tags } = filters;
  const installed = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000 });
  const library = useQuery({
    queryKey: [...previewKey(scope, "library"), tags],
    queryFn: () => services.skills.library(tags),
    staleTime: 5 * 60_000,
    enabled: !installedOnly,
  });
  const taxonomy = useQuery({ queryKey: previewKey(scope, "taxonomy"), queryFn: () => services.skills.taxonomy(), staleTime: 5 * 60_000 });
  const team = useQuery({ queryKey: previewKey(scope, "team"), queryFn: () => services.skills.teamState(), staleTime: 60_000 });
  const preview = installed.data?.preview ?? true;
  const deps = { skills: services.skills, queryClient, scope, showToast };
  const act = (run: typeof installSkill) => (name: string) => {
    setBusy(name);
    void run(deps, name).finally(() => setBusy(null));
  };
  const rows = installed.data ? skillRows({ installed: installed.data.data, library: library.data?.data ?? null, filters, installedOnly }) : null;
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
        <p className="desk-settings__lede">{t("desk.skills_lede")}</p>
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
          taxonomy={taxonomy.data?.data ?? null}
          locale={locale}
          onFilters={setFilters}
          onInstalledOnly={setInstalledOnly}
        />
        {rows === null || (!installedOnly && library.isLoading) ? (
          installed.isError ? (
            <EmptyState title={t("desk.preview_error_title")} description={t("desk.settings_try_again")} />
          ) : (
            <Skeleton variant="text" lines={5} />
          )
        ) : (
          <SkillsView
            rows={rows}
            taxonomy={taxonomy.data?.data ?? null}
            locale={locale}
            filtered={Boolean(q?.trim() || tags.profession || tags.task || tags.language)}
            busy={busy}
            hrefFor={skillPath}
            onAdd={act(installSkill)}
            onRemove={act(removeSkill)}
          />
        )}
      </PreviewPage>
    </DeskShell>
  );
}
