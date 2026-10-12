/*
 * Route labels, inside the engine. Before a request goes to Redrob Auto, the newest thing the person
 * asked is labelled with its ModelGuide profession and task on this machine, by redrob-server's route
 * labeller (route/label-source.ts), and the label rides on the request as `redrob.route`. Console
 * routes on it: the cell's best pick, at the pick's own effort.
 *
 * Hooks used (redrob-code v0.1.0, packages/plugin/src/index.ts):
 * - `experimental.chat.messages.transform`: the prompt loop runs it on the history it is about to
 *   send, which is where the newest user turn is readable. Remembered per session, read-only.
 * - `chat.params`: runs per request with the provider's options, which the OpenAI-compatible SDK
 *   spreads into the request body. Only for the Redrob provider's `auto`: a named model has nothing
 *   to route, and another provider would not know the field.
 *
 * Registered before the privacy gate, so the labeller reads what the person typed rather than its
 * labelled copy. That is safe because the labelling happens here, on this machine, and what leaves
 * it is two ids.
 *
 * Fails open: a label is a routing hint, not a gate. If the server cannot label, the request goes
 * without one and Console labels it itself, with the same lexicon.
 */
type Json = Record<string, unknown>;
type Part = Json & { type?: string; text?: unknown; synthetic?: unknown };
type Message = { info?: Json; parts?: Part[] };

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function server(): { url: string; token: string } | null {
  const url = String(process.env.REDROB_SERVER_URL || "").replace(/\/$/, "");
  const token = String(process.env.REDROB_SERVER_TOKEN || "");
  return url && token ? { url, token } : null;
}

/** The newest user turn's own text: what the person asked for, not what the app added around it. */
function newestUserText(messages: Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.info?.role !== "user") continue;
    const text = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string" && part.synthetic !== true)
      .map((part) => part.text as string)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

function sessionOf(messages: Message[]): string | null {
  for (const message of messages) {
    const id = message.info?.sessionID;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

/** The newest user text per session, kept until the next one. Bounded so a long-lived engine does not grow. */
const pending = new Map<string, string>();
const PENDING_LIMIT = 200;

async function label(text: string): Promise<Json | null> {
  const target = server();
  if (!target) return null;
  try {
    const response = await fetch(`${target.url}/route/label`, {
      method: "POST",
      headers: { Authorization: `Bearer ${target.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    return isRecord(body) && typeof body.profession === "string" && typeof body.task === "string" ? body : null;
  } catch {
    return null;
  }
}

// Single export: the plugin loader treats every export of a plugin module as a plugin factory.
export const RedrobWorkRouteLabels = async () => ({
  "experimental.chat.messages.transform": async (_input: unknown, output: { messages: Message[] }) => {
    const sessionID = sessionOf(output.messages);
    const text = newestUserText(output.messages);
    if (!sessionID || !text) return;
    pending.delete(sessionID);
    pending.set(sessionID, text);
    while (pending.size > PENDING_LIMIT) pending.delete(pending.keys().next().value as string);
  },

  "chat.params": async (
    input: { sessionID?: string; model?: { id?: string; providerID?: string; api?: { id?: string } } },
    output: { options: Record<string, unknown> },
  ) => {
    const providerID = input.model?.providerID ?? "";
    const modelID = input.model?.api?.id ?? input.model?.id ?? "";
    if (!providerID.startsWith("redrob") || modelID !== "auto" || !input.sessionID) return;
    const text = pending.get(input.sessionID);
    if (!text) return;
    const route = await label(text);
    if (!route) return;
    const existing = isRecord(output.options.redrob) ? output.options.redrob : {};
    output.options.redrob = { ...existing, route };
  },
});
