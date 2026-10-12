import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import type { RedrobScheduleState } from "../src/app/lib/redrob-server";
import { ScheduledView } from "../src/react-app/desk/preview/desk-scheduled";
import { scheduleFromPicker } from "../src/react-app/desk/preview/preview";
import {
  ScheduleDialogView,
  canSaveSchedule,
  scheduleDraft,
  targetFromDraft,
  type ScheduleDraft,
} from "../src/react-app/desk/scheduled/schedule-dialog";
import { boardFromState, ruleFromPicker, ruleToPickerValue, scheduleName } from "../src/react-app/desk/scheduled/schedules";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import { counted } from "../src/react-app/desk/shell/use-desk-nav-data";

const STATE: RedrobScheduleState = {
  schedules: [
    {
      id: "s1",
      target: { kind: "prompt", text: "Send notices\n\nSend the renewal notices that are due this week." },
      label: "Every weekday at 08:00, Seoul time",
      rule: { mode: "repeat", freq: "weekdays", time: "08:00", zone: "Asia/Seoul" },
      nextRunAt: 2_000,
      enabled: true,
      lastRun: { state: "waiting", at: 1_000, sessionId: "ses_1" },
    },
    {
      id: "s2",
      target: { kind: "skill", name: "weekly-update", instructions: "Only the sales team." },
      label: "Every Monday",
      rule: { mode: "repeat", freq: "weekly", days: ["1"], time: "09:00", zone: "Asia/Seoul" },
      nextRunAt: 3_000,
      enabled: false,
      lastRun: { state: "missed", at: 500 },
    },
  ],
  runs: [],
  waiting: [{ id: "w1", scheduleId: "s1", sessionId: "ses_1", requestId: "per_1", permission: "bash", patterns: ["send-mail --to client"], askedAt: 1_100 }],
};

