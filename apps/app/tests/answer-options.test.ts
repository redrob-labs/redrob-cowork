import { describe, expect, test } from "bun:test";
import { hasIncompleteOptionsMarker, parseAnswerOptions } from "../src/components/chat/answer-options";

describe("answer options", () => {
  test("takes the marker off the end and returns the choices", () => {
    const { body, options } = parseAnswerOptions("Here is the plan.\n\n[OPTIONS: Merge it now | Wait for CI]");
    expect(body).toBe("Here is the plan.");
    expect(options).toEqual(["Merge it now", "Wait for CI"]);
  });

  test("leaves a message with no marker exactly as it was", () => {
    const text = "No choices here. Just an answer.";
    expect(parseAnswerOptions(text)).toEqual({ body: text, options: [] });
  });

  test("ignores a marker that is not the last line, because that is prose", () => {
    /*
      A paragraph that happens to describe the syntax is not an offer of choices, and stripping it would
      delete words the reader needed. Position is the whole signal.
    */
    const text = "You can write [OPTIONS: a | b] at the end.\n\nThat is the rule.";
    expect(parseAnswerOptions(text).options).toEqual([]);
    expect(parseAnswerOptions(text).body).toBe(text);
  });

  test("refuses a single choice, since one button is not a choice", () => {
    const text = "Only one way.\n\n[OPTIONS: Merge it now]";
    expect(parseAnswerOptions(text).options).toEqual([]);
    // Left in the text rather than swallowed, so a malformed marker is visible to whoever wrote it.
    expect(parseAnswerOptions(text).body).toBe(text);
  });

  test("drops empty segments from sloppy pipes", () => {
    const { options } = parseAnswerOptions("Pick.\n\n[OPTIONS: one | | two |]");
    expect(options).toEqual(["one", "two"]);
  });

  test("caps a runaway list rather than rendering a wall of buttons", () => {
    const { options } = parseAnswerOptions("Pick.\n\n[OPTIONS: a | b | c | d | e | f | g | h]");
    expect(options).toHaveLength(6);
  });

  test("accepts the case and spacing a model will actually produce", () => {
    expect(parseAnswerOptions("Pick.\n[options:  one   |   two  ]").options).toEqual(["one", "two"]);
  });

  test("knows a half-written marker from a finished one", () => {
    // A streaming reply passes through this state; chips that appear and then change are worse than none.
    expect(hasIncompleteOptionsMarker("Pick.\n[OPTIONS: merge it")).toBe(true);
    expect(hasIncompleteOptionsMarker("Pick.\n[OPTIONS: merge it | wait]")).toBe(false);
    expect(hasIncompleteOptionsMarker("Pick.")).toBe(false);
  });
});
