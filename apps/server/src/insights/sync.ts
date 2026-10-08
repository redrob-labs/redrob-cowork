/*
 * Sends the outbox to the Redrob Console, with the person's Redrob Key.
 *
 * On by default whenever Cowork has a Redrob Key (decision 3 in the console's insights design): the
 * person and their workspace are the key's, so the console counts each session as that person's work
 * and nobody else's. What is sent is exactly what GET /insights/outbox shows, labels and counts.
 *
 * Sessions the console accepted, updated or rejected are removed: a rejection is permanent (an old
 * labeler, a label the console no longer accepts) and sending it again would only be refused again.
 * Anything that did not get an answer stays and is tried at the next run.
 */
import { externalFetch } from "../server-fetch.js";
import type { ServerConfig } from "../types.js";
import { teamPolicyConsoleBaseUrl } from "../team-policy/sync.js";
import { InsightsOutbox } from "./outbox.js";

export const INSIGHTS_SYNC_INTERVAL_MS = 10 * 60_000;
const SYNC_JITTER_MS = 2 * 60_000;
const STARTUP_DELAY_MS = 60_000;
const BATCH = 500;

export type InsightsSyncDeps = {
  /** The Redrob Key, read from the engine at the moment it is needed. Null when there is none. */
  readKey: () => Promise<string | null>;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  baseUrl?: string;
};

export type InsightsSyncOutcome =
  | { status: "nothing" | "no-key" }
  | { status: "sent"; accepted: number; updated: number; rejected: number }
  | { status: "refused"; code: number }
  | { status: "unreachable" };

type IngestAnswer = { accepted?: unknown; updated?: unknown; rejected?: unknown };

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export async function syncInsights(outbox: InsightsOutbox, deps: InsightsSyncDeps): Promise<InsightsSyncOutcome> {
  const entries = await outbox.list();
  if (!entries.length) return { status: "nothing" };
  const key = await deps.readKey();
  if (!key) return { status: "no-key" };
  const fetchImpl = deps.fetchImpl ?? externalFetch;
  const base = (deps.baseUrl ?? teamPolicyConsoleBaseUrl()).replace(/\/+$/, "");
  const totals = { accepted: 0, updated: 0, rejected: 0 };
  for (let start = 0; start < entries.length; start += BATCH) {
    const batch = entries.slice(start, start + BATCH).map((entry) => entry.session);
    let response: Response;
    try {
      response = await fetchImpl(`${base}/insights/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: batch }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return totals.accepted + totals.updated + totals.rejected ? { status: "sent", ...totals } : { status: "unreachable" };
    }
    if (!response.ok) return { status: "refused", code: response.status };
    const answer: IngestAnswer = await response.json().catch(() => ({}));
    totals.accepted += count(answer.accepted);
    totals.updated += count(answer.updated);
    totals.rejected += Array.isArray(answer.rejected) ? answer.rejected.length : 0;
    await outbox.remove(batch.map((session) => session.externalId));
  }
  return { status: "sent", ...totals };
}

export function startInsightsSync(
  config: ServerConfig,
  deps: InsightsSyncDeps,
  logger?: { log: (level: "info" | "warn", message: string, meta?: Record<string, unknown>) => void },
): () => void {
  const outbox = new InsightsOutbox(config);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void syncInsights(outbox, deps)
        .then((outcome) => {
          if (outcome.status === "sent" || outcome.status === "refused") logger?.log("info", "Insights sync", outcome);
        })
        .catch((error: unknown) => {
          logger?.log("warn", "Insights sync failed", { error: error instanceof Error ? error.message : "unknown" });
        })
        .finally(() => schedule(INSIGHTS_SYNC_INTERVAL_MS + Math.floor((Math.random() * 2 - 1) * SYNC_JITTER_MS)));
    }, delay);
    timer.unref?.();
  };
  schedule(STARTUP_DELAY_MS);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
