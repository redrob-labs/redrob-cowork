import { describe, expect, test } from "bun:test";
import { DIGEST_MAX_CHARS, reasoningDigest } from "../src/components/chat/reasoning-digest";

/**
 * The digest that turns a raw reasoning trace into one line a person can read.
 *
 * Behavioural tests, not source-text ones: every rule here is a judgement about what counts as prose, and
 * the only way to know a judgement is right is to feed it the shape it will actually meet.
 */
describe("reasoningDigest", () => {
  test("returns null for an empty or blank trace", () => {
    // The caller renders the bare "Thinking…" label for null. There is nothing to summarise yet.
    expect(reasoningDigest("")).toBeNull();
    expect(reasoningDigest("   \n\n  ")).toBeNull();
  });

  test("returns null when the trace is only code", () => {
    /*
      Inventing a line here would mean describing work we did not read. A trace can legitimately be all
      code, and the honest render for that is the plain label.
    */
    expect(reasoningDigest("```ts\nconst x = compute(y)\nreturn x + 1\n```")).toBeNull();
    expect(reasoningDigest("if (a) { return b(c, d) } else { throw new Error(e) }")).toBeNull();
  });

  test("returns the LAST readable sentence, not the first", () => {
    /*
      While streaming that is where the model is now, which is the point of a progress line. Once finished
      it is the conclusion, which is more use than the opening restatement of the task.
    */
    const trace = "First I need to understand the failing test.\nThe cap is derived from the wrong field.";
    expect(reasoningDigest(trace)).toBe("The cap is derived from the wrong field.");
  });

  test("skips a code block sitting after the prose", () => {
    // Real traces alternate prose and code. The last PROSE line is wanted, not the last line.
    const trace = [
      "The overflow check reads limit.input, which is zero here.",
      "```ts",
      "const budget = model.limit.input ?? context",
      "```",
    ].join("\n");
    expect(reasoningDigest(trace)).toBe("The overflow check reads limit.input, which is zero here.");
  });

  test("drops an unclosed fence, because that is code still being written", () => {
    // Mid-stream the closing fence has not arrived. Without this the half-written code becomes the line.
    const trace = "I will rewrite the budget calculation.\n```ts\nconst budget = model.limit";
    expect(reasoningDigest(trace)).toBe("I will rewrite the budget calculation.");
  });

  test("rejects a path or an identifier masquerading as a sentence", () => {
    expect(reasoningDigest("packages/redrob/src/session/overflow.ts:14")).toBeNull();
    expect(reasoningDigest("DEFAULT_COMPACTION_THRESHOLD_PERCENT")).toBeNull();
    expect(reasoningDigest("https://example.com/a/very/long/path/segment")).toBeNull();
  });

  test("keeps a sentence that merely mentions a path", () => {
    // The symbol-ratio rule must not punish prose for naming a file, which reasoning does constantly.
    const line = "The threshold now lives in overflow.ts and the schema documents it.";
    expect(reasoningDigest(line)).toBe(line);
  });

  test("reads Korean, which has no spaces to split on", () => {
    /*
      The "longest token" rule would reject every CJK sentence as one long identifier, so it only applies
      to text that has spaces. The user of this app reads Korean; a digest that silently skipped Korean
      would leave them with the bare label they already had.
    */
    const line = "입력 상한이 0이라서 요약이 매 턴 발동하고 있습니다.";
    expect(reasoningDigest(line)).toBe(line);
  });

  test("strips list markers and quote markers", () => {
    expect(reasoningDigest("- The cap is derived from the wrong field entirely.")).toBe(
      "The cap is derived from the wrong field entirely.",
    );
    expect(reasoningDigest("> The cap is derived from the wrong field entirely.")).toBe(
      "The cap is derived from the wrong field entirely.",
    );
    expect(reasoningDigest("2. The cap is derived from the wrong field entirely.")).toBe(
      "The cap is derived from the wrong field entirely.",
    );
  });

  test("clips a long line and marks that it was clipped", () => {
    const long = `${"The threshold calculation needs to account for the published input cap ".repeat(3)}end.`;
    const digest = reasoningDigest(long);
    expect(digest).not.toBeNull();
    expect(digest!.length).toBeLessThanOrEqual(DIGEST_MAX_CHARS + 1);
    expect(digest!.endsWith("…")).toBe(true);
  });

  test("does not cut a Latin word in half", () => {
    const long = `${"understanding ".repeat(12)}done.`;
    const digest = reasoningDigest(long)!;
    // Everything before the ellipsis must be whole words.
    expect(digest.slice(0, -1).trim().split(" ").every((w) => w === "understanding")).toBe(true);
  });

  test("clips Korean by character, since there is no word boundary to honour", () => {
    // Korean is dense: the first version of this test was only 70 characters and never reached the 90-char
    // cap at all, so it asserted clipping on a string that was never clipped.
    const long =
      "요약 시작 지점을 모델이 발행한 입력 상한에서 유도해야 하고 그 값이 0일 때는 부재로 다뤄야 하며 그렇지 않으면 매 턴 요약이 발동해서 실행이 30초 상한에 걸립니다";
    expect(long.length).toBeGreaterThan(DIGEST_MAX_CHARS);
    const digest = reasoningDigest(long)!;
    expect(digest.length).toBeLessThanOrEqual(DIGEST_MAX_CHARS + 1);
    expect(digest.endsWith("…")).toBe(true);
  });

  test("ignores a short interjection in favour of a real sentence", () => {
    // "Hmm." and "OK." are frequent in traces and say nothing.
    const trace = "The router picks the seed model for this cell.\nHmm.\nOK.";
    expect(reasoningDigest(trace)).toBe("The router picks the seed model for this cell.");
  });
});
