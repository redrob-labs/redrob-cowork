import * as React from "react";

import type { RedrobServerClient } from "@/app/lib/redrob-server";
import type { Client } from "@/app/types";

type WorkspaceContextValue = {
  client: Client | null;
  opencodeBaseUrl: string;
  redrobServerClient: RedrobServerClient | null;
  workspaceId: string;
  selectedWorkspaceRoot: string;
};

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

type WorkspaceProviderProps = {
  client: Client | null;
  opencodeBaseUrl?: string;
  redrobServerClient?: RedrobServerClient | null;
  workspaceId?: string;
  selectedWorkspaceRoot: string;
  children: React.ReactNode;
};

export function WorkspaceProvider({
  client,
  opencodeBaseUrl = "",
  redrobServerClient = null,
  workspaceId = "",
  selectedWorkspaceRoot,
  children,
}: WorkspaceProviderProps) {
  const value = React.useMemo(
    () => ({ client, opencodeBaseUrl, redrobServerClient, workspaceId, selectedWorkspaceRoot }),
    [client, opencodeBaseUrl, redrobServerClient, workspaceId, selectedWorkspaceRoot],
  );

  return React.createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace() {
  const context = React.use(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }

  return context;
}
