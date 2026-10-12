import type { RedrobServerClient } from "@/app/lib/redrob-server";
import { currentLocale, t } from "@/i18n";

export type DictationClient = Pick<RedrobServerClient, "transcribeAudio">;

export function waitForDataChannelOpen(channel: RTCDataChannel) {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("close", handleClose);
      channel.removeEventListener("error", handleError);
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(t("voice.realtime_channel_timeout")));
    }, 10_000);
    const handleOpen = () => { cleanup(); resolve(); };
    const handleClose = () => { cleanup(); reject(new Error(t("voice.realtime_channel_closed_early"))); };
    const handleError = () => { cleanup(); reject(new Error(t("voice.realtime_channel_failed"))); };
    channel.addEventListener("open", handleOpen);
    channel.addEventListener("close", handleClose);
    channel.addEventListener("error", handleError);
  });
}

/** Asks macOS for the microphone. Elsewhere there is nothing to ask. */
export async function askMicrophoneAccess(): Promise<{ granted: boolean; status: string }> {
  const ask = window.__REDROB_ELECTRON__?.system?.askMicrophoneAccess;
  if (!ask) return { granted: true, status: "unknown" };
  const result = await ask();
  if (result.platform !== "darwin") return { granted: true, status: "unknown" };
  return { granted: result.granted, status: result.after ?? result.before ?? result.status ?? "unknown" };
}

/**
 * Push-to-talk dictation on Redrob: record while the mic is held (or between two taps), then send
 * the clip once through `POST /voice/transcribe`, which the engine transcribes on its own Redrob
 * credential. Only text comes back, and it goes into the draft; nothing is ever sent as a message.
 */

/** The longest recording, which is also what the gateway's upstream will transcribe in one call. */
export const MAX_RECORDING_MS = 60_000;

/** A press held at least this long is a hold, and releasing it stops. A shorter one is a tap. */
export const HOLD_MS = 350;

/** What MediaRecorder is asked for, best first: Chromium and Electron record webm/opus. */
const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export type RecordingFormat = "webm" | "ogg" | "m4a";

/** The gateway's name for a recorder's container, or null for one it cannot take. */
export function recordingFormat(mimeType: string): RecordingFormat | null {
  const container = mimeType.split(";")[0]?.trim().toLowerCase();
  if (container === "audio/webm" || container === "video/webm") return "webm";
  if (container === "audio/ogg") return "ogg";
  if (container === "audio/mp4" || container === "audio/x-m4a") return "m4a";
  return null;
}

/** The first type this recorder supports, or undefined to take its default. */
export function pickRecorderType(isTypeSupported: (type: string) => boolean): string | undefined {
  return RECORDER_TYPES.find((type) => isTypeSupported(type));
}

/** Bytes as base64, in chunks so a minute of audio does not overflow the argument list. */
export function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** The words in a transcript, or null when nothing was said. */
export function spokenText(text: string): string | null {
  const trimmed = text.trim();
  return /[\p{Letter}\p{Number}]/u.test(trimmed) ? trimmed : null;
}

/**
 * Where the mic is. `latched` is a recording started by a tap, which waits for a second tap; one
 * that is not latched is being held, and stops on release.
 */
export type MicPhase =
  | { kind: "idle" }
  | { kind: "recording"; pressedAt: number; latched: boolean }
  | { kind: "transcribing" };

export type MicStep = { phase: MicPhase; action: "start" | "stop" | null };

/** Pressing the mic starts a recording, stops one, or does nothing while the last is transcribed. */
export function micPress(phase: MicPhase, now: number): MicStep {
  if (phase.kind === "idle") return { phase: { kind: "recording", pressedAt: now, latched: false }, action: "start" };
  if (phase.kind === "recording") return { phase: { kind: "transcribing" }, action: "stop" };
  return { phase, action: null };
}

/** Releasing a hold stops it; releasing a tap leaves it recording until the next press. */
export function micRelease(phase: MicPhase, now: number): MicStep {
  if (phase.kind !== "recording" || phase.latched) return { phase, action: null };
  if (now - phase.pressedAt >= HOLD_MS) return { phase: { kind: "transcribing" }, action: "stop" };
  return { phase: { ...phase, latched: true }, action: null };
}

export type RecordedClip = { audio: string; format: RecordingFormat };

export type Recording = {
  /** Stops and hands back the clip, or null when nothing was recorded. */
  finish: () => Promise<RecordedClip | null>;
  /** Stops and throws the clip away. */
  cancel: () => void;
};

/** Opens the microphone and records, calling `onLimit` once the recording reaches the limit. */
export async function startRecording(onLimit: () => void): Promise<Recording> {
  const access = await askMicrophoneAccess();
  if (!access.granted) throw new Error(t("voice.macos_permission_denied"));
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const release = () => stream.getTracks().forEach((track) => track.stop());
  let recorder: MediaRecorder;
  try {
    const mimeType = pickRecorderType((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    release();
    throw error;
  }
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const limit = window.setTimeout(onLimit, MAX_RECORDING_MS);
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  const stop = () => {
    window.clearTimeout(limit);
    if (recorder.state !== "inactive") recorder.stop();
    release();
  };
  recorder.start();
  return {
    finish: async () => {
      stop();
      await stopped;
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (blob.size === 0) return null;
      const format = recordingFormat(recorder.mimeType);
      if (!format) throw new Error(t("desk.mic_reason_device"));
      return { audio: base64Of(new Uint8Array(await blob.arrayBuffer())), format };
    },
    cancel: stop,
  };
}

/** The words in a clip, transcribed in the app's language, or null when nothing was said. */
export async function transcribeClip(
  client: DictationClient,
  workspaceId: string,
  clip: RecordedClip,
): Promise<string | null> {
  const { text } = await client.transcribeAudio(workspaceId, { ...clip, language: currentLocale() });
  return spokenText(text);
}
