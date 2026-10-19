// SPDX-FileCopyrightText: 2026-present Janghoon Lee (Redrob) and contributors
// SPDX-License-Identifier: MIT

import { ApiError } from "./errors.js";
import { externalFetch } from "./server-fetch.js";

/**
 * Share a Cowork session transcript or a workspace artifact to Redrob Chat and get a link back.
 *
 * Redrob Chat's `POST /share` accepts the same Redrob Console API key Cowork already holds (the
 * engine owns it; see redrob-auth.ts). The key is read from the engine at the moment of the call,
 * sent to the chat API in the Authorization header, and never returned, logged or stored. The
 * renderer only ever sees `{ id, url }`.
 */

/**
 * Production chat API, used when constants.json has no `redrobChatApiUrl`. Overridable with
 * `REDROB_CHAT_API_URL` (env store or process env).
 */
export const REDROB_CHAT_API_URL_DEFAULT = "https://chat-prod.redrob.ai";
export const REDROB_CHAT_API_URL_ENV = "REDROB_CHAT_API_URL";

/** Contract limits (redrob-chat share contract). Checked here so the user gets a clear error. */
const MAX_SHARE_BYTES = 2 * 1024 * 1024;
const MAX_SHARE_MESSAGES = 500;
const MAX_TITLE_LENGTH = 200;

export type RedrobChatShareVisibility = "public" | "unlisted" | "private";
export type RedrobChatShareMessage = { role: "user" | "assistant" | "system" | "tool"; content: string };
export type RedrobChatShareArtifact = {
  format: "markdown" | "html" | "code" | "json";
  language?: string;
  body: string;
};

export type RedrobChatSharePayload = {
  kind: "transcript" | "artifact";
  title: string;
  visibility: RedrobChatShareVisibility;
  messages?: RedrobChatShareMessage[];
  artifact?: RedrobChatShareArtifact;
};

export type RedrobChatShareResult = { id: string; url: string };

export type RedrobChatShareFetch = (input: string, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseShareVisibility(value: unknown): RedrobChatShareVisibility {
  if (value === undefined || value === null || value === "") return "unlisted";
  if (value === "public" || value === "unlisted" || value === "private") return value;
  throw new ApiError(400, "invalid_visibility", "visibility must be public, unlisted or private");
}

export function normalizeShareTitle(value: unknown, fallback: string): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback.trim();
  const title = raw || "Redrob Cowork";
  return title.length > MAX_TITLE_LENGTH ? title.slice(0, MAX_TITLE_LENGTH) : title;
}

/** Resolve the chat API base: env store, then process env, then constants.json, then production. */
export function resolveRedrobChatApiUrl(storedValue: string | undefined, constantsValue: string | undefined): string {
  const value =
    storedValue?.trim() ||
    process.env[REDROB_CHAT_API_URL_ENV]?.trim() ||
    constantsValue?.trim() ||
    REDROB_CHAT_API_URL_DEFAULT;
  return value.replace(/\/+$/, "");
}

function toolLine(part: Record<string, unknown>): string | null {
  const tool = typeof part.tool === "string" ? part.tool : "";
  if (!tool) return null;
  const state = isRecord(part.state) ? part.state : {};
  const title = typeof state.title === "string" && state.title.trim() ? ` — ${state.title.trim()}` : "";
  return `> Used tool \`${tool}\`${title}`;
}

/**
 * Turn the engine's session messages into the contract's `{ role, content }` list.
 *
 * Text parts become the message body; tool calls become one quoted line each so a reader can see
 * what the agent did without the raw tool output. Reasoning, synthetic and step parts are not part
 * of what the user saw as the conversation and are left out. Messages with nothing to show are
 * dropped.
 */
