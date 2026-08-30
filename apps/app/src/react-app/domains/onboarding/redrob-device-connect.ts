import type { RedrobServerClient } from "../../../app/lib/redrob-server";

/**
 * "Redrob로 연결": the connect path that never asks anyone to handle a key.
 *
 * Work asks its own server to start a device authorization with the console, shows the short code it
 * gets back, opens the console in the system browser, and polls until the console hands over a
 * workspace key. The key lands in the same place a pasted one does, Redrob Code's auth store, so
 * nothing after this point can tell the two paths apart.
 *
 * The loop lives here in the renderer rather than on the server because it is a piece of user
 * interface: it has to show the code, count down, and stop the moment the user closes the step. What
 * the server keeps is the device code, which the renderer is never given.
 *
 * Every ending is stated. A denial, an expiry, or a console that refuses the device code stops the
 * loop and is reported as itself, so the step can say what happened instead of spinning. Nothing here
 * starts a second authorization on its own: a user who wants to try again presses the button again.
 */

export type RedrobDeviceConnectClient = Pick<
  RedrobServerClient,
  "startRedrobDeviceConnection" | "pollRedrobDeviceConnection" | "cancelRedrobDeviceConnection"
>;

/** What the step needs to show while the user is over in the browser. */
export type RedrobDeviceConnectPrompt = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
};

export type RedrobDeviceConnectOutcome =
  | { status: "connected" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "cancelled" }
  | { status: "failed"; code: string };

export type RedrobDeviceConnectOptions = {
  client: RedrobDeviceConnectClient;
  /** Called once, as soon as there is a code to show. */
  onPrompt: (prompt: RedrobDeviceConnectPrompt) => void;
  /** Opens the console in the system browser. Failing to open is not fatal: the code can be typed. */
  openLink: (url: string) => void;
  product?: string;
  /** Injected so the suites do not wait in real time. */
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Polled between attempts so closing the step stops the loop rather than orphaning it. */
  isCancelled?: () => boolean;
};

/**
 * How many times in a row the server may fail to reach the console before this gives up. A lost
 * network is worth riding out, an unreachable console is not worth pretending about.
 */
const MAX_UNREACHABLE = 5;
/** A console that asks us to slow down is obeyed by doubling, up to this. */
const MAX_INTERVAL_MS = 30_000;

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
  }
  return "poll_failed";
}

export async function runRedrobDeviceConnect({
  client,
  onPrompt,
  openLink,
  product,
  wait = defaultWait,
  now = () => Date.now(),
  isCancelled = () => false,
}: RedrobDeviceConnectOptions): Promise<RedrobDeviceConnectOutcome> {
  const started = await client.startRedrobDeviceConnection(product);

  onPrompt({
    userCode: started.userCode,
    verificationUri: started.verificationUri,
    verificationUriComplete: started.verificationUriComplete,
    expiresAt: started.expiresAt,
  });

  // After the prompt, so the code is on screen before the browser takes focus.
  openLink(started.verificationUriComplete);

  const stop = async (outcome: RedrobDeviceConnectOutcome): Promise<RedrobDeviceConnectOutcome> => {
    // Best effort: the server drops the record on its own deadline anyway.
    await client.cancelRedrobDeviceConnection(started.id).catch(() => undefined);
    return outcome;
  };

  let intervalMs = started.intervalMs > 0 ? started.intervalMs : 5_000;
  let unreachable = 0;

  for (;;) {
    if (isCancelled()) return stop({ status: "cancelled" });

    /**
     * Waited before the first poll on purpose. Nobody can have approved a code that has only just
     * been shown, so an immediate poll is a guaranteed pending answer and, on the console's own
     * pacing rule, the one after it would be told to slow down.
     */
    await wait(intervalMs);

    if (isCancelled()) return stop({ status: "cancelled" });
    if (now() >= started.expiresAt) return stop({ status: "expired" });

    let result: Awaited<ReturnType<RedrobDeviceConnectClient["pollRedrobDeviceConnection"]>>;
    try {
      result = await client.pollRedrobDeviceConnection(started.id);
    } catch (error) {
      /**
       * A failure from Work's own server, not from the console: a timeout, or the engine refusing
       * the key it was handed. Neither gets quieter by being retried, and the second one means a key
       * has already been collected, so retrying could not get it back.
       */
      return stop({ status: "failed", code: errorCode(error) });
    }

    if (result.status === "connected") return { status: "connected" };
    if (result.status === "denied") return { status: "denied" };
    if (result.status === "expired") return { status: "expired" };
    if (result.status === "failed") return { status: "failed", code: result.code };

    if (result.status === "unreachable") {
      unreachable += 1;
      if (unreachable >= MAX_UNREACHABLE) {
        return stop({ status: "failed", code: "console_unreachable" });
      }
      continue;
    }

    unreachable = 0;
    if (result.status === "slow_down") {
      intervalMs = Math.min(intervalMs * 2, MAX_INTERVAL_MS);
    }
  }
}
