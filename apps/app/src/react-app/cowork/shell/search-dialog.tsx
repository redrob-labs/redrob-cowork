/** @jsxImportSource react */
import { useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { icons } from "@redrob-labs/ui";

import { currentLocale, t } from "../../../i18n";
import { previewKey } from "../preview/preview";
import { createCoworkServices } from "../services/real-services";
import type { Chat, CoworkFile, Project, CoworkSkill, Schedule } from "../services/types";
import { CATALOGUE_CACHE_MS } from "../skills/console-catalogue";
import { skillDisplayTitle, skillPath, skillRows, type SkillRow } from "../skills/skills";
import { availableWorkflows, workflowPath, workflowSearchText, workflowTitle, type WorkflowId } from "../skills/workflows";
import { CoworkDialog } from "./cowork-dialog";
import { useCoworkConnection } from "./cowork-connection";
import { chatPath } from "./cowork-routes";

const RESULT_LIMIT = 8;

/** The search scopes, in the order the tab strip shows them. "all" is places + chats. */
export const SEARCH_TABS = ["all", "chats", "artifacts", "skills", "projects", "scheduled"] as const;
/** One of the search scopes above. */
export type SearchTab = (typeof SEARCH_TABS)[number];

/** Literal i18n key per scope, so the audit sees a static t() call (no runtime template key). */
const SEARCH_TAB_LABEL_KEYS: Record<SearchTab, string> = {
  all: "titlebar.search_tab_all",
  chats: "titlebar.search_tab_chats",
  artifacts: "titlebar.search_tab_artifacts",
  skills: "titlebar.search_tab_skills",
  projects: "titlebar.search_tab_projects",
  scheduled: "titlebar.search_tab_scheduled",
};

/** The localized tab label for a scope. */
export function searchTabLabel(tab: SearchTab): string {
  return t(SEARCH_TAB_LABEL_KEYS[tab]);
}

/** One search hit: its id, display label, optional meta line, and the route it opens. `terms` is extra matchable text. */
export type SearchResult = { id: string; label: string; meta?: string; path: string; terms?: string };

/** Everything the per-type tabs can draw on. All lists arrive newest/natural order; the
 *  functions below sort and filter. Empty arrays are fine - the tab then shows its empty line. */
export type SearchData = {
  chats: readonly Chat[];
  projects: readonly Project[];
  skills: readonly CoworkSkill[];
  schedules: readonly Schedule[];
  artifacts: readonly CoworkFile[];
  /** Installed skills plus the whole public catalogue (all of it, not only what is added). */
  catalogue?: readonly SkillRow[];
  /** The featured workflows available in that catalogue. */
  workflows?: ReadonlyArray<{ id: WorkflowId; rows: SkillRow[] }>;
};

/** The Skills tab's limit: wider than the others so the catalogue can be browsed from Search. */
const SKILL_RESULT_LIMIT = 24;

/**
 * Every skill (installed or in the catalogue) and every featured workflow as a search hit.
 * A skill opens its own page; a workflow opens its workflow page. Titles,
 * Korean titles, summaries and the stable name all match.
 */
export function skillSearchResults(data: SearchData, locale: string = currentLocale()): SearchResult[] {
  const workflows = (data.workflows ?? []).map((workflow): SearchResult => ({
    id: `workflow-${workflow.id}`,
    label: workflowTitle(workflow.id),
    meta: t("cowork.skills_workflow_eyebrow"),
    path: workflowPath(workflow.id),
    terms: workflowSearchText(workflow.id, workflow.rows, locale),
  }));
  const rows: ReadonlyArray<Pick<SkillRow, "name" | "title" | "titleKo" | "summary" | "summaryKo">> = data.catalogue ?? data.skills;
  const skills = rows.map((skill): SearchResult => ({
    id: `skill-${skill.name}`,
    label: skillDisplayTitle(skill, locale),
    meta: t("cowork.nav_skills"),
    path: skillPath(skill.name),
    terms: [skill.name, skill.title, skill.titleKo, skill.summary, skill.summaryKo].filter(Boolean).join(" "),
  }));
  return [...workflows, ...skills];
}

/** The places Search can jump to, before any chat. */
function places(): SearchResult[] {
  return [
    { id: "new-chat", label: t("cowork.nav_new_chat"), path: chatPath() },
    { id: "projects", label: t("cowork.nav_projects"), path: "/projects" },
    { id: "skills", label: t("cowork.nav_skills"), path: "/skills" },
    { id: "scheduled", label: t("cowork.nav_scheduled"), path: "/scheduled" },
    { id: "history", label: t("cowork.nav_history"), path: "/history" },
    { id: "settings", label: t("titlebar.settings"), path: "/settings" },
  ];
}

function matches(query: string, label: string, terms = ""): boolean {
  const q = query.trim().toLocaleLowerCase();
  return label.toLocaleLowerCase().includes(q) || terms.toLocaleLowerCase().includes(q);
}

/** The "All" tab: places by name, then chats by title, newest first. Kept as a stable
 *  exported helper (its unit test and callers rely on this exact shape). With a query,
 *  `more` (workflows and skills) follows the chats, so a skill is findable from All too. */
export function searchResults(query: string, chats: readonly Chat[], more: readonly SearchResult[] = []): SearchResult[] {
  const q = query.trim().toLowerCase();
  const chatResults = [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chat): SearchResult => ({
      id: `chat-${chat.id}`,
      label: chat.title.trim() || t("cowork.untitled_chat"),
      meta: t("titlebar.search_chat"),
      path: chatPath(chat.id),
    }));
  if (!q) return [...places(), ...chatResults].slice(0, RESULT_LIMIT);
  return [...places(), ...chatResults, ...more].filter((result) => matches(q, result.label, result.terms)).slice(0, RESULT_LIMIT);
}

