import { memo, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import {
  selectSessionIsStickyBottom,
  selectSessionTopClippedMessageId,
  useSessionScrollStore,
} from "./scroll-store";
import { t } from "@/i18n";

function useSessionScrollOverlayState(sessionId: string) {
  const isAtBottom = useSessionScrollStore((state) => selectSessionIsStickyBottom(state.sessions, sessionId));
  const topClippedMessageId = useSessionScrollStore((state) => selectSessionTopClippedMessageId(state.sessions, sessionId));

  return { isAtBottom, topClippedMessageId };
}

type JumpToStartButtonProps = {
  onJumpToStartOfMessage: (behavior?: ScrollBehavior) => void;
};

const JumpToStartButton = memo(function JumpToStartButton({
  onJumpToStartOfMessage,
}: JumpToStartButtonProps) {
  const handleClick = useCallback(() => {
    onJumpToStartOfMessage("smooth");
  }, [onJumpToStartOfMessage]);

  // Round 34: a single icon-only UP chevron (was a "Jump to start" text pill).
  // Shown at the bottom of a long turn to jump to the start of the latest
  // message; the label is kept as aria-label/title for a11y + the tooltip layer.
  return (
    <button
      type="button"
      className="flex size-7 items-center justify-center rounded-full text-dls-text transition-colors hover:bg-dls-hover"
      onClick={handleClick}
      aria-label={t("session.jump_to_start")}
      title={t("session.jump_to_start")}
    >
      <ChevronUp size={16} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
});

type JumpToLatestButtonProps = {
  onJumpToLatest: (behavior?: ScrollBehavior) => void;
};

const JumpToLatestButton = memo(function JumpToLatestButton({
  onJumpToLatest,
}: JumpToLatestButtonProps) {
  const handleClick = useCallback(() => {
    onJumpToLatest("smooth");
  }, [onJumpToLatest]);

  // Round 32: an icon-only down chevron rather than the "Jump to latest" text pill.
  // The label is kept as aria-label (and the global tooltip layer upgrades title=
  // controls, so hover still names it) for a11y.
  return (
    <button
      type="button"
      className="flex size-7 items-center justify-center rounded-full text-dls-text transition-colors hover:bg-dls-hover"
      onClick={handleClick}
      aria-label={t("session.jump_to_latest")}
      title={t("session.jump_to_latest")}
    >
      <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
});

type SessionScrollOverlayProps = {
  sessionId: string;
  isStreaming: boolean;
  onJumpToLatest: (behavior?: ScrollBehavior) => void;
  onJumpToStartOfMessage: (behavior?: ScrollBehavior) => void;
};

export const SessionScrollOverlay = memo(function SessionScrollOverlay({
  sessionId,
  isStreaming,
  onJumpToLatest,
  onJumpToStartOfMessage,
}: SessionScrollOverlayProps) {
  const { isAtBottom, topClippedMessageId } = useSessionScrollOverlayState(sessionId);
  const showJumpToStart = !isStreaming && Boolean(topClippedMessageId);
  // Round 34: the two controls are mutually exclusive -- never shown together,
  // so the overlay is always a single chevron. Jump-to-start wins when the
  // latest message's own top is clipped (you are at the very bottom of a long
  // turn); otherwise jump-to-latest shows only when you have scrolled up.
  const showJumpToLatest = !showJumpToStart && !isAtBottom;

  if (!showJumpToStart && !showJumpToLatest) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-dls-border bg-dls-surface/95 p-1 shadow-(--dls-card-shadow) backdrop-blur-md">
        {showJumpToStart ? (
          <JumpToStartButton onJumpToStartOfMessage={onJumpToStartOfMessage} />
        ) : null}
        {showJumpToLatest ? (
          <JumpToLatestButton onJumpToLatest={onJumpToLatest} />
        ) : null}
      </div>
    </div>
  );
});
