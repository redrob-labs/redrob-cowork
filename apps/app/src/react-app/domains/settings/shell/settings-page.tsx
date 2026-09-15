/** @jsxImportSource react */
import { useState } from "react";
import type * as React from "react";
import { ArrowLeft, ChevronDown, Cog, Search } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "../../../../i18n";
import type { PlatformCapabilities } from "../../../../app/lib/platform-capabilities";
import type { SettingsTab } from "../../../../app/types";
import { cn } from "@/lib/utils";
import { usePlatform } from "../../../kernel/platform";
import {
  SettingsContent,
  SettingsPanel,
  SettingsPanelDescription,
  SettingsPanelHeading,
  SettingsPanelTitle,
  SettingsPanelToolbar,
  SettingsPanelToolbarActions,
  SettingsPanelToolbarButton,
  SettingsPanelToolbarMessage,
  SettingsPanelToolbarStatus,
} from "./panel";
import { useFeatureFlagsPreferences } from "../state/feature-flags-preferences";
import { SidebarDestination } from "../../session/sidebar/sidebar-destination";
import {
  getGlobalSettingsTabs,
  getSettingsTabDescription,
  getSettingsTabIcon,
  getSettingsTabLabel,
  getWorkspaceSettingsTabs,
  isSettingsTabActive,
  isSettingsTabBeta,
} from "./settings-tabs";
import { filterSettingsTabs, matchesSettingsTab } from "./settings-search";

export {
  getSettingsTabDescription,
  getSettingsTabIcon,
  getSettingsTabLabel,
  getGlobalSettingsTabs,
  getWorkspaceSettingsTabs,
  isSettingsTabActive,
  isSettingsTabBeta,
} from "./settings-tabs";

export function SettingsBetaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-warning-muted/40 bg-warning-soft/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-warning-ink",
        className,
      )}
    >
      {t("common.beta")}
    </span>
  );
}

function SettingsSidebarTabLabel({ tab }: { tab: SettingsTab }) {
  return (
    <>
      <span>{getSettingsTabLabel(tab)}</span>
      {isSettingsTabBeta(tab) ? <SettingsBetaBadge className="ml-auto" /> : null}
    </>
  );
}

/**
 * Both settings nav surfaces (sidebar + compact section menu) share the tab
 * groups above so they can't drift.
 */
type SettingsPageProps = {
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  developerMode: boolean;
  showUpdateToolbar?: boolean;
  updateToolbarTone?: string;
  updateToolbarTitle?: string;
  updateToolbarSpinning?: boolean;
  updateToolbarLabel?: string;
  updateToolbarActionLabel?: string | null;
  updateToolbarDisabled?: boolean;
  updateRestartBlockedMessage?: string | null;
  onUpdateToolbarAction?: () => void;
  children: React.ReactNode;
};

type SettingsSidebarProps = Pick<SettingsPageProps, "activeTab" | "onSelectTab" | "developerMode"> & {
  onClose: () => void;
  selectedWorkspaceId: string;
  selectedWorkspaceName: string;
  selectedWorkspaceColor: string;
  workspaces: Array<{ id: string; name: string; color: string }>;
  onSelectWorkspace: (workspaceId: string) => void;
};

