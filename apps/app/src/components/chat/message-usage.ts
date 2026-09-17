/**
 * What a turn used, and how full the context is.
 *
 * The engine already computes both per assistant message - `cost` in USD and a `tokens` breakdown - and
 * the SDK type has carried them all along. The app dropped them at the two points where a session
 * message becomes a UI message: the live `message.updated` branch and the history reload, neither of
 * which so much as named the fields. So there was nothing to render a per-message cost from, and nothing
 * to build a context gauge from either. One plumbing job serves both.
 *
 * Kept out of the sync layer because these are the rules a reader sees - what counts toward the window,
 * what a percentage means - and none of them were testable inside an event handler.
 */

export type MessageUsageTokens = {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
};

export type MessageUsage = {
  /** USD for this turn, as the engine computed it. */
  cost?: number;
  tokens?: MessageUsageTokens;
  /**
   * Which model actually answered, when the gateway said so.
   *
   * The model a session is SET to is `auto` against Redrob's router, so the picker cannot answer "what
   * produced this reply". The gateway names the routed model on the same block as the cost, and the
   * engine now carries both onto the assistant message, so they arrive together and are read together.
   *
   * `upstreamProvider` is the vendor that served it, which is not always the model's own vendor: a
   * pinned vendor that fails falls through to a fallback. Absent for any provider that is not this
   * gateway, which is why both are optional and neither is ever synthesised from the requested model.
   */
  routedModel?: string;
  upstreamProvider?: string;
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * The metadata to merge onto a UI message, or undefined when the turn reports nothing.
 *
 * Undefined rather than an empty object, so a message with no usage does not gain a metadata key and
 * start looking different to `upsertMessage` than the one it replaces.
 */
export function messageUsageMetadata(info: {
  cost?: unknown;
  tokens?: unknown;
  routedModel?: unknown;
  upstreamProvider?: unknown;
}): MessageUsage | undefined {
  const cost = finite(info.cost);
  const routedModel = text(info.routedModel);
  const upstreamProvider = text(info.upstreamProvider);
  const raw = (info.tokens ?? undefined) as MessageUsageTokens | undefined;
  const tokens = raw
    ? {
        input: finite(raw.input),
        output: finite(raw.output),
        reasoning: finite(raw.reasoning),
        cache: raw.cache
          ? { read: finite(raw.cache.read), write: finite(raw.cache.write) }
          : undefined,
      }
    : undefined;
  const hasTokens =
    tokens !== undefined &&
    (tokens.input !== undefined ||
      tokens.output !== undefined ||
      tokens.reasoning !== undefined ||
      tokens.cache !== undefined);
  if (cost === undefined && !hasTokens && routedModel === undefined && upstreamProvider === undefined)
    return undefined;
  return {
    ...(cost === undefined ? {} : { cost }),
    ...(hasTokens ? { tokens } : {}),
    ...(routedModel === undefined ? {} : { routedModel }),
    ...(upstreamProvider === undefined ? {} : { upstreamProvider }),
  };
}

/** The usage a rendered message carries, read back out of its metadata. */
export function readMessageUsage(message: {
  metadata?: unknown;
}): MessageUsage | undefined {
  const opencode = (message.metadata as { opencode?: MessageUsage } | undefined)?.opencode;
  if (!opencode) return undefined;
  const cost = finite(opencode.cost);
  const tokens = opencode.tokens;
  const routedModel = text(opencode.routedModel);
  const upstreamProvider = text(opencode.upstreamProvider);
  if (cost === undefined && !tokens && routedModel === undefined && upstreamProvider === undefined)
    return undefined;
  return {
    ...(cost === undefined ? {} : { cost }),
    ...(tokens ? { tokens } : {}),
    ...(routedModel === undefined ? {} : { routedModel }),
    ...(upstreamProvider === undefined ? {} : { upstreamProvider }),
  };
}

/**
 * Tokens occupying the window after a turn.
 *
 * Input plus cache reads plus output, because that whole set is what the next request has to carry.
 * `reasoning` is NOT added: the engine reports it as a component of output, so adding it counts the same
 * tokens twice - which would have made the gauge overshoot on exactly the models people reach for.
 *
 * Cache WRITES are excluded for the opposite reason: a write is the cost of putting something in the
 * cache, not additional conversation occupying the window.
 */
export function contextTokensUsed(usage: MessageUsage | undefined): number | undefined {
  const tokens = usage?.tokens;
  if (!tokens) return undefined;
  const parts = [tokens.input, tokens.cache?.read, tokens.output].filter(
    (value): value is number => typeof value === "number",
  );
  if (parts.length === 0) return undefined;
  return parts.reduce((total, value) => total + value, 0);
}

/**
 * How full the window is, 0-100, from the LAST turn that reported usage.
 *
 * The last turn rather than a sum over the session: each request carries the whole conversation, so its
 * own input count already includes every earlier turn. Adding turns together would multiply the
 * transcript by the number of turns in it.
 *
 * Returns null when either half is unknown, so the caller shows nothing rather than a made-up number.
 */
export function contextUsagePercent(input: {
  usage: MessageUsage | undefined;
  contextLimitTokens: number | undefined;
}): number | null {
  const used = contextTokensUsed(input.usage);
  const limit = input.contextLimitTokens;
  if (used === undefined || !limit || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** The most recent usage in a transcript, newest first, ignoring turns that report none. */
export function latestUsage(
  messages: ReadonlyArray<{ role: string; metadata?: unknown }>,
): MessageUsage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    const usage = readMessageUsage(message);
    if (usage) return usage;
  }
  return undefined;
}

/** Session total, which IS a sum - cost accrues per turn where context does not. */
export function totalSessionCost(
  messages: ReadonlyArray<{ role: string; metadata?: unknown }>,
): number | undefined {
  let total = 0;
  let seen = false;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const cost = readMessageUsage(message)?.cost;
    if (cost === undefined) continue;
    total += cost;
    seen = true;
  }
  return seen ? total : undefined;
}

/**
 * A cost small enough that rounding to cents would print $0.00.
 *
 * Shown to four decimals instead, because "$0.0004" is a fact and "$0.00" reads as free.
 */
export function formatMessageCost(cost: number | undefined): string | null {
  if (cost === undefined || !Number.isFinite(cost) || cost < 0) return null;
  if (cost === 0) return "$0";
  const digits = cost < 0.01 ? 4 : cost < 1 ? 3 : 2;
  return `$${cost.toFixed(digits)}`;
}
