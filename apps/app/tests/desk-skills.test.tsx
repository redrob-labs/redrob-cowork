import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import type { RedrobSkillItem, RedrobTeamSkillsState } from "../src/app/lib/redrob-server";
import { setLocale } from "../src/i18n";
import { scheduleDraft } from "../src/react-app/desk/scheduled/schedule-dialog";
import { createFixtureDeskServices, resetSampleSkills } from "../src/react-app/desk/services/fixture-services";
import { TAXONOMY } from "../src/react-app/desk/services/fixtures/skills";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import type { DeskSkill, SkillDraft } from "../src/react-app/desk/services/types";
import { runSkill, SkillView } from "../src/react-app/desk/skills/desk-skill";
import { SkillFiltersView, SkillsView, teamStatusText, withFilter } from "../src/react-app/desk/skills/desk-skills";
import { saveSkill, SkillDialogView, skillDialogState, withTag, withTitle } from "../src/react-app/desk/skills/skill-dialog";
import {
  canEditSkill,
  canRemoveSkill,
  canSaveSkill,
  deskSkillFrom,
  isValidSkillName,
  skillBody,
  skillContent,
  skillOrigin,
  skillRows,
  skillRunPrompt,
  skillSlug,
  tagLabels,
} from "../src/react-app/desk/skills/skills";
import type { PendingDeskChat } from "../src/react-app/desk/skills/start-chat";
import { installSkill, removeSkill } from "../src/react-app/desk/skills/use-skills";

beforeEach(() => {
  setLocale("en");
  resetSampleSkills();
});

const DRAFT: SkillDraft = { name: "weekly-update", description: "Writes the weekly client update.", instructions: "Read the week's files.", editing: false };

describe("where a skill came from", () => {
  test("team by its metadata or the team's record, library by its metadata, the rest the person's", () => {
    const team: Pick<RedrobTeamSkillsState, "installed"> = { installed: ["synced-earlier"] };
    expect(skillOrigin({ name: "a", metadata: { source: "team" } }, null)).toBe("team");
    expect(skillOrigin({ name: "synced-earlier" }, team)).toBe("team");
    expect(skillOrigin({ name: "b", metadata: { source: "library" } }, team)).toBe("library");
    expect(skillOrigin({ name: "c", metadata: { profession: "lawyer" } }, team)).toBe("mine");
  });

  test("an installed skill keeps its tags and where it lives", () => {
    const item: RedrobSkillItem = { name: "nda-review", path: "/p", description: "d", scope: "project", metadata: { profession: "lawyer", task: "review", family: "nda", source: "library" } };
    expect(deskSkillFrom(item, null)).toEqual({ name: "nda-review", description: "d", origin: "library", tags: { profession: "lawyer", task: "review" }, scope: "project" });
  });

  test("team skills and skills outside the project are never changed here", () => {
    expect(canRemoveSkill({ origin: "team", scope: "project" })).toBe(false);
    expect(canRemoveSkill({ origin: "library", scope: "project" })).toBe(true);
    expect(canRemoveSkill({ origin: "mine", scope: "global" })).toBe(false);
    expect(canEditSkill({ origin: "library", scope: "project" })).toBe(false);
    expect(canEditSkill({ origin: "mine", scope: "project" })).toBe(true);
  });
});

