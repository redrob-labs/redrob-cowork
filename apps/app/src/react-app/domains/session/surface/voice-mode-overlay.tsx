import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { t } from "@/i18n";
import { IconButton } from "@redrob-labs/ui";
import { useReadAloudStore, stopReadAloud } from "../voice/read-aloud";
import { voiceModePhase, voicePhaseLabel, type MicPhaseKind, type VoicePhase } from "../voice/voice-mode";
import { NEW_CHAT_KEY, talkFor, useDeskComposerStore } from "@/react-app/desk/composer/composer-state";
import { useFrameStore } from "@/react-app/desk/store/frame-store";

/**
 * Store-connected voice overlay for the open chat. Reads the voice-chat toggle for this chat, the
 * mic phase (published by the composer into the frame store), and renders the overlay inside the
 * chat column. Mount it once at the chat column root (a `relative` ancestor).
 */
export function ChatVoiceMode(props: { sessionId: string | null | undefined }) {
  const chatKey = props.sessionId ?? NEW_CHAT_KEY;
  const talk = useDeskComposerStore((state) => talkFor(state.chats, chatKey));
  const setTalk = useDeskComposerStore((state) => state.setTalk);
  const mic = useFrameStore((state) => state.voiceMic);
  // Round 14, item F: the composer registers a mic start/stop toggle so the orb can start talking.
  const micToggle = useFrameStore((state) => state.voiceMicToggle);
  return (
    <VoiceModeOverlay
      talk={talk}
      mic={mic}
      onExit={() => setTalk(chatKey, false)}
      onToggleTalk={micToggle ?? undefined}
    />
  );
}

/**
 * The in-chat voice overlay, in the spirit of ChatGPT's voice mode: a soft orb that pulses while
 * you talk, Cowork thinks, and Cowork talks back, with an Exit button. It fills the chat column
 * (NOT the whole window) so the sidebar and app chrome stay put, per the product owner's call.
 *
 * It is purely presentational over state the composer already owns: `talk` (the voice-chat toggle),
 * the mic phase, and the read-aloud status. Closing it turns the toggle off and stops any speech.
 */
export function VoiceModeOverlay(props: {
  talk: boolean;
  mic: MicPhaseKind;
  onExit: () => void;
  /** Round 14, item F: start/stop talking by tapping the orb (null when no composer/mic). */
  onToggleTalk?: () => void;
}) {
  const readStatus = useReadAloudStore((state) => state.status);
  const view = voiceModePhase({ talk: props.talk, mic: props.mic, readStatus });
  // Close on Escape, like any modal surface.
  const onExitRef = useRef(props.onExit);
  onExitRef.current = props.onExit;
  useEffect(() => {
    if (!view.visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.visible]);

  if (!view.visible) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-dls-surface backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={t("desk.voice_mode_title")}
    >
      <div className="absolute right-3 top-3">
        <IconButton
          label={t("desk.voice_mode_close")}
          variant="ghost"
          size="sm"
          onClick={() => {
            stopReadAloud();
            props.onExit();
          }}
        >
          <X width={18} height={18} aria-hidden />
        </IconButton>
      </div>
      <VoiceOrb phase={view.phase} onToggle={props.onToggleTalk} />
      <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
        {voicePhaseLabel(view.phase)}
      </p>
    </div>
  );
}

/**
 * A soft, pulsing orb. Each phase gets its own tint and motion:
 *   - listening: the brand/primary glow, a quick breathing pulse (you are the input);
 *   - thinking:  a muted glow, a slow spin ring (work in progress);
 *   - speaking:  a warm glow, a wider slow pulse (Cowork is the output);
 *   - idle:      a still, dim orb inviting a tap.
 * All animation is gated behind `motion-reduce:animate-none`, so the reduced-motion setting leaves a
 * calm, static orb that still carries the colour cue.
 */
function VoiceOrb({ phase, onToggle }: { phase: VoicePhase; onToggle?: () => void }) {
  // How lively the orb is, by phase: a quick breath while listening, a wider swell while speaking,
  // a steady state while thinking, calm when idle. Colour stays Redrob-blue throughout.
  const pulse =
    phase === "listening"
      ? "animate-[voice-orb-pulse_0.85s_ease-in-out_infinite] motion-reduce:animate-none"
      : phase === "speaking"
      ? "animate-[voice-orb-pulse_1.9s_ease-in-out_infinite] motion-reduce:animate-none"
      : "";
  const intensity = phase === "idle" ? "opacity-70" : "opacity-100";
  // Round 11, item 11: while listening (mic tapped) the orb pulses more and the hue wheel whirls
  // faster. The CSS modifier drives the faster spin + a brighter glow; the pulse amplitude is bumped
  // in the keyframe. Kept tasteful (0.85s breath, 5s spin) and still reduced-motion safe.
  const listening = phase === "listening" ? "voice-orb--listening" : "";
  const orb = (
    <div className={`voice-orb ${listening} ${pulse} ${intensity}`} aria-hidden="true">
      {/* The swirling hues: a conic Redrob-blue-to-indigo-to-teal wheel that turns slowly inside the orb. */}
      <div className="voice-orb__swirl" />
      {/* A soft inner core so the orb reads as a lit sphere, not a flat disc. */}
      <div className="voice-orb__core" />
    </div>
  );
  // Round 14, item F: the orb itself starts/stops talking when a mic toggle is available — a real
  // button with keyboard support. Without a toggle (no composer) it stays a decorative div.
  if (!onToggle) return orb;
  return (
    <button
      type="button"
      className="voice-orb__button"
      onClick={onToggle}
      aria-label={t(phase === "idle" ? "desk.voice_mode_idle" : "desk.voice_mode_listening")}
    >
      {orb}
    </button>
  );
}
