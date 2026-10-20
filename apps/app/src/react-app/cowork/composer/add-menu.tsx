/** @jsxImportSource react */
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { create } from "zustand";
import { icons, type IconName } from "@redrob-labs/ui";
import { X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { menuItemClassName } from "@/components/ui/menu-surface";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import {
  CONNECTORS_QUERY_KEY,
  connectorStateLabel,
  invalidateConnectors,
  mcpStatusReader,
  setConnectorEnabled,
  visibleConnectors,
  type ConnectorActionDeps,
} from "../connectors/connectors";
import { openExternal } from "../connectors/cowork-connectors";
import { PROJECTS_QUERY_KEY } from "../projects/cowork-projects";
import { loadProjectRows, moveChatToProject, projectChoices } from "../projects/projects";
import { createCoworkServices } from "../services/real-services";
import type { Connector } from "../services/types";
import { useCoworkConnection } from "../shell/cowork-connection";
import { SkillIcon } from "../skills/skill-icon";
import { skillDisplayTitle } from "../skills/skills";
import { useMarketplaceRows } from "../skills/use-marketplace";
import { PREVIEW_QUERY_KEY } from "../preview/preview";
import { useFrameStore } from "../store/frame-store";
import { useCoworkComposerStore } from "./composer-state";
import { usePending } from "./use-pending";

// Menu row glyphs; decorative, each row's text is its label.
const ICON = { width: 16, height: 16, "aria-hidden": true };
// The projects list is cached for 30s, as on the Projects screen.
const STALE_MS = 30_000;

/**
 * Flyout placement, shared with the chat "..." menus: clear the main panel (its 8px DS padding + 1px
 * border) and leave a 4px gap, and lift the flyout by the same 9px so its first row lines up with
 * the row that opened it, as in Claude. Base UI's defaults (0 and -3) started it inside the main
 * panel, overlapping it by 9px.
 */
export const FLYOUT = { sideOffset: 13, alignOffset: -9 } as const;

/** After a chat or project changes: the menu's Recent list, History and the Projects screens. */
export function refreshChatLists(queryClient: QueryClient) {
  // The left menu's Recent chats.
  void queryClient.invalidateQueries({ queryKey: ["cowork-nav"] });
  // History and the other preview-backed screens.
  void queryClient.invalidateQueries({ queryKey: [PREVIEW_QUERY_KEY] });
  // The Projects list and each project's chats.
  void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
}

// Narrows a connector's free-form icon to a DS icon name.
function isIconName(name: string): name is IconName {
  return Object.hasOwn(icons, name);
}

/** The project the next new chat starts in, chosen from the hero's Add to project. Not persisted. */
export type NewChatProject = { id: string; name: string };

type NewChatProjectState = {
  // The pick, or null for the hero's own workspace.
  project: NewChatProject | null;
  // Sets or clears the pick.
  choose: (project: NewChatProject | null) => void;
};

// One pick for the whole app: the hero composer sets it, the hero's send reads it.
export const useNewChatProjectStore = create<NewChatProjectState>((set) => ({
  project: null,
  choose: (project) => set({ project }),
}));

/** The project picked in the hero's Add to project, or null when there is none. */
export function selectedNewChatProject(): NewChatProject | null {
  // Read outside React: the send handler runs once, not on every render.
  return useNewChatProjectStore.getState().project;
}

/** Clears `projectId` after its task dispatch was accepted, without erasing a newer pick. */
export function clearNewChatProject(projectId: string): void {
  const { project, choose } = useNewChatProjectStore.getState();
  // A newer selection made during dispatch belongs to the next task and must survive.
  if (project?.id === projectId) choose(null);
}

/**
 * How a connector shows in the Connectors flyout. `switch`: connected or off, so the row turns it
 * on or off for the workspace. `open`: needs a sign-in or failed, so the row says so and opens the
 * Connectors page, where signing in lives. `disabled`: blocked by the team, or sample data.
 */
export function connectorMenuRow(connector: Pick<Connector, "state">, preview: boolean): "switch" | "open" | "disabled" {
  // Sample data and team-blocked connectors cannot change here.
  if (preview || connector.state === "blocked") return "disabled";
  // Only a settled state can be flipped in place; the rest need the page.
  return connector.state === "connected" || connector.state === "off" ? "switch" : "open";
}

export type ComposerAddMenuProps = {
  // Whether this composer can take files at all.
  attachmentsEnabled: boolean;
  /** Why files cannot be added here; shown on the disabled item. */
  attachmentsDisabledReason: string | null;
  /** Opens the file picker. */
  onAddFiles: () => void;
  /** Skills already in the composer's tray; they show as chosen. */
  attachedSkills: readonly string[];
  /** Puts a skill in the composer's tray. Never runs it. */
  onAttachSkill: (name: string) => void;
  /** The open chat, or null on the new-chat screen (where Add to project picks the chat's project). */
  chatId: string | null;
  /**
   * The composer's text box. A pointer close returns focus there, as Claude does, instead of to
   * the "+" (which would also pop its tooltip); a keyboard close goes back to the "+".
   */
  editor?: () => HTMLElement | null;
};

/**
 * The composer's Add menu, in place of the paperclip: Add files or photos, Add to project, Skills
 * and Connectors, the last three as flyouts. Built on the app's dropdown (Base UI, styled as the
 * DS menu) because the DS `Menu` has no submenus. Each flyout's data is read only when it opens,
 * through the same queries the Projects, Skills and Connectors screens use.
 */
export function ComposerAddMenu(props: ComposerAddMenuProps) {
  // The open chat's project, so Add to project can mark it and move from it.
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  // Files stay listed but disabled, with the reason, when this composer cannot take them.
  const filesDisabled = !props.attachmentsEnabled;
  return (
    <DropdownMenu>
      {/* The "+" with its name in a DS tooltip; the tooltip wraps the menu trigger. */}
      <Tooltip>
        <TooltipTrigger
          render={(
            <DropdownMenuTrigger
              render={(
                <button type="button" className="cowork-add-menu__trigger" aria-label={t("cowork.add_menu_label")}>
                  {icons.plus(ICON)}
                </button>
              )}
            />
          )}
        />
        <TooltipContent>{t("cowork.add_menu_label")}</TooltipContent>
      </Tooltip>
      {/* Opens above the "+", so it never runs off the bottom of a chat. */}
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="cowork-add-menu"
        // Keyboard close: back to the "+". Pointer close: back to the text box.
        finalFocus={(closeType) => (closeType === "keyboard" ? true : (props.editor?.() ?? true))}
      >
        {/* Add files or photos, with the reason under it when files are off. */}
        <DropdownMenuItem disabled={filesDisabled} onClick={props.onAddFiles}>
          {icons.attachment(ICON)}
          <span className="cowork-add-menu__text">
            {t("cowork.add_menu_files")}
            {filesDisabled && props.attachmentsDisabledReason ? (
              <span className="cowork-add-menu__hint">{props.attachmentsDisabledReason}</span>
            ) : null}
          </span>
        </DropdownMenuItem>
        {/* Add to project: move the open chat, or pick the new chat's project. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {icons.folder(ICON)}
            <span className="cowork-add-menu__text">{t("cowork.add_menu_project")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="cowork-add-menu cowork-add-menu--sub" {...FLYOUT}>
            <ProjectItems chat={props.chatId && workspaceId ? { id: props.chatId, workspaceId } : null} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {/* Skills: the person's installed skills, to attach. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {icons.sparkle(ICON)}
            <span className="cowork-add-menu__text">{t("cowork.nav_skills")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="cowork-add-menu cowork-add-menu--sub" {...FLYOUT}>
            <SkillItems attached={props.attachedSkills} onAttach={props.onAttachSkill} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* Connectors: switch each on or off for the workspace. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {icons.plug(ICON)}
            <span className="cowork-add-menu__text">{t("cowork.nav_connectors")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="cowork-add-menu cowork-add-menu--sub" {...FLYOUT}>
            <ConnectorItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A quiet row for loading and empty states: not a choice, so not focusable. */
function NoteItem(props: { children: ReactNode }) {
  // Disabled keeps it out of the roving focus; the class keeps it from reading as greyed out.
  return (
    <DropdownMenuItem disabled className="cowork-add-menu__note">
      {props.children}
    </DropdownMenuItem>
  );
}

/**
 * Add to project. In a chat, picking a project moves the chat there; on the new-chat screen it
 * marks the project the chat will start in (a chip in the composer, applied at send). New project
 * opens the project dialog: for a chat that is Save as a project, which moves it in.
 *
 * `chat` is the chat to move and the project it is in now (the chat "..." menus on Recent and
 * History pass any chat; the composer passes the open one); null on the new-chat screen.
 */
export function ProjectItems(props: { chat: { id: string; workspaceId: string } | null }) {
  // The server that lists projects and moves chats; null before it connects.
  const client = useCoworkConnection((state) => state.client);
  // New project opens the frame's project dialog.
  const openModal = useFrameStore((state) => state.openModal);
  // A move says how it went.
  const showToast = useFrameStore((state) => state.showToast);
  // A moved chat's memory goes to the project.
  const setMemory = useCoworkComposerStore((state) => state.setMemory);
  // On the new-chat screen, the current pick is shown as chosen.
  const picked = useNewChatProjectStore((state) => state.project);
  const choose = useNewChatProjectStore((state) => state.choose);
  // A move opens the chat in its new project.
  const navigate = useNavigate();
  // A move refreshes every list the chat appears in.
  const queryClient = useQueryClient();
  // The same list the Projects screen reads, so both share a cache entry.
  const projects = useQuery({
    queryKey: [PROJECTS_QUERY_KEY, client ? "live" : "preview", "list"],
    queryFn: () => loadProjectRows(client),
    staleTime: STALE_MS,
  });
  // Sample projects cannot hold a real chat, so only a live list is offered.
  const live = projects.data && !projects.data.preview ? projects.data.data : null;
  const chat = props.chat;
  // The project marked as chosen: the chat's own, else the new chat's pick.
  const currentId = chat ? chat.workspaceId : (picked?.id ?? null);
  const choices = live ? projectChoices(live, currentId) : [];

  // New-chat screen: remember the pick. In a chat: move it now.
  const pick = (project: { id: string; name: string }) => {
    if (!chat) {
      choose(project);
      return;
    }
    void moveChatToProject(
      { client, navigate, toast: showToast, setMemory },
      { chatId: chat.id, workspaceId: chat.workspaceId, project },
    ).then((moved) => {
      // A failed move already said so and changed nothing to refresh.
      if (moved) refreshChatLists(queryClient);
    });
  };

  return (
    <>
      {/* Loading, then empty, as quiet notes. */}
      {projects.isLoading ? <NoteItem>{t("cowork.add_menu_loading")}</NoteItem> : null}
      {!projects.isLoading && choices.length === 0 ? <NoteItem>{t("cowork.add_menu_no_projects")}</NoteItem> : null}
      {/* One row per project; the current one is checked and cannot be picked again. */}
      {choices.map((choice) => (
        <DropdownMenuItem key={choice.id} disabled={choice.current} onClick={() => pick(choice)}>
          {icons.folder(ICON)}
          <span className="cowork-add-menu__text">{choice.name}</span>
          {choice.current ? <span className="cowork-add-menu__end">{icons.check(ICON)}</span> : null}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      {/* New project; for a chat, the dialog moves it in once the project exists. */}
      <DropdownMenuItem onClick={() => openModal({ kind: "project", chatId: chat?.id ?? null, fromWorkspaceId: chat?.workspaceId })}>
        {icons.folderPlus(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.projects_new")}</span>
      </DropdownMenuItem>
    </>
  );
}

/** Skills: the person's installed skills (the Your skills shelf), then All skills. */
function SkillItems(props: { attached: readonly string[]; onAttach: (name: string) => void }) {
  // Catalogue rows joined with what is installed; null while loading.
  const { rows } = useMarketplaceRows();
  // Titles follow the app language.
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  // All skills opens the Skills page.
  const navigate = useNavigate();
  // Only installed skills can be attached; null keeps the loading note.
  const yours = useMemo(() => (rows ? rows.filter((row) => row.installed !== null) : null), [rows]);
  return (
    <>
      {/* Loading, then empty, as quiet notes. */}
      {yours === null ? <NoteItem>{t("cowork.add_menu_loading")}</NoteItem> : null}
      {yours?.length === 0 ? <NoteItem>{t("cowork.add_menu_no_skills")}</NoteItem> : null}
      {yours?.map((row) => {
        // An attached skill is checked and cannot be attached twice.
        const attached = props.attached.includes(row.name);
        return (
          <DropdownMenuItem key={row.name} disabled={attached} onClick={() => props.onAttach(row.name)}>
            <SkillIcon name={row.name} size="mini" />
            <span className="cowork-add-menu__text">{skillDisplayTitle(row, locale)}</span>
            {attached ? <span className="cowork-add-menu__end">{icons.check(ICON)}</span> : null}
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuSeparator />
      {/* All skills: the catalogue, for anything not installed yet. */}
      <DropdownMenuItem onClick={() => navigate("/skills")}>
        {icons.grid(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.composer_picks_all")}</span>
      </DropdownMenuItem>
    </>
  );
}

/**
 * Connectors: each with a switch that turns it on or off for the whole workspace (the same switch
 * as the Connectors page), then Manage connectors. One that needs a sign-in or has failed says so
 * and opens the Connectors page, where signing in lives; one the team blocked cannot be chosen.
 */
function ConnectorItems() {
  // The connection pieces the Connectors page builds its services from.
  const client = useCoworkConnection((state) => state.client);
  const opencode = useCoworkConnection((state) => state.opencode);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const workspaceRoot = useCoworkConnection((state) => state.workspaceRoot);
  // Developer-only connectors stay hidden unless developer mode is on, as on the page.
  const developerMode = useFrameStore((state) => state.developerMode);
  // A switch that fails says so.
  const showToast = useFrameStore((state) => state.showToast);
  // Sign-in and Manage connectors open the Connectors page.
  const navigate = useNavigate();
  // A switch refreshes the connectors query.
  const queryClient = useQueryClient();
  // Rebuilt only when the connection changes.
  const services = useMemo(
    () => createCoworkServices({ client, workspaceId, mcpStatus: mcpStatusReader(opencode, workspaceRoot) }),
    [client, opencode, workspaceId, workspaceRoot],
  );
  // The same cache key the Connectors page uses, so both agree.
  const scope = workspaceId ?? "preview";
  const list = useQuery({ queryKey: [CONNECTORS_QUERY_KEY, scope], queryFn: () => services.connectors.list() });
  // Connectors switching right now; their row is disabled until the switch settles.
  const switching = usePending();
  // What setConnectorEnabled needs, the same as on the page.
  const deps: ConnectorActionDeps = {
    client,
    workspaceId,
    openLink: openExternal,
    openSignIn: () => navigate("/connectors"),
    refresh: () => invalidateConnectors(queryClient, scope),
    showToast,
  };
  const result = list.data;
  // The rows the page would show; null while loading.
  const shown = result ? visibleConnectors(result.data, developerMode) : null;

  return (
    <>
      {/* Loading, then empty, as quiet notes. */}
      {list.isLoading ? <NoteItem>{t("cowork.add_menu_loading")}</NoteItem> : null}
      {shown?.length === 0 ? <NoteItem>{t("cowork.add_menu_no_connectors")}</NoteItem> : null}
      {shown?.map((connector) => {
        // The connector's own DS glyph, or a plug for one the DS does not know.
        const icon = icons[isIconName(connector.icon) ? connector.icon : "plug"](ICON);
        const row = connectorMenuRow(connector, Boolean(result?.preview));
        if (row === "switch") {
          const on = connector.state === "connected";
          // The row itself is the checkbox, so the switch inside is drawing only.
          return (
            <MenuPrimitive.CheckboxItem
              key={connector.id}
              className={menuItemClassName}
              checked={on}
              disabled={switching.has(connector.id)}
              onCheckedChange={(checked) => switching.run(connector.id, () => setConnectorEnabled(deps, connector, checked))}
            >
              {icon}
              <span className="cowork-add-menu__text">{connector.name}</span>
              <span className="cowork-add-menu__switch" data-on={on || undefined} aria-hidden="true">
                <span className="cowork-add-menu__thumb" />
              </span>
            </MenuPrimitive.CheckboxItem>
          );
        }
        // Needs a sign-in, failed or blocked: the state under the name, and the page on press.
        return (
          <DropdownMenuItem
            key={connector.id}
            disabled={row === "disabled"}
            onClick={() => navigate("/connectors")}
          >
            {icon}
            <span className="cowork-add-menu__text">
              {connector.name}
              <span className="cowork-add-menu__hint">{connectorStateLabel(connector.state)}</span>
            </span>
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuSeparator />
      {/* Manage connectors: the full page. */}
      <DropdownMenuItem onClick={() => navigate("/connectors")}>
        {icons.settings(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.add_menu_manage_connectors")}</span>
      </DropdownMenuItem>
    </>
  );
}

/** The new chat's project, picked in Add to project: a chip above the text, removable. */
export function ComposerProjectChip() {
  // The pick, and the way to clear it.
  const project = useNewChatProjectStore((state) => state.project);
  const choose = useNewChatProjectStore((state) => state.choose);
  // No pick, no chip.
  if (!project) return null;
  return (
    <div className="cowork-project-chip">
      {/* The project's name; focusable so keyboard users get the tooltip too. */}
      <Tooltip>
        <TooltipTrigger
          render={(
            <span className="cowork-project-chip__label" tabIndex={0}>
              {icons.folder({ width: 14, height: 14, "aria-hidden": true })}
              <span className="cowork-project-chip__name">{project.name}</span>
            </span>
          )}
        />
        <TooltipContent>{t("cowork.composer_project_chip", { name: project.name })}</TooltipContent>
      </Tooltip>
      {/* × clears the pick, so the chat starts on the hero's own workspace. */}
      <Tooltip>
        <TooltipTrigger
          render={(
            <button
              type="button"
              className="cowork-project-chip__remove"
              aria-label={t("cowork.composer_project_remove", { name: project.name })}
              onClick={() => choose(null)}
            >
              <X width={12} height={12} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
        />
        <TooltipContent>{t("cowork.composer_project_remove", { name: project.name })}</TooltipContent>
      </Tooltip>
    </div>
  );
}