describe("the server's schedules on the screen", () => {
  test("schedules and waiting asks, in words", () => {
    const board = boardFromState(STATE, "ws_1");
    expect(board.schedules[0]).toMatchObject({ target: STATE.schedules[0]?.target, name: "Send notices", rule: STATE.schedules[0]?.rule, projectId: "ws_1", cadence: "Every weekday at 08:00, Seoul time", nextRunAt: 2_000, lastRun: { state: "blocked", label: "Waiting for you" } });
    // A paused schedule has no next run to show.
    expect(board.schedules[1]).toMatchObject({ name: "weekly-update", enabled: false, nextRunAt: null, lastRun: { state: "stopped", label: "Missed: the app was closed" } });
    expect(board.waiting).toEqual([
      {
        id: "w1",
        scheduleId: "s1",
        target: STATE.schedules[0]?.target,
        name: "Send notices",
        projectId: "ws_1",
        title: "It wants to run a command",
        description: "The run stopped here. Go ahead lets it continue; Not now refuses this step.",
        detail: "send-mail --to client",
        askedAt: 1_100,
      },
    ]);
    // An ask left behind by a deleted schedule has nothing to name.
    expect(boardFromState({ ...STATE, schedules: [] }, "ws_1").waiting).toEqual([]);
  });

  test("a schedule is named by its skill, or by its prompt's first line, kept short", () => {
    expect(scheduleName({ kind: "skill", name: "weekly-report", instructions: "Sales only." })).toBe("weekly-report");
    expect(scheduleName({ kind: "prompt", text: "  Summarise my inbox\nThen draft replies." })).toBe("Summarise my inbox");
    const long = scheduleName({ kind: "prompt", text: "x".repeat(100) });
    expect(long).toHaveLength(60);
    expect(long.endsWith("…")).toBe(true);
  });

  test("a rule goes back into the picker unchanged", () => {
    const rules = [
      { mode: "repeat" as const, freq: "weekly" as const, days: ["1", "3"], time: "08:00", zone: "Asia/Seoul", start: "2026-10-05" },
      { mode: "repeat" as const, freq: "monthly" as const, dom: "31", time: "18:30", zone: "America/New_York" },
      { mode: "once" as const, date: "2026-10-05", time: "09:00", zone: "Asia/Seoul" },
    ];
    for (const rule of rules) expect(ruleFromPicker(ruleToPickerValue(rule))).toEqual(rule);
  });

  test("the picker's value is the rule; a file arriving is not one", () => {
    const value = { mode: "repeat" as const, freq: "weekly" as const, days: ["1"], time: "08:00", zone: "Asia/Seoul", start: "2026-10-05", date: "2026-10-05" };
    expect(ruleFromPicker(value)).toEqual({ mode: "repeat", freq: "weekly", days: ["1"], time: "08:00", zone: "Asia/Seoul", start: "2026-10-05", date: "2026-10-05" });
    expect(ruleFromPicker({ ...value, mode: "event" })).toBeNull();
    const target = { kind: "prompt" as const, text: "Weekly update" };
    const saved = scheduleFromPicker(target, { id: "ws_1", name: "Seorin" }, value, new Date(Date.UTC(2026, 9, 5, 0)));
    expect(saved).toMatchObject({ target, rule: { mode: "repeat", freq: "weekly" } });
  });

  test("the services read and change the server's schedules", async () => {
    const calls: string[] = [];
    const unused = async (): Promise<never> => {
      throw new Error("not used");
    };
    const client: DeskServerClient = {
      listSchedules: async (workspaceId) => {
        calls.push(`list:${workspaceId}`);
        return STATE;
      },
      addSchedule: async (workspaceId, payload) => {
        calls.push(`add:${workspaceId}:${JSON.stringify(payload.target)}:${payload.label}:${payload.rule.mode}`);
        return STATE;
      },
      updateSchedule: async (workspaceId, scheduleId, payload) => {
        calls.push(`update:${workspaceId}:${scheduleId}:${JSON.stringify(payload)}`);
        return STATE;
      },
      deleteSchedule: async (workspaceId, scheduleId) => {
        calls.push(`delete:${workspaceId}:${scheduleId}`);
        return { ...STATE, schedules: STATE.schedules.filter((schedule) => schedule.id !== scheduleId), waiting: [] };
      },
      listSkills: async (workspaceId, options) => {
        calls.push(`skills:${workspaceId}:${String(options?.includeGlobal)}`);
        return { items: [{ name: "weekly-report", path: "/skills/weekly-report/SKILL.md", description: "The weekly report.", scope: "global" }] };
      },
      answerScheduleWaiting: async (workspaceId, waitingId, approve) => {
        calls.push(`answer:${workspaceId}:${waitingId}:${String(approve)}`);
        return { ...STATE, waiting: [] };
      },
      listWorkspaces: unused,
      listSessions: unused,
      getSession: unused,
      getSessionSnapshot: unused,
      listMemories: unused,
      saveMemory: unused,
      updateMemory: unused,
      deleteMemory: unused,
      listArtifacts: unused,
      listMcp: unused,
      getConfig: unused,
      patchConfig: unused,
      getSkill: unused,
      upsertSkill: unused,
      deleteSkill: unused,
      listLibrarySkills: unused,
      getSkillTaxonomy: unused,
      getLibrarySkill: unused,
      installLibrarySkill: unused,
      getTeamSkills: unused,
    };
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    const board = await services.schedules.list();
    expect(board.preview).toBe(false);
    // The menu counts the real runs waiting.
    expect(counted(board, (data) => data.waiting.length)).toBe(1);
    expect((await services.schedules.answer("w1", true)).data.waiting).toEqual([]);
    await services.schedules.setEnabled("s2", true);
    const once = { mode: "once" as const, date: "2026-10-05", time: "09:00", zone: "Asia/Seoul" };
    const skill = { kind: "skill" as const, name: "weekly-report" };
    await services.schedules.save({ target: skill, projectId: "ws_1", cadence: "Every Monday", nextRunAt: 1, rule: once });
    await expect(
      services.schedules.save({ target: { kind: "prompt", text: "p" }, projectId: "ws_1", cadence: "When a file arrives", nextRunAt: null }),
    ).rejects.toThrow();
    await services.schedules.update("s1", { target: skill, cadence: "Once", rule: once });
    const removed = await services.schedules.remove("s1");
    expect(removed.data.schedules.map((schedule) => schedule.id)).toEqual(["s2"]);
    expect((await services.skills.list()).data).toEqual([{ name: "weekly-report", description: "The weekly report.", origin: "mine", tags: {}, scope: "global" }]);
    expect(calls).toEqual([
      "list:ws_1",
      "answer:ws_1:w1:true",
      `update:ws_1:s2:${JSON.stringify({ enabled: true })}`,
      `add:ws_1:${JSON.stringify(skill)}:Every Monday:once`,
      `update:ws_1:s1:${JSON.stringify({ target: skill, label: "Once", rule: once })}`,
      "delete:ws_1:s1",
      "skills:ws_1:true",
    ]);
  });

  test("the screen names what each schedule runs, offers Edit and Delete, and says it runs only while the app is open", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ScheduledView
          board={boardFromState(STATE, "ws_1")}
          locale="en"
          real
          projectName={() => "Seorin MSA"}
          onAnswer={() => {}}
          onToggle={() => {}}
          onNew={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Schedules run only while Redrob Cowork is open.");
    expect(html).toContain("Runs on schedule: Send notices");
    expect(html).toContain("Runs on schedule: weekly-update");
    expect(html).toContain("It wants to run a command");
    expect(html).toContain("In Seorin MSA");
    expect(html.split(">Edit<")).toHaveLength(3);
    expect(html.split(">Delete<")).toHaveLength(3);
    expect(html).toContain('aria-label="Edit Send notices"');
    expect(html).toContain('aria-label="Delete weekly-update"');
  });

  test("with nothing on a schedule, it says what to schedule and offers New schedule", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ScheduledView
          board={{ schedules: [], waiting: [] }}
          locale="en"
          onAnswer={() => {}}
          onToggle={() => {}}
          onNew={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Schedule a prompt or a skill to run while the app is open");
    expect(html).toContain("New schedule");
  });
});

