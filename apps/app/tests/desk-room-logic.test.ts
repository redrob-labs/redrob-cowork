import { describe, expect, test } from "bun:test";

import { authorsByMessage, costByAuthor, type RoomAuthorship, type RoomMessage } from "../src/react-app/desk/room/room-logic";

const park: Omit<RoomAuthorship, "messageId"> = { participantId: "par_1", displayName: "Park", at: 1 };
const kim: Omit<RoomAuthorship, "messageId"> = { participantId: "par_2", displayName: "Kim", at: 2 };

const messages: RoomMessage[] = [
  { id: "m0", role: "user" },
  { id: "a0", role: "assistant", cost: 0.5 },
  { id: "m1", role: "user" },
  { id: "a1", role: "assistant", cost: 0.25 },
  { id: "a1b", role: "assistant", cost: 0.05 },
  { id: "m2", role: "user" },
  { id: "a2", role: "assistant", cost: 1 },
];
const ledger: RoomAuthorship[] = [
  { ...park, messageId: "m1" },
  { ...kim, messageId: "m2" },
];

describe("room authorship", () => {
  test("an answer belongs to whoever asked; turns before the room have no author", () => {
    const authors = authorsByMessage(messages, ledger);
    expect(authors.get("m0")).toBeUndefined();
    expect(authors.get("a0")).toBeUndefined();
    expect(authors.get("a1")?.displayName).toBe("Park");
    expect(authors.get("a1b")?.displayName).toBe("Park");
    expect(authors.get("a2")?.displayName).toBe("Kim");
  });

  test("cost per author adds up with the unattributed rest to the total", () => {
    const { authors, total } = costByAuthor(messages, ledger);
    expect(authors).toEqual([
      { participantId: "par_1", displayName: "Park", cost: 0.3, messages: 1 },
      { participantId: "par_2", displayName: "Kim", cost: 1, messages: 1 },
    ]);
    expect(total).toBeCloseTo(1.8);
    const attributed = authors.reduce((sum, author) => sum + author.cost, 0);
    expect(total - attributed).toBeCloseTo(0.5);
  });
});
