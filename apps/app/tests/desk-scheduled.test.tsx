import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import type { RedrobScheduleState } from "../src/app/lib/redrob-server";
import { ScheduledView } from "../src/react-app/desk/preview/desk-scheduled";
import { scheduleFromPicker } from "../src/react-app/desk/preview/preview";
import { boardFromState, ruleFromPicker } from "../src/react-app/desk/scheduled/schedules";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import { counted } from "../src/react-app/desk/shell/use-desk-nav-data";

const STATE: RedrobScheduleState = {
  schedules: [
    {
      id: "s1",
      playbookId: "send-notices",
      label: "Every weekday at 08:00, Seoul time",
      rule: { mode: "repeat", freq: "weekdays", time: "08:00", zone: "Asia/Seoul" },
      nextRunAt: 2_000,
      enabled: true,
      lastRun: { state: "waiting", at: 1_000, sessionId: "ses_1" },
    },
    {
      id: "s2",
      playbookId: "weekly-update",
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
    expect(board.schedules[0]).toMatchObject({ playbookId: "send-notices", projectId: "ws_1", cadence: "Every weekday at 08:00, Seoul time", nextRunAt: 2_000, lastRun: { state: "blocked", label: "Waiting for you" } });
    // A paused schedule has no next run to show.
    expect(board.schedules[1]).toMatchObject({ enabled: false, nextRunAt: null, lastRun: { state: "stopped", label: "Missed: the app was closed" } });
    expect(board.waiting).toEqual([
      {
        id: "w1",
        playbookId: "send-notices",
        projectId: "ws_1",
        title: "It wants to run a command",
        description: "The run stopped here. Go ahead lets it continue; Not now refuses this step.",
        detail: "send-mail --to client",
        askedAt: 1_100,
      },
    ]);
  });

  test("the picker's value is the rule; a file arriving is not one", () => {
    const value = { mode: "repeat" as const, freq: "weekly" as const, days: ["1"], time: "08:00", zone: "Asia/Seoul", start: "2026-10-05", date: "2026-10-05" };
    expect(ruleFromPicker(value)).toEqual({ mode: "repeat", freq: "weekly", days: ["1"], time: "08:00", zone: "Asia/Seoul", start: "2026-10-05", date: "2026-10-05" });
    expect(ruleFromPicker({ ...value, mode: "event" })).toBeNull();
    const saved = scheduleFromPicker("weekly-update", { id: "ws_1", name: "Seorin" }, value, new Date(Date.UTC(2026, 9, 5, 0)));
    expect(saved.rule).toMatchObject({ mode: "repeat", freq: "weekly" });
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
        calls.push(`add:${workspaceId}:${payload.playbookId}:${payload.label}:${payload.rule.mode}`);
        return STATE;
      },
      updateSchedule: async (workspaceId, scheduleId, payload) => {
        calls.push(`update:${workspaceId}:${scheduleId}:${String(payload.enabled)}`);
        return STATE;
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
      listCommands: unused,
      upsertCommand: unused,
      deleteCommand: unused,
    };
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    const board = await services.schedules.list();
    expect(board.preview).toBe(false);
    // The menu counts the real runs waiting.
    expect(counted(board, (data) => data.waiting.length)).toBe(1);
    expect((await services.schedules.answer("w1", true)).data.waiting).toEqual([]);
    await services.schedules.setEnabled("s2", true);
    await services.schedules.save({ playbookId: "weekly-update", projectId: "ws_1", cadence: "Every Monday", nextRunAt: 1, rule: { mode: "once", date: "2026-10-05", time: "09:00", zone: "Asia/Seoul" } });
    await expect(services.schedules.save({ playbookId: "p", projectId: "ws_1", cadence: "When a file arrives", nextRunAt: null })).rejects.toThrow();
    expect(calls).toEqual(["list:ws_1", "answer:ws_1:w1:true", "update:ws_1:s2:true", "add:ws_1:weekly-update:Every Monday:once"]);
  });

  test("the screen names the workspace's playbooks and says it runs only while the app is open", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
      <ScheduledView
        board={boardFromState(STATE, "ws_1")}
        locale="en"
        real
        playbookName={(id) => (id === "send-notices" ? "Send notices" : "Weekly update")}
        projectName={() => "Seorin MSA"}
        onAnswer={() => {}}
        onToggle={() => {}}
      />
      </MemoryRouter>,
    );
    expect(html).toContain("Schedules run only while Redrob Cowork is open.");
    expect(html).toContain("Send notices");
    expect(html).toContain("It wants to run a command");
    expect(html).toContain("In Seorin MSA");
  });
});
