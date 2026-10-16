/** @jsxImportSource react */
// The single writer of the Cowork connection. Mounted once beside <Routes>
// inside WorkspaceConnectionProvider, so /skills, /scheduled and /history get
// the live connection on a cold landing instead of the sample fixtures.
import { useEffect, useMemo } from "react";

import { createClient } from "@/app/lib/opencode";
import {
  deriveCoworkConnection,
  publishCoworkConnection,
  revisionMatches,
  useCoworkChatsRevision,
} from "@/react-app/cowork/shell/cowork-connection";

import { useWorkspaceConnection } from "./workspace-connection-provider";

/** Publishes all five Cowork connection fields from the app-wide workspace connection. */
export function CoworkConnectionPublisher() {
  const { selectedWorkspace, selectedWorkspaceEndpoint } = useWorkspaceConnection();
  const revision = useCoworkChatsRevision();
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
    publishCoworkConnection(
      deriveCoworkConnection({
        workspace: selectedWorkspace,
        endpoint: selectedWorkspaceEndpoint,
        opencode,
        revision,
      }),
    );
  }, [opencode, revision, selectedWorkspace, selectedWorkspaceEndpoint]);

  return null;
}
