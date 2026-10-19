/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, EmptyState, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { PreviewPage, PreviewState } from "../preview/preview-note";
import { previewKey, usePreviewServices } from "../preview/preview";
import { ScheduleDialog } from "../scheduled/schedule-dialog";
import type { CoworkResult, CoworkSkill, SkillDetail, SkillTaxonomy } from "../services/types";
import { CoworkShell } from "../shell/cowork-shell";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import { CATALOGUE_CACHE_MS, consoleCatalogue } from "./console-catalogue";
import { canEditSkill, canRemoveSkill, languageTagLabel, runSkill, seedSkillDetail, skillBrief, skillDisplayTitle, skillShelf, tagLabels } from "./skills";
import { HeroSkeleton, OriginBadge, SHELF_LABEL, originLabel } from "./skill-tile";
import { SkillIcon } from "./skill-icon";
import { useCoworkStartStore } from "./start-chat";
import { useBackToList } from "./use-back-to-list";
import { installSkill, removeSkill } from "./use-skills";

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** Inputs of the skill product page. */
export type SkillViewProps = {
  /** Detail payload rendered by the product page. */
  skill: SkillDetail;
  /** Taxonomy used to localize language metadata. */
  taxonomy: SkillTaxonomy | null;
  /** Current locale for catalogue title and summary. */
  locale: string;
  /** Whether a connected workspace can run this skill. */
  canRun: boolean;
  /** Whether the add or remove request is active. */
  busy: boolean;
  /** Marketplace path preserved for Back and Escape. */
  backPath: string;
  /** Returns to the marketplace without adding a duplicate history entry. */
  onBack: () => void;
  /** Starts the skill in a Plan chat. */
  onRun: () => void;
  /** Installs a library skill. */
  onAdd: () => void;
};

