/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, Skeleton, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { prefersReducedMotion } from "../../../lib/use-prefers-reduced-motion";
import type { SkillOrigin } from "../services/types";
import { shelfEdges, skillBrief, skillDisplayTitle, skillPath, type SkillRow, type SkillShelfId } from "./skills";
import { SkillIcon } from "./skill-icon";

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** The localized name of each skill group, read lazily so it follows the current locale. */
export const SHELF_LABEL: Record<SkillShelfId, () => string> = {
  yours: () => t("cowork.skills_shelf_yours"),
  lawyer: () => t("cowork.skills_shelf_lawyer"),
  accountant: () => t("cowork.skills_shelf_accountant"),
  vc: () => t("cowork.skills_shelf_vc"),
  everyday: () => t("cowork.skills_shelf_everyday"),
};

/** The localized label for where a skill came from. */
export function originLabel(origin: SkillOrigin): string {
  switch (origin) {
    case "library": return t("cowork.skills_origin_library");
    case "team": return t("cowork.skills_origin_team");
    case "mine": return t("cowork.skills_origin_mine");
  }
}

/** A small tone-coded badge naming a skill's origin. */
export function OriginBadge(props: { /** Origin rendered by this badge. */ origin: SkillOrigin }) {
  return <Badge size="sm" tone={props.origin === "team" ? "info" : props.origin === "mine" ? "success" : "neutral"}>{originLabel(props.origin)}</Badge>;
}

/** A skill or workflow page's loading state, shaped like its hero so a deep link never paints grey lines. */
export function HeroSkeleton(props: {
  /** `circle` for a skill icon, `rect` for a workflow cover. */
  art: "circle" | "rect";
  /** Also reserve the skill list under the hero (workflow pages). */
  list?: boolean;
}) {
  return (
    <div className="cowork-skill-detail" aria-busy="true">
      <span className="sr-only">{t("cowork.skills_loading_label")}</span>
      <div className="cowork-skill-hero">
        <Skeleton variant={props.art} width={128} height={128} />
        <div className="cowork-skill-hero__content">
          <Skeleton variant="text" width={320} />
          <Skeleton variant="text" width={160} />
          <Skeleton variant="rect" width={120} height={32} />
        </div>
      </div>
      {props.list ? <Skeleton variant="text" lines={4} /> : null}
    </div>
  );
}

/** Inputs of one marketplace skill lockup. */
type SkillTileProps = {
  /** Skill row rendered by this lockup. */
  row: SkillRow;
  /** Current locale for catalogue title and summary selection. */
  locale: string;
  /** Skills with an add request in flight. */
  pending: ReadonlySet<string>;
  /** Whether this workspace can install library skills. */
  canAdd: boolean;
  /** Path restored when the detail page closes. */
  fromPath: string;
  /** Installs a library skill by stable name. */
  onAdd: (name: string) => void;
  /** Starts an installed skill when a workspace is connected. */
  onUse?: (name: string) => void;
  /** Keeps element ids unique when one skill sits on two shelves (Your skills and Popular). */
  shelf?: string;
};

/** App Store style skill lockup: icon, title, the full short description, then the action. */
export function SkillTile({ row, locale, pending, canAdd, fromPath, onAdd, onUse, shelf }: SkillTileProps) {
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
          loading={pending.has(row.name)}
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

/** Inputs of the Your skills shelf: tile props shared by every row, plus the rows. */
type SkillShelfProps = Omit<SkillTileProps, "row"> & {
  /** The only skill-tile shelf left is the person's own; other groups are workflows or Popular. */
  id: "yours";
  /** Rows shown in this horizontal collection. */
  rows: SkillRow[];
};

/**
 * Your skills: compact horizontal cards on a raised surface, so the person's own set reads as theirs
 * and not as more of the catalogue's circles. A small circle on the left, the title with its origin
 * (Team, Mine, Library) and one line of description, and Use on the right. A grid, not a scroller:
 * these are the skills you reach for, so all of them stay in view.
 */
export function SkillShelf({ id, rows, locale, fromPath, onUse }: SkillShelfProps) {
  const headingId = `skill-shelf-${id}`;
  return (
    <section className="cowork-your-skills" aria-labelledby={headingId}>
      <div className="cowork-skills__shelf-heading">
        <h2 id={headingId}>
          {SHELF_LABEL[id]()}
          <span className="cowork-your-skills__count">{rows.length}</span>
        </h2>
      </div>
      <ul className="cowork-your-skills__grid" role="list" aria-labelledby={headingId}>
        {rows.map((row) => <YourSkillCard key={row.name} row={row} locale={locale} fromPath={fromPath} onUse={onUse} />)}
      </ul>
    </section>
  );
}

/** One of the person's skills as a compact horizontal card. */
function YourSkillCard(props: { row: SkillRow; locale: string; fromPath: string; onUse?: (name: string) => void }) {
  const { row, locale, fromPath, onUse } = props;
  const title = skillDisplayTitle(row, locale);
  const briefId = `skill-brief-yours-${row.name}`;
  return (
    <li className="cowork-your-skill" data-skill={row.name}>
      <Link
        className="cowork-skill-tile__link cowork-your-skill__link"
        to={skillPath(row.name)}
        state={{ fromSkill: row.name, fromPath }}
        aria-describedby={briefId}
      >
        <SkillIcon name={row.name} size="row" />
        <span className="cowork-your-skill__text">
          <span className="cowork-your-skill__head">
            <span className="cowork-your-skill__title">{title}</span>
            <OriginBadge origin={row.origin} />
          </span>
          <span id={briefId} className="cowork-your-skill__brief">{skillBrief(row, locale)}</span>
        </span>
      </Link>
      {onUse ? (
        <Button
          className="cowork-your-skill__action"
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

type MarketplaceShelfProps = {
  /** Stable id for the heading's id. */
  id: string;
  /** Localized heading, also the list's name and the chevrons' context. */
  label: string;
  /** Item count, so the chevrons re-measure when it changes. */
  count: number;
  /** `cards` for the square workflow covers, `tiles` (default) for skill circles. */
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
    node.scrollBy({ left: direction * Math.max(240, node.clientWidth * 0.8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
      data-show={show ? "" : undefined}
      onClick={() => { if (show) onMove(direction); }}
    >
      <Icon width={18} height={18} aria-hidden />
    </button>
  );
}
