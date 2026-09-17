import * as React from "react"
import { t } from "@/i18n"
import { orderVariantModels } from "@/components/chat/variant-model-order"
import { resolveModelPickerEmptyState } from "@/react-app/domains/session/modals/model-picker-modal"

/**
 * Ask another model to answer this same turn.
 *
 * One control, not two features. "Compare" and "paraphrase" were separate commands and that was the wrong
 * shape: what a reader actually does is call grok, then call claude, then keep whichever answered better,
 * and picking the SAME model again is the paraphrase case of exactly that action. So there is one button,
 * it takes a model, and each use adds a column beside the answer already on screen.
 *
 * A button rather than a command, because a command has to be known before it can be used. Both were
 * shipped as commands first and the report that came back was that there was no way to find them.
 *
 * The list is deliberately short and searchable rather than the full catalogue: three hundred rows in a
 * popover is a list nobody reads to the end.
 */
export function AnotherAnswerButton({
  models,
  onPick,
  label,
  hint,
  busy,
  onConnectProvider,
  remembered,
}: {
  models: readonly { providerID: string; modelID: string }[]
  onPick: (model: { providerID: string; modelID: string }) => void
  label: string
  hint: string
  busy?: boolean
  /** Opens the providers screen, which is what actually fills this list. */
  onConnectProvider?: () => void
  /**
   * The model this action used last time. When there is one, the label runs it straight away and the caret
   * opens the picker, because choosing a model on every single use is what made this feel like work.
   */
  remembered?: { providerID: string; modelID: string } | null
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? models.filter((model) => model.modelID.toLowerCase().includes(needle))
      : models
    /*
      Ordered, then capped. The cap is what makes the order matter: three hundred rows is a list nobody
      reads to the end, so `auto` and the families people reach for by name have to be inside the first
      screenful. A search sees the whole catalogue, in the same order, and its own cap is generous enough
      that a specific id is reachable by typing three characters.
    */
    return orderVariantModels(pool).slice(0, needle ? 40 : 20)
  }, [models, query])

  /*
    Rendered even when the catalogue has not loaded. Returning null on an empty list is what made this
    button invisible in the very session it was built for: the list arrives with the provider catalogue,
    and until then the feature looked absent rather than pending. The popover says so instead.
  */
  return (
    <div className="relative flex items-center" ref={rootRef}>
      <button
        className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground/80 underline decoration-dotted underline-offset-2 transition-colors hover:bg-dls-bg-hover hover:text-foreground disabled:opacity-50"
        disabled={busy === true}
        onClick={() => {
          /*
            One click when we know what to run. Choosing a model on every use is the friction that was
            reported, and the caret beside this is where changing it lives.
          */
          if (remembered) onPick(remembered)
          else setOpen((value) => !value)
        }}
        title={remembered ? `${hint} (${remembered.modelID})` : hint}
        type="button"
      >
        {busy === true ? t("variants.working") : label}
      </button>
      {remembered ? (
        <button
          aria-label={t("variants.change_model")}
          className="rounded px-1 py-0.5 text-[11px] text-muted-foreground/60 transition-colors hover:bg-dls-bg-hover hover:text-foreground"
          disabled={busy === true}
          onClick={() => setOpen((value) => !value)}
          title={t("variants.change_model")}
          type="button"
        >
          ▾
        </button>
      ) : null}
      {open ? (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-64 overflow-hidden rounded-xl border border-dls-border bg-dls-surface shadow-[var(--dls-shell-shadow)]">
          <input
            autoFocus
            className="w-full border-b border-dls-border bg-transparent px-3 py-2 text-xs outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("variants.search_models")}
            value={query}
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              /*
                An empty list has to say what fills it. "No model matches" was true and useless: the list
                arrives with the connected providers, so a reader with none has no way to know that
                connecting one is the action. Resolved through the model picker's own rule so the two
                empty states cannot say different things about the same situation, and the connect case
                gets the button rather than a sentence about a screen the reader then has to find.
              */
              (() => {
                const empty = resolveModelPickerEmptyState({
                  providerGroupCount: models.length,
                  query,
                })
                return (
                  <div className="px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {t(empty?.messageKey ?? "models.no_models_match_search")}
                    </p>
                    {empty?.showConnectProvider && onConnectProvider ? (
                      <button
                        className="mt-2 rounded-full border border-dls-border px-3 py-1 text-xs text-foreground transition-colors hover:bg-dls-hover"
                        onClick={() => {
                          setOpen(false)
                          onConnectProvider()
                        }}
                        type="button"
                      >
                        {t("models.connect_provider")}
                      </button>
                    ) : null}
                  </div>
                )
              })()
            ) : (
              filtered.map((model) => (
                <button
                  className="block w-full truncate px-3 py-1.5 text-left font-mono text-[11px] text-foreground transition-colors hover:bg-dls-hover"
                  key={`${model.providerID}/${model.modelID}`}
                  onClick={() => {
                    setOpen(false)
                    setQuery("")
                    onPick(model)
                  }}
                  type="button"
                >
                  {model.modelID}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
