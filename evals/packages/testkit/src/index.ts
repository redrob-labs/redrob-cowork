import { readFile } from "node:fs/promises";
import { startWorld as startWorldRaw } from "@redrob/env";
import type { Place, World, WorldDefinition, WorldTopology } from "@redrob/env";
import { currentTestEvidence } from "@redrob/test-evidence";

export { createDesktopHandoffGrant, signInDesktopAs } from "@redrob/behaviors";
export type { DesktopHandle } from "@redrob/hosts";
export { test } from "./fixture.ts";
export * from "@redrob/env";
export * from "./brief.ts";
export * from "./eventually.ts";
export * from "./link.ts";
export * from "./self-host.ts";
export * from "./state.ts";

export async function startWorld(
  definition: WorldDefinition | WorldTopology,
  options: { place?: Place; name?: string } = {},
): Promise<World> {
  const world = await startWorldRaw(definition, options);
  try {
    const snapshot: unknown = JSON.parse(await readFile(world.snapshotPath, "utf8"));
    currentTestEvidence()?.recordJsonArtifact(`world-snapshot ${world.name}`, snapshot);
  } catch (error) {
    console.error(`[redrob/testkit] world snapshot evidence attach failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return world;
}