/** Results for one tab. "all" delegates to searchResults; the rest list that one type,
 *  filtered by the query, newest/natural first, capped at RESULT_LIMIT. */
export function searchResultsForTab(tab: SearchTab, query: string, data: SearchData): SearchResult[] {
  if (tab === "all") return searchResults(query, data.chats, skillSearchResults(data));
  const q = query.trim();
  const out: SearchResult[] =
    tab === "chats"
      ? [...data.chats]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((chat) => ({ id: `chat-${chat.id}`, label: chat.title.trim() || t("cowork.untitled_chat"), meta: t("titlebar.search_chat"), path: chatPath(chat.id) }))
      : tab === "projects"
        ? data.projects.map((project) => ({ id: `project-${project.id}`, label: project.name, meta: t("cowork.nav_projects"), path: "/projects" }))
        : tab === "skills"
          ? skillSearchResults(data)
          : tab === "scheduled"
            ? data.schedules.map((schedule) => ({ id: `schedule-${schedule.id}`, label: schedule.name, meta: t("cowork.nav_scheduled"), path: "/scheduled" }))
            : // artifacts
              data.artifacts.map((file) => ({ id: `artifact-${file.id}`, label: file.name, meta: file.projectName, path: "/history" }));
  return (q ? out.filter((result) => matches(q, result.label, result.terms)) : out).slice(0, tab === "skills" ? SKILL_RESULT_LIMIT : RESULT_LIMIT);
}

/** Literal i18n key per scope for the empty-state line, so the audit sees a static t() call. */
const SEARCH_EMPTY_LABEL_KEYS: Record<SearchTab, string> = {
  all: "titlebar.search_empty_all",
  chats: "titlebar.search_empty_chats",
  artifacts: "titlebar.search_empty_artifacts",
  skills: "titlebar.search_empty_skills",
  projects: "titlebar.search_empty_projects",
  scheduled: "titlebar.search_empty_scheduled",
};

/** The empty-state line for a tab when it has no (matching) items. */
function emptyLabel(tab: SearchTab): string {
  return t(SEARCH_EMPTY_LABEL_KEYS[tab]);
}

/**
 * Search from the title bar or Ctrl+K on Cowork screens: a scoped tab strip over places and
 * chats, projects, skills, schedules and artifacts. The developer and settings screens keep
 * their own command palette, which the title bar opens instead.
 */
