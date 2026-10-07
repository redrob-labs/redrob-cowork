/*
 * The privacy gate, inside the engine. Every model request goes through these hooks, so this is
 * where private details are swapped for labels on the way out and put back on the way in, for
 * everything the model reads: what the person typed, text extracted from attachments, what tools
 * returned (file reads, connector and web results), earlier turns and the system text.
 *
 * The labelling itself happens in redrob-server (privacy/gate.ts), reached over the loopback URL
 * and token the server launched this engine with. One process, one map per chat.
 *
 * Hooks used (redrob-code v0.1.0, packages/plugin/src/index.ts):
 * - `experimental.chat.messages.transform`: the prompt loop and context compaction both run it on
 *   the copy of the history they are about to send, so the stored history is never touched.
 * - `experimental.chat.system.transform`: the system text, team notes included.
 * - `tool.execute.before`: the real values go back into tool arguments, so a file the agent writes or
 *   an email a connector sends says 김지원, not [PERSON_1].
 * - `experimental.text.complete`: each finished answer is restored before it is stored, so the
 *   history keeps real values and the person reads them.
 * - `config`: chat titles are written by a separate model call that does not run the messages
 *   hook (session/prompt.ts ensureTitle), so with protection on, the title agent is turned off.
 * - `tool`: `privacy_compute`, exact arithmetic on the real values behind labels
 *   (privacy/compute.ts). It runs here, on this machine, after its arguments were restored, and
 *   its answer reaches the model through the messages hook like any tool result.
 *
 * Fails closed: if the server cannot label a request while protection is on, the request is not
 * sent. An attachment the gate cannot read (an image, a PDF that is not text) is left out at High
 * and Strict, with a note in its place saying why.
 */

import { z } from "zod";

import { compute, ComputeError } from "../privacy/compute.js";

type Json = Record<string, unknown>;
type Part = Json & { type?: string };
type Message = { info?: Json; parts?: Part[] };

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function server(): { url: string; token: string } | null {
  const url = String(process.env.REDROB_SERVER_URL || "").replace(/\/$/, "");
  const token = String(process.env.REDROB_SERVER_TOKEN || "");
  return url && token ? { url, token } : null;
}

