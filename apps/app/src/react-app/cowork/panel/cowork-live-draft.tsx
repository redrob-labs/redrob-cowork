/** @jsxImportSource react */
import { useEffect, useRef } from "react";

import { ArtifactIcon } from "@/components/chat/artifact-icon";
import { useSmoothReveal } from "@/components/chat/use-smooth-reveal";
import { getArtifactType, prettyArtifactTitle } from "@/lib/artifacts";
import { t } from "../../../i18n";
import { MarkdownBlock } from "../../domains/session/surface/markdown";
import type { LiveDraft } from "./live-draft";

/** Inputs of the live draft view. */
export type CoworkLiveDraftProps = {
  /** The file being written, with the full body the write tool was given. */
  draft: LiveDraft;
  /** Called once the reveal has caught up AND the write has settled, so the real file can open. */
  onDone: () => void;
};

/**
 * The deliverable appearing in the Artifacts tab as it is written. The body is revealed letter by
 * letter at the chat's own pace (twice the reading speed easing to 1x, useSmoothReveal) with
 * the Redrob Blue caret riding the end; Markdown renders as formatted text while it builds up.
 * Under reduced motion the whole body shows at once.
 */
export function CoworkLiveDraft({ draft, onDone }: CoworkLiveDraftProps) {
  const { revealed, revealing } = useSmoothReveal(draft.content, true);
  const type = getArtifactType(draft.path);
  const writing = revealing || !draft.settled;
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view while it is being written, like the chat follows its tail.
  useEffect(() => {
    const node = bodyRef.current;
    if (node && writing) node.scrollTop = node.scrollHeight;
  }, [revealed, writing]);

  // Hand over to the real file only when nothing is left to type and the file is on disk.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!writing) doneRef.current();
  }, [writing]);

  return (
    <section className="cowork-live-draft" aria-label={prettyArtifactTitle(draft.path)} aria-busy={writing}>
      <header className="cowork-live-draft__head">
        <span className="cowork-file__icon">
          <ArtifactIcon className="size-4 text-muted-foreground" type={type} />
        </span>
        <span className="cowork-live-draft__title">{prettyArtifactTitle(draft.path)}</span>
        {writing ? <span className="redrob-shimmer-text cowork-live-draft__status">{t("cowork.artifact_writing")}</span> : null}
      </header>
      <div ref={bodyRef} className="cowork-live-draft__body" data-writing={writing ? "" : undefined}>
        {type === "markdown" ? (
          <MarkdownBlock text={revealed} />
        ) : (
          <pre className="cowork-live-draft__plain">
            {revealed}
            {writing ? <span className="redrob-writing-caret" aria-hidden="true" /> : null}
          </pre>
        )}
      </div>
    </section>
  );
}