describe("writing a skill", () => {
  test("names: lowercase words with single hyphens, up to 64; a title becomes one", () => {
    expect(isValidSkillName("weekly-update")).toBe(true);
    for (const bad of ["Weekly", "-weekly", "weekly-", "weekly--update", "a".repeat(65), ""]) expect(isValidSkillName(bad)).toBe(false);
    expect(skillSlug("Weekly client update!")).toBe("weekly-client-update");
    expect(skillSlug("주간 보고")).toBe("");
    expect(skillSlug(`${"a".repeat(63)} b`)).toBe("a".repeat(63));
  });

  test("Save needs a valid name, a description of at most 1024 characters, and instructions", () => {
    expect(canSaveSkill(DRAFT)).toBe(true);
    expect(canSaveSkill({ ...DRAFT, name: "Bad Name" })).toBe(false);
    expect(canSaveSkill({ ...DRAFT, description: " " })).toBe(false);
    expect(canSaveSkill({ ...DRAFT, description: "x".repeat(1025) })).toBe(false);
    expect(canSaveSkill({ ...DRAFT, instructions: "" })).toBe(false);
  });

  test("the SKILL.md has the name, a quoted description, the tags, then the instructions", () => {
    const content = skillContent({ ...DRAFT, description: 'Says "hi": always', profession: "lawyer", language: "ko" });
    expect(content).toBe(
      ['---', "name: weekly-update", 'description: "Says \\"hi\\": always"', "metadata:", "  profession: lawyer", "  language: ko", "---", "", "Read the week's files.", ""].join("\n"),
    );
    expect(skillBody(content)).toBe("Read the week's files.");
    expect(skillContent(DRAFT)).not.toContain("metadata:");
  });

  test("the dialog: the title fills in the name until the name is typed; a change keeps its name", () => {
    let state = withTitle(skillDialogState(null, "From a message"), "Weekly update");
    expect(state.draft).toMatchObject({ name: "weekly-update", instructions: "From a message", editing: false });
    state = withTitle({ ...state, nameTouched: true, draft: { ...state.draft, name: "my-name" } }, "Other");
    expect(state.draft.name).toBe("my-name");
    const editing = skillDialogState({ name: "mine", description: "d", tags: { task: "memo" }, body: "Do it.", installed: { origin: "mine", scope: "project" } });
    expect(editing.draft).toEqual({ name: "mine", description: "d", instructions: "Do it.", editing: true, task: "memo" });
    const html = renderToStaticMarkup(<SkillDialogView state={editing} taxonomy={TAXONOMY} locale="en" busy={false} onChange={() => {}} onSave={() => {}} onClose={() => {}} />);
    expect(html).toContain("Edit skill");
    expect(html).toContain("readOnly");
    expect(html).not.toContain('id="desk-skill-title"');
  });

  test("the dialog says what the description is for, and Save is off until the draft is valid", () => {
    const render = (draft: SkillDraft) =>
      renderToStaticMarkup(<SkillDialogView state={{ draft, title: "", nameTouched: false }} taxonomy={TAXONOMY} locale="en" busy={false} onChange={() => {}} onSave={() => {}} onClose={() => {}} />);
    const empty = render({ name: "", description: "", instructions: "", editing: false });
    expect(empty).toContain("The assistant reads this to decide when to use the skill.");
    expect(empty).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Save skill/);
    expect(render(DRAFT)).not.toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Save skill/);
    expect(render({ ...DRAFT, name: "Bad Name" })).toContain("single hyphens");
  });

  test("a new profession clears a task that is not its own", () => {
    const withTask = withTag({ ...DRAFT, profession: "lawyer" }, "task", "memo", TAXONOMY);
    expect(withTask.task).toBe("memo");
    expect(withTag(withTask, "profession", "accountant", TAXONOMY).task).toBeUndefined();
    expect(withTag(withTask, "language", "none", TAXONOMY).language).toBeUndefined();
  });
});

