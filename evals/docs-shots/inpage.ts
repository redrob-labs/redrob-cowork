import { evalIn } from "@redrob/behaviors";
import type { Surface } from "@redrob/cdp";

export interface InPageOptions {
  awaitPromise?: boolean;
  timeoutMs?: number;
}

/** Execute function source in the page with one JSON-serialized argument. */
export function inPage(
  surface: Surface,
  fnSource: string,
  args: unknown,
  options: InPageOptions = {},
): Promise<unknown> {
  const injected = JSON.stringify(args);
  if (injected === undefined) throw new Error("inPage arguments must be JSON-serializable.");
  return evalIn(surface, `(${fnSource})(${injected})`, options);
}
