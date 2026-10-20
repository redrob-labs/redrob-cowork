/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Button, EmptyState, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { PreviewPage } from "../preview/preview-note";
import { CoworkShell } from "../shell/cowork-shell";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import { runSkill, skillBrief, skillDisplayTitle, skillPath, type SkillRow } from "./skills";
import { SkillIcon } from "./skill-icon";
import { HeroSkeleton } from "./skill-tile";
import { useBackToList } from "./use-back-to-list";
import { useCoworkStartStore } from "./start-chat";
import { useMarketplaceRows } from "./use-marketplace";
import { installSkills, usePendingAdds } from "./use-skills";
import { WorkflowMosaic } from "./workflow-card";
import { findWorkflow, missingSkills, workflowGroups, workflowPath, workflowStepLabel, workflowTitle, type Workflow } from "./workflows";

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** Inputs of the workflow page. */
export type WorkflowViewProps = {
  /** The catalogue family this page shows, its skills in run order. */
  workflow: Workflow;
  /** Current locale for titles and summaries. */
  locale: string;
  /** Whether this workspace can add library skills. */
  canAdd: boolean;
  /** Skills with a single add request in flight. */
  pending: ReadonlySet<string>;
  /** Whether "Add all" is running. */
  addingAll: boolean;
  /** Back target; the Skills page by default. */
  backPath: string;
  /** Returns to the list without adding a duplicate history entry. */
  onBack: () => void;
  /** Adds one library skill by name. */
  onAdd: (name: string) => void;
  /** Adds every listed skill that is not installed yet. */
  onAddAll: (names: string[]) => void;
  /** Starts an installed skill when a workspace is connected. */
  onUse?: (name: string) => void;
};

/** Pure presentation of one workflow: the cover hero, then its skills grouped by step. */
export function WorkflowView({ workflow, locale, canAdd, pending, addingAll, backPath, onBack, onAdd, onAddAll, onUse }: WorkflowViewProps) {
  const { rows } = workflow;
  const groups = workflowGroups(rows);
  const missing = missingSkills(rows);
  const all = missing.length === rows.length;
  const from = workflowPath(workflow.id);
  const title = workflowTitle(workflow, locale);
  // Step headings only when the order carries information: more than one step, all numbered.
  const stepped = groups.length > 1 && groups.every((group) => group.step !== null);
  return (
    <div className="cowork-skill-detail">
      <Link className="cowork-settings__action" to={backPath} onClick={(event) => { event.preventDefault(); onBack(); }}>
        {icons.arrowLeft(ICON)}{t("cowork.skills_back_to_all")}
      </Link>
      <div className="cowork-skill-hero">
        <span className="cowork-workflow-hero__card">
          <WorkflowMosaic rows={rows} size="hero" />
        </span>
        <div className="cowork-skill-hero__content">
          <p className="cowork-workflow-hero__eyebrow">{t("cowork.skills_workflow_eyebrow")}</p>
          <p className="cowork-workflow-hero__count">{t("cowork.skills_workflow_count", { count: rows.length })}</p>
          {missing.length ? (
            <Button variant="primary" iconLeft={icons.plus(ICON)} loading={addingAll} disabled={!canAdd || pending.size > 0} onClick={() => onAddAll(missing)}>
              {all ? t("cowork.skills_workflow_add_all", { count: missing.length }) : t("cowork.skills_workflow_add_rest", { count: missing.length })}
            </Button>
          ) : null}
        </div>
      </div>
      {groups.map((group) => (
        <section key={group.step ?? "general"} className="cowork-workflow__group" aria-label={stepped && group.step !== null ? workflowStepLabel(group.step) : title}>
          {stepped && group.step !== null ? <h2>{workflowStepLabel(group.step)}</h2> : null}
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
                    <Button size="sm" variant="secondary" iconLeft={icons.plus(ICON)} loading={pending.has(row.name)} disabled={!canAdd || addingAll} aria-label={t("cowork.skill_add_label", { name: title })} onClick={() => onAdd(row.name)}>
                      {t("cowork.skill_add")}
                    </Button>
                  ) : onUse ? (
                    <Button size="sm" variant="secondary" iconLeft={icons.sparkle(ICON)} aria-label={t("cowork.skills_use_label", { name: title })} onClick={() => onUse(row.name)}>
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

/** `/skills/workflow/:id`: one catalogue family and the skills it is made of. */
export function WorkflowScreen() {
  const { id = "" } = useParams<{ id: string }>();
  return <WorkflowScreenFor id={id} />;
}

/** The workflow page for a route id; reads the shared marketplace rows. */
function WorkflowScreenFor({ id }: { id: string }) {
  const { services, scope, rows, library, preview } = useMarketplaceRows();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const request = useCoworkStartStore((state) => state.request);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const navigate = useNavigate();
  const [addingAll, setAddingAll] = useState(false);
  const deps = { skills: services.skills, queryClient, scope, showToast };
  const { pending, add } = usePendingAdds(deps);
  // A running add owns the page: Escape must not leave it while installs continue unseen.
  const { backPath, back } = useBackToList({ restoreKey: "fromWorkflow", restoreValue: id, blocked: addingAll || pending.size > 0 });

  const workflow = rows ? findWorkflow(id, rows, locale) : null;
  const canUse = preview === false && Boolean(workspaceId);
  // A family the loaded catalogue does not have is not a page; an offline catalogue says so instead.
  if (rows && !workflow && !library.isError) return <Navigate to="/skills" replace />;

  return (
    <CoworkShell current="skills" title={workflow ? workflowTitle(workflow, locale) : t("cowork.nav_skills")}>
      <PreviewPage note={t("cowork.skills_preview_note")} preview={preview}>
        {rows === null ? <HeroSkeleton art="rect" list /> : !workflow ? (
          <EmptyState title={t("cowork.skills_library_offline_title")} description={t("cowork.skills_library_offline_text")} />
        ) : (
          <WorkflowView
            workflow={workflow}
            locale={locale}
            canAdd={canUse}
            pending={pending}
            addingAll={addingAll}
            backPath={backPath}
            onBack={back}
            onAdd={add}
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
