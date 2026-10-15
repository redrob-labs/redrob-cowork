/** @jsxImportSource react */
// The single writer of the Desk connection. Mounted once beside <Routes>
// inside WorkspaceConnectionProvider, so /skills, /scheduled and /history get
// the live connection on a cold landing instead of the sample fixtures.
import { useEffect, useMemo } from "react";

import { createClient } from "@/app/lib/opencode";
import {
  deriveDeskConnection,
  publishDeskConnection,
  revisionMatches,
  useDeskChatsRevision,
} from "@/react-app/desk/shell/desk-connection";

import { useWorkspaceConnection } from "./workspace-connection-provider";

/** Publishes all five Desk connection fields from the app-wide workspace connection. */
export function DeskConnectionPublisher() {
  const { selectedWorkspace, selectedWorkspaceEndpoint } = useWorkspaceConnection();
  const revision = useDeskChatsRevision();
  const workspaceRoot = selectedWorkspace?.path?.trim() || "";
  // The chat route withholds the engine client while the workspace has a load
  // error; honour that only when its revision is about this workspace.
  const engineWithheld = revisionMatches(revision, selectedWorkspace?.id) && revision.workspaceError;
  const opencodeBaseUrl = selectedWorkspaceEndpoint?.opencodeBaseUrl ?? "";
  const serverToken = selectedWorkspaceEndpoint?.token ?? "";
  // Built with the same arguments the chat route uses for its engine client.
  const opencode = useMemo(
    () =>
      opencodeBaseUrl && serverToken && !engineWithheld
        ? createClient(opencodeBaseUrl, workspaceRoot || undefined, { token: serverToken, mode: "redrob" })
        : null,
    [engineWithheld, opencodeBaseUrl, serverToken, workspaceRoot],
  );

  useEffect(() => {
    publishDeskConnection(
      deriveDeskConnection({
        workspace: selectedWorkspace,
        endpoint: selectedWorkspaceEndpoint,
        opencode,
        revision,
      }),
    );
  }, [opencode, revision, selectedWorkspace, selectedWorkspaceEndpoint]);

  return null;
}
