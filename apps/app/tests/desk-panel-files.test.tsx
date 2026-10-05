import { describe, expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { UIMessage } from "ai";

import { deriveOpenTargets } from "../src/react-app/domains/session/artifacts/open-target";
import {
  deskFileIdFor,
  displayFileName,
  fileIconFor,
  filesThisWeek,
  findDeskFile,
} from "../src/react-app/desk/panel/desk-files";
import {
  DeskFilePreview,
  DeskFilesList,
  DeskFileView,
  fileActionsFor,
  type DeskFileViewProps,
  type FileActions,
} from "../src/react-app/desk/panel/desk-panel-files";
import { applyFramePanelCommand, routeSidePanelRequest } from "../src/react-app/desk/panel/route-side-panel";
import { FILES } from "../src/react-app/desk/services/fixtures/files";
import { SAMPLE_NOW } from "../src/react-app/desk/services/fixtures/sample-day";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import type { DeskFile } from "../src/react-app/desk/services/types";
import { formatNavTime } from "../src/react-app/desk/shell/nav";
import { createFrameStore } from "../src/react-app/desk/store/frame-store";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = SAMPLE_NOW;

function render(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/chat"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const file = (patch: Partial<DeskFile> & Pick<DeskFile, "id" | "when">): DeskFile => ({
  name: `${patch.id}.md`,
  icon: "fileText",
  projectName: "Seorin MSA",
  fromChat: null,
  kind: "file",
  ...patch,
});

/** A server that lists two files Desk wrote, one under folders and one named by a full Windows path. */
async function realFiles(): Promise<DeskFile[]> {
  const unused = async (): Promise<never> => {
    throw new Error("not used");
  };
  const client: DeskServerClient = {
    listWorkspaces: async () => ({
      items: [{ id: "ws_1", name: "seorin", displayName: "Seorin MSA", path: "C:\\Users\\x\\Documents\\Seorin MSA", preset: "starter", workspaceType: "local" }],
    }),
    listSessions: unused,
    getSession: unused,
    listMemories: unused,
    saveMemory: unused,
    deleteMemory: unused,
    listMcp: unused,
    listArtifacts: async () => ({
      items: [
        { id: "a1", path: "reports/q3/plan.md", updatedAt: NOW - 2 * HOUR },
        { id: "a2", name: "C:\\Users\\x\\Documents\\Seorin MSA\\notice.docx", path: "Seorin MSA/notice.docx", updatedAt: NOW - HOUR },
      ],
    }),
  };
  return (await createRealDeskServices({ client, workspaceId: "ws_1" }).files.list()).data;
}

/**
 * Every place a person could read a path: text between tags and attribute values. Icons
 * (their SVG namespace and drawing) and the link back to the chat are left out.
 */
function visibleStrings(html: string): string[] {
  const markup = html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/href="#?\/chat\/[^"/]*"/g, "");
  const text = [...markup.matchAll(/>([^<]+)</g)].map((match) => match[1]);
  const attributes = [...markup.matchAll(/="([^"]*)"/g)].map((match) => match[1]);
  return [...text, ...attributes];
}

const PATH_LIKE = /[\\/]|\b[A-Za-z]:/;

function viewProps(target: DeskFile, actions: FileActions, calls: string[] = []): DeskFileViewProps {
  return {
    file: target,
    now: NOW,
    locale: "en",
    chat: target.chatId && target.fromChat ? { id: target.chatId, title: target.fromChat } : null,
    actions,
    preview: <DeskFilePreview file={target} client={null} workspaceId={null} />,
    onBack: () => calls.push("back"),
    onOpenInOffice: () => calls.push("open"),
    onShowInFolder: () => calls.push("reveal"),
  };
}

/** The buttons in an element tree, walking only plain elements (a view's own markup). */
function plainButtons(node: ReactNode): Array<{ className?: string; onClick?: () => void }> {
  const found: Array<{ className?: string; onClick?: () => void }> = [];
  const walk = (child: ReactNode) => {
    if (!isValidElement<{ children?: ReactNode; className?: string; onClick?: () => void }>(child)) return;
    if (child.type === "button") found.push(child.props);
    Children.forEach(child.props.children, walk);
  };
  walk(node);
  return found;
}

describe("this week's files", () => {
  test("only the last seven days, newest first", () => {
    const files = [
      file({ id: "old", when: NOW - 8 * DAY }),
      file({ id: "mid", when: NOW - 3 * DAY }),
      file({ id: "new", when: NOW - HOUR }),
      file({ id: "edge", when: NOW - 7 * DAY + 1 }),
      file({ id: "future", when: NOW + DAY }),
    ];
    expect(filesThisWeek(files, NOW).map((entry) => entry.id)).toEqual(["new", "mid", "edge"]);
  });

  test("the sample week keeps the four sample files from the past seven days", () => {
    expect(filesThisWeek(FILES, NOW).map((entry) => entry.id)).toEqual(["f-notice", "f-note", "f-plan", "f-exhibits"]);
  });
});

