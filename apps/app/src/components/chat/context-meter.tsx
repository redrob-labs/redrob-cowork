import { t } from "@/i18n";

/**
 * How full the model's context is, as one quiet line directly under the composer.
 *
 * Context ONLY. The session's accumulated cost used to sit here beside it, and that was the wrong figure
 * in the wrong place: a single running total says nothing about which turn was expensive, and it read as
 * the cost of the message about to be sent. Cost belongs on each turn, where the thing that incurred it
 * is, and that is where it is now.
 *
 * Its own module rather than a local function in the composer so it can be mounted and looked at: the
 * thresholds and the "show nothing rather than a made-up number" rule are the whole point of it, and
 * neither was verifiable while it lived inside a component with forty props.
 */
export function ContextMeter(props: { usedPercent: number | null }) {
  if (props.usedPercent === null) return null;
  // Amber past 75% and red past 90%: past that the next long turn is what triggers a summarisation, and
  // a reader who is about to paste a large file should be able to see it coming.
  const tone =
    props.usedPercent >= 90
      ? "text-destructive-ink"
      : props.usedPercent >= 75
        ? "text-warning-ink"
        : "text-gray-10";
  return (
    <div className="flex items-center justify-end px-4 pb-1 pt-1 text-[11px] tabular-nums">
      <span className={tone} title={t("usage.context_hint")}>
        {t("usage.context_used").replace("{percent}", String(props.usedPercent))}
      </span>
    </div>
  );
}
