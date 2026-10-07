import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import type { RedrobCommandItem } from "../src/app/lib/redrob-server";
import { draftFor, promptBody } from "../src/react-app/desk/playbooks/playbook-dialog";
import { humanizeName, parseTemplate, playbookFromCommand, playbookSlug, playbookTemplate } from "../src/react-app/desk/playbooks/playbooks";
import type { PendingDeskChat } from "../src/react-app/desk/playbooks/start-chat";
import { PlaybookView, runPlaybook } from "../src/react-app/desk/preview/desk-playbook";
import { PlaybooksView } from "../src/react-app/desk/preview/desk-playbooks";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";

const TEMPLATE = `# Weekly client update

1. Read where things stand
2. Draft the update
3. Send it to the client (ask first)

Write a short update for the client from this project's files.`;

describe("a command as a playbook", () => {
  test("the title and steps at the top of the template; (ask first) marks a stop", () => {
    const { title, steps } = parseTemplate(TEMPLATE);
    expect(title).toBe("Weekly client update");
    expect(steps.map((step) => step.label)).toEqual(["Read where things stand", "Draft the update", "Send it to the client"]);
    expect(steps.map((step) => Boolean(step.approval))).toEqual([false, false, true]);
    expect(parseTemplate("- 초안 쓰기\n- 고객에게 보내기 (먼저 묻기)\n\n요청").steps[1]).toMatchObject({ label: "고객에게 보내기" });
    expect(parseTemplate("Just a prompt.")).toEqual({ title: null, steps: [] });
  });

  test("maps a command, with the template as what Run sends", () => {
    const playbook = playbookFromCommand({ name: "weekly-client-update", description: "A short update", template: TEMPLATE, scope: "workspace" });
    expect(playbook).toMatchObject({
      id: "weekly-client-update",
      name: "Weekly client update",
      summary: "A short update",
      team: true,
      highStakes: true,
      prompt: TEMPLATE,
      runCount: 0,
    });
    expect(playbookFromCommand({ name: "review_nda", template: "Review it.", scope: "global" })).toMatchObject({ name: "Review nda", team: false, highStakes: false });
    expect(humanizeName("a-b_c")).toBe("A b c");
  });

  test("a saved playbook reads back as it was written", () => {
    const template = playbookTemplate({ name: "Weekly client update", steps: ["Read", "", "Send (ask first)"], prompt: "Write it." });
    expect(template).toBe("# Weekly client update\n\n1. Read\n2. Send (ask first)\n\nWrite it.");
    const playbook = playbookFromCommand({ name: "weekly", description: "d", template, scope: "workspace" });
    expect(draftFor(playbook)).toEqual({ id: "weekly", name: "Weekly client update", description: "d", steps: ["Read", "Send (ask first)"], prompt: "Write it." });
    expect(promptBody("No title, no steps.")).toBe("No title, no steps.");
  });

  test("file names are Latin; a Korean name gets a generated one", () => {
    expect(playbookSlug("Weekly client update!")).toBe("weekly-client-update");
    expect(playbookSlug("주간 고객 보고", 36)).toBe("playbook-10");
  });
});