/** Product-page presentation for one installed or library skill. */
export function SkillView({ skill, taxonomy, locale, canRun, busy, backPath, onBack, onRun, onAdd }: SkillViewProps) {
  const brief = skillBrief(skill, locale);
  const category = skillShelf({ name: skill.name, tags: skill.tags, installed: null });
  // Profession and task only; the language has its own Information row.
  const topicTags = tagLabels({ profession: skill.tags.profession, task: skill.tags.task }, taxonomy, locale);
  const language = languageTagLabel(skill.tags, taxonomy, locale);
  const info = [
    { label: t("cowork.skill_info_source"), value: skill.installed ? originLabel(skill.installed.origin) : t("cowork.skill_not_added") },
    ...(category === "everyday" ? [] : [{ label: t("cowork.skill_info_category"), value: SHELF_LABEL[category]() }]),
    ...(language ? [{ label: t("cowork.skill_info_language"), value: language }] : []),
    ...(skill.version ? [{ label: t("cowork.skill_info_version"), value: skill.version }] : []),
  ];

  return (
    <div className="cowork-skill-detail">
      <Link className="cowork-settings__action" to={backPath} state={{ fromSkill: skill.name }} onClick={(event) => { event.preventDefault(); onBack(); }}>
        {icons.arrowLeft(ICON)}{t("cowork.skills_back_to_all")}
      </Link>
      <div className="cowork-skill-hero">
        <SkillIcon name={skill.name} size="hero" />
        <div className="cowork-skill-hero__content">
          <p className="cowork-skill-hero__brief">{brief}</p>
          <div className="cowork-skill-hero__meta">
            {skill.installed ? <OriginBadge origin={skill.installed.origin} /> : <Badge size="sm">{t("cowork.skill_not_added")}</Badge>}
            {category !== "everyday" && category !== "yours" ? <Badge size="sm" variant="outline">{SHELF_LABEL[category]()}</Badge> : null}
            {topicTags.map((label) => <Badge key={label} size="sm" variant="outline">{label}</Badge>)}
          </div>
          {skill.installed ? (
            <Button variant="primary" iconLeft={icons.play(ICON)} disabled={!canRun} onClick={onRun}>{t("cowork.skills_use")}</Button>
          ) : (
            <Button variant="primary" iconLeft={icons.plus(ICON)} loading={busy} onClick={onAdd}>{t("cowork.skill_add")}</Button>
          )}
        </div>
      </div>
      {skill.installed?.origin === "team" ? <p className="cowork-settings__description">{t("cowork.skill_team_note")}</p> : null}
      <section className="cowork-skill-about">
        <h2>{t("cowork.skill_detail_about")}</h2>
        <p className="cowork-skill-about__text">{skill.description}</p>
      </section>
      <section className="cowork-skill-info">
        <h2>{t("cowork.skill_detail_info")}</h2>
        <dl>
          {info.map((row) => <div key={row.label} className="cowork-skill-info__row"><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          <div className="cowork-skill-info__row"><dt>{t("cowork.skill_info_name")}</dt><dd><code>{skill.name}</code></dd></div>
        </dl>
      </section>
    </div>
  );
}

/** `/skill/:name`: one skill with marketplace navigation and existing management actions. */
export function SkillScreen() {
  const { name = "" } = useParams<{ name: string }>();
  const { services, scope } = usePreviewServices();
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const request = useCoworkStartStore((state) => state.request);
  const openModal = useFrameStore((state) => state.openModal);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  // Paint the real page at once from the catalogue and the cached installed list; the server
  // answer replaces it when it lands.
  const query = useQuery({
    queryKey: [...previewKey(scope, "skills"), "one", name],
    queryFn: () => services.skills.get(name),
    staleTime: 30_000,
    gcTime: CATALOGUE_CACHE_MS,
    placeholderData: (): CoworkResult<SkillDetail | null> | undefined => {
      const cached = queryClient.getQueryData<CoworkResult<CoworkSkill[]>>(previewKey(scope, "skills"));
      const seed = seedSkillDetail(name, consoleCatalogue.peek(name), cached?.data ?? null);
      return seed && cached ? { data: seed, preview: cached.preview } : undefined;
    },
  });
  const taxonomy = useQuery({ queryKey: previewKey(scope, "taxonomy"), queryFn: () => services.skills.taxonomy(), staleTime: 5 * 60_000 });
  const skill = query.data?.data ?? null;
  // "Is a project connected" comes from the installed list, the same signal the Skills page uses, so the note does not appear on one page and vanish on the next (a library skill's own
  // detail is real catalogue data even without a project). Undefined until it resolves.
  const installedList = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000, gcTime: CATALOGUE_CACHE_MS });
  const preview = installedList.data?.preview;
  const installed = skill?.installed ?? null;
  const { backPath, back: returnToList } = useBackToList({ restoreKey: "fromSkill", restoreValue: name, blocked: scheduling });
  const deps = { skills: services.skills, queryClient, scope, showToast };
  const act = async (run: typeof installSkill, then?: () => void) => {
    setBusy(true);
    const ok = await run(deps, name);
    setBusy(false);
    if (ok) then?.();
  };

  // No raw slug in the header while the page is still loading.
  const title = skill ? skillDisplayTitle(skill, locale) : query.isLoading ? "" : t("cowork.nav_skills");
  const real = preview === false;

  return (
    <CoworkShell
      current="skills"
      title={title}
      actions={skill && installed ? (
        <>
          {canEditSkill(installed) ? <Button size="sm" variant="ghost" iconLeft={icons.edit(ICON)} onClick={() => openModal({ kind: "skill", name })}>{t("cowork.skill_edit")}</Button> : null}
          {canRemoveSkill(installed) ? <Button size="sm" variant="ghost" iconLeft={icons.trash(ICON)} loading={busy} onClick={() => void act(removeSkill, () => navigate(backPath, { state: { fromSkill: name } }))}>{installed.origin === "mine" ? t("cowork.skill_delete") : t("cowork.skill_remove")}</Button> : null}
          <Button size="sm" variant="secondary" iconLeft={icons.calendarClock(ICON)} onClick={() => setScheduling(true)}>{t("cowork.preview_schedule")}</Button>
        </>
      ) : null}
    >
      <PreviewPage note={t("cowork.skills_preview_note")} preview={preview}>
        <PreviewState query={query} loading={<HeroSkeleton art="circle" />}>
          {(data) => data ? (
            <SkillView skill={data} taxonomy={taxonomy.data?.data ?? null} locale={locale} canRun={real && Boolean(workspaceId)} busy={busy} backPath={backPath} onBack={returnToList} onRun={() => void runSkill({ workspaceId, request, navigate }, name)} onAdd={() => void act(installSkill)} />
          ) : <EmptyState title={t("cowork.skill_not_found_title")} description={t("cowork.skill_not_found_text")} />}
        </PreviewState>
      </PreviewPage>
      {skill && scheduling ? <ScheduleDialog skill={name} real={real} onClose={() => setScheduling(false)} /> : null}
    </CoworkShell>
  );
}

