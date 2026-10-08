/**
 * Who wrote what in a live room, and what each person's turns cost, from the server's authorship
 * ledger. An assistant turn is credited to the person whose message it answered: the nearest user
 * message before it. Mirrors apps/server/src/cowork-room.ts.
 */

export type RoomAuthorship = { messageId: string; participantId: string; displayName: string; at: number };

export type RoomMessage = { id: string; role: "user" | "assistant" | "system" | string; cost?: number };

export type AuthorCost = { participantId: string; displayName: string; cost: number; messages: number };

/** Message id to author, for author chips. */
export function authorIndex(ledger: readonly RoomAuthorship[]): Map<string, RoomAuthorship> {
  return new Map(ledger.map((entry) => [entry.messageId, entry]));
}

/** Each message's author: its own for a user message, the asker's for an answer, none before the room. */
export function authorsByMessage(messages: readonly RoomMessage[], ledger: readonly RoomAuthorship[]): Map<string, RoomAuthorship> {
  const index = authorIndex(ledger);
  const out = new Map<string, RoomAuthorship>();
  let asker: RoomAuthorship | undefined;
  for (const message of messages) {
    if (message.role === "user") asker = index.get(message.id);
    if (asker) out.set(message.id, asker);
  }
  return out;
}

/** What each author's turns cost, in order of first appearance, and the total. */
export function costByAuthor(messages: readonly RoomMessage[], ledger: readonly RoomAuthorship[]): { authors: AuthorCost[]; total: number } {
  const authors = authorsByMessage(messages, ledger);
  const totals = new Map<string, AuthorCost>();
  let total = 0;
  for (const message of messages) {
    const cost = typeof message.cost === "number" && Number.isFinite(message.cost) ? message.cost : 0;
    total += cost;
    const author = authors.get(message.id);
    if (!author) continue;
    const entry = totals.get(author.participantId) ?? { participantId: author.participantId, displayName: author.displayName, cost: 0, messages: 0 };
    entry.cost += cost;
    if (message.role === "user") entry.messages += 1;
    totals.set(author.participantId, entry);
  }
  return { authors: [...totals.values()], total };
}
