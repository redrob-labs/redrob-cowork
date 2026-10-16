/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, EmptyState, Textarea, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { MarkdownPreview } from "../../domains/session/artifacts/preview";
import { PreviewPage, PreviewState } from "../preview/preview-note";
import { previewKey, usePreviewServices } from "../preview/preview";
import { ScheduleDialog } from "../scheduled/schedule-dialog";
import type { SkillDetail, SkillTaxonomy } from "../services/types";
import { CoworkShell } from "../shell/cowork-shell";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import { OriginBadge } from "./cowork-skills";
import { canEditSkill, canRemoveSkill, skillRunPrompt, tagLabels } from "./skills";
import { useCoworkStartStore, type PendingCoworkChat } from "./start-chat";
import { installSkill, removeSkill } from "./use-skills";

const ICON = { width: 14, height: 14, "aria-hidden": true };

/**
 * Run: a new chat in Plan that asks for the skill by name, with anything the person added, so
 * they see the plan before anything happens. Without a project there is nowhere to run it.
 */
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

export type SkillViewProps = {
  skill: SkillDetail;
  taxonomy: SkillTaxonomy | null;
  locale: string;
  extra: string;
  /** False on sample data: there is no project to run in. */
  canRun: boolean;
  onExtra: (text: string) => void;
  onRun: () => void;
};

/** What the skill does, what it is filed under, Run with optional extra instructions, and the instructions. */
export function SkillView(props: SkillViewProps) {
  const { skill } = props;
  const tags = tagLabels(skill.tags, props.taxonomy, props.locale);
  return (
    <>
      <Link className="cowork-settings__action" to="/skills">
        {icons.arrowLeft(ICON)}
        {t("cowork.nav_skills")}
      </Link>
      <p className="cowork-settings__lede">{skill.description}</p>
      <p className="cowork-preview__meta">
        {skill.installed ? <OriginBadge origin={skill.installed.origin} /> : <Badge size="sm">{t("cowork.skill_not_added")}</Badge>}
        {tags.map((tag) => (
          <Badge key={tag} size="sm" variant="outline">
            {tag}
          </Badge>
        ))}
      </p>
      {skill.installed?.origin === "team" ? <p className="cowork-settings__description">{t("cowork.skill_team_note")}</p> : null}
      {skill.installed ? (
        <section className="cowork-settings__group">
          <Textarea
            id="cowork-skill-run-extra"
            label={t("cowork.skill_run_extra_label")}
            hint={t("cowork.skill_run_extra_hint")}
            rows={2}
            value={props.extra}
            onChange={(event) => props.onExtra(event.target.value)}
          />
          <div>
            <Button variant="primary" iconLeft={icons.play(ICON)} disabled={!props.canRun} onClick={props.onRun}>
              {t("cowork.skill_run")}
            </Button>
          </div>
        </section>
      ) : null}
      <section className="cowork-settings__group" aria-label={t("cowork.skill_instructions_label")}>
        <MarkdownPreview content={skill.body} className="h-auto p-0" />
      </section>
    </>
  );
}

/** `/skill/:name`: one skill, with Run, Schedule, and what the person may change about it. */
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
  const [extra, setExtra] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: [...previewKey(scope, "skills"), "one", name], queryFn: () => services.skills.get(name), staleTime: 30_000 });
  const taxonomy = useQuery({ queryKey: previewKey(scope, "taxonomy"), queryFn: () => services.skills.taxonomy(), staleTime: 5 * 60_000 });
  const skill = query.data?.data ?? null;
  const preview = query.data?.preview ?? true;
  const installed = skill?.installed ?? null;
  const deps = { skills: services.skills, queryClient, scope, showToast };
  const act = async (run: typeof installSkill, then?: () => void) => {
    setBusy(true);
    const ok = await run(deps, name);
    setBusy(false);
    if (ok) then?.();
  };

  return (
    <CoworkShell
      current="skills"
      title={name || t("cowork.nav_skills")}
      actions={
        skill ? (
          <>
            {installed && canEditSkill(installed) ? (
              <Button size="sm" variant="ghost" iconLeft={icons.edit(ICON)} onClick={() => openModal({ kind: "skill", name })}>
                {t("cowork.skill_edit")}
              </Button>
            ) : null}
            {installed && canRemoveSkill(installed) ? (
              <Button size="sm" variant="ghost" iconLeft={icons.trash(ICON)} loading={busy} onClick={() => void act(removeSkill, () => navigate("/skills"))}>
                {installed.origin === "mine" ? t("cowork.skill_delete") : t("cowork.skill_remove")}
              </Button>
            ) : null}
            {installed ? (
              <Button size="sm" variant="secondary" iconLeft={icons.calendarClock(ICON)} onClick={() => setScheduling(true)}>
                {t("cowork.preview_schedule")}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" iconLeft={icons.plus(ICON)} loading={busy} onClick={() => void act(installSkill)}>
                {t("cowork.skill_add")}
              </Button>
            )}
          </>
        ) : null
      }
    >
      <PreviewPage note={t("cowork.skills_preview_note")} preview={preview}>
        <PreviewState query={query}>
          {(data) =>
            data ? (
              <SkillView
                skill={data}
                taxonomy={taxonomy.data?.data ?? null}
                locale={locale}
                extra={extra}
                canRun={!preview && Boolean(workspaceId)}
                onExtra={setExtra}
                onRun={() => void runSkill({ workspaceId, request, navigate }, name, extra)}
              />
            ) : (
              <EmptyState title={t("cowork.skill_not_found_title")} description={t("cowork.skill_not_found_text")} />
            )
          }
        </PreviewState>
      </PreviewPage>
      {skill && scheduling ? <ScheduleDialog skill={name} real={!preview} onClose={() => setScheduling(false)} /> : null}
    </CoworkShell>
  );
}
