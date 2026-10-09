import { loadGuideResearch } from "../src/react-app/desk/guide/model-guide";
import { GUIDE_RESEARCH_KEY } from "../src/react-app/desk/preview/desk-guide";
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes } from "react-router";
import { nextScheduledRun } from "@redrob-labs/ui";

import { setLocale, type Language } from "../src/i18n";
import { RunPlayer } from "../src/react-app/desk/preview/desk-run";
import { ScheduleDialog } from "../src/react-app/desk/scheduled/schedule-dialog";
import { scheduledMeta } from "../src/react-app/desk/preview/desk-scheduled";
import {
  RUN_START,
  answerWaiting,
  deleteSchedule,
  initialScheduleValue,
  navWaitingKey,
  nextStop,
  playRun,
  previewKey,
  runPath,
  runStatus,
  runSteps,
  saveSchedule,
  scheduleFromPicker,
  setScheduleEnabled,
  stepState,
  type BoardActionDeps,
  type RunProgress,
} from "../src/react-app/desk/preview/preview";
import { createFixtureDeskServices, resetSampleBoard } from "../src/react-app/desk/services/fixture-services";
import { HISTORY } from "../src/react-app/desk/services/fixtures/history";
import { PLAYBOOKS } from "../src/react-app/desk/services/fixtures/playbooks";
import { createDeskServices } from "../src/react-app/desk/services/real-services";
import type { Playbook, ScheduleBoard } from "../src/react-app/desk/services/types";
import { deskRoutes } from "../src/react-app/desk/shell/desk-routes";
import type { DeskTimers, TimerHandle } from "../src/react-app/desk/timers";

afterEach(() => {
  setLocale("en");
  resetSampleBoard();
});

function render(node: ReactNode, path: string, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The text between tags and the labels a screen reader says. */
function readable(html: string): string {
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, " "), ...labels].join(" ");
}

/** A query cache holding the sample data each Preview screen reads. */
async function seeded(): Promise<QueryClient> {
  const fixture = createFixtureDeskServices();
  const client = new QueryClient();
  client.setQueryData(previewKey("preview", "playbooks"), await fixture.playbooks.list());
  client.setQueryData(previewKey("preview", "board"), await fixture.schedules.list());
  client.setQueryData(previewKey("preview", "history"), await fixture.history.list());
  client.setQueryData(previewKey("preview", "catalog"), await fixture.catalog.get());
  return client;
}

function route(path: string, client: QueryClient) {
  return render(<Routes>{deskRoutes(<span>chat screen</span>)}</Routes>, path, client);
}

function playbook(id: string): Playbook {
  const found = PLAYBOOKS.find((entry) => entry.id === id);
  if (!found) throw new Error(`No sample playbook ${id}`);
  return found;
}

