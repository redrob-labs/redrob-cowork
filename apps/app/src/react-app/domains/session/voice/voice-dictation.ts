import { desktopFetch } from "@/app/lib/desktop";
import type { RedrobServerClient } from "@/app/lib/redrob-server";
import { currentLocale, t } from "@/i18n";

export type DictationClient = Pick<RedrobServerClient, "createVoiceRealtimeSession">;

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

/** The transcript in a realtime event, or null for every other event. */
export function transcriptFromRealtimeEvent(raw: string): string | null {
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!event || typeof event !== "object" || !("type" in event) || !("transcript" in event)) return null;
  if (event.type !== "conversation.item.input_audio_transcription.completed") return null;
  return typeof event.transcript === "string" && /[\p{Letter}\p{Number}]/u.test(event.transcript)
    ? event.transcript.trim()
    : null;
}

/**
 * Dictation over the Voice Mode realtime session: the same session, microphone and
 * transcription, with replies turned off. Only what was said comes back; the realtime
 * model never answers, speaks or calls a tool. Resolves to a stop function.
 */
export async function startDictation(
  client: DictationClient,
  onTranscript: (text: string) => void,
): Promise<() => void> {
  const access = await askMicrophoneAccess();
  if (!access.granted) throw new Error(t("voice.macos_permission_denied"));
  const realtimeSession = await client.createVoiceRealtimeSession({ sessionContext: "", language: currentLocale() });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const peer = new RTCPeerConnection();
  const stop = () => {
    stream.getTracks().forEach((track) => track.stop());
    peer.close();
  };
  try {
    for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);
    const channel = peer.createDataChannel("oai-events");
    channel.addEventListener("message", (event) => {
      const text = transcriptFromRealtimeEvent(String(event.data));
      if (text) onTranscript(text);
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (!offer.sdp) throw new Error(t("voice.realtime_no_sdp"));
    const sdpResponse = await desktopFetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${realtimeSession.clientSecret}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    if (!sdpResponse.ok) throw new Error(t("voice.realtime_channel_failed"));
    await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    await waitForDataChannelOpen(channel);
    channel.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        audio: { input: { turn_detection: { type: "server_vad", create_response: false, interrupt_response: false } } },
      },
    }));
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}
