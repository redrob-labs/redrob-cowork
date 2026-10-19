/** @jsxImportSource react */
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useFrameStore } from "../store/frame-store";
import { useCoworkComposerStore } from "./composer-state";

const ICON = { width: 16, height: 16, "aria-hidden": true };
const STALE_MS = 30_000;

function isIconName(name: string): name is IconName {
  return Object.hasOwn(icons, name);
}

/** The project the next new chat starts in, chosen from the hero's Add to project. Not persisted. */
export type NewChatProject = { id: string; name: string };

type NewChatProjectState = {
  project: NewChatProject | null;
  choose: (project: NewChatProject | null) => void;
};

export const useNewChatProjectStore = create<NewChatProjectState>((set) => ({
  project: null,
  choose: (project) => set({ project }),
}));

/**
 * Where the hero's send creates the chat: the project picked in Add to project, else the
 * workspace the hero is on. Reading it clears the pick, so the next new chat starts fresh.
 */
export function takeNewChatWorkspace(fallback: string): string {
  const picked = useNewChatProjectStore.getState().project;
  if (picked) useNewChatProjectStore.getState().choose(null);
  return picked?.id ?? fallback;
}

/**
 * How a connector shows in the Connectors flyout. `switch`: connected or off, so the row turns it
 * on or off for the workspace. `open`: needs a sign-in or failed, so the row says so and opens the
 * Connectors page, where signing in lives. `disabled`: blocked by the team, or sample data.
 */
export function connectorMenuRow(connector: Pick<Connector, "state">, preview: boolean): "switch" | "open" | "disabled" {
  if (preview || connector.state === "blocked") return "disabled";
  return connector.state === "connected" || connector.state === "off" ? "switch" : "open";
}

export type ComposerAddMenuProps = {
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
 * DS menu) because the DS `Menu` has no submenus; every glyph is a DS icon. Each flyout's data is
 * read only when it opens, through the same queries the Projects, Skills and Connectors screens use.
 */
