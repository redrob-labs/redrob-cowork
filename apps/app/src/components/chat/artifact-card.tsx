/** @jsxImportSource react */

import type { UIMessage } from "ai";

import { ArtifactIcon } from "@/components/chat/artifact-icon";
import {
  canOpenArtifact,
  getArtifactTypeLabel,
  prettyArtifactTitle,
  useArtifacts,
  type ArtifactItem,
} from "@/lib/artifacts";
import { CHAT_COLUMN } from "@/components/chat/chat-column";
import { t } from "@/i18n";
import { useFrameStore } from "@/react-app/cowork/store/frame-store";

/** Props for one rounded, clickable artifact card. */
interface ArtifactCardProps {
  /** The artifact this card stands for. */
  artifact: ArtifactItem;
  /** True while the run is still writing this artifact; shows a caret and a "Writing..." shimmer. */
  writing: boolean;
}

/**
 * A rounded artifact card for the chat: a type icon, a humanized Title Case title
 * (prettyArtifactTitle), a small type label, and a click that opens the artifact in the right
 * panel. While the file is still being written it shows a blinking caret and a "Writing..."
 * shimmer in place of the type label, resolving to the finished type label once the file settles.
 */
function ArtifactCard({ artifact, writing }: ArtifactCardProps) {
  const openPanel = useFrameStore((state) => state.openPanel);
  const openArtifact = useFrameStore((state) => state.openArtifact);
  // While the file is being written the card opens the live draft in the Artifacts tab; a written
  // artifact opens on its own in the Artifacts tab (not the Files tab).
  const canOpen = writing || canOpenArtifact(artifact);
  const title = prettyArtifactTitle(artifact.path);
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => (writing ? openPanel("artifacts") : openArtifact(artifact.legacy_target.id))}
      aria-label={t("cowork.artifact_open", { title })}
      className="group/artifact-card flex w-full max-w-md items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-muted/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
        <ArtifactIcon className="size-4 text-muted-foreground" type={artifact.type} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium leading-5 text-foreground">
          {title}
          {/* A blinking text caret trailing the title while the file is being written. */}
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

/** Props for the in-chat artifact card list. */
interface ArtifactCardListProps {
  /** The messages of ONE turn; the cards show the artifacts that turn produced. */
  messages: UIMessage[];
}

/**
 * The Cowork frame's in-chat artifact cards: one rounded card per artifact a turn produced, each
 * opening the right panel on click. It reads the same artifacts the Files strip does, and marks a
 * card as "writing" while a write-family tool part for its path is still in flight.
 */
export function ArtifactCardList({ messages }: ArtifactCardListProps) {
  // writtenOnly: a card only for a file a write-family tool produced (settled or in flight). A path
  // mentioned in prose (a plan's "Save as reports/x.md") makes no card.
  const artifacts = useArtifacts(messages, { includeTargetFallbacks: false, includeInFlightWrites: true, writtenOnly: true });
  if (artifacts.length === 0) return null;
  return (
    // The cards sit on the same column as the prose (CHAT_COLUMN), left-aligned with it.
    <div className={`${CHAT_COLUMN} flex flex-col gap-2`} data-artifact-cards="">
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          writing={artifact.writing === true}
        />
      ))}
    </div>
  );
}
