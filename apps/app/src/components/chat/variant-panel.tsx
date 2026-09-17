import { t } from "@/i18n";
import { CHAT_COLUMN } from "@/components/chat/chat-column";
import type { VariantRun } from "@/react-app/domains/session/variant-run";
import { runHasAnswer, runSettled } from "@/react-app/domains/session/variant-run";

/**
 * The variants of one turn, side by side, with the one the user keeps.
 *
 * Shown inside the session rather than as a modal, because the answers have to be read against the
 * conversation they belong to. Each column is a fork of this session that was asked the same thing; the
 * one the user keeps becomes the session and the rest are deleted.
 *
 * The keep button appears only on a FINISHED variant. Offering it while a reply is still streaming would
 * let a reader adopt a truncated turn, which then sits in the conversation looking like the model stopped
 * there.
 */
export function VariantPanel({
  run,
  onAdopt,
  onDismiss,
}: {
  run: VariantRun;
  onAdopt: (index: number) => void;
  onDismiss: () => void;
}) {
  const settled = runSettled(run);
  const anyAnswer = runHasAnswer(run);

  return (
    <div className={CHAT_COLUMN}>
      <div className="rounded-2xl border border-dls-border bg-dls-surface/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-11">
            {run.kind === "compare"
              ? t("variants.compare_title")
              : t("variants.paraphrase_title")}
          </span>
          <button
            className="rounded px-1.5 py-0.5 text-xs text-gray-10 underline decoration-dotted underline-offset-2 hover:bg-dls-bg-hover hover:text-gray-12"
            onClick={onDismiss}
            type="button"
          >
            {t("variants.discard_all")}
          </button>
        </div>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(run.variants.length, 2)}, minmax(0, 1fr))` }}
        >
          {run.variants.map((variant) => (
            <div
              className="flex min-w-0 flex-col rounded-xl border border-dls-border bg-background/40 p-3"
              key={variant.index}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-gray-11">{variant.label}</span>
                <span className="shrink-0 text-[11px] text-gray-10">
                  {variant.status === "done"
                    ? ""
                    : variant.status === "failed"
                      ? t("variants.failed")
                      : t("variants.working")}
                </span>
              </div>
              <div className="min-h-[3rem] max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">
                {variant.status === "failed" ? (variant.error ?? t("variants.failed")) : variant.text}
              </div>
              {variant.status === "done" && variant.text ? (
                <button
                  className="mt-2 self-start rounded-full border border-dls-border px-3 py-1 text-xs text-foreground transition-colors hover:bg-dls-hover"
                  onClick={() => onAdopt(variant.index)}
                  type="button"
                >
                  {t("variants.keep_this")}
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <p className="mt-2 text-[11px] text-gray-10">
          {settled && !anyAnswer ? t("variants.none_finished") : t("variants.keep_hint")}
        </p>
      </div>
    </div>
  );
}