describe("the Files list", () => {
  test("each row is a button with the icon, name, project and when", () => {
    const html = render(<DeskFilesList files={filesThisWeek(FILES, NOW)} now={NOW} locale="en" onOpen={() => undefined} />);
    expect(html).toContain("What Desk wrote for you this week, newest first.");
    expect(html.match(/<button type="button" class="desk-file-row"/g)?.length).toBe(4);
    const first = html.slice(html.indexOf('class="desk-file-row"'), html.indexOf("</button>"));
    expect(first).toMatch(/<span class="desk-file__icon"><svg/);
    expect(first).toContain("<b>Notice ending the Seorin MSA (KO, EN).docx</b>");
    expect(first).toContain("<span>Seorin MSA</span>");
    expect(first).toContain(`<span class="desk-file-row__when">${formatNavTime(FILES[0].when, NOW, "en")}</span>`);
    expect(html.indexOf("Note for the client.docx")).toBeLessThan(html.indexOf("Hanbit exhibit index.xlsx"));
  });

  test("a row opens its file", () => {
    const opened: string[] = [];
    const list = DeskFilesList({ files: FILES.slice(0, 2), now: NOW, locale: "en", onOpen: (id) => opened.push(id) });
    plainButtons(list).forEach((button) => button.onClick?.());
    expect(opened).toEqual(["f-notice", "f-note"]);
  });

  test("empty: says there are no files this week", () => {
    const html = render(<DeskFilesList files={[]} now={NOW} locale="en" onOpen={() => undefined} />);
    expect(html).toContain("No files yet this week");
    expect(html).not.toContain("desk-file-row");
  });
});

describe("the file view", () => {
  const notice = FILES[0];

  test("name, In the project folder and when, a raised preview, and the chat that wrote it", () => {
    const html = render(<DeskFileView {...viewProps(notice, "ready")} />);
    expect(html).toContain("All files");
    expect(html).toContain("<b>Notice ending the Seorin MSA (KO, EN).docx</b>");
    expect(html).toContain("<span>In the Seorin MSA folder</span>");
    expect(html).toContain(`<span>${formatNavTime(notice.when, NOW, "en")}</span>`);
    expect(html).toMatch(/<div class="desk-file__preview">[\s\S]*Notice of termination/);
    expect(html).toMatch(/Written in the chat <a href="\/chat\/notice"[^>]*>Notice by email - valid\?<\/a>/);
  });

  test("on the desktop: Open in Redrob Office first, then Show in folder, both enabled", () => {
    const html = render(<DeskFileView {...viewProps(notice, "ready")} />);
    const open = html.indexOf("Open in Redrob Office");
    const reveal = html.indexOf("Show in folder");
    expect(open).toBeGreaterThan(-1);
    expect(reveal).toBeGreaterThan(open);
    expect(html.slice(html.indexOf('class="desk-file__actions"'))).not.toContain("disabled");
    expect(html).not.toContain("desk-file__note");
  });

  test("on the web: both disabled, with the reason", () => {
    const html = render(<DeskFileView {...viewProps(notice, "web")} />);
    const actions = html.slice(html.indexOf('class="desk-file__actions"'));
    expect(actions.match(/disabled=""/g)?.length).toBe(2);
    expect(html).toContain("Open and Show in folder work in the desktop app.");
  });

  test("which actions apply", () => {
    expect(fileActionsFor({ desktop: true, workspaceRoot: "C:\\w", file: { path: "a.md" } })).toBe("ready");
    expect(fileActionsFor({ desktop: false, workspaceRoot: "C:\\w", file: { path: "a.md" } })).toBe("web");
    expect(fileActionsFor({ desktop: true, workspaceRoot: null, file: { path: "a.md" } })).toBe("sample");
    expect(fileActionsFor({ desktop: true, workspaceRoot: "C:\\w", file: {} })).toBe("sample");
    expect(fileActionsFor({ desktop: false, workspaceRoot: null, file: {} })).toBe("web");
  });

  test("back goes to the list, and the actions call through", () => {
    const calls: string[] = [];
    const view = DeskFileView(viewProps(notice, "ready", calls));
    const back = plainButtons(view).find((button) => button.className === "desk-file__back");
    back?.onClick?.();
    const props = viewProps(notice, "ready", calls);
    props.onOpenInOffice();
    props.onShowInFolder();
    expect(calls).toEqual(["back", "open", "reveal"]);

    const store = createFrameStore({ storage: () => null });
    store.getState().openFile("f-notice");
    store.getState().openFile(null);
    expect(store.getState().panel).toMatchObject({ open: true, tab: "files", file: null });
  });

  test("a file without a preview says to open it in Office", () => {
    const docx = file({ id: "x", when: NOW, name: "notice.docx", path: "Seorin MSA/notice.docx" });
    expect(render(<DeskFilePreview file={docx} client={null} workspaceId={null} />)).toContain("Open it in Redrob Office to see it.");
  });
});

