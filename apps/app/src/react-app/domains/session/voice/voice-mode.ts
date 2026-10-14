import { t } from "@/i18n";

/**
 * Voice-mode phase, derived from the composer's talk toggle, the mic phase, and the read-aloud
 * status. This is the ChatGPT-style listening -> thinking -> speaking cycle, kept pure so it can be
 * unit-tested without the browser.
 *
 *  - `listening`: the mic is recording what you say.
 *  - `thinking`:  the clip is being transcribed / the answer is being prepared.
 *  - `speaking`:  Cowork is reading its answer aloud.
 *  - `idle`:      voice mode is on but nothing is happening right now (waiting for you to speak).
 */
export type VoicePhase = "listening" | "thinking" | "speaking" | "idle";

export type MicPhaseKind = "idle" | "recording" | "transcribing";
export type ReadAloudStatus = "idle" | "loading" | "playing";

export type VoiceModeInputs = {
  /** The composer's voice-chat toggle for this chat. */
  talk: boolean;
  /** The dictation mic phase. */
  mic: MicPhaseKind;
  /** The read-aloud playback status. */
  readStatus: ReadAloudStatus;
};

export type VoiceModeView = {
  /** Whether the voice overlay should be shown at all. */
  visible: boolean;
  phase: VoicePhase;
};

/** Fold the three signals into a single phase. Recording wins (you talking interrupts everything). */
export function voiceModePhase(input: VoiceModeInputs): VoiceModeView {
  if (!input.talk) return { visible: false, phase: "idle" };
  if (input.mic === "recording") return { visible: true, phase: "listening" };
  if (input.mic === "transcribing") return { visible: true, phase: "thinking" };
  if (input.readStatus === "loading") return { visible: true, phase: "thinking" };
  if (input.readStatus === "playing") return { visible: true, phase: "speaking" };
  return { visible: true, phase: "idle" };
}

/** The human-readable status line for a phase, in the app's language. */
export function voicePhaseLabel(phase: VoicePhase): string {
  switch (phase) {
    case "listening":
      return t("desk.voice_mode_listening");
    case "thinking":
      return t("desk.voice_mode_thinking");
    case "speaking":
      return t("desk.voice_mode_speaking");
    case "idle":
      return t("desk.voice_mode_idle");
  }
}
