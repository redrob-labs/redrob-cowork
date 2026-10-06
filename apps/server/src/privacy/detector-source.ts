import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { DetectorIntegrityError, loadDetector, type DetectedEntity, type EntityDetector, type OrtRuntime } from "./detector.js";

/*
 * Where redrob-server gets its privacy detection model, and the one copy of it per process.
 *
 * The model is optional: without one, or in a runtime that cannot load it, the gate works on
 * patterns and listed names alone and `status()` says why, so the app can tell the person instead of
 * implying names are being found. It is loaded on first use at High or Strict, never at Standard, so
 * nobody pays its memory (about 200 MB resident) or start-up for a level that does not use it.
 *
 * Trust: the directory comes from REDROB_PRIVACY_MODEL_DIR (the desktop app sets it to the model the
 * installer ships, C8). PINNED_MANIFEST_SHA256 pins that model's manifest, whose own hashes pin the
 * model and tokenizer files. Until a model ships it is null, and an unpinned model is loaded only in
 * dev mode, the same rule as the team-policy test keys.
 */

/** SHA-256 of the shipped model's manifest.json. Set when the installer ships a model (C8). */
export const PINNED_MANIFEST_SHA256: string | null = null;

export type DetectorStatus =
  | { state: "ready"; model: string }
  | { state: "not-loaded" }
  | { state: "absent"; reason: string }
  | { state: "failed"; reason: string };

const CACHE_LIMIT = 2_000;

export class DetectorSource {
  private loading: Promise<EntityDetector | null> | null = null;
  private current: DetectorStatus;
  /**
   * Results by text: the engine sends a chat's whole history with every turn, so each earlier
   * message would otherwise be read again each time. Holds offsets and values of what was found,
   * in memory only, like the label maps.
   */
  private readonly cache = new Map<string, DetectedEntity[]>();

  constructor(
    private readonly options: {
      directory: string | null;
      pinnedManifestSha256: string | null;
      allowUnpinned: boolean;
      loadRuntime?: () => Promise<OrtRuntime>;
      load?: typeof loadDetector;
    },
  ) {
    this.current = this.precheck() ?? { state: "not-loaded" };
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): DetectorSource {
    return new DetectorSource({
      directory: env.REDROB_PRIVACY_MODEL_DIR?.trim() || null,
      pinnedManifestSha256: PINNED_MANIFEST_SHA256,
      allowUnpinned: env.REDROB_DEV_MODE === "1",
    });
  }

  private precheck(): DetectorStatus | null {
    const { directory, pinnedManifestSha256, allowUnpinned } = this.options;
    if (!directory) return { state: "absent", reason: "no privacy model is installed" };
    if (!existsSync(join(directory, "manifest.json"))) return { state: "absent", reason: "the privacy model folder has no manifest" };
    if (!pinnedManifestSha256 && !allowUnpinned) return { state: "absent", reason: "this build trusts no privacy model yet" };
    return null;
  }

  status(): DetectorStatus {
    return this.current;
  }

  /** The detector, loading it on first call. Null when there is none to load; never throws. */
  get(): Promise<EntityDetector | null> {
    if (this.current.state === "absent" || this.current.state === "failed") return Promise.resolve(null);
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<EntityDetector | null> {
    const { directory, pinnedManifestSha256 } = this.options;
    try {
      const ort = await (this.options.loadRuntime ?? (async () => (await import("onnxruntime-node")) as unknown as OrtRuntime))();
      const detector = await (this.options.load ?? loadDetector)(directory!, ort, {
        expectedManifestSha256: pinnedManifestSha256 ?? undefined,
      });
      this.current = { state: "ready", model: detector.id };
      return detector;
    } catch (error) {
      // A tampered file and a runtime that cannot load native code end the same way, patterns
      // only, but say different things.
      const reason =
        error instanceof DetectorIntegrityError
          ? `the privacy model failed its integrity check: ${error.message}`
          : `the privacy model could not be loaded: ${error instanceof Error ? error.message : String(error)}`;
      this.current = { state: "failed", reason };
      return null;
    }
  }

  /** Detection with the per-text cache. Throws when the model fails mid-run: the gate fails closed. */
  async detect(detector: EntityDetector, text: string): Promise<DetectedEntity[]> {
    const key = createHash("sha256").update(text).digest("base64url");
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const found = await detector.detect(text);
    this.cache.set(key, found);
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value as string);
    return found;
  }
}