export function SettingsSidebar(props: SettingsSidebarProps) {
  const platform = usePlatform();
  const { memoryEnabled } = useFeatureFlagsPreferences();
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const workspaceTabs = filterSettingsTabs(getWorkspaceSettingsTabs(), query);
  const globalTabs = filterSettingsTabs(
    getGlobalSettingsTabs(props.developerMode, platform.capabilities, memoryEnabled),
    query,
  );
  const showGeneral = matchesSettingsTab("general", query);
  const noMatches = !showGeneral && workspaceTabs.length === 0 && globalTabs.length === 0;

  return (
    <Sidebar collapsible="icon" className="mac:**:data-[sidebar=sidebar]:bg-transparent">
      <div className="hidden h-10 mac:block mac:titlebar-drag" />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={props.onClose}>
              <ArrowLeft size={14} />
              <span>{t("dashboard.back_to_app")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton type="button">
                    <span className="truncate">{props.selectedWorkspaceName}</span>
                    <ChevronDown className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent className="w-(--anchor-width)">
                {props.workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={() => props.onSelectWorkspace(workspace.id)}
                    disabled={workspace.id === props.selectedWorkspaceId}
                  >
                    <span className="truncate">{workspace.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Hidden when the rail is collapsed to icons: a text field has nothing
            to show at icon width. */}
        <div className="relative px-1 pt-1 group-data-[collapsible=icon]:hidden">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t("settings.search_settings")}
            aria-label={t("settings.search_settings")}
            className="h-7 w-full rounded-md border border-sidebar-border bg-sidebar-accent/40 pl-7 pr-2 text-xs text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Top-level hub entry */}
        {showGeneral ? (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  isActive={isSettingsTabActive(props.activeTab, "general")}
                  aria-current={isSettingsTabActive(props.activeTab, "general") ? "page" : undefined}
                  tooltip={getSettingsTabLabel("general")}
                  onClick={() => props.onSelectTab("general")}
                >
                  <Cog />
                  <span>{getSettingsTabLabel("general")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}

        {workspaceTabs.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>{t("settings.group_workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceTabs.map((tab) => {
                const Icon = getSettingsTabIcon(tab);
                return (
                  <SidebarDestination
                    key={tab}
                    active={isSettingsTabActive(props.activeTab, tab)}
                    icon={Icon}
                    label={getSettingsTabLabel(tab)}
                    labelContent={<SettingsSidebarTabLabel tab={tab} />}
                    onSelect={() => props.onSelectTab(tab)}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}

        {globalTabs.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>{t("settings.group_global")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {globalTabs.map((tab) => {
                const Icon = getSettingsTabIcon(tab);
                return (
                  <SidebarDestination
                    key={tab}
                    active={isSettingsTabActive(props.activeTab, tab)}
                    icon={Icon}
                    label={getSettingsTabLabel(tab)}
                    labelContent={<SettingsSidebarTabLabel tab={tab} />}
                    onSelect={() => props.onSelectTab(tab)}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}

        {searching && noMatches ? (
          <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {t("settings.search_no_results")}
          </div>
        ) : null}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function SettingsPageHeading({ activeTab }: Pick<SettingsPageProps, "activeTab">) {
  return (
    <SettingsPanelHeading>
      <SettingsPanelTitle>{getSettingsTabLabel(activeTab)}</SettingsPanelTitle>
      <SettingsPanelDescription>{getSettingsTabDescription(activeTab)}</SettingsPanelDescription>
    </SettingsPanelHeading>
  );
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <SettingsContent>
      <SettingsPanel>
        <SettingsPageHeading activeTab={props.activeTab} />

        {props.showUpdateToolbar && props.activeTab === "general" ? (
          <SettingsPanelToolbar>
            <SettingsPanelToolbarActions>
              <SettingsPanelToolbarStatus
                tone={props.updateToolbarTone}
                title={props.updateToolbarTitle}
                spinning={props.updateToolbarSpinning}
              >
                {props.updateToolbarLabel}
              </SettingsPanelToolbarStatus>
              {props.updateToolbarActionLabel ? (
                <SettingsPanelToolbarButton
                  onClick={props.onUpdateToolbarAction}
                  disabled={props.updateToolbarDisabled}
                  title={props.updateRestartBlockedMessage ?? ""}
                >
                  {props.updateToolbarActionLabel}
                </SettingsPanelToolbarButton>
              ) : null}
            </SettingsPanelToolbarActions>
            {props.updateRestartBlockedMessage ? (
              <SettingsPanelToolbarMessage>{props.updateRestartBlockedMessage}</SettingsPanelToolbarMessage>
            ) : null}
          </SettingsPanelToolbar>
        ) : null}
      </SettingsPanel>

      {props.children}
    </SettingsContent>
  );
}
