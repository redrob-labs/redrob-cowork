/** @jsxImportSource react */
import { Link } from "react-router";

import { t } from "../../../i18n";
import type { SkillRow } from "./skills";
import { SkillIcon } from "./skill-icon";
import { MarketplaceShelf } from "./skill-tile";
import { workflowOrderedRows, workflowPath, workflowSub, workflowTitle, type WorkflowId } from "./workflows";

/** A workflow's cover: its first four skills' circles in a 2x2 grid on a square card. Decorative. */
export function WorkflowMosaic(props: {
  /** The workflow's available rows; the first four in page order fill the grid. */
  rows: readonly SkillRow[];
  /** Current locale, which decides the page order. */
  locale: string;
  /** `card` on the shelf, `hero` on the workflow page. */
  size: "card" | "hero";
}) {
  const covers = workflowOrderedRows(props.rows, props.locale).slice(0, 4);
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
  /** Which featured workflow this card opens. */
  id: WorkflowId;
  /** The workflow's available rows. */
  rows: readonly SkillRow[];
  /** Current locale for the cover order. */
  locale: string;
  /** Path restored when the workflow page closes. */
  fromPath: string;
};

/** Album-cover lockup for one workflow: the square cover, then title, one line and the skill count. */
export function WorkflowCard({ id, rows, locale, fromPath }: WorkflowCardProps) {
  const subId = `workflow-sub-${id}`;
  return (
    <li className="cowork-workflow-card" data-workflow={id}>
      <Link className="cowork-workflow-card__link" to={workflowPath(id)} state={{ fromPath }} aria-describedby={subId}>
        <span className="cowork-workflow-card__art">
          <WorkflowMosaic rows={rows} locale={locale} size="card" />
        </span>
        <span className="cowork-workflow-card__title">{workflowTitle(id)}</span>
        <span id={subId} className="cowork-workflow-card__sub">{workflowSub(id)}</span>
        <span className="cowork-workflow-card__count">{t("cowork.skills_workflow_count", { count: rows.length })}</span>
      </Link>
    </li>
  );
}

/** The featured workflows shelf. */
export function WorkflowShelf(props: { workflows: ReadonlyArray<{ id: WorkflowId; rows: SkillRow[] }>; locale: string; fromPath: string }) {
  return (
    <MarketplaceShelf id="workflows" label={t("cowork.skills_section_workflows")} count={props.workflows.length} variant="cards">
      {props.workflows.map((workflow) => (
        <WorkflowCard key={workflow.id} id={workflow.id} rows={workflow.rows} locale={props.locale} fromPath={props.fromPath} />
      ))}
    </MarketplaceShelf>
  );
}