async function gate<T>(body: Json): Promise<T> {
  const target = server();
  if (!target) throw new Error("Privacy protection could not reach Redrob Cowork, so nothing was sent.");
  let response: Response;
  try {
    response = await fetch(`${target.url}/privacy/gate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${target.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Privacy protection could not reach Redrob Cowork, so nothing was sent.");
  }
  if (!response.ok) throw new Error(`Privacy protection failed (${response.status}), so nothing was sent.`);
  return (await response.json()) as T;
}

const TEXT_MIME = /^(text\/|application\/(json|xml|csv|x-yaml|yaml|markdown))/i;

function decodeDataUrl(url: string): string | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
  if (!match) return null;
  try {
    return match[2] ? Buffer.from(match[3] ?? "", "base64").toString("utf8") : decodeURIComponent(match[3] ?? "");
  } catch {
    return null;
  }
}

/** A slot in the history whose text the gate labels in place. */
type Slot = { get: () => string; set: (value: string) => void };

function collect(messages: Message[], withheld: Array<{ message: Message; index: number; name: string }>): Slot[] {
  const slots: Slot[] = [];
  for (const message of messages) {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    parts.forEach((part, index) => {
      if (part.type === "text" && typeof part.text === "string") {
        slots.push({ get: () => part.text as string, set: (value) => (part.text = value) });
      } else if (part.type === "tool" && isRecord(part.state)) {
        const state = part.state;
        if (typeof state.output === "string") {
          slots.push({ get: () => state.output as string, set: (value) => (state.output = value) });
        }
        if (typeof state.error === "string") {
          slots.push({ get: () => state.error as string, set: (value) => (state.error = value) });
        }
      } else if (part.type === "file" && typeof part.url === "string") {
        const mime = typeof part.mime === "string" ? part.mime : "";
        const text = TEXT_MIME.test(mime) ? decodeDataUrl(part.url) : null;
        if (text !== null) {
          slots.push({
            get: () => text,
            set: (value) => (part.url = `data:${mime};base64,${Buffer.from(value, "utf8").toString("base64")}`),
          });
        } else if (part.url.startsWith("data:") || part.url.startsWith("file:")) {
          withheld.push({ message, index, name: typeof part.filename === "string" ? part.filename : "attachment" });
        }
      }
    });
  }
  return slots;
}

function sessionOf(messages: Message[]): string | null {
  for (const message of messages) {
    const id = message.info?.sessionID;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

const computeArgsSchema = z.object({
  expression: z
    .string()
    .min(1)
    .max(2_000)
    .describe(
      "One expression using labels as written, for example `[AMOUNT_3] + [AMOUNT_7]`, `[AMOUNT_2] * 3.5%`, `days(2026-03-01, 2026-10-31)` or `[AMOUNT_1] > [AMOUNT_4]`. Supports + - * / ( ), one comparison, and sum, min, max, abs, round(value, places), days(from, to).",
    ),
});

const COMPUTE_DESCRIPTION =
  "Exact arithmetic on the real values behind privacy labels, run on the person's computer. Use it whenever you need the exact sum, difference, ratio or comparison of amounts, or the days between dates, in a conversation with labels: rounded amounts such as [AMOUNT_1](≈₩12,000,000) are not exact. Pass the labels as written. The result comes back labelled where it is private.";

/** Labels the gate could not resolve, as written; none means the arguments were restored. */
const UNRESOLVED = /[\[［]\s*(?:EMAIL|RRN|BRN|CARD|PHONE|ACCOUNT|ADDRESS|PERSON|ORG|TITLE|AMOUNT|NAME)[_\s]\d+\s*[\]］]/;

// Single export: the OpenCode plugin loader treats every export of a plugin
// module as a plugin factory, so helpers must stay module-private.
export const RedrobWorkPrivacyGate = async (factoryInput?: unknown) => {
  const directory = isRecord(factoryInput) && typeof factoryInput.directory === "string" ? factoryInput.directory : null;
  return {
    config: async (config: unknown) => {
      if (!isRecord(config)) return;
      const settings = await gate<{ level: string }>({ op: "settings", directory }).catch(() => ({ level: "standard" }));
      if (settings.level === "off") return;
      const agents = isRecord(config.agent) ? config.agent : (config.agent = {});
      (agents as Json).title = { ...(isRecord((agents as Json).title) ? ((agents as Json).title as Json) : {}), disable: true };
    },

    "experimental.chat.messages.transform": async (_input: unknown, output: { messages: Message[] }) => {
      const sessionID = sessionOf(output.messages);
      if (!sessionID) return;
      const withheld: Array<{ message: Message; index: number; name: string }> = [];
      const slots = collect(output.messages, withheld);
      const result = await gate<{ texts: string[]; level: string }>({
        op: "label",
        sessionID,
        directory,
        texts: slots.map((slot) => slot.get()),
      });
      if (!Array.isArray(result.texts) || result.texts.length !== slots.length) {
        throw new Error("Privacy protection returned an unexpected answer, so nothing was sent.");
      }
      slots.forEach((slot, index) => slot.set(result.texts[index]!));
      if (result.level === "high" || result.level === "strict") {
        // Right to left within each message, so earlier indexes stay valid.
        for (const item of [...withheld].reverse()) {
          item.message.parts?.splice(item.index, 1, {
            type: "text",
            text: `[An attachment (${item.name}) was left out: privacy protection cannot check this kind of file.]`,
            synthetic: true,
          });
        }
      }
    },

    "experimental.chat.system.transform": async (input: { sessionID?: string }, output: { system: string[] }) => {
      if (!input?.sessionID) return;
      const result = await gate<{ texts: string[]; instruction: string | null }>({
        op: "label",
        sessionID: input.sessionID,
        directory,
        texts: output.system,
      });
      if (!Array.isArray(result.texts) || result.texts.length !== output.system.length) {
        throw new Error("Privacy protection returned an unexpected answer, so nothing was sent.");
      }
      output.system.splice(0, output.system.length, ...result.texts);
      if (result.instruction) output.system.push(result.instruction);
    },

    "tool.execute.before": async (input: { sessionID: string }, output: { args: unknown }) => {
      if (!input?.sessionID || output.args === undefined) return;
      const result = await gate<{ value: unknown }>({ op: "restore", sessionID: input.sessionID, value: output.args });
      output.args = result.value;
    },

    "experimental.text.complete": async (input: { sessionID: string }, output: { text: string }) => {
      if (!input?.sessionID || !output.text) return;
      // Restoring an answer must never lose it: on any failure the labelled text is kept.
      const result = await gate<{ value: unknown }>({ op: "restore", sessionID: input.sessionID, value: output.text }).catch(
        () => null,
      );
      if (result && typeof result.value === "string") output.text = result.value;
    },

    tool: {
      privacy_compute: {
        description: COMPUTE_DESCRIPTION,
        args: computeArgsSchema.shape,
        async execute(rawArgs: unknown, context?: { sessionID?: string }) {
          let { expression } = computeArgsSchema.parse(rawArgs);
          // tool.execute.before has normally restored the arguments already; restoring twice is
          // harmless, and covers a runtime that skips that hook for plugin tools.
          if (context?.sessionID && UNRESOLVED.test(expression)) {
            const restored = await gate<{ value: unknown }>({ op: "restore", sessionID: context.sessionID, value: expression }).catch(() => null);
            if (restored && typeof restored.value === "string") expression = restored.value;
          }
          const unresolved = expression.match(new RegExp(UNRESOLVED.source, "g"));
          if (unresolved) {
            return JSON.stringify({ ok: false, error: `This conversation has no value for ${[...new Set(unresolved)].join(", ")}.` });
          }
          try {
            const result = compute(expression);
            return JSON.stringify({ ok: true, result: result.text });
          } catch (error) {
            if (error instanceof ComputeError) return JSON.stringify({ ok: false, error: error.message });
            throw error;
          }
        },
      },
    },
  };
};
