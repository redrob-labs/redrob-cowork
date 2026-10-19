import { describe, expect, test } from "bun:test";

import { mergeTabOrder, tabKeyTarget } from "../src/react-app/cowork/panel/cowork-browser";

// Dragging browser tabs stores the full tab order (the store refuses a partial one).

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

  test("a stale or partial order keeps the stored order", () => {
    expect(mergeTabOrder(all, ["zz", "b"])).toEqual(["a", "f", "b", "c"]);
    expect(mergeTabOrder(all, ["c", "c", "a"])).toEqual(["a", "f", "b", "c"]);
  });
});

// The tab strip is a keyboard tabs widget: arrows wrap, Home/End jump, other keys do nothing.
test("tabKeyTarget moves between tabs like a tablist", () => {
  const ids = ["a", "b", "c"];
  expect(tabKeyTarget(ids, "a", "ArrowRight")).toBe("b");
  expect(tabKeyTarget(ids, "c", "ArrowRight")).toBe("a");
  expect(tabKeyTarget(ids, "a", "ArrowLeft")).toBe("c");
  expect(tabKeyTarget(ids, "b", "Home")).toBe("a");
  expect(tabKeyTarget(ids, "b", "End")).toBe("c");
  expect(tabKeyTarget(ids, "b", "Enter")).toBeNull();
  expect(tabKeyTarget(ids, "gone", "ArrowRight")).toBeNull();
});