describe("the Skills screen", () => {
  const installed: DeskSkill[] = [
    { name: "weekly-report", description: "Weekly status.", origin: "library", tags: { profession: "lawyer", task: "client", language: "en" }, scope: "project" },
    { name: "mine", description: "My own.", origin: "mine", tags: {}, scope: "project" },
    { name: "first-review", description: "Contract review.", origin: "team", tags: { profession: "lawyer", task: "review", language: "en" }, scope: "project" },
  ];
  const library = [
    { name: "weekly-report", description: "Weekly status.", tags: { profession: "lawyer", task: "client", language: "en" } },
    { name: "legal-memo-ko", description: "법률 메모", tags: { profession: "lawyer", task: "memo", language: "ko" } },
  ];

  test("installed skills first, team then mine then library, then the library's not yet added", () => {
    const rows = skillRows({ installed, library, filters: {}, installedOnly: false });
    expect(rows.map((row) => [row.name, row.origin, row.installed !== null])).toEqual([
      ["first-review", "team", true],
      ["mine", "mine", true],
      ["weekly-report", "library", true],
      ["legal-memo-ko", "library", false],
    ]);
    expect(skillRows({ installed, library, filters: {}, installedOnly: true }).map((row) => row.name)).toEqual(["first-review", "mine", "weekly-report"]);
  });

  test("filters work like the Console's: tags with AND, search on the name and the description", () => {
    expect(skillRows({ installed, library, filters: { language: "ko" }, installedOnly: false }).map((row) => row.name)).toEqual(["legal-memo-ko"]);
    expect(skillRows({ installed, library, filters: { profession: "lawyer", task: "review" }, installedOnly: false }).map((row) => row.name)).toEqual(["first-review"]);
    expect(skillRows({ installed, library, filters: { q: "MY OWN" }, installedOnly: false }).map((row) => row.name)).toEqual(["mine"]);
    expect(withFilter({ profession: "lawyer", task: "memo" }, "profession", "all", TAXONOMY)).toEqual({});
  });

  test("rows show the origin badge, the tag labels in the person's language, and Add or Remove", () => {
    const rows = skillRows({ installed, library, filters: {}, installedOnly: false });
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SkillsView rows={rows} taxonomy={TAXONOMY} locale="en" filtered={false} busy={null} hrefFor={(name) => `/skill/${name}`} onAdd={() => {}} onRemove={() => {}} />
      </MemoryRouter>,
    );
    for (const badge of [">Team<", ">Mine<", ">Library<"]) expect(html).toContain(badge);
    expect(html).toContain("Review documents and contracts");
    expect(html).toContain('href="/skill/first-review"');
    expect(html).toContain('aria-label="Add legal-memo-ko"');
    expect(html).toContain('aria-label="Remove weekly-report"');
    expect(html).toContain('aria-label="Remove mine"');
    expect(html).not.toContain('aria-label="Remove first-review"');
    expect(tagLabels({ profession: "lawyer", task: "memo", language: "ko" }, TAXONOMY, "ko")).toEqual(["변호사", "서면과 메모 작성", "한국어"]);
  });

  test("filters: Profession, Task (its profession's), Language, each with All; search and Installed only", () => {
    const html = renderToStaticMarkup(
      <SkillFiltersView filters={{}} installedOnly={false} taxonomy={TAXONOMY} locale="en" onFilters={() => {}} onInstalledOnly={() => {}} />,
    );
    for (const text of ["Profession", "Task", "Language", "All", "Search skills", "Installed only"]) expect(html).toContain(text);
  });

  test("empty: no skills says how to get one; no match says to change the filters", () => {
    const render = (filtered: boolean) =>
      renderToStaticMarkup(<SkillsView rows={[]} taxonomy={null} locale="en" filtered={filtered} busy={null} hrefFor={(name) => name} onAdd={() => {}} onRemove={() => {}} />);
    expect(render(false)).toContain("No skills yet");
    expect(render(true)).toContain("No skills match");
  });

  test("the team line names conflicts and a missing key, and says nothing when all is well", () => {
    const state: RedrobTeamSkillsState = { etag: null, installed: [], conflicts: [], lastSyncAt: null, status: "synced" };
    expect(teamStatusText(state)).toBeNull();
    expect(teamStatusText({ ...state, conflicts: ["nda-review"] })).toContain("nda-review");
    expect(teamStatusText({ ...state, status: "not_connected" })).toContain("Redrob Key");
    expect(teamStatusText(null)).toBeNull();
  });
});

describe("one skill", () => {
  test("Run opens a new chat in Plan that asks for the skill, with what the person added", () => {
    const requested: PendingDeskChat[] = [];
    const went: string[] = [];
    const deps = { workspaceId: "ws_1", request: (chat: PendingDeskChat) => requested.push(chat), navigate: (path: string) => went.push(path) };
    expect(runSkill(deps, "nda-review")).toBe(true);
    runSkill(deps, "nda-review", "  Only the term.  ");
    expect(requested).toEqual([
      { workspaceId: "ws_1", prompt: "Use the `nda-review` skill.", mode: "plan" },
      { workspaceId: "ws_1", prompt: "Use the `nda-review` skill.\n\nOnly the term.", mode: "plan" },
    ]);
    expect(went).toEqual(["/chat", "/chat"]);
    expect(runSkill({ ...deps, workspaceId: null }, "nda-review")).toBe(false);
    expect(skillRunPrompt("x")).toBe("Use the `x` skill.");
  });

  test("Schedule starts the schedule dialog on this skill", () => {
    const draft = scheduleDraft({ skill: "nda-review", now: new Date(2026, 9, 5) });
    expect(draft).toMatchObject({ kind: "skill", skill: "nda-review", instructions: "" });
  });

  test("a team skill says it is managed in Redrob Console; its instructions render as markdown", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SkillView
          skill={{ name: "first-review", description: "Reviews a contract.", tags: { profession: "lawyer" }, body: "# Steps\n\n1. **Read** it.", installed: { origin: "team", scope: "project" } }}
          taxonomy={TAXONOMY}
          locale="en"
          extra=""
          canRun
          onExtra={() => {}}
          onRun={() => {}}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Managed in Redrob Console");
    expect(html).toContain("<strong>Read</strong>");
    expect(html).toContain(">Team<");
    expect(html).toContain(">Run<");
  });

  test("a library skill not added yet has no Run", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SkillView skill={{ name: "nda-review", description: "d", tags: {}, body: "Do it.", installed: null }} taxonomy={null} locale="en" extra="" canRun onExtra={() => {}} onRun={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain("Not added");
    expect(html).not.toContain(">Run<");
  });
});