describe("the schedule dialog", () => {
  const now = new Date(2026, 9, 5, 10, 0);
  const view = (draft: ScheduleDraft, options: { real?: boolean; skills?: Array<{ name: string; description: string }> | null } = {}) =>
    renderToStaticMarkup(
      <ScheduleDialogView
        draft={draft}
        editing={false}
        real={options.real ?? true}
        now={now}
        projectName="Seorin MSA"
        skills={options.skills === undefined ? [{ name: "weekly-report", description: "The weekly report." }] : options.skills}
        ready
        busy={false}
        onChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
  const saveDisabled = (html: string) => /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Save/.test(html);

  test("a prompt needs some text before Save", () => {
    const empty = scheduleDraft({ now });
    expect(empty.kind).toBe("prompt");
    expect(canSaveSchedule(empty, true)).toBe(false);
    expect(saveDisabled(view(empty))).toBe(true);
    const typed = { ...empty, text: "  Summarise my inbox  " };
    expect(targetFromDraft(typed)).toEqual({ kind: "prompt", text: "Summarise my inbox" });
    expect(canSaveSchedule(typed, true)).toBe(true);
    expect(saveDisabled(view(typed))).toBe(false);
    expect(canSaveSchedule({ ...typed, text: "x".repeat(20_001) }, true)).toBe(false);
  });

  test("a skill needs one chosen before Save; instructions are optional", () => {
    const skill: ScheduleDraft = { ...scheduleDraft({ now }), kind: "skill" };
    expect(canSaveSchedule(skill, true)).toBe(false);
    const html = view(skill);
    expect(saveDisabled(html)).toBe(true);
    expect(html).toContain("Extra instructions");
    const chosen = { ...skill, skill: "weekly-report" };
    expect(targetFromDraft(chosen)).toEqual({ kind: "skill", name: "weekly-report" });
    expect(targetFromDraft({ ...chosen, instructions: " Sales only. " })).toEqual({ kind: "skill", name: "weekly-report", instructions: "Sales only." });
    expect(saveDisabled(view(chosen))).toBe(false);
  });

  test("with no skills installed it says so", () => {
    const html = view({ ...scheduleDraft({ now }), kind: "skill" }, { skills: [] });
    expect(html).toContain("No skills are installed yet.");
    expect(html).not.toContain("Extra instructions");
  });

  test("real data cannot wait for a file to arrive", () => {
    const draft = { ...scheduleDraft({ now, prompt: "Summarise my inbox" }), value: { ...scheduleDraft({ now }).value, mode: "event" as const } };
    expect(canSaveSchedule(draft, true)).toBe(false);
    expect(canSaveSchedule(draft, false)).toBe(true);
    expect(view(draft)).not.toContain("On a new file");
    expect(view(draft, { real: false })).toContain("On a new file");
  });

  test("an edit starts from the schedule: its target and its rule", () => {
    const [prompt, skill] = boardFromState(STATE, "ws_1").schedules;
    if (!prompt || !skill) throw new Error("two schedules");
    const fromPrompt = scheduleDraft({ schedule: prompt, now });
    expect(fromPrompt).toMatchObject({ kind: "prompt", text: "Send notices\n\nSend the renewal notices that are due this week." });
    expect(ruleFromPicker(fromPrompt.value)).toMatchObject(prompt.rule ?? {});
    const fromSkill = scheduleDraft({ schedule: skill, now });
    expect(fromSkill).toMatchObject({ kind: "skill", skill: "weekly-update", instructions: "Only the sales team." });
    expect(fromSkill.value).toMatchObject({ mode: "repeat", freq: "weekly", days: ["1"], time: "09:00" });
    // A skill's Schedule starts on that skill; a prompt to start from starts on the prompt.
    expect(scheduleDraft({ now, skill: "weekly-update" })).toMatchObject({ kind: "skill", skill: "weekly-update", instructions: "" });
    expect(scheduleDraft({ now, prompt: "# Weekly update" })).toMatchObject({ kind: "prompt", text: "# Weekly update" });
  });
});
