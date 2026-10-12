import { existsSync } from "node:fs";
import { join } from "node:path";

import { loadRouteLabeller, type RouteLabel, type RouteLabeller } from "@redrob-labs/route-labeller/node";

/*
 * Where redrob-server gets its route labeller, and the one copy of it per process.
 *
 * The labeller says which ModelGuide profession and task a request is, on this machine, and the
 * engine plugin redrob-route-labels sends that to Console as `redrob.route`, which Redrob Auto routes
 * on. Only the two ids and the runners-up leave the machine; the text was going to Console anyway.
 *
 * The embedding model is optional. Without one, or in a runtime that cannot load it, the labeller
 * runs its lexical pass alone, the same one Console would run on an unlabelled request, and
 * `status()` says why. Loaded on first use, so a person who never sends a message to Auto never pays
 * its memory (about 150 MB resident).
 *
 * Integrity: every file in REDROB_ROUTE_MODEL_DIR is checked against the manifest pinned inside the
 * package before it is parsed or run, so pointing the variable elsewhere loads nothing but that model.
 */

export type RouteLabellerStatus =
  | { state: "not-loaded" }
  | { state: "ready"; mode: "embedding" | "lexical"; reason: string | null };

const CACHE_LIMIT = 500;

export class RouteLabelSource {
  private loading: Promise<RouteLabeller> | null = null;
  private current: RouteLabellerStatus = { state: "not-loaded" };
  /** Labels by text, because the engine re-sends a turn on every retry and compaction. */
  private readonly cache = new Map<string, RouteLabel>();

  constructor(private readonly options: { directory: string | null; load?: typeof loadRouteLabeller }) {}

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): RouteLabelSource {
    const directory = env.REDROB_ROUTE_MODEL_DIR?.trim() || null;
    return new RouteLabelSource({
      directory: directory && existsSync(join(directory, "manifest.json")) ? directory : null,
    });
  }

  status(): RouteLabellerStatus {
    return this.current;
  }

  private get(): Promise<RouteLabeller> {
    this.loading ??= (this.options.load ?? loadRouteLabeller)({ directory: this.options.directory }).then(
      ({ labeller, reason }) => {
        this.current = { state: "ready", mode: labeller.mode, reason };
        return labeller;
      },
    );
    return this.loading;
  }

  /** The label for one request. Never throws for a missing model; the lexical pass answers then. */
  async label(text: string, options: { profession?: string | null; coding?: boolean } = {}): Promise<RouteLabel> {
    const key = `${options.profession ?? ""}\u0000${options.coding ? 1 : 0}\u0000${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const label = await (await this.get()).label(text, options);
    this.cache.set(key, label);
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value as string);
    return label;
  }
}
