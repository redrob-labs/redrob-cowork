import { createHash, randomInt } from "node:crypto";
import { resolve } from "node:path";

import { readRedrobWorkspaceConfig } from "../redrob-workspace-config-store.js";
import { DESK_PRIVACY_CONFIG_KEY } from "../team-lock.js";
import type { ServerConfig } from "../types.js";
import {
  emptyLabelMap,
  LABEL_INSTRUCTION,
  labelText,
  restoreDeep,
  restoreText,
  type LabelCategory,
  type LabelMap,
  type PrivacyLevel,
  type PrivacyRules,
} from "./labels.js";

/*
 * The privacy gate's server half. The engine plugin (opencode-plugins/redrob-privacy-gate.ts) sends
 * every text the model is about to read here, and every tool call and finished answer back, so all
 * labelling for a machine happens in one process with one map per chat.
 *
 * The maps are held in memory only, never written anywhere. That is safe because nothing durable
 * needs them: the engine stores what the person typed and what tools returned as they were, and the
 * plugin restores each finished answer before it is stored, so a chat's history holds real values.
 * After a restart a chat simply gets fresh labels the next time it is sent, consistent from then on.
 */

const LEVELS: readonly PrivacyLevel[] = ["off", "standard", "high", "strict"];
/** Matches DEFAULT_PRIVACY_LEVEL in the app: protection is on unless someone turned it off. */
export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = "standard";
const MAX_SESSIONS = 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A workspace's privacy rules, from the same config entry the app and the team policy write. */
export function readPrivacyRules(redrob: Record<string, unknown>): PrivacyRules {
  const stored = isRecord(redrob[DESK_PRIVACY_CONFIG_KEY]) ? (redrob[DESK_PRIVACY_CONFIG_KEY] as Record<string, unknown>) : {};
  const level = LEVELS.find((entry) => entry === stored.level) ?? DEFAULT_PRIVACY_LEVEL;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  // A team policy writes `aliases` (forms grouped per entity); a person's own list is flat names.
  const names = Array.isArray(stored.aliases)
    ? stored.aliases.map(strings).filter((forms) => forms.length > 0)
    : strings(stored.names).map((name) => [name]);
  const transforms = isRecord(stored.transforms) ? stored.transforms : {};
  return {
    level,
    names,
    transforms: {
      roundAmounts: transforms.roundAmounts === true,
      shiftDates: transforms.shiftDates === true,
      titlesNearNames: transforms.titlesNearNames === true || level === "strict",
    },
  };
}

export type GateWorkspaceResolver = (directory: string) => { id: string; path: string } | null;

export function workspaceForDirectory(config: ServerConfig): GateWorkspaceResolver {
  return (directory) => {
    const target = resolve(directory);
    return (
      config.workspaces.find((workspace) => resolve(workspace.path) === target) ??
      config.workspaces.find((workspace) => target.startsWith(`${resolve(workspace.path)}/`)) ??
      null
    );
  };
}

export type GateTextsResult = { texts: string[]; found: LabelCategory[]; level: PrivacyLevel; instruction: string | null };

export class PrivacyGate {
  private readonly maps = new Map<string, LabelMap>();

  constructor(
    private readonly config: ServerConfig,
    private readonly resolveWorkspace: GateWorkspaceResolver = workspaceForDirectory(config),
  ) {}

  /** The rules for a directory. A directory no workspace owns gets the default level, never off. */
  async rules(directory: string | null): Promise<PrivacyRules> {
    const workspace = directory ? this.resolveWorkspace(directory) : null;
    if (!workspace) return { level: DEFAULT_PRIVACY_LEVEL, names: [] };
    return readPrivacyRules(await readRedrobWorkspaceConfig(this.config, workspace.id));
  }

  private map(sessionID: string): LabelMap {
    let map = this.maps.get(sessionID);
    if (map) {
      // Recently used last, so the oldest chat is the one dropped when the bound is reached.
      this.maps.delete(sessionID);
      this.maps.set(sessionID, map);
      return map;
    }
    // A shift between 3 and 30 days either way, never 0, fixed for the chat's lifetime here.
    const days = randomInt(3, 31) * (randomInt(0, 2) ? 1 : -1);
    map = emptyLabelMap(days);
    this.maps.set(sessionID, map);
    while (this.maps.size > MAX_SESSIONS) this.maps.delete(this.maps.keys().next().value as string);
    return map;
  }

  async label(input: { sessionID: string; directory: string | null; texts: string[] }): Promise<GateTextsResult> {
    const rules = await this.rules(input.directory);
    if (rules.level === "off") return { texts: input.texts, found: [], level: rules.level, instruction: null };
    const map = this.map(input.sessionID);
    const found: LabelCategory[] = [];
    const texts = input.texts.map((text) => {
      const result = labelText(text, rules, map);
      found.push(...result.found);
      return result.text;
    });
    return {
      texts,
      found: [...new Set(found)],
      level: rules.level,
      instruction: Object.keys(map.byLabel).length ? LABEL_INSTRUCTION : null,
    };
  }

  restore(input: { sessionID: string; value: unknown }): { value: unknown; unmapped: string[] } {
    const map = this.maps.get(input.sessionID);
    if (!map) return { value: input.value, unmapped: [] };
    if (typeof input.value === "string") {
      const result = restoreText(input.value, map);
      return { value: result.text, unmapped: result.unmapped };
    }
    return { value: restoreDeep(input.value, map), unmapped: [] };
  }

  /** For the Privacy screen: how many labels a chat holds, never the values. */
  summary(sessionID: string): { labels: number } {
    return { labels: Object.keys(this.maps.get(sessionID)?.byLabel ?? {}).length };
  }

  forget(sessionID: string): void {
    this.maps.delete(sessionID);
  }
}

/** Stable, non-reversible id for logs: a session id is not secret, but there is no reason to log it. */
export function sessionLogId(sessionID: string): string {
  return createHash("sha256").update(sessionID).digest("hex").slice(0, 12);
}
