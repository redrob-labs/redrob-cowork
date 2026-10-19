/** @jsxImportSource react */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Badge, Button, EmptyState, Textarea, icons } from "@redrob-labs/ui";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { MarkdownPreview } from "../../domains/session/artifacts/preview";
import { PreviewPage, PreviewState } from "../preview/preview-note";
import { previewKey, usePreviewServices } from "../preview/preview";
import { ScheduleDialog } from "../scheduled/schedule-dialog";
import type { SkillDetail, SkillTaxonomy } from "../services/types";
import { CoworkShell } from "../shell/cowork-shell";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import { OriginBadge, originLabel } from "./cowork-skills";
import { canEditSkill, canRemoveSkill, skillBrief, skillDisplayTitle, skillRunPrompt, skillShelf, tagLabels } from "./skills";
import { SHELF_LABEL } from "./skill-tile";
import { SkillIcon } from "./skill-icon";
import { useCoworkStartStore, type PendingCoworkChat } from "./start-chat";
import { installSkill, removeSkill } from "./use-skills";

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** Run a skill in a new Plan chat when a workspace is connected. */
export function runSkill(
  deps: { workspaceId: string | null; request: (chat: PendingCoworkChat) => void; navigate: (path: string) => void },
  name: string,
  extra = "",
): boolean {
  if (!deps.workspaceId) return false;
  deps.request({ workspaceId: deps.workspaceId, prompt: skillRunPrompt(name, extra), mode: "plan" });
  deps.navigate("/chat");
  return true;
}

export type EscapeToListState = {
  /** Whether a frame modal currently owns Escape. */
  modalOpen: boolean;
  /** Whether the schedule dialog currently owns Escape. */
  scheduling: boolean;
};

/** Pure guard for when Escape may return from a detail page to the marketplace. */
export function shouldEscapeToList(
  event: { key: string; defaultPrevented: boolean; targetTag?: string; contentEditable?: boolean },
  state: EscapeToListState,
): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || state.modalOpen || state.scheduling || event.contentEditable) return false;
  return !["INPUT", "TEXTAREA", "SELECT"].includes(event.targetTag ?? "");
}

export type SkillViewProps = {
  /** Detail payload rendered by the product page. */
  skill: SkillDetail;
  /** Taxonomy used to localize language metadata. */
  taxonomy: SkillTaxonomy | null;
  /** Current locale for catalogue title and summary. */
  locale: string;
  /** Optional instructions appended to the run prompt. */
  extra: string;
  /** Whether a connected workspace can run this skill. */
  canRun: boolean;
  /** Whether the add or remove request is active. */
  busy: boolean;
  /** Marketplace path preserved for Back and Escape. */
  backPath: string;
  /** Updates optional run instructions. */
  onExtra: (text: string) => void;
  /** Starts the skill in a Plan chat. */
  onRun: () => void;
  /** Installs a library skill. */
  onAdd: () => void;
};