describe("sample skills", () => {
  test("list, library, add, save, remove; team skills stay", async () => {
    const services = createFixtureDeskServices();
    const listed = await services.skills.list();
    expect(listed.preview).toBe(true);
    expect(listed.data.map((skill) => skill.origin).sort()).toEqual(["library", "mine", "team"]);
    expect((await services.skills.library({ language: "ko" })).data.map((skill) => skill.name)).toEqual(["legal-memo-ko"]);
    await services.skills.install("nda-review");
    await expect(services.skills.install("nda-review")).rejects.toThrow();
    await services.skills.save(DRAFT);
    await expect(services.skills.save(DRAFT)).rejects.toThrow();
    await services.skills.save({ ...DRAFT, editing: true, instructions: "Changed." });
    expect((await services.skills.get("weekly-update")).data).toMatchObject({ body: "Changed.", installed: { origin: "mine" } });
    await services.skills.remove("nda-review");
    await expect(services.skills.remove("first-review")).rejects.toThrow();
    // Another instance reads the same sample skills, as the dialog and the screen do.
    const names = (await createFixtureDeskServices().skills.list()).data.map((skill) => skill.name);
    expect(names).toContain("weekly-update");
    expect(names).not.toContain("nda-review");
    expect((await services.skills.get("legal-memo-ko")).data?.installed).toBeNull();
    expect((await services.skills.teamState()).data).toBeNull();
  });

  test("actions toast, refresh the lists, and say when it was sample data", async () => {
    const services = createFixtureDeskServices();
    const toasts: string[] = [];
    const invalidated: unknown[] = [];
    const deps = { skills: services.skills, queryClient: { invalidateQueries: async (filters: unknown) => void invalidated.push(filters) }, scope: "preview", showToast: (title: string) => void toasts.push(title) };
    expect(await installSkill(deps, "nda-review")).toBe(true);
    expect(await installSkill(deps, "nda-review")).toBe(false);
    expect(await removeSkill(deps, "nda-review")).toBe(true);
    expect(toasts).toEqual(["Added nda-review", "Couldn't add the skill", "Removed nda-review"]);
    expect(invalidated).toContainEqual({ queryKey: ["desk-preview", "preview", "skills"] });
    expect(await saveSkill({ skills: services.skills, invalidate: () => {}, showToast: (title) => void toasts.push(title) }, DRAFT)).toBe(true);
    expect(toasts.at(-1)).toBe("Skill saved");
  });
});

