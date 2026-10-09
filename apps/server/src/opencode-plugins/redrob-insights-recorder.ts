/*
 * The insights recorder, inside the engine.
 *
 * Two hooks:
 * - `event`: every bus event is reduced to a fact on this side (insights/facts.ts) -- counts, flags
 *   and times -- and only facts are sent to redrob-server, over the loopback URL and token the server
 *   launched this engine with. No message text, file content, command line or tool output crosses,
 *   with one exception: the text of each session's first message goes once to /insights/work, where
 *   the server's work classifier names its family on this machine and drops the text.
 * - `chat.headers`: every model request carries x-redrob-session, the session's id as the console
 *   knows it, so the console can join a labeled session to its own record of what the requests cost.
 *   A subagent's requests carry its root session's id.
 *
 * Never in the way: a fact that cannot be delivered is dropped. Analytics must not slow or break a
 * chat, unlike the privacy gate, which fails closed because it protects what is sent.
 */
import { factsOf, textPartOf, type Fact } from "../insights/facts.js";
import { externalIdOf } from "../insights/labeler.js";

const FLUSH_MS = 2_000;
const MAX_BUFFER = 500;
const MAX_TRACKED = 2_000;
/** What the classifier reads of a first message; it reads 256 tokens at most anyway. */
const MAX_WORK_TEXT = 4_000;

function server(): { url: string; token: string } | null {
  const url = String(process.env.REDROB_SERVER_URL || "").replace(/\/$/, "");
  const token = String(process.env.REDROB_SERVER_TOKEN || "");
  return url && token ? { url, token } : null;
}

// Single export: the OpenCode plugin loader treats every export of a plugin
// module as a plugin factory, so helpers must stay module-private.
export const RedrobWorkInsightsRecorder = async () => {
  const parents = new Map<string, string>();
  /** A root session's first message, until its text has gone to the classifier. */
  const firstMessages = new Map<string, string>();
  const read = new Set<string>();
  let buffer: Fact[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const rootOf = (sessionID: string): string => {
    let current = sessionID;
    for (let depth = 0; depth < 16; depth += 1) {
      const parent = parents.get(current);
      if (!parent) return current;
      current = parent;
    }
    return current;
  };

  const flush = async () => {
    timer = null;
    const target = server();
    const facts = buffer;
    buffer = [];
    if (!target || !facts.length) return;
    await fetch(`${target.url}/insights/facts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${target.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ facts }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
  };

  return {
    event: async (input: { event: unknown }) => {
      const part = textPartOf(input.event);
      if (part && firstMessages.get(part.sessionID) === part.messageID) {
        firstMessages.delete(part.sessionID);
        // The facts first, so the server knows this is the session's first message.
        await flush();
        const target = server();
        if (target) {
          await fetch(`${target.url}/insights/work`, {
            method: "POST",
            headers: { Authorization: `Bearer ${target.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: part.sessionID, messageID: part.messageID, text: part.text.slice(0, MAX_WORK_TEXT) }),
            signal: AbortSignal.timeout(5_000),
          }).catch(() => undefined);
        }
        return;
      }
      const fact = factsOf(input.event, Date.now());
      if (!fact) return;
      if (fact.kind === "user-turn" && !parents.has(fact.sessionID) && !read.has(fact.sessionID)) {
        read.add(fact.sessionID);
        firstMessages.set(fact.sessionID, fact.messageID);
        const oldest = read.values().next();
        if (read.size > MAX_TRACKED && !oldest.done) {
          read.delete(oldest.value);
          firstMessages.delete(oldest.value);
        }
      }
      if (fact.kind === "session" && fact.parentID) {
        parents.set(fact.sessionID, fact.parentID);
        const oldest = parents.keys().next();
        if (parents.size > MAX_TRACKED && !oldest.done) parents.delete(oldest.value);
      }
      buffer.push(fact);
      if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
      // Idle is when a session may be finishing; send at once rather than wait for the timer.
      if (fact.kind === "idle") await flush();
      else timer ??= setTimeout(() => void flush(), FLUSH_MS);
    },

    "chat.headers": async (input: { sessionID: string }, output: { headers: Record<string, string> }) => {
      if (!input?.sessionID) return;
      output.headers["x-redrob-session"] = externalIdOf(rootOf(input.sessionID));
    },
  };
};
