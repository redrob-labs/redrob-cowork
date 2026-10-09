import { loadGuideResearch } from "../src/react-app/desk/guide/model-guide";
import { GUIDE_RESEARCH_KEY } from "../src/react-app/desk/preview/desk-guide";
import { afterEach, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes } from "react-router";
import { nextScheduledRun } from "@redrob-labs/ui";

import { setLocale, type Language } from "../src/i18n";
import { ScheduleDialog } from "../src/react-app/desk/scheduled/schedule-dialog";
import { scheduledMeta } from "../src/react-app/desk/preview/desk-scheduled";
import {
  answerWaiting,
  deleteSchedule,
  initialScheduleValue,
  navWaitingKey,
  previewKey,
  saveSchedule,
  scheduleFromPicker,
  setScheduleEnabled,
  type BoardActionDeps,
} from "../src/react-app/desk/preview/preview";
import { createFixtureDeskServices, resetSampleBoard, resetSampleSkills } from "../src/react-app/desk/services/fixture-services";
import { HISTORY } from "../src/react-app/desk/services/fixtures/history";
import { SKILLS } from "../src/react-app/desk/services/fixtures/skills";
import { createDeskServices } from "../src/react-app/desk/services/real-services";
import type { ScheduleBoard } from "../src/react-app/desk/services/types";
import { deskRoutes } from "../src/react-app/desk/shell/desk-routes";

afterEach(() => {
  setLocale("en");
  resetSampleBoard();
  resetSampleSkills();
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
  client.setQueryData(previewKey("preview", "skills"), await fixture.skills.list());
  client.setQueryData([...previewKey("preview", "library"), {}], await fixture.skills.library({}));
  client.setQueryData(previewKey("preview", "taxonomy"), await fixture.skills.taxonomy());
  client.setQueryData(previewKey("preview", "team"), await fixture.skills.teamState());
  client.setQueryData([...previewKey("preview", "skills"), "one", "first-review"], await fixture.skills.get("first-review"));
  client.setQueryData(previewKey("preview", "board"), await fixture.schedules.list());
  client.setQueryData(previewKey("preview", "history"), await fixture.history.list());
  client.setQueryData(previewKey("preview", "catalog"), await fixture.catalog.get());
  return client;
}

function route(path: string, client: QueryClient) {
  return render(<Routes>{deskRoutes(<span>chat screen</span>)}</Routes>, path, client);
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

const SCREENS: ReadonlyArray<{ path: string; title: string; place: string; note: string }> = [
  { path: "/skills", title: "Skills", place: "skills", note: "Preview: sample skills. Connect a project to use your own." },
  { path: "/skill/first-review", title: "first-review", place: "skills", note: "Preview: sample skills." },
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
    expect(route("/skills", client)).toContain("미리 보기: 예시 스킬입니다.");
    expect(route("/scheduled", client)).toContain("나를 기다리는 실행 (2)");
    expect(route("/history", client)).toContain("스스로 실행");
    client.setQueryData(GUIDE_RESEARCH_KEY, await loadGuideResearch());
    expect(route("/guide", client)).toContain("레드롭 오토");
  });
});

describe("Skills", () => {
  test("lists the sample skills with where each came from, and the library's not yet added", async () => {
    const html = route("/skills", await seeded());
    expect(html).toContain("3 installed");
    for (const entry of SKILLS) expect(html).toContain(`href="/skill/${entry.name}"`);
    for (const badge of [">Team<", ">Mine<", ">Library<"]) expect(html).toContain(badge);
    expect(html).toContain('aria-label="Add nda-review"');
    expect(html).toContain("New skill");
    expect(html).toContain("Review documents and contracts");
  });

  test("a team skill shows its instructions, Run and Schedule, and says it is managed in Redrob Console", async () => {
    const html = route("/skill/first-review", await seeded());
    expect(html).toContain("Managed in Redrob Console");
    expect(html).toContain("Contract first review");
    expect(html).toContain(">Run<");
    expect(html).toContain(">Schedule<");
    expect(html).not.toContain(">Edit<");
    expect(html).toContain('href="/skills"');
  });

  test("an unknown skill says so", async () => {
    const client = await seeded();
    client.setQueryData([...previewKey("preview", "skills"), "one", "nope"], await createFixtureDeskServices().skills.get("nope"));
    expect(route("/skill/nope", client)).toContain("This skill is not here");
  });
});

describe("Schedules on sample data", () => {
  test("the Schedule dialog starts from a prompt, with the picker and Save", () => {
    const html = render(
      <ScheduleDialog prompt="Sweep the renewals" sampleProjectId="supplier" real={false} onClose={() => {}} now={new Date(2026, 8, 28, 10, 0)} />,
      "/scheduled",
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
    const value = initialScheduleValue({ cadence: "Every Monday, 08:00 KST" }, now);
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

  test("a schedule run by a file arriving starts the picker on a new file", () => {
    expect(initialScheduleValue({ cadence: "When a new file arrives" }, new Date(2026, 8, 28)).mode).toBe("event");
    expect(initialScheduleValue({ cadence: "Every Monday, 08:00 KST" }, new Date(2026, 8, 28))).toMatchObject({
      mode: "repeat",
      date: "2026-09-28",
      time: "08:00",
      zone: "Asia/Seoul",
    });
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
