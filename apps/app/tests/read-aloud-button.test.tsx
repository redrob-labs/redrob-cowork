/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { MessageList } from "../src/components/chat/message-list";
import { MessageListProvider } from "../src/components/chat/message-list-provider";
import { voiceAccessKey, type VoiceAccess } from "../src/react-app/domains/session/voice/read-aloud";
import { createRedrobServerClient } from "../src/app/lib/redrob-server";
import { WorkspaceProvider } from "../src/react-app/shell/workspace-provider";
import en from "../src/i18n/locales/en";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const messages: UIMessage[] = [
  { id: "user-1", role: "user", parts: [{ type: "text", text: "Summarise", state: "done" }] },
  { id: "assistant-1", role: "assistant", parts: [{ type: "text", text: "Revenue is up.", state: "done" }] },
];

function list() {
  return (
    <MessageListProvider
      workspaceId="ws"
      sessionId="session"
      showThinking={true}
      developerMode={false}
      displaySuggestions={false}
      providerConnectedCount={1}
      dispatchAction={() => {}}
      setPrompt={() => {}}
      onRetryMessage={() => {}}
      onRevertToUserMessage={() => {}}
      onForkAtMessage={() => {}}
      onEditUserMessage={() => {}}
    >
      <MessageList messages={messages} status="ready" />
    </MessageListProvider>
  );
}

/** The list inside a workspace whose voice check has already answered `access`. */
function inWorkspace(access: VoiceAccess | undefined) {
  const queries = new QueryClient();
  if (access !== undefined) queries.setQueryData(voiceAccessKey("ws"), access);
  const client = createRedrobServerClient({ baseUrl: "http://127.0.0.1:8787", token: "t" });
  return renderToStaticMarkup(
    <QueryClientProvider client={queries}>
      <WorkspaceProvider client={null} redrobServerClient={client} workspaceId="ws" selectedWorkspaceRoot="/ws">
        {list()}
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
}

describe("read aloud button", () => {
  test("a finished reply offers read aloud when the workspace's privacy level allows voice", () => {
    expect(inWorkspace("on")).toContain(`aria-label="${en["message.read_aloud"]}"`);
  });

  test("it is not offered to a collaborator, at High or Strict privacy, nor before the answer is known", () => {
    expect(inWorkspace("not_owner")).not.toContain(en["message.read_aloud"]);
    expect(inWorkspace("privacy")).not.toContain(en["message.read_aloud"]);
    expect(inWorkspace(undefined)).not.toContain(en["message.read_aloud"]);
  });

  test("without a server there is no button to press", () => {
    expect(renderToStaticMarkup(list())).not.toContain(en["message.read_aloud"]);
  });
});
