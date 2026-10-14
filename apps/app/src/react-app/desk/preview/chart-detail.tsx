/** @jsxImportSource react */
import { useState } from "react";
import { icons } from "@redrob-labs/ui";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "../../../i18n";
import { resolveExtensionIconSrc } from "../../design-system/extension-icon-src";
import { albumArtBase, type ArtSection } from "./model-chart-home";
import { CHART_MODELS } from "./chart-models";
import { modelsForChart, ledeKeyFor } from "./chart-model-lists";
import { PROFESSION_TASKS, rerankByTask } from "./chart-task-rerank";

/**
 * Model logos whose glyph is pure white on a transparent ground (e.g. Kimi), so they vanish on the
 * light chip. These get a dark chip in both themes instead. Logos that render as black `currentColor`
 * (OpenAI, Grok, GLM, …) are the opposite case and read fine on the default light chip, so the chip
 * backing — not a per-icon recolor, which an <img> cannot do — is what makes every mark visible.
 */
const LOGO_ON_DARK = new Set(["kimi-k2-6"]);

/** Needle Test grade band → badge color. Apple-Music-clear: green ace, blue strong, amber good, grey fair. */
function gradeFor(score: number): "ace" | "strong" | "good" | "fair" {
  if (score >= 9) return "ace";
  if (score >= 8) return "strong";
  if (score >= 7) return "good";
  return "fair";
}

/** One model row of the top-10 list. */
function ModelRow(props: { id: string; rank: number; top?: boolean; onUse: (id: string) => void }) {
  const model = CHART_MODELS[props.id];
  if (!model) return null;
  return (
    <li className="chart-detail__row" data-top={props.top ? "true" : undefined}>
      <span className="chart-detail__rank">{props.rank}</span>
      <span className="chart-detail__logo" data-on-dark={LOGO_ON_DARK.has(props.id) ? "true" : undefined}>
        <img
          className="chart-detail__logo-img"
          src={resolveExtensionIconSrc(`/brand/model-icons/${model.icon}`)}
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          draggable={false}
        />
      </span>
      <span className="chart-detail__meta">
        <span className="chart-detail__name">{model.name}</span>
        <span className="chart-detail__maker">{model.maker}</span>
        <span className="chart-detail__good">{t(model.blurbKey)}</span>
      </span>
      <span className="chart-detail__score" title={t("desk.chart_detail_needle_tip")}>
        <span className="chart-detail__score-ring" data-grade={gradeFor(model.needleScore)} aria-hidden="true">
          {model.needleScore.toFixed(1)}
        </span>
        <span className="chart-detail__score-label">{t("desk.chart_detail_needle_label")}</span>
      </span>
      <span className="chart-detail__cost">
        <span className="chart-detail__cost-amount">{t("desk.chart_detail_cost", { amount: model.estMonthly })}</span>
        <span className="chart-detail__cost-note">{t("desk.chart_detail_cost_note")}</span>
      </span>
      <button type="button" className="chart-detail__use" onClick={() => props.onUse(props.id)}>
        {t("desk.chart_detail_use")}
      </button>
    </li>
  );
}

/**
 * Redrob Auto — the budget-aware router, as the FEATURED first row. It uses the EXACT model-row
 * anatomy (rank / logo / name+maker+good / score / cost / use) so it is visually seamless with and
 * the same height as the ten models, with Auto's content mapped into each column:
 *   rank  -> a star (it sits ABOVE the ranking, not at a number)   maker -> "Featured"
 *   score -> the Needle circle with "Best" inside (same shape + tooltip + caption as the models)
 *   cost  -> "Your budget" + the same "est. for an average user" note   good -> the router explainer.
 */
