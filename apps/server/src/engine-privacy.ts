/**
 * The workspace's privacy level, carried to the engine.
 *
 * Personal details are masked in Redrob Code (`privacy.mask_pii`), in one place for every provider
 * and every app that runs on the engine. Cowork keeps no masker of its own: the Cowork privacy page
 * sets a level per workspace (`coworkPrivacy.level`, lockable by a team policy), and that level is
 * translated to the engine's switch here.
 *
 *   off       -> off     nothing is touched
 *   standard  -> regex   emails, phones, cards, resident numbers
 *   high      -> model   regex plus a local model naming people, organisations and places
 *   strict    -> model   same masking; Strict differs in what voice may do (voice-privacy.ts)
 *
 * The engine holds one value, so the workspace written last decides. Writing fails loudly: the
 * caller refuses the change when the engine cannot be reached, rather than storing a level the
 * engine does not enforce.
 */
import { ApiError } from "./errors.js";
import { type RedrobAuthInput, putRedrobEnginePrivacy } from "./redrob-auth.js";
import { COWORK_PRIVACY_CONFIG_KEY } from "./team-lock.js";

export type EnginePrivacyMode = "off" | "regex" | "model";

const LEVELS = ["off", "standard", "high", "strict"] as const;
export type CoworkPrivacyLevel = (typeof LEVELS)[number];

/** The level under `coworkPrivacy`; "standard" where nothing or something unknown is set. */
export function coworkPrivacyLevel(redrob: Record<string, unknown> | null | undefined): CoworkPrivacyLevel {
  const value = redrob?.[COWORK_PRIVACY_CONFIG_KEY];
  const level = typeof value === "object" && value !== null ? (value as { level?: unknown }).level : undefined;
  return LEVELS.find((entry) => entry === level) ?? "standard";
}

export function engineModeForLevel(level: CoworkPrivacyLevel): EnginePrivacyMode {
  switch (level) {
    case "off":
      return "off";
    case "standard":
      return "regex";
    case "high":
    case "strict":
      return "model";
  }
}

/**
 * Push the level the given redrob config holds to the engine. Throws the engine's ApiError (503
 * when it is not reachable) so a config write can be refused before anything is stored.
 */
export async function syncEnginePrivacy(input: RedrobAuthInput, redrob: Record<string, unknown>): Promise<EnginePrivacyMode> {
  const mode = engineModeForLevel(coworkPrivacyLevel(redrob));
  await putRedrobEnginePrivacy(input, mode);
  return mode;
}

/** Same push, for writers that must not fail on it (a team policy arriving while the engine starts). */
export async function syncEnginePrivacyQuietly(
  input: RedrobAuthInput,
  redrob: Record<string, unknown>,
  log: (message: string) => void = () => undefined,
): Promise<void> {
  try {
    await syncEnginePrivacy(input, redrob);
  } catch (error) {
    const message = error instanceof ApiError ? `${error.code}: ${error.message}` : String(error);
    log(`privacy level not carried to the engine (${message}); it is retried when the level changes`);
  }
}
