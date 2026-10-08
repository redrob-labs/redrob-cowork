/*
 * Labeled sessions waiting to be sent to the Redrob Console, on this machine.
 *
 * The person can read every entry here before anything is sent: it is exactly the payload, labels
 * and counts, and the app shows it as it is. Bounded, oldest dropped first, because a machine that is
 * never online should not fill its disk with analytics.
 */
import type { ServerConfig } from "../types.js";
import { createWorkspaceKvStore } from "../workspace-kv-store.js";
import type { LabeledSession } from "./labeler.js";

export const OUTBOX_LIMIT = 2_000;
/** One outbox per machine: sessions belong to the person, whichever workspace they were in. */
const OUTBOX_KEY = "machine";

export type OutboxEntry = { session: LabeledSession; queuedAt: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const store = createWorkspaceKvStore<OutboxEntry[]>({
  tableName: "insights_outbox",
  valueColumn: "entries_json",
  parse: (json) => {
    try {
      const value: unknown = JSON.parse(json);
      return Array.isArray(value)
        ? value.filter((entry): entry is OutboxEntry => isRecord(entry) && isRecord(entry.session) && typeof entry.queuedAt === "number")
        : [];
    } catch {
      return [];
    }
  },
  serialize: (value) => JSON.stringify(value),
});

export class InsightsOutbox {
  /** Writes are serialised, so two sessions finishing together cannot drop one another. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ServerConfig) {}

  async list(): Promise<OutboxEntry[]> {
    return (await store.get(this.config, OUTBOX_KEY)) ?? [];
  }

  add(session: LabeledSession, now = Date.now()): Promise<void> {
    const next = this.queue.then(async () => {
      const entries = (await this.list()).filter((entry) => entry.session.externalId !== session.externalId);
      entries.push({ session, queuedAt: now });
      await store.set(this.config, OUTBOX_KEY, entries.slice(-OUTBOX_LIMIT), now);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Drops the sessions the console has accepted, so they are not sent twice. */
  remove(externalIds: readonly string[], now = Date.now()): Promise<void> {
    const drop = new Set(externalIds);
    const next = this.queue.then(async () => {
      const entries = (await this.list()).filter((entry) => !drop.has(entry.session.externalId));
      await store.set(this.config, OUTBOX_KEY, entries, now);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