export function SearchDialog(props: { onClose: () => void }) {
  const navigate = useNavigate();
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const chatsVersion = useCoworkConnection((state) => state.chatsVersion);
  const services = useMemo(() => createCoworkServices({ client, workspaceId }), [client, workspaceId]);

  // Sample data would read as the person's own, so a preview lists none for every type.
  const unwrap = <T,>(result: { data: T; preview: boolean } | undefined, empty: T): T =>
    !result || result.preview ? empty : result.data;

  const base = ["cowork-search", workspaceId ?? "preview", chatsVersion] as const;
  const chats = useQuery({ queryKey: [...base, "chats"], queryFn: () => services.chats.list(), staleTime: 30_000 });
  const projects = useQuery({ queryKey: [...base, "projects"], queryFn: () => services.projects.list(), staleTime: 30_000 });
  const skills = useQuery({ queryKey: [...base, "skills"], queryFn: () => services.skills.list(), staleTime: 30_000 });
  const schedules = useQuery({ queryKey: [...base, "schedules"], queryFn: () => services.schedules.list(), staleTime: 30_000 });
  const files = useQuery({ queryKey: [...base, "files"], queryFn: () => services.files.list(), staleTime: 30_000 });
  // The public catalogue is real data even without a project; shared with the Skills page's cache.
  const library = useQuery({ queryKey: previewKey(workspaceId ?? "preview", "library"), queryFn: () => services.skills.library(), staleTime: 5 * 60_000, gcTime: CATALOGUE_CACHE_MS, retry: false });

  const installedSkills = useMemo(() => unwrap(skills.data, [] as CoworkSkill[]), [skills.data]);
  // Catalogue rows and the workflows built from them change only with the data, not per keystroke.
  const { catalogue, workflows } = useMemo(() => {
    const rows = skillRows({ installed: installedSkills, library: library.data?.data ?? null });
    return { catalogue: rows, workflows: availableWorkflows(rows) };
  }, [installedSkills, library.data]);
  const data: SearchData = {
    chats: unwrap(chats.data, [] as Chat[]),
    projects: unwrap(projects.data, [] as Project[]),
    skills: installedSkills,
    schedules: unwrap(schedules.data?.data ? { data: schedules.data.data.schedules, preview: schedules.data.preview } : undefined, [] as Schedule[]),
    artifacts: unwrap(files.data, [] as CoworkFile[]),
    catalogue,
    workflows,
  };

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [active, setActive] = useState(0);
  const results = searchResultsForTab(tab, query, data);

  const go = (result: SearchResult | undefined) => {
    if (!result) return;
    props.onClose();
    navigate(result.path);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (results.length ? (index + step + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  };
  const pickTab = (next: SearchTab) => {
    setTab(next);
    setActive(0);
  };

  return (
    <CoworkDialog open title={t("titlebar.search")} onClose={props.onClose} width={560}>
      <div className="cowork-search">
        <label className="cowork-search__field">
          {icons.search({ width: 16, height: 16, "aria-hidden": true })}
          <input
            className="cowork-search__input"
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls="cowork-search-results"
            aria-activedescendant={results[active] ? `cowork-search-${results[active].id}` : undefined}
            aria-label={t("titlebar.search_placeholder")}
            placeholder={t("titlebar.search_placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </label>
        <div className="cowork-search__tabs" role="tablist" aria-label={t("titlebar.search")}>
          {SEARCH_TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className="cowork-search__tab"
              onClick={() => pickTab(name)}
            >
              {searchTabLabel(name)}
            </button>
          ))}
        </div>
        <ul id="cowork-search-results" role="listbox" className="cowork-search__results" aria-label={t("titlebar.search")}>
          {results.map((result, index) => (
            <li
              key={result.id}
              id={`cowork-search-${result.id}`}
              role="option"
              aria-selected={index === active}
              className="cowork-search__result"
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                go(result);
              }}
            >
              <span>{result.label}</span>
              {result.meta ? <span className="cowork-search__meta">{result.meta}</span> : null}
            </li>
          ))}
          {results.length === 0 ? <li className="cowork-search__empty">{emptyLabel(tab)}</li> : null}
        </ul>
      </div>
    </CoworkDialog>
  );
}
