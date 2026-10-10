import { create } from "zustand";

import type { RedrobServerClient } from "@/app/lib/redrob-server";
import { readStoredPrivacy } from "@/react-app/desk/privacy/privacy-store";

/**
 * Read a reply aloud.
 *
 * The engine speaks on its own Redrob credential (`POST /voice/speech` here, `/redrob/speech` there),
 * so the app sends text and plays mp3 and never holds the key. One reply plays at a time across the
 * whole app: starting another stops the first, the way a person expects a speaker button to behave.
 */

/**
 * Whether voice may run for this privacy level. Speech cannot be labelled the way text is, so at High
 * and Strict protection the reply would reach a speech vendor with its real values in it. The server
 * refuses the same requests; this only keeps a button from being offered that would be refused.
 */
export function voiceAllowedForPrivacy(redrob: Record<string, unknown> | null | undefined): boolean {
  const level = readStoredPrivacy(redrob).level;
  return level !== "high" && level !== "strict";
}

/** The engine's limit for one request, in code points, which is how it counts. */
export const MAX_SPEECH_CHUNK = 4_096;

/**
 * What a listener should hear from a markdown reply. Code is left out rather than spelled out
 * character by character; a link reads as its label; formatting marks are dropped.
 */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, " ")
    .replace(/\|/g, ", ")
    .replace(/(\*\*|__|~~|\*|_)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/**
 * The text in pieces the engine accepts, broken at sentence ends where possible, then at spaces, and
 * only as a last resort mid-word, so a long reply plays as one continuous reading.
 */
export function splitForSpeech(text: string, max = MAX_SPEECH_CHUNK): string[] {
  const sentences = text.match(/[^.!?。！？\n]+(?:[.!?。！？]+|\n+|$)/gu) ?? [];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };
  for (const sentence of sentences) {
    if (codePoints(current) + codePoints(sentence) <= max) {
      current += sentence;
      continue;
    }
    push();
    let rest = sentence;
    while (codePoints(rest) > max) {
      const head = [...rest].slice(0, max).join("");
      const space = head.lastIndexOf(" ");
      const cut = space > max / 2 ? space : head.length;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    current = rest;
  }
  push();
  return chunks.filter(Boolean);
}

type ReadAloudState = {
  /** The reply being read, or null. */
  activeId: string | null;
  status: "idle" | "loading" | "playing";
  error: string | null;
};

export const useReadAloudStore = create<ReadAloudState>(() => ({ activeId: null, status: "idle", error: null }));

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
/** Bumped on every start and stop, so a reading that was superseded drops its late answers. */
let generation = 0;

function release() {
  audio?.pause();
  audio = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

export function stopReadAloud() {
  generation += 1;
  release();
  useReadAloudStore.setState({ activeId: null, status: "idle" });
}

/**
 * Read `markdown` aloud as reply `id`. Each piece is fetched while the one before it plays, so the
 * pause between pieces is as short as the engine allows.
 */
export async function startReadAloud(
  client: Pick<RedrobServerClient, "speakText">,
  workspaceId: string,
  id: string,
  markdown: string,
): Promise<void> {
  stopReadAloud();
  const run = generation;
  const chunks = splitForSpeech(speakableText(markdown));
  if (!chunks.length) return;
  useReadAloudStore.setState({ activeId: id, status: "loading", error: null });
  const fetchChunk = (chunk: string) => client.speakText(workspaceId, chunk);
  try {
    let next = fetchChunk(chunks[0]);
    for (let index = 0; index < chunks.length; index += 1) {
      const spoken = await next;
      if (run !== generation) return;
      if (index + 1 < chunks.length) next = fetchChunk(chunks[index + 1]);
      release();
      objectUrl = URL.createObjectURL(new Blob([spoken.data], { type: spoken.contentType ?? "audio/mpeg" }));
      const element = new Audio(objectUrl);
      audio = element;
      const ended = new Promise<void>((resolve, reject) => {
        element.onended = () => resolve();
        element.onerror = () => reject(new Error("The audio could not be played."));
      });
      await element.play();
      useReadAloudStore.setState({ status: "playing" });
      await ended;
      if (run !== generation) return;
    }
    release();
    useReadAloudStore.setState({ activeId: null, status: "idle" });
  } catch (cause) {
    if (run !== generation) return;
    release();
    useReadAloudStore.setState({
      activeId: null,
      status: "idle",
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