function AutoRow(props: { onUse: (id: string) => void }) {
  return (
    <li className="chart-detail__row chart-detail__row--auto">
      <span className="chart-detail__rank chart-detail__rank--star" aria-hidden="true">★</span>
      <span className="chart-detail__logo chart-detail__logo--auto">
        <img
          className="chart-detail__logo-img"
          src={resolveExtensionIconSrc("/brand/redrob/redrob-mark-blue.svg")}
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          draggable={false}
        />
      </span>
      <span className="chart-detail__meta">
        <span className="chart-detail__name">{t("desk.chart_detail_auto_name")}</span>
        <span className="chart-detail__maker chart-detail__maker--featured">{t("desk.chart_detail_featured")}</span>
        <span className="chart-detail__good">{t("desk.chart_detail_auto_lede")}</span>
      </span>
      <span className="chart-detail__score" title={t("desk.chart_detail_auto_verdict_tip")}>
        <span className="chart-detail__score-ring" data-grade="auto" aria-hidden="true">
          {t("desk.chart_detail_auto_verdict")}
        </span>
        <span className="chart-detail__score-label">{t("desk.chart_detail_needle_label")}</span>
      </span>
      <span className="chart-detail__cost">
        <span className="chart-detail__cost-amount">{t("desk.chart_detail_auto_cost")}</span>
        <span className="chart-detail__cost-note">{t("desk.chart_detail_cost_note")}</span>
      </span>
      <button type="button" className="chart-detail__use" onClick={() => props.onUse("__auto__")}>
        {t("desk.chart_detail_use")}
      </button>
    </li>
  );
}

/**
 * The inner chart-detail page: a Spotify / Apple-Music style TOP-10 model list for one shelf tile.
 *
 * Round 33: Redrob Auto is the FEATURED first row — grid-aligned with the models so it reads as part
 * of the chart, gently tinted and tagged rather than a separate banner. The task filter is a
 * right-aligned component-system select with no "Rank for" label and an "Overall Rank" default.
 */
export function ChartDetail(props: {
  section: ArtSection;
  tileId: string;
  title: string;
  onBack: () => void;
  onUse: (modelId: string) => void;
}) {
  const [task, setTask] = useState("overall");
  const baseIds = modelsForChart(props.section, props.tileId);
  const isProfession = props.section === "picked-for-your-profession";
  const tasks = isProfession ? PROFESSION_TASKS[props.tileId] ?? [] : [];
  const ids = isProfession ? rerankByTask(baseIds, props.tileId, task) : baseIds;

  const ledeKey = ledeKeyFor(props.section, props.tileId);
  const artBase = albumArtBase(props.section, props.tileId);
  const artSrc = artBase ? resolveExtensionIconSrc(`${artBase}@2x.png`) : null;

  return (
    <div className="chart-detail">
      <button type="button" className="model-chart__back" onClick={props.onBack}>
        {icons.back({ width: 16, height: 16, "aria-hidden": true })}
        {t("desk.chart_back")}
      </button>

      <header className="chart-detail__head">
        {artSrc ? (
          <img className="chart-detail__cover" src={artSrc} alt="" aria-hidden="true" draggable={false} />
        ) : (
          <span className="chart-detail__cover chart-detail__cover--blank" aria-hidden="true" />
        )}
        <div className="chart-detail__headtext">
          <span className="chart-detail__eyebrow">{t("desk.chart_detail_eyebrow")}</span>
          <h2 className="chart-detail__title">{props.title}</h2>
          <p className="chart-detail__lede">{t(ledeKey, { chart: props.title })}</p>
        </div>
        {tasks.length ? (
          <div className="chart-detail__rerank">
            <Select value={task} onValueChange={(v) => { if (v) setTask(v); }}>
              <SelectTrigger className="chart-detail__rerank-trigger" aria-label={t("desk.chart_detail_rerank_label")}>
                <SelectValue>{task === "overall" ? t("desk.chart_task_overall") : t(tasks.find((tk) => tk.id === task)?.labelKey ?? "desk.chart_task_overall")}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="overall">{t("desk.chart_task_overall")}</SelectItem>
                {tasks.map((tk) => (
                  <SelectItem key={tk.id} value={tk.id}>
                    {t(tk.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </header>

      <ol className="chart-detail__list">
        <AutoRow onUse={props.onUse} />
        {ids.map((id, index) => (
          <ModelRow key={id} id={id} rank={index + 1} top={index === 0} onUse={props.onUse} />
        ))}
      </ol>
      <p className="chart-detail__disclaimer">{t("desk.chart_detail_estimate_note")}</p>
    </div>
  );
}
