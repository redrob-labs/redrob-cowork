/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { shelfEdges, skillBrief, skillDisplayTitle, skillPath, type SkillRow, type SkillShelfId } from "./skills";
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
  /** Round 10: keeps element ids unique when one skill sits on two shelves (Your skills and Popular). */
  shelf?: string;
};

/** App Store style skill lockup: icon, title, the full short description, then the action. */
export function SkillTile({ row, locale, busy, canAdd, fromPath, onAdd, onUse, shelf }: SkillTileProps) {
  const title = skillDisplayTitle(row, locale);
  const brief = skillBrief(row, locale);
  const briefId = shelf ? `skill-brief-${shelf}-${row.name}` : `skill-brief-${row.name}`;
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

type SkillShelfProps = Omit<SkillTileProps, "row"> & {
  /** Stable shelf id used for the heading and its label. */
  id: SkillShelfId;
  /** Rows shown in this horizontal collection. */
  rows: SkillRow[];
};

/** One horizontally scrolling marketplace shelf of skill tiles. */
export function SkillShelf({ id, rows, ...tileProps }: SkillShelfProps) {
  return (
    <MarketplaceShelf id={id} label={SHELF_LABEL[id]()} count={rows.length}>
      {rows.map((row) => <SkillTile key={row.name} row={row} {...tileProps} />)}
    </MarketplaceShelf>
  );
}

type MarketplaceShelfProps = {
  /** Stable id for the heading's id. */
  id: string;
  /** Localized heading, also the list's name and the chevrons' context. */
  label: string;
  /** Item count, so the chevrons re-measure when it changes. */
  count: number;
  /** Round 10: `cards` for the square workflow covers, `tiles` (default) for skill circles. */
  variant?: "tiles" | "cards";
  /** The `<li>` items. */
  children: ReactNode;
};

/** A horizontally scrolling shelf; edge chevrons appear on hover or keyboard focus. */
export function MarketplaceShelf({ id, label, count, variant = "tiles", children }: MarketplaceShelfProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ canPrev: false, canNext: false });
  const headingId = `skill-shelf-${id}`;
  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    setEdges(shelfEdges(node.scrollLeft, node.scrollWidth, node.clientWidth));
  }, []);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, count]);
  const move = (direction: -1 | 1) => {
    const node = scroller.current;
    if (!node) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({ left: direction * Math.max(240, node.clientWidth * 0.8), behavior: reduced ? "auto" : "smooth" });
  };
  const cards = variant === "cards";

  return (
    <section className={cards ? "cowork-skills__shelf cowork-skills__shelf--cards" : "cowork-skills__shelf"} aria-labelledby={headingId}>
      <div className="cowork-skills__shelf-heading">
        <h2 id={headingId}>{label}</h2>
      </div>
      <div className="cowork-skills__shelf-viewport">
        <ShelfChevron direction={-1} label={t("cowork.skills_scroll_left", { shelf: label })} show={edges.canPrev} onMove={move} />
        <ul ref={scroller} className={cards ? "cowork-skills__shelf-row cowork-skills__shelf-row--cards" : "cowork-skills__shelf-row"} role="list" aria-label={label} onScroll={measure}>
          {children}
        </ul>
        <ShelfChevron direction={1} label={t("cowork.skills_scroll_right", { shelf: label })} show={edges.canNext} onMove={move} />
      </div>
    </section>
  );
}

type ShelfChevronProps = {
  /** Which way this chevron pages the shelf: -1 left, 1 right. */
  direction: -1 | 1;
  /** Localized accessible name; there is no hover text. */
  label: string;
  /** Whether there is anything left to scroll in this direction. */
  show: boolean;
  /** Pages the shelf in the given direction. */
  onMove: (direction: -1 | 1) => void;
};

/** A plain overlay button (not IconButton, which sets title) that leaves the tab order at an edge. */
function ShelfChevron({ direction, label, show, onMove }: ShelfChevronProps) {
  const Icon = direction < 0 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      className={`cowork-skills__chevron cowork-skills__chevron--${direction < 0 ? "prev" : "next"}`}
      aria-label={label}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      data-show={show || undefined}
      onClick={() => { if (show) onMove(direction); }}
    >
      <Icon width={18} height={18} aria-hidden />
    </button>
  );
}