export function buildTranscriptShareMessages(messages: ReadonlyArray<{ info: Record<string, unknown>; parts: ReadonlyArray<Record<string, unknown>> }>): RedrobChatShareMessage[] {
  const out: RedrobChatShareMessage[] = [];
  for (const message of messages) {
    const role = message.info.role === "user" ? "user" : message.info.role === "assistant" ? "assistant" : null;
    if (!role) continue;
    const blocks: string[] = [];
    for (const part of message.parts) {
      if (part.type === "text") {
        if (part.synthetic === true || part.ignored === true) continue;
        const text = typeof part.text === "string" ? part.text.trim() : "";
        if (text) blocks.push(text);
      } else if (part.type === "tool") {
        const line = toolLine(part);
        if (line) blocks.push(line);
      } else if (part.type === "file") {
        const name = typeof part.filename === "string" && part.filename.trim() ? part.filename.trim() : "file";
        blocks.push(`> Attached \`${name}\``);
      }
    }
    const content = blocks.join("\n\n");
    if (content) out.push({ role, content });
  }
  return out;
}

const CODE_LANGUAGES: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".css": "css",
  ".scss": "scss",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".csv": "csv",
  ".tsv": "tsv",
  ".txt": "text",
  ".log": "text",
  ".jsonc": "jsonc",
};

/** Map a workspace text file to the contract's artifact format. */
export function artifactForPath(relativePath: string, body: string): RedrobChatShareArtifact {
  const lowered = relativePath.toLowerCase();
  const dot = lowered.lastIndexOf(".");
  const ext = dot >= 0 ? lowered.slice(dot) : "";
  if (ext === ".md" || ext === ".mdx" || ext === ".markdown") return { format: "markdown", body };
  if (ext === ".html" || ext === ".htm") return { format: "html", body };
  if (ext === ".json") return { format: "json", body };
  return { format: "code", language: CODE_LANGUAGES[ext] ?? "text", body };
}

/**
 * POST the share to Redrob Chat. Errors are opaque on purpose: the chat API's error body could
 * echo request content, so only a status-derived code reaches the caller.
 */
export async function postRedrobChatShare(input: {
  baseUrl: string;
  key: string;
  payload: RedrobChatSharePayload;
  fetchImpl?: RedrobChatShareFetch;
}): Promise<RedrobChatShareResult> {
  const { payload } = input;
  if (payload.messages && payload.messages.length === 0) {
    throw new ApiError(400, "share_empty", "This conversation has no messages to share yet");
  }
  if (payload.messages && payload.messages.length > MAX_SHARE_MESSAGES) {
    throw new ApiError(413, "share_too_long", `Redrob Chat accepts at most ${MAX_SHARE_MESSAGES} messages per share`);
  }
  const body = JSON.stringify({ ...payload, source: "cowork" });
  if (Buffer.byteLength(body, "utf8") > MAX_SHARE_BYTES) {
    throw new ApiError(413, "share_too_large", "This is larger than the 2 MB Redrob Chat accepts per share");
  }

  const fetchImpl = input.fetchImpl ?? externalFetch;
  let response: Response;
  try {
    response = await fetchImpl(`${input.baseUrl}/share`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.key}` },
      body,
    });
  } catch {
    throw new ApiError(502, "redrob_chat_unreachable", "Could not reach Redrob Chat");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, "redrob_chat_unauthorized", "Redrob Chat did not accept this Redrob Key");
  }
  if (response.status === 413) {
    throw new ApiError(413, "share_too_large", "Redrob Chat says this share is too large");
  }
  if (response.status === 429) {
    throw new ApiError(429, "redrob_chat_rate_limited", "Too many shares right now. Try again in a minute.");
  }
  if (response.status === 400) {
    throw new ApiError(400, "share_rejected", "Redrob Chat rejected this share");
  }
  if (!response.ok) {
    throw new ApiError(502, "redrob_chat_failed", "Redrob Chat could not create the link");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  const id = isRecord(result) && typeof result.id === "string" ? result.id : "";
  const url = isRecord(result) && typeof result.url === "string" ? result.url : "";
  if (!id || !/^https?:\/\//i.test(url)) {
    throw new ApiError(502, "redrob_chat_invalid_response", "Redrob Chat did not return a link");
  }
  return { id, url };
}