describe("real playbooks", () => {
  function fakeClient() {
    const calls: string[] = [];
    const unused = async (): Promise<never> => {
      throw new Error("not used");
    };
    const command = (name: string, scope: RedrobCommandItem["scope"]): RedrobCommandItem => ({ name, template: `# ${name}\n\nDo it.`, scope });
    const client: DeskServerClient = {
      listWorkspaces: unused,
      listSessions: unused,
      getSession: unused,
      listMemories: unused,
      saveMemory: unused,
      updateMemory: unused,
      deleteMemory: unused,
      listArtifacts: unused,
      listMcp: unused,
      getConfig: unused,
      patchConfig: unused,
      listCommands: async (workspaceId, scope) => {
        calls.push(`list:${workspaceId}:${scope}`);
        return { items: scope === "global" ? [command("mine", "global"), command("shared", "global")] : [command("shared", "workspace")] };
      },
      upsertCommand: async (workspaceId, payload) => {
        calls.push(`upsert:${workspaceId}:${payload.name}:${payload.template}`);
        return { items: [] };
      },
      deleteCommand: async (workspaceId, name) => {
        calls.push(`delete:${workspaceId}:${name}`);
        return { ok: true };
      },
    };
    return { client, calls };
  }

  test("lists the workspace's commands, then the person's own, once each", async () => {
    const { client } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    const result = await services.playbooks.list();
    expect(result.preview).toBe(false);
    expect(result.data.map((playbook) => [playbook.id, playbook.team])).toEqual([["shared", true], ["mine", false]]);
    expect((await services.playbooks.get("mine")).data?.name).toBe("mine");
  });

  test("saving writes a command; deleting removes it", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    const saved = await services.playbooks.save({ name: "Weekly update", description: "Short", steps: ["Read"], prompt: "Write it." });
    expect(saved.data).toMatchObject({ id: "weekly-update", name: "Weekly update", prompt: "# Weekly update\n\n1. Read\n\nWrite it." });
    await services.playbooks.save({ id: "weekly-update", name: "Weekly update", description: "", steps: [], prompt: "Again." });
    await services.playbooks.remove("weekly-update");
    expect(calls).toEqual([
      "upsert:ws_1:weekly-update:# Weekly update\n\n1. Read\n\nWrite it.",
      "upsert:ws_1:weekly-update:# Weekly update\n\nAgain.",
      "delete:ws_1:weekly-update",
    ]);
  });
});

describe("Run", () => {
  test("a saved playbook opens a new chat in Plan with its prompt", () => {
    const requested: PendingDeskChat[] = [];
    const went: string[] = [];
    runPlaybook({ workspaceId: "ws_1", request: (chat) => requested.push(chat), navigate: (path) => went.push(path) }, { id: "weekly", prompt: TEMPLATE });
    expect(requested).toEqual([{ workspaceId: "ws_1", prompt: TEMPLATE, mode: "plan" }]);
    expect(went).toEqual(["/chat"]);
  });

  test("a sample playbook still opens the sample run", () => {
    const went: string[] = [];
    runPlaybook({ workspaceId: null, request: () => {}, navigate: (path) => went.push(path) }, { id: "first-review" });
    expect(went).toEqual(["/run?playbook=first-review"]);
  });

  test("the chat route starts the requested chat in the mode asked for", () => {
    const route = readFileSync(join(import.meta.dir, "..", "src", "react-app", "shell", "session-route.tsx"), "utf8");
    const start = route.indexOf("const startPendingChat = useEffectEvent(");
    const body = route.slice(start, route.indexOf("});", start));
    expect(body).toContain("useDeskComposerStore.getState().setMode(NEW_CHAT_KEY, pending.mode);");
    expect(body).toContain("createTaskWithPrompt(pending.workspaceId, pending.prompt);");
    expect(route).toContain("onCreateTaskWithPrompt: createTaskWithPrompt,");
  });
});

describe("screens", () => {
  test("no playbooks says how to make one", () => {
    const html = renderToStaticMarkup(<PlaybooksView playbooks={[]} hrefFor={(id) => id} />);
    expect(html).toContain("No playbooks yet");
  });

  test("a saved playbook shows what it does and its steps, and nothing it does not have", () => {
    const playbook = playbookFromCommand({ name: "weekly", description: "A short update", template: TEMPLATE, scope: "workspace" });
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PlaybookView playbook={playbook} locale="en" onRun={() => {}} onOpenLink={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain("A short update");
    expect(html).toContain("Send it to the client");
    expect(html).not.toContain("desk-preview__impact");
    expect(html).not.toMatch(/Gets|Needs/);
  });
});
