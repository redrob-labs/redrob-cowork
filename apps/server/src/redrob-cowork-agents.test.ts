import { describe, expect, test } from "bun:test";

import { COWORK_BLOCKS, COWORK_CHECK_AGENT, COWORK_PLAN_AGENT, COWORK_RUN_AGENT } from "./redrob-cowork-agents.js";
import { buildRedrobRuntimeConfigObjectFromSnapshot } from "./redrob-runtime-config.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PLUGIN_OPTIONS = { serverUrl: "http://127.0.0.1:1", serverToken: "t", runtimeConfigPath: "/dev/null" };

function agents(): Record<string, unknown> {
  const config = buildRedrobRuntimeConfigObjectFromSnapshot({}, PLUGIN_OPTIONS);
  if (!isRecord(config.agent)) throw new Error("no agent map");
  return config.agent;
}

function agent(name: string): Record<string, unknown> {
  const entry = agents()[name];
  if (!isRecord(entry)) throw new Error(`no agent ${name}`);
  return entry;
}

describe("cowork agents in the engine config", () => {
  test("redrob stays the default and the three cowork agents exist", () => {
    expect(buildRedrobRuntimeConfigObjectFromSnapshot({}, PLUGIN_OPTIONS).default_agent).toBe("redrob");
    expect(Object.keys(agents()).sort()).toEqual(["redrob", COWORK_CHECK_AGENT, COWORK_PLAN_AGENT, COWORK_RUN_AGENT].sort());
  });

  test("every cowork agent keeps the redrob skill rules", () => {
    const skill = agent("redrob").permission;
    if (!isRecord(skill)) throw new Error("redrob has no permission");
    for (const name of [COWORK_PLAN_AGENT, COWORK_RUN_AGENT, COWORK_CHECK_AGENT]) {
      const permission = agent(name).permission;
      expect(isRecord(permission) ? permission.skill : null).toEqual(skill.skill);
    }
  });

  test("the check never asks: its session is hidden, so a question would hang it", () => {
    const permission = agent(COWORK_CHECK_AGENT).permission;
    if (!isRecord(permission)) throw new Error("check has no permission");
    const values = Object.entries(permission).flatMap(([key, value]) => (key === "skill" ? [] : [value]));
    expect(values).not.toContain("ask");
    expect(permission).toMatchObject({ external_directory: "deny", doom_loop: "deny", webfetch: "allow" });
  });

  test("plan and check change nothing; run can", () => {
    for (const name of [COWORK_PLAN_AGENT, COWORK_CHECK_AGENT]) {
      expect(agent(name).permission).toMatchObject({ edit: "deny", bash: "deny" });
    }
    const run = agent(COWORK_RUN_AGENT).permission;
    expect(isRecord(run) ? run.edit : "missing").toBeUndefined();
  });

  test("plan and run carry the redrob prompt; plan defines its blocks", () => {
    const base = String(agent("redrob").prompt);
    expect(String(agent(COWORK_PLAN_AGENT).prompt).startsWith(base)).toBe(true);
    expect(String(agent(COWORK_RUN_AGENT).prompt).startsWith(base)).toBe(true);
    expect(String(agent(COWORK_PLAN_AGENT).prompt)).toContain("```" + COWORK_BLOCKS.questions);
    expect(String(agent(COWORK_PLAN_AGENT).prompt)).toContain("```" + COWORK_BLOCKS.plan);
  });

  test("check is hidden from pickers and answers in one check block", () => {
    expect(agent(COWORK_CHECK_AGENT).hidden).toBe(true);
    expect(String(agent(COWORK_CHECK_AGENT).prompt)).toContain("```" + COWORK_BLOCKS.check);
    expect(agent(COWORK_PLAN_AGENT).hidden).toBeUndefined();
  });

  test("the example blocks in the prompts are valid JSON", () => {
    const prompts = [COWORK_PLAN_AGENT, COWORK_CHECK_AGENT].map((name) => String(agent(name).prompt));
    const blocks = prompts.flatMap((p) => [...p.matchAll(/```redrob-[a-z]+\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? ""));
    expect(blocks.length).toBe(3);
    for (const block of blocks) expect(() => JSON.parse(block)).not.toThrow();
  });
});
