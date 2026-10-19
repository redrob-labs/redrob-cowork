import { describe, expect, test } from "bun:test";

import { mergeTabOrder } from "../src/react-app/cowork/panel/cowork-browser";

// Round 10 (R5): dragging browser tabs stores the full tab order (the store refuses a partial one).

describe("mergeTabOrder", () => {
  const all = [
    { id: "a", type: "browser" },
    { id: "f", type: "file" },
    { id: "b", type: "browser" },
    { id: "c", type: "browser" },
  ];

  test("browser slots take the dragged order; other tabs keep their slots", () => {
    expect(mergeTabOrder(all, ["c", "a", "b"])).toEqual(["c", "f", "a", "b"]);
  });

  test("an unchanged order is the same list", () => {
    expect(mergeTabOrder(all, ["a", "b", "c"])).toEqual(["a", "f", "b", "c"]);
  });

  test("a stale or partial order keeps the stored order", () => {
    expect(mergeTabOrder(all, ["zz", "b"])).toEqual(["a", "f", "b", "c"]);
    expect(mergeTabOrder(all, ["c", "c", "a"])).toEqual(["a", "f", "b", "c"]);
  });
});