describe("no file path on screen", () => {
  test("displayFileName keeps the last part only", () => {
    expect(displayFileName("C:\\Users\\x\\Documents\\Seorin MSA\\notice.docx")).toBe("notice.docx");
    expect(displayFileName("reports/q3/plan.md")).toBe("plan.md");
    expect(displayFileName("/home/x/a b.txt/")).toBe("a b.txt");
    expect(displayFileName("plain.md")).toBe("plain.md");
  });

  test("the list and the view of real files show names, never paths", async () => {
    const files = await realFiles();
    expect(files.map((entry) => entry.name).sort()).toEqual(["notice.docx", "plan.md"]);
    const shown = filesThisWeek(files, NOW);
    expect(shown).toHaveLength(2);

    const html = [
      render(<DeskFilesList files={shown} now={NOW} locale="en" onOpen={() => undefined} />),
      ...shown.flatMap((entry) =>
        (["ready", "web", "sample"] satisfies FileActions[]).map((actions) =>
          render(<DeskFileView {...viewProps({ ...entry, chatId: "ses_1", fromChat: "Notice by email - valid?" }, actions)} />),
        ),
      ),
    ];
    for (const markup of html) {
      expect(markup).toContain("desk-file");
      expect(visibleStrings(markup).filter((value) => PATH_LIKE.test(value))).toEqual([]);
    }
    // The scan itself catches a path.
    expect(visibleStrings('<p title="a/b">x</p><b>C:\\x</b>').filter((value) => PATH_LIKE.test(value))).toEqual(["C:\\x", "a/b"]);
    expect(html.join("")).not.toContain("Users");
    expect(html.join("")).not.toContain("q3");
  });

  test("the sample files show no path either", () => {
    const html = [
      render(<DeskFilesList files={FILES} now={NOW} locale="en" onOpen={() => undefined} />),
      ...FILES.map((entry) => render(<DeskFileView {...viewProps(entry, "sample")} />)),
    ];
    for (const markup of html) expect(visibleStrings(markup).filter((value) => PATH_LIKE.test(value))).toEqual([]);
  });
});

describe("a file name in a chat answer opens that file", () => {
  const answer = (text: string): UIMessage => ({ id: "m1", role: "assistant", parts: [{ type: "text", text }] });

  test("the answer's open target and the list row have the same id", async () => {
    const files = await realFiles();
    const [target] = deriveOpenTargets([answer("I wrote the plan to .opencode/redrob/outbox/reports/q3/plan.md for you.")]);
    expect(target?.kind).toBe("file");
    const listed = files.find((entry) => entry.name === "plan.md");
    expect(listed?.id).toBe(target?.id);
    expect(deskFileIdFor(".opencode\\redrob\\outbox\\Reports\\Q3\\Plan.md")).toBe(listed?.id ?? "");
    expect(deskFileIdFor("file:./.opencode/redrob/outbox/reports/q3/plan.md")).toBe(listed?.id ?? "");
  });

  test("the session page's open lands on that file's view", async () => {
    const files = await realFiles();
    const [target] = deriveOpenTargets([answer("I saved it to .opencode/redrob/outbox/reports/q3/plan.md")]);
    const store = createFrameStore({ storage: () => null });
    // What `openTarget` in session-page.tsx sends for a file target inside the Desk frame.
    const command = routeSidePanelRequest("panel", true, { tab: "files", file: target?.id ?? "" });
    if (command) applyFramePanelCommand(command, store.getState());
    expect(store.getState().panel).toMatchObject({ open: true, tab: "files" });
    const opened = findDeskFile(store.getState().panel.file ?? "", files, { targets: [], projectName: "", chatId: null });
    expect(opened).toMatchObject({ name: "plan.md", projectName: "Seorin MSA", path: ".opencode/redrob/outbox/reports/q3/plan.md" });

    const [plan] = deriveOpenTargets([answer("I wrote reports/q3/plan.md")]);
    applyFramePanelCommand({ kind: "file", id: plan?.id ?? "" }, store.getState());
    const fromChat = findDeskFile(store.getState().panel.file ?? "", files, {
      targets: plan ? [plan] : [],
      projectName: "Seorin MSA",
      chatId: "ses_1",
    });
    expect(fromChat).toMatchObject({ name: "plan.md", projectName: "Seorin MSA", chatId: "ses_1", path: "reports/q3/plan.md" });
  });

  test("a file the list and the chat do not know stays on the list", () => {
    expect(findDeskFile("file:nowhere.md", FILES, { targets: [], projectName: "", chatId: null })).toBeNull();
    expect(findDeskFile("f-plan", FILES, { targets: [], projectName: "", chatId: null })?.name).toBe("Plan · Ending the Seorin MSA.md");
  });

  test("icons follow the kind of file", () => {
    expect(fileIconFor("a.xlsx")).toBe("fileSheet");
    expect(fileIconFor("a.png")).toBe("fileImage");
    expect(fileIconFor("a.pdf")).toBe("filePdf");
    expect(fileIconFor("a.json")).toBe("fileCode");
    expect(fileIconFor("a.docx")).toBe("fileText");
  });
});
