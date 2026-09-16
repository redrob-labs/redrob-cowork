import { t } from "@/i18n";
import { formatMessageCost } from "./message-usage";

/**
 * How full the model's context is, and what the session has cost, as one quiet line under the composer.
 *
 * Its own module rather than a local function in the composer so it can be mounted and looked at: the
 * thresholds and the "show nothing rather than a made-up number" rule are the whole point of it, and
 * neither was verifiable while it lived inside a component with forty props.
 */
export function ContextMeter(props: { usedPercent: number | null; sessionCost?: number }) {
  const cost = formatMessageCost(props.sessionCost);
  if (props.usedPercent === null && !cost) return null;
  // Amber past 75% and red past 90%: past that the next long turn is what triggers a summarisation, and
  // a reader who is about to paste a large file should be able to see it coming.
  const tone =
    props.usedPercent === null
      ? "text-gray-10"
      : props.usedPercent >= 90
        ? "text-destructive-ink"
        : props.usedPercent >= 75
          ? "text-warning-ink"
          : "text-gray-10";
  return (
    <div className="flex items-center justify-end gap-2 px-3 pb-1 pt-1 text-[11px] tabular-nums">
      {props.usedPercent === null ? null : (
        <span className={tone} title={t("usage.context_hint")}>
          {t("usage.context_used").replace("{percent}", String(props.usedPercent))}
        </span>
      )}
      {cost ? (
        <span className="font-mono text-gray-10" title={t("usage.session_cost_hint")}>
          {cost}
        </span>
      ) : null}
    </div>
  );
}
