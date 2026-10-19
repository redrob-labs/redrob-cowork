/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button, IconButton, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { skillBrief, skillDisplayTitle, skillPath, type SkillRow, type SkillShelfId } from "./skills";
import { SkillIcon } from "./skill-icon";

const ICON = { width: 14, height: 14, "aria-hidden": true };

export const SHELF_LABEL: Record<SkillShelfId, () => string> = {
  yours: () => t("cowork.skills_shelf_yours"),
  lawyer: () => t("cowork.skills_shelf_lawyer"),
  accountant: () => t("cowork.skills_shelf_accountant"),
  vc: () => t("cowork.skills_shelf_vc"),
  everyday: () => t("cowork.skills_shelf_everyday"),
};

type SkillTileProps = {
  /** Skill row rendered by this lockup. */
  row: SkillRow;
  /** Current locale for catalogue title and summary selection. */
  locale: string;
  /** Skill currently running an add request. */
  busy: string | null;
  /** Whether this workspace can install library skills. */
  canAdd: boolean;
  /** Path restored when the detail page closes. */
  fromPath: string;
  /** Installs a library skill by stable name. */
  onAdd: (name: string) => void;
  /** Starts an installed skill when a workspace is connected. */
  onUse?: (name: string) => void;
};

/** App Store style skill lockup: icon, title, the full short description, then the action. */
export function SkillTile({ row, locale, busy, canAdd, fromPath, onAdd, onUse }: SkillTileProps) {
  const title = skillDisplayTitle(row, locale);
  const brief = skillBrief(row, locale);
  const briefId = `skill-brief-${row.name}`;
  return (
    <li className="cowork-skill-tile" data-skill={row.name}>
      <Link
        className="cowork-skill-tile__link"
        to={skillPath(row.name)}
        state={{ fromSkill: row.name, fromPath }}
        aria-describedby={briefId}
      >
        <SkillIcon name={row.name} size="tile" />
        <span className="cowork-skill-tile__title">{title}</span>
        <span id={briefId} className="cowork-skill-tile__brief">{brief}</span>
      </Link>
      {row.installed === null ? (
        <Button
          className="cowork-skill-tile__action"
          size="sm"
          variant="secondary"
          iconLeft={icons.plus(ICON)}
          loading={busy === row.name}
          disabled={!canAdd}
          aria-label={t("cowork.skill_add_label", { name: title })}
          onClick={() => onAdd(row.name)}
        >
          {t("cowork.skill_add")}
        </Button>
      ) : onUse ? (
        <Button
          className="cowork-skill-tile__action"
          size="sm"
          variant="secondary"
          iconLeft={icons.play(ICON)}
          aria-label={t("cowork.skills_use_label", { name: title })}
          onClick={() => onUse(row.name)}
        >
          {t("cowork.skills_use")}
        </Button>
      ) : null}
    </li>
  );
}

type SkillGridProps = Omit<SkillTileProps, "row"> & {
  /** Rows shown in plain keyboard and reading order. */
  rows: SkillRow[];
  /** Localized label announced for the list. */
  label: string;
};

/** Wrapped full-shelf or search-results grid. */
export function SkillGrid({ rows, label, ...tileProps }: SkillGridProps) {
  return (
    <ul className="cowork-skills__grid" role="list" aria-label={label}>
      {rows.map((row) => <SkillTile key={row.name} row={row} {...tileProps} />)}
    </ul>
  );
}

type SkillShelfProps = Omit<SkillGridProps, "rows" | "label"> & {
  /** Stable shelf id used for heading and URL filtering. */
  id: SkillShelfId;
  /** Rows shown in this horizontal collection. */
  rows: SkillRow[];
  /** Opens the wrapped full-shelf view. */
  onSeeAll: (id: SkillShelfId) => void;
};

/** One horizontally scrolling marketplace shelf with keyboard-reachable controls. */
export function SkillShelf({ id, rows, onSeeAll, ...tileProps }: SkillShelfProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const headingId = `skill-shelf-${id}`;
  const label = SHELF_LABEL[id]();
  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    setEdges({ start: node.scrollLeft <= 1, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, rows.length]);
  const move = (direction: -1 | 1) => {
    const node = scroller.current;
    if (node) node.scrollBy({ left: direction * Math.max(240, node.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className="cowork-skills__shelf" aria-labelledby={headingId}>
      <div className="cowork-skills__shelf-heading">
        <h2 id={headingId}>{label}</h2>
        <div className="cowork-skills__shelf-controls">
          <IconButton
            size="sm"
            label={t("cowork.skills_scroll_left", { shelf: label })}
            aria-disabled={edges.start}
            data-disabled={edges.start ? "" : undefined}
            onClick={() => { if (!edges.start) move(-1); }}
          >
            {icons.arrowLeft(ICON)}
          </IconButton>
          <IconButton
            size="sm"
            label={t("cowork.skills_scroll_right", { shelf: label })}
            aria-disabled={edges.end}
            data-disabled={edges.end ? "" : undefined}
            onClick={() => { if (!edges.end) move(1); }}
          >
            {icons.arrowRight(ICON)}
          </IconButton>
          <Button id={`${headingId}-see-all`} size="sm" variant="ghost" aria-label={t("cowork.skills_see_all_label", { shelf: label })} onClick={() => onSeeAll(id)}>
            {t("cowork.skills_see_all")}
          </Button>
        </div>
      </div>
      <ul ref={scroller} className="cowork-skills__shelf-row" role="list" aria-label={label} onScroll={measure}>
        {rows.map((row) => <SkillTile key={row.name} row={row} {...tileProps} />)}
      </ul>
    </section>
  );
}
