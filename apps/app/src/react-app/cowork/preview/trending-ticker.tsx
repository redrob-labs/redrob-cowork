import { Badge } from "@redrob-labs/ui";
import { ChevronDown, Minus, Pause, Play, TrendingUp, Triangle } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { t, type Language } from "../../../i18n";
import {
  tickerSequence,
  trendLabel,
  trendOf,
  type TrendingEdition,
  type TrendItem,
  type TrendScope,
} from "./chart-trending";
import { useAutoRotate } from "./use-auto-rotate";

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
  /** Registers row buttons for arrow-key focus movement. */
  rowRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
}) {
  return (
    <ol className="model-chart__trending-list" aria-label={scopeLabel(props.scope)}>
      {props.items.map((item, index) => (
        <li key={item.id}>
          <button
            ref={(node) => { props.rowRefs.current[index] = node; }}
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
  const [manualPaused, setManualPaused] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [scope, setScope] = useState<TrendScope>("korea");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sequence = tickerSequence(props.data, props.locale);
  const rotation = useAutoRotate({
    count: sequence.length,
    ms: TICKER_MS,
    paused: manualPaused || pointerInside || focusInside || open,
  });
  const current = sequence[rotation.index] ?? sequence[0];
  const visibleItems = scope === "korea" ? props.data.korea : props.data.global;

  useEffect(() => {
    rowRefs.current = [];
  }, [scope]);

  const openAndFocus = () => {
    setOpen(true);
    window.requestAnimationFrame(() => rowRefs.current[0]?.focus());
  };
  const select = (item: TrendItem) => {
    setOpen(false);
    props.onPick(item);
  };
  const moveRowFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = rowRefs.current.filter((row): row is HTMLButtonElement => row !== null);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
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
    <div
      className="model-chart__trending"
      onMouseEnter={() => setPointerInside(true)}
      onMouseLeave={() => setPointerInside(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          ref={triggerRef}
          className="model-chart__trending-trigger"
          openOnHover
          delay={250}
          closeDelay={300}
          aria-label={t("cowork.chart_trending_trigger", { edition: props.edition })}
          aria-haspopup="dialog"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openAndFocus();
            }
          }}
        >
          <TrendingUp className="model-chart__trending-icon" aria-hidden />
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
          className="model-chart__trending-panel"
          side="bottom"
          align="end"
          sideOffset={8}
          role="dialog"
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
            <span>{props.edition}</span>
          </div>
          <p className="model-chart__trending-note">{t("cowork.chart_trending_note")}</p>
          <Tabs
            value={scope}
            onValueChange={(value) => {
              if (value === "korea" || value === "global") setScope(value);
            }}
          >
            <TabsList variant="line" className="model-chart__trending-tabs">
              <TabsTrigger value="korea">{t("cowork.chart_trending_korea")}</TabsTrigger>
              <TabsTrigger value="global">{t("cowork.chart_trending_global")}</TabsTrigger>
            </TabsList>
            <TabsContent value="korea">
              <TrendList scope="korea" items={visibleItems} locale={props.locale} onPick={select} rowRefs={rowRefs} />
            </TabsContent>
            <TabsContent value="global">
              <TrendList scope="global" items={visibleItems} locale={props.locale} onPick={select} rowRefs={rowRefs} />
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
      {rotation.reducedMotion ? null : (
        <button
          type="button"
          className="model-chart__trending-pause"
          aria-label={manualPaused ? t("cowork.chart_trending_play") : t("cowork.chart_trending_pause")}
          aria-pressed={manualPaused}
          onClick={() => setManualPaused((paused) => !paused)}
        >
          {manualPaused ? <Play aria-hidden /> : <Pause aria-hidden />}
        </button>
      )}
    </div>
  );
}
