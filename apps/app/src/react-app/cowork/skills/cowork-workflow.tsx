/** @jsxImportSource react */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { Button, EmptyState, Skeleton, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { PreviewPage } from "../preview/preview-note";
import { CoworkShell } from "../shell/cowork-shell";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import { runSkill, shouldEscapeToList } from "./cowork-skill";
import { skillBrief, skillDisplayTitle, skillPath, type SkillRow } from "./skills";
import { SkillIcon } from "./skill-icon";
import { useCoworkStartStore } from "./start-chat";
import { useMarketplaceRows } from "./use-marketplace";
import { installSkill, installSkills } from "./use-skills";
import { WorkflowMosaic } from "./workflow-card";
import { isWorkflowId, jurisdictionLabel, missingSkills, workflowGroups, workflowPath, workflowRows, workflowSub, workflowTitle, type WorkflowId } from "./workflows";

const ICON = { width: 14, height: 14, "aria-hidden": true };

export type WorkflowViewProps = {
  id: WorkflowId;
  /** The workflow's available rows, curated order. */
  rows: readonly SkillRow[];
  locale: string;
  /** Whether this workspace can add library skills. */
  canAdd: boolean;
  /** Skill currently being added on its own. */
  busy: string | null;
  /** Whether "Add all" is running. */
  addingAll: boolean;
  /** Back target; the Skills page by default. */
  backPath: string;
  onBack: () => void;
  onAdd: (name: string) => void;
  onAddAll: (names: string[]) => void;
  /** Starts an installed skill when a workspace is connected. */
  onUse?: (name: string) => void;
};

/** Pure presentation of one workflow: the cover hero, then its skills grouped by country. */
export function WorkflowView({ id, rows, locale, canAdd, busy, addingAll, backPath, onBack, onAdd, onAddAll, onUse }: WorkflowViewProps) {
  const groups = workflowGroups(rows, locale);
  const missing = missingSkills(rows, locale);
  const all = missing.length === rows.length;
  const from = workflowPath(id);
  return (
    <div className="cowork-skill-detail cowork-workflow">
      <Link className="cowork-settings__action" to={backPath} onClick={(event) => { event.preventDefault(); onBack(); }}>
        {icons.arrowLeft(ICON)}{t("cowork.skills_back_to_all")}
      </Link>
      <div className="cowork-skill-hero">
        <span className="cowork-workflow-hero__card">
          <WorkflowMosaic rows={rows} locale={locale} size="hero" />
        </span>
        <div className="cowork-skill-hero__content">
          <p className="cowork-workflow-hero__eyebrow">{t("cowork.skills_workflow_eyebrow")}</p>
          <p className="cowork-skill-hero__brief">{workflowSub(id)}</p>
          <p className="cowork-workflow-hero__count">{t("cowork.skills_workflow_count", { count: rows.length })}</p>
          {missing.length ? (
            <Button variant="primary" iconLeft={icons.plus(ICON)} loading={addingAll} disabled={!canAdd} onClick={() => onAddAll(missing)}>
              {all ? t("cowork.skills_workflow_add_all", { count: missing.length }) : t("cowork.skills_workflow_add_rest", { count: missing.length })}
            </Button>
          ) : null}
        </div>
      </div>
      {groups.map((group) => (
        <section key={group.jurisdiction ?? "general"} className="cowork-workflow__group" aria-label={group.jurisdiction ? jurisdictionLabel(group.jurisdiction) : workflowTitle(id)}>
          {group.jurisdiction && groups.length > 1 ? <h2>{jurisdictionLabel(group.jurisdiction)}</h2> : null}
          <ul className="cowork-workflow__list" role="list">
            {group.rows.map((row) => {
              const title = skillDisplayTitle(row, locale);
              const briefId = `workflow-skill-brief-${row.name}`;
              return (
                <li key={row.name} className="cowork-workflow__row" data-skill={row.name}>
                  <Link className="cowork-workflow__link" to={skillPath(row.name)} state={{ fromSkill: row.name, fromPath: from }} aria-describedby={briefId}>
                    <SkillIcon name={row.name} size="row" />
                    <span className="cowork-workflow__text">
                      <span className="cowork-workflow__title">{title}</span>
                      <span id={briefId} className="cowork-workflow__brief">{skillBrief(row, locale)}</span>
                    </span>
                  </Link>
                  {row.installed === null ? (
                    <Button size="sm" variant="secondary" iconLeft={icons.plus(ICON)} loading={busy === row.name} disabled={!canAdd || addingAll} aria-label={t("cowork.skill_add_label", { name: title })} onClick={() => onAdd(row.name)}>
                      {t("cowork.skill_add")}
                    </Button>
                  ) : onUse ? (
                    <Button size="sm" variant="secondary" iconLeft={icons.play(ICON)} aria-label={t("cowork.skills_use_label", { name: title })} onClick={() => onUse(row.name)}>
                      {t("cowork.skills_use")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function WorkflowSkeleton() {
  return (
    <div className="cowork-skill-detail" aria-busy="true">
      <span className="sr-only">{t("cowork.skills_loading_label")}</span>
      <div className="cowork-skill-hero">
        <Skeleton variant="rect" width={128} height={128} />
        <div className="cowork-skill-hero__content">
          <Skeleton variant="text" width={320} />
          <Skeleton variant="text" width={120} />
          <Skeleton variant="rect" width={120} height={32} />
        </div>
      </div>
      <Skeleton variant="text" lines={4} />
    </div>
  );
}

/** `/skills/workflow/:id`: one featured workflow and the skills it is made of. */
export function WorkflowScreen() {
  const { id = "" } = useParams<{ id: string }>();
  return isWorkflowId(id) ? <WorkflowScreenFor id={id} /> : <Navigate to="/skills" replace />;
}

function WorkflowScreenFor({ id }: { id: WorkflowId }) {
  const { services, scope, rows, preview } = useMarketplaceRows();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const modal = useFrameStore((state) => state.modal);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const request = useCoworkStartStore((state) => state.request);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const locationState = location.state as { fromPath?: string } | null;
  const backPath = locationState?.fromPath ?? "/skills";
  const back = useCallback(() => {
    if (locationState?.fromPath) navigate(-1);
    else navigate(backPath, { replace: true, state: { fromWorkflow: id } });
  }, [backPath, id, locationState?.fromPath, navigate]);
  const deps = { skills: services.skills, queryClient, scope, showToast };
  const real = preview === false;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldEscapeToList({ key: event.key, defaultPrevented: event.defaultPrevented, targetTag: target?.tagName, contentEditable: Boolean(target?.isContentEditable || target?.closest("[contenteditable]")) }, { modalOpen: modal !== null, scheduling: false })) return;
      back();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back, modal]);

  const members = rows ? workflowRows(id, rows) : null;
  const canUse = real && Boolean(workspaceId);

  return (
    <CoworkShell current="skills" title={workflowTitle(id)}>
      <PreviewPage note={t("cowork.skills_preview_note")} preview={preview}>
        {members === null ? <WorkflowSkeleton /> : members.length === 0 ? (
          <EmptyState title={t("cowork.skills_library_offline_title")} description={t("cowork.skills_library_offline_text")} />
        ) : (
          <WorkflowView
            id={id}
            rows={members}
            locale={locale}
            canAdd={real}
            busy={busy}
            addingAll={addingAll}
            backPath={backPath}
            onBack={back}
            onAdd={(name) => {
              setBusy(name);
              void installSkill(deps, name).finally(() => setBusy(null));
            }}
            onAddAll={(names) => {
              setAddingAll(true);
              void installSkills(deps, names).finally(() => setAddingAll(false));
            }}
            {...(canUse ? { onUse: (name: string) => void runSkill({ workspaceId, request, navigate }, name) } : {})}
          />
        )}
      </PreviewPage>
    </CoworkShell>
  );
}
