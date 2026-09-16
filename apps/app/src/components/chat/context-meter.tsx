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
export function ContextMeter(props: { usedPercent: number | null; onCompact?: () => void; compacting?: boolean }) {
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
    <div className="flex items-center justify-end gap-2 px-4 pb-1 pt-1 text-[11px] tabular-nums">
      {/*
        Summarise now.

        The engine has had this since before the app shipped - `session.summarize`, with a `/compact`
        command fallback - and the app already wired both. What it never had was anything to CLICK: the
        only way in was typing `/compact`, which a user has to know exists. This is that entry point, put
        beside the fullness reading because that number is what makes someone want it.

        Shown only from 50% up. Below that there is little to summarise and the offer is noise; the button
        appearing is itself a signal that the conversation is getting long.
      */}
      {props.onCompact && props.usedPercent >= 50 ? (
        <button
          className="rounded px-1.5 py-0.5 text-gray-10 underline decoration-dotted underline-offset-2 transition-colors hover:bg-dls-bg-hover hover:text-gray-12 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={props.compacting === true}
          onClick={props.onCompact}
          title={t("usage.compact_now_hint")}
          type="button"
        >
          {props.compacting === true ? t("usage.compacting") : t("usage.compact_now")}
        </button>
      ) : null}
      <span className={tone} title={t("usage.context_hint")}>
        {t("usage.context_used").replace("{percent}", String(props.usedPercent))}
      </span>
    </div>
  );
}