export function ComposerAddMenu(props: ComposerAddMenuProps) {
  const filesDisabled = !props.attachmentsEnabled;
  return (
    <DropdownMenu>
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
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="cowork-add-menu"
        finalFocus={(closeType) => (closeType === "keyboard" ? true : (props.editor?.() ?? true))}
      >
        <DropdownMenuItem disabled={filesDisabled} onClick={props.onAddFiles}>
          {icons.attachment(ICON)}
          <span className="cowork-add-menu__text">
            {t("cowork.add_menu_files")}
            {filesDisabled && props.attachmentsDisabledReason ? (
              <span className="cowork-add-menu__hint">{props.attachmentsDisabledReason}</span>
            ) : null}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {icons.folder(ICON)}
            <span className="cowork-add-menu__text">{t("cowork.add_menu_project")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="cowork-add-menu cowork-add-menu--sub">
            <ProjectItems chatId={props.chatId} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {icons.sparkle(ICON)}
            <span className="cowork-add-menu__text">{t("cowork.nav_skills")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="cowork-add-menu cowork-add-menu--sub">
            <SkillItems attached={props.attachedSkills} onAttach={props.onAttachSkill} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {icons.plug(ICON)}
            <span className="cowork-add-menu__text">{t("cowork.nav_connectors")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="cowork-add-menu cowork-add-menu--sub">
            <ConnectorItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A quiet row for loading and empty states: not a choice, so not focusable. */
function NoteItem(props: { children: ReactNode }) {
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
 */
function ProjectItems(props: { chatId: string | null }) {
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const openModal = useFrameStore((state) => state.openModal);
  const showToast = useFrameStore((state) => state.showToast);
  const setMemory = useCoworkComposerStore((state) => state.setMemory);
  const picked = useNewChatProjectStore((state) => state.project);
  const choose = useNewChatProjectStore((state) => state.choose);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({
    queryKey: [PROJECTS_QUERY_KEY, client ? "live" : "preview", "list"],
    queryFn: () => loadProjectRows(client),
    staleTime: STALE_MS,
  });
  // Sample projects cannot hold a real chat, so only a live list is offered.
  const live = projects.data && !projects.data.preview ? projects.data.data : null;
  const currentId = props.chatId ? workspaceId : (picked?.id ?? null);
  const choices = live ? projectChoices(live, currentId) : [];

  const pick = (project: { id: string; name: string }) => {
    if (!props.chatId) {
      choose(project);
      return;
    }
    if (!workspaceId) return;
    void moveChatToProject(
      { client, navigate, toast: showToast, setMemory },
      { chatId: props.chatId, workspaceId, project },
    ).then((moved) => {
      if (!moved) return;
      void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["cowork-nav"] });
    });
  };

  return (
    <>
      {projects.isLoading ? <NoteItem>{t("cowork.add_menu_loading")}</NoteItem> : null}
      {!projects.isLoading && choices.length === 0 ? <NoteItem>{t("cowork.add_menu_no_projects")}</NoteItem> : null}
      {choices.map((choice) => (
        <DropdownMenuItem key={choice.id} disabled={choice.current} onClick={() => pick(choice)}>
          {icons.folder(ICON)}
          <span className="cowork-add-menu__text">{choice.name}</span>
          {choice.current ? <span className="cowork-add-menu__end">{icons.check(ICON)}</span> : null}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => openModal({ kind: "project", chatId: props.chatId })}>
        {icons.folderPlus(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.projects_new")}</span>
      </DropdownMenuItem>
    </>
  );
}

/** Skills: the person's installed skills (the Your skills shelf), then All skills. */
function SkillItems(props: { attached: readonly string[]; onAttach: (name: string) => void }) {
  const { rows } = useMarketplaceRows();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const navigate = useNavigate();
  const yours = useMemo(() => (rows ? rows.filter((row) => row.installed !== null) : null), [rows]);
  return (
    <>
      {yours === null ? <NoteItem>{t("cowork.add_menu_loading")}</NoteItem> : null}
      {yours?.length === 0 ? <NoteItem>{t("cowork.add_menu_no_skills")}</NoteItem> : null}
      {yours?.map((row) => {
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
  const client = useCoworkConnection((state) => state.client);
  const opencode = useCoworkConnection((state) => state.opencode);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const workspaceRoot = useCoworkConnection((state) => state.workspaceRoot);
  const developerMode = useFrameStore((state) => state.developerMode);
  const showToast = useFrameStore((state) => state.showToast);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const services = useMemo(
    () => createCoworkServices({ client, workspaceId, mcpStatus: mcpStatusReader(opencode, workspaceRoot) }),
    [client, opencode, workspaceId, workspaceRoot],
  );
  const scope = workspaceId ?? "preview";
  const list = useQuery({ queryKey: [CONNECTORS_QUERY_KEY, scope], queryFn: () => services.connectors.list() });
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const deps: ConnectorActionDeps = {
    client,
    workspaceId,
    openLink: openExternal,
    openSignIn: () => navigate("/connectors"),
    refresh: () => invalidateConnectors(queryClient, scope),
    showToast,
  };
  const result = list.data;
  const shown = result ? visibleConnectors(result.data, developerMode) : null;
  const toggle = (connector: Connector, on: boolean) => {
    if (pending.has(connector.id)) return;
    setPending((current) => new Set(current).add(connector.id));
    void setConnectorEnabled(deps, connector, on).finally(() =>
      setPending((current) => {
        const next = new Set(current);
        next.delete(connector.id);
        return next;
      }),
    );
  };

  return (
    <>
      {list.isLoading ? <NoteItem>{t("cowork.add_menu_loading")}</NoteItem> : null}
      {shown?.length === 0 ? <NoteItem>{t("cowork.add_menu_no_connectors")}</NoteItem> : null}
      {shown?.map((connector) => {
        const icon = icons[isIconName(connector.icon) ? connector.icon : "plug"](ICON);
        const row = connectorMenuRow(connector, Boolean(result?.preview));
        if (row === "switch") {
          const on = connector.state === "connected";
          return (
            <MenuPrimitive.CheckboxItem
              key={connector.id}
              className={menuItemClassName}
              checked={on}
              disabled={pending.has(connector.id)}
              onCheckedChange={(checked) => toggle(connector, checked)}
            >
              {icon}
              <span className="cowork-add-menu__text">{connector.name}</span>
              <span className="cowork-add-menu__switch" data-on={on || undefined} aria-hidden="true">
                <span className="cowork-add-menu__thumb" />
              </span>
            </MenuPrimitive.CheckboxItem>
          );
        }
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
      <DropdownMenuItem onClick={() => navigate("/connectors")}>
        {icons.settings(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.add_menu_manage_connectors")}</span>
      </DropdownMenuItem>
    </>
  );
}

/** The new chat's project, picked in Add to project: a chip above the text, removable. */
export function ComposerProjectChip() {
  const project = useNewChatProjectStore((state) => state.project);
  const choose = useNewChatProjectStore((state) => state.choose);
  if (!project) return null;
  return (
    <div className="cowork-project-chip">
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
