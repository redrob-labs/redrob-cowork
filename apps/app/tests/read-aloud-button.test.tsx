/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { MessageList } from "../src/components/chat/message-list";
import { MessageListProvider } from "../src/components/chat/message-list-provider";
import { createRedrobServerClient } from "../src/app/lib/redrob-server";
import { WorkspaceProvider } from "../src/react-app/shell/workspace-provider";
import en from "../src/i18n/locales/en";

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
      onRevertToUserMessage={() => {}}
      onForkAtMessage={() => {}}
      onEditUserMessage={() => {}}
    >
      <MessageList messages={messages} status="ready" />
    </MessageListProvider>
  );
}

describe("read aloud button", () => {
  test("a finished reply offers read aloud when there is a server to speak it", () => {
    const client = createRedrobServerClient({ baseUrl: "http://127.0.0.1:8787", token: "t" });
    const markup = renderToStaticMarkup(
      <WorkspaceProvider client={null} redrobServerClient={client} workspaceId="ws" selectedWorkspaceRoot="/ws">
        {list()}
      </WorkspaceProvider>,
    );
    expect(markup).toContain(`aria-label="${en["message.read_aloud"]}"`);
  });

  test("without a server there is no button to press", () => {
    expect(renderToStaticMarkup(list())).not.toContain(en["message.read_aloud"]);
  });
});
