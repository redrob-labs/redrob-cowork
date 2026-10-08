import { randomBytes } from "node:crypto";

/**
 * Ids in the engine's own format: `<prefix>_` + 12 hex characters of time and counter + 14 base62
 * characters. Sessions sort newest first (descending), messages and parts oldest first
 * (ascending). Mirrors `@redrob-code/schema/identifier`, which is not a dependency of this server.
 */

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MASK_48 = (1n << 48n) - 1n;

let lastTimestamp = 0;
let counter = 0;

function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  let output = "";
  for (let index = 0; index < length; index += 1) output += BASE62[bytes[index]! % 62];
  return output;
}

export function engineId(prefix: "ses" | "msg" | "prt", direction: "ascending" | "descending", now = Date.now()): string {
  if (now !== lastTimestamp) {
    lastTimestamp = now;
    counter = 0;
  }
  counter += 1;
  let value = (BigInt(now) * 0x1000n + BigInt(counter)) & MASK_48;
  if (direction === "descending") value = ~value & MASK_48;
  return `${prefix}_${value.toString(16).padStart(12, "0")}${randomBase62(14)}`;
}

const ENGINE_ID_RE = /^(ses|msg|prt)_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

export function isEngineId(value: unknown, prefix?: "ses" | "msg" | "prt"): value is string {
  if (typeof value !== "string") return false;
  const match = ENGINE_ID_RE.exec(value);
  return Boolean(match && (!prefix || match[1] === prefix));
}
