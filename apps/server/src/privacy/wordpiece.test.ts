import { describe, expect, test } from "bun:test";

import parity from "./fixtures/wordpiece-parity.json" with { type: "json" };
import { WordPiece } from "./wordpiece.js";

describe("WordPiece", () => {
  const tokenizer = new WordPiece({ vocab: new Map(Object.entries(parity.vocab as Record<string, number>)) });

  for (const sample of parity.cases) {
    test(`matches Hugging Face tokenizers: ${sample.text.slice(0, 32)}`, () => {
      const tokens = tokenizer.tokenize(sample.text);
      expect(tokens.map((token) => token.id)).toEqual(sample.ids);
      expect(tokens.map((token) => [token.start, token.end])).toEqual(sample.offsets);
    });
  }

  test("offsets slice the piece's own characters out of the input", () => {
    const text = "김지원님은 Acme Robotics와 계약했다.";
    for (const token of tokenizer.tokenize(text)) {
      if (token.piece === "[UNK]") continue;
      expect(text.slice(token.start, token.end)).toBe(token.piece.replace(/^##/, ""));
    }
  });
});
