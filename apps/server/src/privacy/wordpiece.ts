/*
 * The BERT WordPiece tokenizer, from @redrob-labs/route-labeller.
 *
 * It lived here first, written for the privacy detector. The route labeller runs a BERT-family
 * encoder on the person's machine too, with the same tokenizer configuration, so the implementation
 * moved into that shared package rather than being copied; Office and Design use it from there.
 * wordpiece.test.ts still pins it against the Python reference, here, where it was first measured.
 */
export * from "@redrob-labs/route-labeller/wordpiece";