describe("real skills", () => {
  function fakeClient(team: RedrobTeamSkillsState | null = { etag: null, installed: ["synced"], conflicts: [], lastSyncAt: 1, status: "synced" }) {
    const calls: string[] = [];
    const unused = async (): Promise<never> => {
      throw new Error("not used");
    };
    let items: RedrobSkillItem[] = [
      { name: "synced", path: "/p/synced", description: "From the team.", scope: "project" },
      { name: "added", path: "/p/added", description: "From the library.", scope: "project", metadata: { source: "library", profession: "lawyer" } },
      { name: "mine", path: "/p/mine", description: "My own.", scope: "project" },
    ];
    const client: DeskServerClient = {
      listSkills: async (workspaceId, options) => {
        calls.push(`list:${workspaceId}:${String(options?.includeGlobal)}`);
        return { items };
      },
      getSkill: async (workspaceId, name) => {
        calls.push(`get:${workspaceId}:${name}`);
        const item = items.find((entry) => entry.name === name);
        if (!item) throw new Error("404");
        return { item, content: `---\nname: ${name}\ndescription: x\n---\n\nThe ${name} instructions.\n` };
      },
      upsertSkill: async (workspaceId, payload) => {
        calls.push(`upsert:${workspaceId}:${payload.name}:${payload.content}`);
        const saved: RedrobSkillItem = { name: payload.name, path: "/p", description: payload.description ?? "", scope: "project" };
        items = [...items.filter((entry) => entry.name !== payload.name), saved];
        return saved;
      },
      deleteSkill: async (workspaceId, name) => {
        calls.push(`delete:${workspaceId}:${name}`);
        return { path: "/p" };
      },
      listLibrarySkills: async (workspaceId, filter) => {
        calls.push(`library:${workspaceId}:${JSON.stringify(filter)}`);
        return { version: "v", source: "snapshot", skills: [{ name: "nda-review", description: "NDA.", profession: "lawyer", task: "review", language: "en", family: "nda-review", version: 1 }] };
      },
      getSkillTaxonomy: async () => ({ ...TAXONOMY, source: "console" }),
      getLibrarySkill: async (workspaceId, name) => {
        calls.push(`library-get:${workspaceId}:${name}`);
        if (name !== "nda-review") throw new Error("404");
        return { name, description: "NDA.", profession: "lawyer", task: "review", language: "en", family: name, version: 1, body: "Check the term.", content: "", source: "console" };
      },
      installLibrarySkill: async (workspaceId, name) => {
        calls.push(`install:${workspaceId}:${name}`);
        return { name, path: "/p", description: "NDA.", scope: "project" };
      },
      getTeamSkills: async () => {
        if (!team) throw new Error("no server");
        return team;
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
      listSchedules: unused,
      addSchedule: unused,
      updateSchedule: unused,
      deleteSchedule: unused,
      answerScheduleWaiting: unused,
    };
    return { client, calls };
  }

  test("installed skills carry their origin: the team's record, the library's metadata, the rest mine", async () => {
    const { client } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    const listed = await services.skills.list();
    expect(listed.preview).toBe(false);
    expect(listed.data.map((skill) => [skill.name, skill.origin])).toEqual([["synced", "team"], ["added", "library"], ["mine", "mine"]]);
    // Without the team's record a skill without metadata is the person's.
    const offline = createRealDeskServices({ client: fakeClient(null).client, workspaceId: "ws_1" });
    expect((await offline.skills.list()).data[0]?.origin).toBe("mine");
  });

  test("the library and its taxonomy; one skill installed or from the library", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    expect((await services.skills.library({ profession: "lawyer" })).data).toEqual([{ name: "nda-review", description: "NDA.", tags: { profession: "lawyer", task: "review", language: "en" } }]);
    expect((await services.skills.taxonomy()).data).toEqual(TAXONOMY);
    expect((await services.skills.get("mine")).data).toMatchObject({ body: "The mine instructions.", installed: { origin: "mine", scope: "project" } });
    expect((await services.skills.get("nda-review")).data).toMatchObject({ body: "Check the term.", installed: null, tags: { task: "review" } });
    expect((await services.skills.get("nowhere")).data).toBeNull();
    expect(calls).toContain(`library:ws_1:${JSON.stringify({ profession: "lawyer" })}`);
    expect(calls).toContain("get:ws_1:mine");
  });

  test("add, save new and changed, and remove go to the server; team skills and taken names are refused", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    await services.skills.install("nda-review");
    await services.skills.save(DRAFT);
    await expect(services.skills.save({ ...DRAFT, name: "mine" })).rejects.toThrow();
    await expect(services.skills.save({ ...DRAFT, name: "added", editing: true })).rejects.toThrow();
    await services.skills.save({ ...DRAFT, name: "mine", editing: true });
    await expect(services.skills.remove("synced")).rejects.toThrow();
    await services.skills.remove("added");
    await services.skills.remove("mine");
    expect(calls.filter((call) => !call.startsWith("list:"))).toEqual([
      "install:ws_1:nda-review",
      `upsert:ws_1:weekly-update:${skillContent(DRAFT)}`,
      `upsert:ws_1:mine:${skillContent({ ...DRAFT, name: "mine", editing: true })}`,
      "delete:ws_1:added",
      "delete:ws_1:mine",
    ]);
  });
});

describe("Save as skill", () => {
  test("a sent message opens the skill dialog with its text as the instructions", () => {
    const source = readFileSync(join(import.meta.dir, "..", "src", "components", "chat", "message-list.tsx"), "utf8");
    expect(source).toContain('openModal({ kind: "skill", instructions: messageText })');
    expect(source).toContain('t("desk.skill_save_from_message")');
  });
});
