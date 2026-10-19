/** @jsxImportSource react */

import type { UIMessage } from "ai";

import { ArtifactIcon } from "@/components/chat/artifact-icon";
import {
  canOpenArtifact,
  getArtifactTypeLabel,
  isArtifactWriteInFlight,
  prettyArtifactTitle,
  useArtifacts,
  usePreviewArtifact,
  type ArtifactItem,
} from "@/lib/artifacts";
import { t } from "@/i18n";

/** Props for one rounded, clickable artifact card (item 4). */
interface ArtifactCardProps {
  /** The artifact this card stands for. */
  artifact: ArtifactItem;
  /** Item 8: true while the run is still writing this artifact; shows a caret + "Writing..." shimmer. */
  writing: boolean;
}

/**
 * A rounded, Claude-style artifact card for the chat (item 4): a type icon, a humanized Sentence-case
 * title (prettyArtifactTitle), a small type label, and a click that opens the artifact in the right
 * panel. While the file is still being written (item 8) it shows a blinking caret and a "Writing..."
 * shimmer in place of the type label, resolving to the finished type label once the file settles.
 */
function ArtifactCard({ artifact, writing }: ArtifactCardProps) {
  const previewArtifact = usePreviewArtifact();
  const canOpen = canOpenArtifact(artifact);
  const title = prettyArtifactTitle(artifact.path);
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => previewArtifact(artifact)}
      title={t("cowork.artifact_open", { title })}
      className="group/artifact-card flex w-full max-w-md items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-muted/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
        <ArtifactIcon className="size-4 text-muted-foreground" type={artifact.type} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium leading-5 text-foreground">
          {title}
          {/* Item 8: a blinking text caret trailing the title while the file is being written. */}
          {writing ? <span className="redrob-writing-caret" aria-hidden="true" /> : null}
        </span>
        {writing ? (
          <span className="redrob-shimmer-text text-xs">{t("cowork.artifact_writing")}</span>
        ) : (
          <span className="truncate text-xs text-muted-foreground">{getArtifactTypeLabel(artifact.type)}</span>
        )}
      </span>
    </button>
  );
}

/** Props for the in-chat artifact card list (item 4). */
interface ArtifactCardListProps {
  /** The messages of ONE turn; the cards show the artifacts that turn produced. */
  messages: UIMessage[];
}

/**
 * The Cowork frame's in-chat artifact cards (items 4 + 8): one rounded card per artifact a turn
 * produced, each opening the right panel on click. It reads the same artifacts the Files strip
 * does, and marks a card as "writing" while a write/edit tool part for its path is still in flight.
 */
export function ArtifactCardList({ messages }: ArtifactCardListProps) {
  const artifacts = useArtifacts(messages, { includeTargetFallbacks: false, includeInFlightWrites: true });
  if (artifacts.length === 0) return null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-2 md:px-10" data-artifact-cards>
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          writing={isArtifactWriteInFlight(messages, artifact.path)}
        />
      ))}
    </div>
  );
}