/** Runs `work` with `fetch` replaced by one that throws, and counts the calls. */
async function withoutNetwork<T>(work: () => Promise<T>): Promise<{ result: T; fetched: number }> {
  const originalFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = Object.assign(
    () => {
      fetched += 1;
      throw new Error("no network in this test");
    },
    { preconnect: originalFetch.preconnect },
  );
  try {
    return { result: await work(), fetched };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** Board actions on the shared sample state, with the toasts kept. */
function boardDeps(client = new QueryClient()) {
  const toasts: Array<[string, string | undefined]> = [];
  const deps: BoardActionDeps = {
    schedules: createDeskServices({ client: null, workspaceId: null }).schedules,
    queryClient: client,
    scope: "preview",
    showToast: (title, text) => toasts.push([title, text]),
  };
  return { deps, toasts, client };
}

/** A manual clock: timers fire only when the test advances time. */
function fakeClock() {
  let now = 0;
  let nextId = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const handles = new Map<TimerHandle, number>();
  const timers: DeskTimers = {
    setTimeout(fn, ms) {
      const id = ++nextId;
      pending.set(id, { at: now + ms, fn });
      const handle = globalThis.setTimeout(() => {}, 1e9);
      globalThis.clearTimeout(handle);
      handles.set(handle, id);
      return handle;
    },
    clearTimeout(handle) {
      const id = handles.get(handle);
      if (id !== undefined) pending.delete(id);
    },
  };
  const advanceTo = (time: number) => {
    for (;;) {
      const due = [...pending.entries()].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = time;
  };
  return { timers, advanceTo };
}

const SCREENS: ReadonlyArray<{ path: string; title: string; place: string; note: string }> = [
  { path: "/playbooks", title: "Playbooks", place: "playbooks", note: "Preview: sample playbooks. Running them is not connected yet." },
  { path: "/playbook/first-review", title: "Contract first review", place: "playbooks", note: "Preview: sample playbooks." },
  { path: runPath("renewal-sweep"), title: "Contract renewal sweep", place: "playbooks", note: "Preview: a sample run." },
  { path: "/scheduled", title: "Scheduled", place: "scheduled", note: "Preview: sample schedules." },
  { path: "/history", title: "History", place: "history", note: "Preview: sample history." },
];

describe("the Preview routes", () => {
  test("each renders its screen inside the shell, with its menu place current and the preview note", async () => {
    const client = await seeded();
    for (const screen of SCREENS) {
      const html = route(screen.path, client);
      expect(html).toContain("rr-shell");
      expect(html).toContain(`<h1 class="rr-shell__title">${screen.title}</h1>`);
      expect(html).toContain(`href="/${screen.place}" aria-current="page"`);
      expect(html).toContain("rr-alert");
      expect(html).toContain(screen.note);
      expect(html).not.toContain("chat screen");
      expect(html).not.toContain("rr-skeleton");
    }
  });

  test("the note shows while the sample data is still loading", () => {
    for (const screen of SCREENS) {
      expect(route(screen.path, new QueryClient())).toContain(screen.note);
    }
  });

  test("uses the product words on all six screens, in English and in Korean", async () => {
    const client = await seeded();
    const locales: Language[] = ["en", "ko"];
    for (const locale of locales) {
      setLocale(locale);
      for (const screen of SCREENS) {
        const text = readable(route(screen.path, client));
        for (const banned of [/Expert Match/i, /router/i, /API key/i, /MCP/i]) expect(text).not.toMatch(banned);
      }
    }
  });

  test("Korean has the screens' own words in Korean", async () => {
    const client = await seeded();
    setLocale("ko");
    expect(route("/playbooks", client)).toContain("미리 보기: 예시 플레이북입니다.");
    expect(route("/scheduled", client)).toContain("나를 기다리는 실행 (2)");
    expect(route("/history", client)).toContain("스스로 실행");
    client.setQueryData(GUIDE_RESEARCH_KEY, await loadGuideResearch());
    expect(route("/guide", client)).toContain("레드롭 오토");
  });
});

describe("Playbooks", () => {
  test("lists every sample playbook as a row that opens its page", async () => {
    const html = route("/playbooks", await seeded());
    expect(html).toContain("3 saved by your team");
    for (const entry of PLAYBOOKS) {
      expect(html).toContain(entry.name);
      expect(html).toContain(`href="/playbook/${entry.id}"`);
    }
    expect(html).toContain("2 days to 2 hours");
    expect(html).toContain("High impact");
  });

  test("one playbook shows its steps, where it stops, its sources as links, and Run and Schedule", async () => {
    const html = route("/playbook/first-review", await seeded());
    for (const step of playbook("first-review").steps) expect(html).toContain(step.label);
    expect(html).toContain("You approve the redlines first");
    expect(html).toContain("Harvey customer results, 2025");
    expect(html).toContain('href="https://www.harvey.ai/blog/how-harvey-saves-lawyers-time"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Run now");
    expect(html).toContain("run 9 times");
    expect(html).toContain(">Schedule<");
    expect(html).toContain('href="/playbooks"');
  });

  test("an unknown playbook says so", async () => {
    const html = route("/playbook/nope", await seeded());
    expect(html).toContain("This playbook is not here");
  });

  test("the Schedule dialog starts a prompt from the playbook, with the picker and Save", () => {
    const html = render(
      <ScheduleDialog prompt="Sweep the renewals" sampleProjectId="supplier" real={false} onClose={() => {}} now={new Date(2026, 8, 28, 10, 0)} />,
      "/playbook/renewal-sweep",
    );
    expect(html).toContain("New schedule");
    expect(html).toContain("Sweep the renewals");
    expect(html).toContain("Every Monday at 08:00 Seoul time");
    expect(html).toContain("Save");
    expect(html).toContain("Cancel");
  });

  test("saving a schedule changes only the sample state, toasts, and calls nothing", async () => {
    const { deps, toasts, client } = boardDeps();
    const now = new Date(2026, 8, 28, 10, 0);
    const value = initialScheduleValue(playbook("renewal-sweep"), now);
    const target = { kind: "prompt" as const, text: "Sweep the renewals\n\nEvery contract that renews before 30 Nov." };
    const schedule = scheduleFromPicker(target, { id: "supplier", name: "Q3 supplier contracts" }, value, now);
    expect(schedule.cadence).toBe("Every Monday at 08:00 Seoul time");
    expect(schedule.nextRunAt).toBe(nextScheduledRun(value, now)?.getTime() ?? null);
    expect(schedule.nextRunAt ?? 0).toBeGreaterThan(now.getTime());
    expect(scheduleFromPicker(target, { id: "supplier", name: "Q3 supplier contracts" }, { ...value, mode: "event" }, now)).toMatchObject({
      cadence: "Runs each time a new file arrives in Q3 supplier contracts",
      nextRunAt: null,
    });

    const { result, fetched } = await withoutNetwork(() => saveSchedule(deps, schedule));
    expect(fetched).toBe(0);
    expect(result?.preview).toBe(true);
    const saved = result?.data.schedules.filter((entry) => entry.name === "Sweep the renewals") ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ target, projectId: "supplier", cadence: "Every Monday at 08:00 Seoul time", enabled: true, lastRun: null });
    expect(client.getQueryData(previewKey("preview", "board"))).toEqual(result);
    expect(toasts).toEqual([["Schedule saved", "This is a preview, so nothing ran and nothing was sent."]]);

    // The same prompt again is a second schedule, not a replacement.
    const added = await saveSchedule(deps, { ...schedule, projectId: "clauses" });
    expect(added?.data.schedules).toHaveLength(6);
    expect(added?.data.schedules[5]).toMatchObject({ target, projectId: "clauses", lastRun: null });
  });

  test("an edit changes the schedule in place; a delete takes it and its waiting run away", async () => {
    const { deps, toasts } = boardDeps();
    const now = new Date(2026, 8, 28, 10, 0);
    const skill = { kind: "skill" as const, name: "weekly-report" };
    const edit = scheduleFromPicker(skill, { id: "supplier", name: "Q3 supplier contracts" }, initialScheduleValue({ cadence: "" }, now), now);
    const { result, fetched } = await withoutNetwork(() => saveSchedule(deps, edit, "s1"));
    expect(fetched).toBe(0);
    expect(result?.data.schedules).toHaveLength(4);
    expect(result?.data.schedules.find((entry) => entry.id === "s1")).toMatchObject({ target: skill, name: "weekly-report", cadence: "Every Monday at 08:00 Seoul time" });

    const removed = await deleteSchedule(deps, "s1");
    expect(removed?.data.schedules.map((entry) => entry.id)).toEqual(["s2", "s3", "s4"]);
    expect(removed?.data.waiting.map((run) => run.id)).toEqual(["w2"]);
    expect(toasts.map(([title]) => title)).toEqual(["Schedule saved", "Schedule deleted"]);
  });

  test("a save or a delete that fails says so and keeps the board", async () => {
    const { deps, client } = boardDeps();
    const toasts: Array<[string, string | undefined, string | undefined]> = [];
    const failing: BoardActionDeps = {
      ...deps,
      schedules: { ...deps.schedules, remove: () => Promise.reject(new Error("offline")), update: () => Promise.reject(new Error("offline")) },
      showToast: (title, text, tone) => toasts.push([title, text, tone]),
    };
    expect(await deleteSchedule(failing, "s1")).toBeNull();
    expect(await saveSchedule(failing, { target: { kind: "prompt", text: "p" }, projectId: "supplier", cadence: "Daily", nextRunAt: null }, "s1")).toBeNull();
    expect(toasts).toEqual([
      ["Couldn't delete the schedule", "Try again in a moment.", "danger"],
      ["Couldn't save the schedule", "Try again in a moment.", "danger"],
    ]);
    expect(client.getQueryData(previewKey("preview", "board"))).toBeUndefined();
  });

  test("a playbook triggered by a file starts the picker on a new file", () => {
    expect(initialScheduleValue(playbook("deadline-tracker"), new Date(2026, 8, 28)).mode).toBe("event");
    expect(initialScheduleValue(playbook("renewal-sweep"), new Date(2026, 8, 28))).toMatchObject({
      mode: "repeat",
      date: "2026-09-28",
      time: "08:00",
      zone: "Asia/Seoul",
    });
  });
});

describe("a playbook run", () => {
  test("runSteps keeps the playbook's steps in order, with where it asks first", () => {
    const steps = runSteps(playbook("first-review"));
    expect(steps.map((step) => step.label)).toEqual(playbook("first-review").steps.map((step) => step.label));
    expect(steps.map((step) => step.id)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `first-review-${n}`));
    expect(steps[5]?.approval).toBe("You approve the redlines first");
    expect(nextStop(steps, 0)).toBe(5);
    expect(nextStop(runSteps(playbook("renewal-sweep")), 4)).toBe(5);
  });

  test("steps finish 650ms apart, stop at the approval until approved, then finish", async () => {
    const { result, fetched } = await withoutNetwork(async () => {
      const clock = fakeClock();
      const steps = runSteps(playbook("deadline-tracker"));
      const seen: RunProgress[] = [];
      let progress = RUN_START;
      const track = (next: RunProgress) => {
        progress = next;
        seen.push(next);
      };

      playRun(steps, 0, track, { timers: clock.timers });
      expect(steps.map((_step, index) => stepState(index, progress))).toEqual(["active", "todo", "todo", "todo", "todo"]);
      clock.advanceTo(649);
      expect(seen).toEqual([]);
      clock.advanceTo(650);
      expect(progress).toEqual({ done: 1, phase: "running" });
      clock.advanceTo(1950);
      expect(progress).toEqual({ done: 3, phase: "running" });
      clock.advanceTo(2600);
      // Step 4 asks first: the run waits there, and time alone moves nothing.
      expect(progress).toEqual({ done: 3, phase: "waiting" });
      expect(runStatus(progress)).toEqual({ state: "blocked", label: "Waiting for you" });
      expect(steps.map((_step, index) => stepState(index, progress))).toEqual(["done", "done", "done", "active", "todo"]);
      clock.advanceTo(60_000);
      expect(seen).toHaveLength(4);

      // Approve: the asking step is done and the rest plays on.
      playRun(steps, progress.done + 1, track, { timers: clock.timers });
      clock.advanceTo(60_650);
      expect(progress).toEqual({ done: 5, phase: "running" });
      clock.advanceTo(61_300);
      expect(progress).toEqual({ done: 5, phase: "done" });
      expect(runStatus(progress)).toEqual({ state: "done", label: "Done" });
      return steps.map((_step, index) => stepState(index, progress));
    });
    expect(result).toEqual(["done", "done", "done", "done", "done"]);
    expect(fetched).toBe(0);
  });

  test("a run that ends on an approval waits there, and finishes after it", () => {
    const clock = fakeClock();
    const steps = runSteps(playbook("first-review"));
    let progress = RUN_START;
    playRun(steps, 0, (next) => (progress = next), { timers: clock.timers });
    clock.advanceTo(650 * 6);
    expect(progress).toEqual({ done: 5, phase: "waiting" });
    playRun(steps, 6, (next) => (progress = next), { timers: clock.timers });
    clock.advanceTo(650 * 7);
    expect(progress).toEqual({ done: 6, phase: "done" });
  });

  test("cancelling stops the clock", () => {
    const clock = fakeClock();
    let progress = RUN_START;
    const cancel = playRun(runSteps(playbook("renewal-sweep")), 0, (next) => (progress = next), { timers: clock.timers });
    clock.advanceTo(650);
    cancel();
    clock.advanceTo(60_000);
    expect(progress).toEqual({ done: 1, phase: "running" });
  });

  test("the run screen starts on the first step, running, and calls no chat or session", async () => {
    const html = render(<RunPlayer playbook={playbook("renewal-sweep")} />, "/run");
    expect(html).toContain("rr-timeline");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Running");
    expect(html).toContain("Read each contract and pull out its dates and terms");
    for (const file of ["desk-run.tsx", "preview.ts"]) {
      const source = readFileSync(join(import.meta.dir, "../src/react-app/desk/preview", file), "utf8");
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
      for (const name of imports) expect(name).not.toMatch(/chat|session|thread|opencode|redrob-server/);
    }
  });
});

describe("Scheduled", () => {
  test("the waiting count matches the menu's, which reads the same sample state", async () => {
    const client = await seeded();
    const html = route("/scheduled", client);
    const navCount = (await createDeskServices({ client: null, workspaceId: null }).schedules.list()).data.waiting.length;
    expect(navCount).toBe(2);
    expect(html).toContain(`Waiting for you (${navCount})`);
    expect(html).toContain("Pick which contracts to end");
    expect(html).toContain("Add 2 deadlines to the team calendar");
    expect(html).toContain("3 running on a schedule, 1 paused");
    expect(html).toContain("Every Monday, 08:00 KST");
    expect(html).toContain("In Q3 supplier contracts");
    expect(html).toContain("Runs on schedule: Contract renewal sweep");
    expect(html).toContain("Paused");
  });

  test("answering one changes only the sample state, lowers the menu's count and refreshes it", async () => {
    const { deps, toasts, client } = boardDeps();
    client.setQueryData(navWaitingKey("preview"), 2);
    const { result, fetched } = await withoutNetwork(() => answerWaiting(deps, "w1", true));
    expect(fetched).toBe(0);
    expect(result.data.waiting.map((run) => run.id)).toEqual(["w2"]);
    expect(client.getQueryState(navWaitingKey("preview"))?.isInvalidated).toBe(true);
    expect(client.getQueryData(previewKey("preview", "board"))).toEqual(result);
    // The menu builds its own services; it sees the same board.
    expect((await createDeskServices({ client: null, workspaceId: null }).schedules.list()).data.waiting).toHaveLength(1);
    expect(result.data.schedules.find((entry) => entry.id === "s1")?.lastRun?.state).toBe("done");
    expect(toasts).toEqual([["Answer saved", "This is a preview, so nothing ran and nothing was sent."]]);

    await answerWaiting(deps, "w2", false);
    const html = route("/scheduled", client);
    expect(html).toContain("Nothing is waiting for you");
    expect(toasts[1]?.[0]).toBe("Marked Not now");
  });

  test("the schedule switch pauses and resumes in the sample state", async () => {
    const { deps, toasts } = boardDeps();
    const { result, fetched } = await withoutNetwork(() => setScheduleEnabled(deps, "s1", false));
    expect(fetched).toBe(0);
    expect(result.data.schedules.find((entry) => entry.id === "s1")?.enabled).toBe(false);
    expect(scheduledMeta(result.data)).toBe("2 running on a schedule, 2 paused");
    const resumed = await setScheduleEnabled(deps, "s4", true);
    expect(resumed.data.schedules.find((entry) => entry.id === "s4")?.enabled).toBe(true);
    expect(toasts.map(([title]) => title)).toEqual(["Schedule paused", "Schedule on"]);
  });

  test("each fixture instance reads the shared board", async () => {
    const one = createFixtureDeskServices();
    const two = createFixtureDeskServices();
    await one.schedules.setEnabled("s2", false);
    const board: ScheduleBoard = (await two.schedules.list()).data;
    expect(board.schedules.find((entry) => entry.id === "s2")?.enabled).toBe(false);
    resetSampleBoard();
    expect((await two.schedules.list()).data.schedules.find((entry) => entry.id === "s2")?.enabled).toBe(true);
  });
});

describe("History", () => {
  test("a table of everything Desk did and who approved it, from the sample entries", async () => {
    const html = route("/history", await seeded());
    expect(html).toContain("<table");
    expect(html).toContain("Everything Desk did, newest first");
    for (const entry of HISTORY) expect(html).toContain(entry.what.replace(/'/g, "&#x27;"));
    expect(html).toContain("Ran on its own");
    expect(html).toContain("Lee Dohyun");
    expect(html).toContain("Approval - sent outside");
    expect(html).toContain("desk-preview__figure");
    expect(html).toContain("4m 12s");
    expect(html.indexOf("Renewal sweep read 41 contracts")).toBeLessThan(html.indexOf("Declined to send 1 notice letter"));
  });

  test("shows no file path and no JSON", async () => {
    const text = readable(route("/history", await seeded()));
    expect(text).not.toMatch(/[{}]|\.json|\.pdf|[A-Za-z]:\\|\/Users\/|"\w+":/);
  });
});

describe("Model Guide", () => {
  test("opens by profession on the researched rankings, with the price view a tab away", async () => {
    const client = await seeded();
    client.setQueryData(GUIDE_RESEARCH_KEY, await loadGuideResearch());
    const html = route("/guide", client);
    expect(html).toContain('<h1 class="rr-shell__title">Model Guide</h1>');
    expect(html).toContain('href="/guide" aria-current="page"');
    expect(html).toContain('aria-selected="true" aria-controls="panel-profession"');
    expect(html).toContain("By price");
    expect(html).toContain("every message goes to Redrob Auto");
    expect(html).toContain("Rankings as of 2026-10-08");
    expect(html).not.toContain("rr-alert");
    expect(html).not.toContain("Sample output, illustrative");
  });
});
