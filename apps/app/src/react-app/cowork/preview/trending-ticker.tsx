import { Badge, Tabs, icons } from "@redrob-labs/ui";
import { ChevronDown, Minus, Triangle } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { t, type Language } from "../../../i18n";
import {
  tickerSequence,
  trendLabel,
  trendOf,
  type TrendingEdition,
  type TrendItem,
  type TrendScope,
} from "./chart-trending";
import { formatEditionStamp, formatLiveClock } from "./edition-clock";
import { useAutoRotate } from "./use-auto-rotate";
import { useMinuteClock } from "./use-minute-clock";

const TICKER_MS = 3000;

function scopeLabel(scope: TrendScope): string {
  return scope === "korea" ? t("cowork.chart_trending_korea") : t("cowork.chart_trending_global");
}

/** Direction glyph, movement count and accessible text for one ranked term. */
function TrendMark(props: { item: TrendItem; compact?: boolean }) {
  const change = trendOf(props.item);
  if (change.trend === "new") {
    return (
      <Badge size="sm" tone="brand" variant="subtle">
        {t("cowork.chart_trending_new")}
      </Badge>
    );
  }
  if (change.trend === "steady") {
    return (
      <span className="model-chart__trending-mark model-chart__trending-mark--steady">
        <Minus aria-hidden />
        <span className="sr-only">{t("cowork.chart_trending_same")}</span>
      </span>
    );
  }
  const accessible = change.trend === "up"
    ? t("cowork.chart_trending_up", { count: change.moved })
    : t("cowork.chart_trending_down", { count: change.moved });
  return (
    <span className={`model-chart__trending-mark model-chart__trending-mark--${change.trend}`}>
      <Triangle aria-hidden />
      {props.compact ? null : <span aria-hidden>{change.moved}</span>}
      <span className="sr-only">{accessible}</span>
    </span>
  );
}

/** The reader's current day and time, ticking each minute while the panel is open. */
function LiveClock(props: { locale: Language }) {
  const now = useMinuteClock();
  return <time dateTime={now.toISOString()}>{formatLiveClock(now, props.locale)}</time>;
}

/** One tab's ordered, keyboard-navigable search list. */
function TrendList(props: {
  /** Scope represented by this tab panel. */
  scope: TrendScope;
  /** Ranked entries shown in the active tab. */
  items: readonly TrendItem[];
  /** Current application language. */
  locale: Language;
  /** Starts a normal chat for the selected term. */
  onPick: (item: TrendItem) => void;
}) {
  return (
    <ol className="model-chart__trending-list" aria-label={scopeLabel(props.scope)}>
      {props.items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="model-chart__trending-row"
            onClick={() => props.onPick(item)}
          >
            <span className="model-chart__trending-rank" data-top={item.rank <= 3 || undefined}>{item.rank}</span>
            <span className="model-chart__trending-item-label">{trendLabel(item, props.locale)}</span>
            <TrendMark item={item} />
          </button>
        </li>
      ))}
    </ol>
  );
}

export type TrendingTickerProps = {
  /** Bundled dated search edition. */
  data: TrendingEdition;
  /** Localized date displayed beside the list title. */
  edition: string;
  /** Current application language. */
  locale: Language;
  /** Starts a normal chat for the selected search term. */
  onPick: (item: TrendItem) => void;
};

/** Collapsed rotating search ticker plus its two-tab ranked list. */
export function TrendingTicker(props: TrendingTickerProps) {
  const [open, setOpen] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [scope, setScope] = useState<TrendScope>("korea");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sequence = tickerSequence(props.data, props.locale);
  const rotation = useAutoRotate({
    count: sequence.length,
    ms: TICKER_MS,
    paused: pointerInside || focusInside || open,
  });
  const current = sequence[rotation.index] ?? sequence[0];
  const visibleItems = scope === "korea" ? props.data.korea : props.data.global;

  const openAndFocus = () => {
    setOpen(true);
  };
  const select = (item: TrendItem) => {
    setOpen(false);
    setScope("korea");
    props.onPick(item);
  };
  const moveRowFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLButtonElement>(".model-chart__trending-row");
    if (!row && event.key !== "ArrowDown") return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".model-chart__trending-row"));
    const at = row ? rows.indexOf(row) : -1;
    let next = at;
    if (event.key === "ArrowDown") next = Math.min(rows.length - 1, at + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, at - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else return;
    event.preventDefault();
    rows[next]?.focus();
  };

  return (
    <div className="model-chart__trending">
      <div
        className="model-chart__trending-track"
        onMouseEnter={() => setPointerInside(true)}
        onMouseLeave={() => setPointerInside(false)}
        onFocus={() => setFocusInside(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
        }}
      >
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setScope("korea");
        }}
      >
        <PopoverTrigger
          ref={triggerRef}
          className="model-chart__trending-trigger"
          openOnHover
          delay={250}
          closeDelay={300}
          aria-label={t("cowork.chart_trending_trigger", { edition: props.edition })}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openAndFocus();
            }
          }}
        >
          {/* The same chart mark as the sidebar's Trending AI item, so the ticker reads as part of it. */}
          <span className="model-chart__trending-icon" aria-hidden="true">
            {icons.chart({ width: 14, height: 14, "aria-hidden": true })}
          </span>
          <span className="model-chart__trending-label">{t("cowork.chart_trending_label")}</span>
          {current ? (
            <span className="model-chart__trending-window" aria-hidden="true">
              <span key={current.item.id} className="model-chart__trending-entry">
                <span className="model-chart__trending-scope">{scopeLabel(current.scope)}</span>
                <span className="model-chart__trending-rank" data-top={current.item.rank <= 3 || undefined}>{current.item.rank}</span>
                <span className="model-chart__trending-item-label">{trendLabel(current.item, props.locale)}</span>
                <TrendMark item={current.item} compact />
              </span>
            </span>
          ) : null}
          <ChevronDown className="model-chart__trending-chevron" data-open={open || undefined} aria-hidden />
        </PopoverTrigger>
        <PopoverContent
          ref={panelRef}
          className="model-chart__trending-panel"
          side="bottom"
          align="end"
          sideOffset={8}
          initialFocus={() => panelRef.current?.querySelector<HTMLButtonElement>(".model-chart__trending-row") ?? true}
          aria-label={t("cowork.chart_trending_title")}
          onMouseEnter={() => setPointerInside(true)}
          onMouseLeave={() => setPointerInside(false)}
          onFocus={() => setFocusInside(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
          }}
          onKeyDown={moveRowFocus}
        >
          <div className="model-chart__trending-heading">
            <h3>{t("cowork.chart_trending_title")}</h3>
            <span className="model-chart__trending-clock">
              <LiveClock locale={props.locale} />
              <span className="model-chart__trending-updated">
                {t("cowork.chart_trending_updated", { time: formatEditionStamp(props.data.updatedAt, props.locale) })}
              </span>
            </span>
          </div>
          <Tabs
            variant="line"
            label={t("cowork.chart_trending_title")}
            value={scope}
            className="model-chart__trending-tabs"
            items={[
              { id: "korea", label: t("cowork.chart_trending_korea") },
              { id: "global", label: t("cowork.chart_trending_global") },
            ]}
            onChange={(value) => {
              if (value === "korea" || value === "global") setScope(value);
            }}
          >
            <TrendList scope={scope} items={visibleItems} locale={props.locale} onPick={select} />
          </Tabs>
        </PopoverContent>
      </Popover>
      </div>
    </div>
  );
}
