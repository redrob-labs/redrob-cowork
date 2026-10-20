/** @jsxImportSource react */
import { Link } from "react-router";

import { t } from "../../../i18n";
import type { SkillRow } from "./skills";
import { SkillIcon } from "./skill-icon";
import { MarketplaceShelf } from "./skill-tile";
import { workflowPath, workflowTitle, type Workflow } from "./workflows";

/** A workflow's cover: its first four skills' circles in a 2x2 grid on a square card. Decorative. */
export function WorkflowMosaic(props: {
  /** The workflow's rows in run order; the first four fill the grid. */
  rows: readonly SkillRow[];
  /** `card` on the shelf, `hero` on the workflow page. */
  size: "card" | "hero";
}) {
  const covers = props.rows.slice(0, 4);
  return (
    <span className="cowork-workflow-card__cover" data-size={props.size} aria-hidden="true">
      {covers.map((row) => (
        <span key={row.name} className="cowork-workflow-card__cover-cell">
          <SkillIcon name={row.name} size="fill" />
        </span>
      ))}
    </span>
  );
}

/** Inputs of one workflow card on the shelf. */
type WorkflowCardProps = {
  /** The family this card opens. */
  workflow: Workflow;
  /** Current locale for the family name. */
  locale: string;
  /** Path restored when the workflow page closes. */
  fromPath: string;
};

/** Album-cover lockup for one workflow: the square cover, then the family name and the skill count. */
export function WorkflowCard({ workflow, locale, fromPath }: WorkflowCardProps) {
  const countId = `workflow-count-${workflow.id}`;
  return (
    <li className="cowork-workflow-card" data-workflow={workflow.id}>
      <Link className="cowork-workflow-card__link" to={workflowPath(workflow.id)} state={{ fromPath }} aria-describedby={countId}>
        <span className="cowork-workflow-card__art">
          <WorkflowMosaic rows={workflow.rows} size="card" />
        </span>
        <span className="cowork-workflow-card__title">{workflowTitle(workflow, locale)}</span>
        <span id={countId} className="cowork-workflow-card__count">{t("cowork.skills_workflow_count", { count: workflow.rows.length })}</span>
      </Link>
    </li>
  );
}

/** The workflows shelf: one card per catalogue family. */
export function WorkflowShelf(props: { workflows: readonly Workflow[]; locale: string; fromPath: string }) {
  return (
    <MarketplaceShelf id="workflows" label={t("cowork.skills_section_workflows")} count={props.workflows.length} variant="cards">
      {props.workflows.map((workflow) => (
        <WorkflowCard key={workflow.id} workflow={workflow} locale={props.locale} fromPath={props.fromPath} />
      ))}
    </MarketplaceShelf>
  );
}