/** Product-page presentation for one installed or library skill. */
export function SkillView({ skill, taxonomy, locale, extra, canRun, busy, backPath, onExtra, onRun, onAdd }: SkillViewProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const brief = skillBrief(skill, locale);
  const category = skillShelf({ name: skill.name, tags: skill.tags, installed: null });
  const tags = tagLabels(skill.tags, taxonomy, locale);
  const info = [
    { label: t("cowork.skill_info_source"), value: skill.installed ? originLabel(skill.installed.origin) : t("cowork.skill_not_added") },
    ...(category === "everyday" ? [] : [{ label: t("cowork.skill_info_category"), value: SHELF_LABEL[category]() }]),
    ...(tags.length ? [{ label: t("cowork.skill_info_language"), value: tags.at(-1) ?? "" }] : []),
    ...(skill.version ? [{ label: t("cowork.skill_info_version"), value: skill.version }] : []),
  ];
  const focusRun = () => document.getElementById("cowork-skill-run-extra")?.focus();

  return (
    <div className="cowork-skill-detail">
      <Link className="cowork-settings__action" to={backPath} state={{ fromSkill: skill.name }}>
        {icons.arrowLeft(ICON)}{t("cowork.skills_back_to_all")}
      </Link>
      <div className="cowork-skill-hero">
        <SkillIcon name={skill.name} size="hero" />
        <div className="cowork-skill-hero__content">
          <p className="cowork-skill-hero__brief">{brief}</p>
          <div className="cowork-skill-hero__meta">
            {skill.installed ? <OriginBadge origin={skill.installed.origin} /> : <Badge size="sm">{t("cowork.skill_not_added")}</Badge>}
            {category !== "everyday" && category !== "yours" ? <Badge size="sm" variant="outline">{SHELF_LABEL[category]()}</Badge> : null}
          </div>
          {skill.installed ? (
            <Button variant="primary" iconLeft={icons.play(ICON)} onClick={focusRun}>{t("cowork.skills_use")}</Button>
          ) : (
            <Button variant="primary" iconLeft={icons.plus(ICON)} loading={busy} onClick={onAdd}>{t("cowork.skill_add")}</Button>
          )}
        </div>
      </div>
      {skill.installed?.origin === "team" ? <p className="cowork-settings__description">{t("cowork.skill_team_note")}</p> : null}
      {skill.installed ? (
        <section className="cowork-settings__group">
          <Textarea id="cowork-skill-run-extra" label={t("cowork.skill_run_extra_label")} hint={t("cowork.skill_run_extra_hint")} rows={2} value={extra} onChange={(event) => onExtra(event.target.value)} />
          <div><Button variant="primary" iconLeft={icons.play(ICON)} disabled={!canRun} onClick={onRun}>{t("cowork.skill_run")}</Button></div>
        </section>
      ) : null}
      <section className="cowork-skill-about">
        <h2>{t("cowork.skill_detail_about")}</h2>
        <p className="cowork-skill-about__text" data-expanded={aboutOpen}>{skill.description}</p>
        {skill.description.length > 180 ? <Button size="sm" variant="ghost" aria-expanded={aboutOpen} onClick={() => setAboutOpen((value) => !value)}>{aboutOpen ? t("cowork.skill_less") : t("cowork.skill_more")}</Button> : null}
      </section>
      <section className="cowork-skill-info">
        <h2>{t("cowork.skill_detail_info")}</h2>
        <dl>
          {info.map((row) => <div key={row.label} className="cowork-skill-info__row"><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          <div className="cowork-skill-info__row"><dt>{t("cowork.skill_info_name")}</dt><dd><code>{skill.name}</code></dd></div>
        </dl>
      </section>
      <section className="cowork-skill-instructions">
        <Accordion>
          <AccordionItem value="instructions">
            <AccordionTrigger>{t("cowork.skill_instructions_show")}</AccordionTrigger>
            <AccordionContent><MarkdownPreview content={skill.body} className="h-auto p-0" /></AccordionContent>
          </AccordionItem>
        </Accordion>
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
  const modal = useFrameStore((state) => state.modal);
  const openModal = useFrameStore((state) => state.openModal);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const [extra, setExtra] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: [...previewKey(scope, "skills"), "one", name], queryFn: () => services.skills.get(name), staleTime: 30_000 });
  const taxonomy = useQuery({ queryKey: previewKey(scope, "taxonomy"), queryFn: () => services.skills.taxonomy(), staleTime: 5 * 60_000 });
  const skill = query.data?.data ?? null;
  const preview = query.data?.preview ?? true;
  const installed = skill?.installed ?? null;
  const locationState = location.state as { fromPath?: string } | null;
  const backPath = locationState?.fromPath ?? "/skills";
  const deps = { skills: services.skills, queryClient, scope, showToast };
  const act = async (run: typeof installSkill, then?: () => void) => {
    setBusy(true);
    const ok = await run(deps, name);
    setBusy(false);
    if (ok) then?.();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldEscapeToList({ key: event.key, defaultPrevented: event.defaultPrevented, targetTag: target?.tagName, contentEditable: Boolean(target?.isContentEditable || target?.closest("[contenteditable]")) }, { modalOpen: modal !== null, scheduling })) return;
      navigate(backPath, { state: { fromSkill: name } });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backPath, modal, name, navigate, scheduling]);

  const title = skill ? skillDisplayTitle(skill, locale) : name || t("cowork.nav_skills");

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
        <PreviewState query={query}>
          {(data) => data ? (
            <SkillView skill={data} taxonomy={taxonomy.data?.data ?? null} locale={locale} extra={extra} canRun={!preview && Boolean(workspaceId)} busy={busy} backPath={backPath} onExtra={setExtra} onRun={() => void runSkill({ workspaceId, request, navigate }, name, extra)} onAdd={() => void act(installSkill)} />
          ) : <EmptyState title={t("cowork.skill_not_found_title")} description={t("cowork.skill_not_found_text")} />}
        </PreviewState>
      </PreviewPage>
      {skill && scheduling ? <ScheduleDialog skill={name} real={!preview} onClose={() => setScheduling(false)} /> : null}
    </CoworkShell>
  );
}
