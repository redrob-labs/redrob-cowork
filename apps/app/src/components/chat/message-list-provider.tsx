"use memo";

import { useSessionActivityStore } from "@/react-app/domains/session/status/session-activity-store"
import * as React from "react"

interface MessageListContextValue {
  workspaceId: string
  sessionId: string
  showThinking: boolean
  highlightQuery?: string
  developerMode: boolean
  displaySuggestions: boolean
  providerConnectedCount: number
  dispatchAction: (action: DispatchAction) => void
  setPrompt: (prompt: string) => void
  /**
   * Asking another model to answer the same turn.
   *
   * Optional throughout: a surface that has not wired the variant run simply does not render the control,
   * rather than the message list needing to know which surface it is inside.
   */
  variantModels?: readonly { providerID: string; modelID: string }[]
  onAnotherAnswer?: (model: { providerID: string; modelID: string }, kind: "compare" | "paraphrase") => void
  variantBusy?: boolean
  variantCurrentModel?: { providerID: string; modelID: string } | null
  onRevertToUserMessage: (messageId: string) => void
  onForkAtMessage: (messageId: string) => void
  onEditUserMessage: (messageId: string, text: string) => void
  /** Re-run a turn: rewind to its user message and send that same text again. */
  onRetryMessage: (messageId: string) => void
}

const MessageListContext = React.createContext<MessageListContextValue | null>(null)

interface MessageListProviderProps {
  children: React.ReactNode
  workspaceId: string
  sessionId: string
  showThinking: boolean
  highlightQuery?: string
  developerMode: boolean
  onRevertToUserMessage: (messageId: string) => void
  onForkAtMessage: (messageId: string) => void
  onEditUserMessage: (messageId: string, text: string) => void
  /** Re-run a turn: rewind to its user message and send that same text again. */
  onRetryMessage: (messageId: string) => void
  displaySuggestions: boolean
  providerConnectedCount: number
  dispatchAction: (action: DispatchAction) => void
  setPrompt: (prompt: string) => void
  /**
   * Asking another model to answer the same turn.
   *
   * Optional throughout: a surface that has not wired the variant run simply does not render the control,
   * rather than the message list needing to know which surface it is inside.
   */
  variantModels?: readonly { providerID: string; modelID: string }[]
  onAnotherAnswer?: (model: { providerID: string; modelID: string }, kind: "compare" | "paraphrase") => void
  variantBusy?: boolean
  variantCurrentModel?: { providerID: string; modelID: string } | null
}

export interface DispatchAction {
  target: "settings"
  action: "open"
  section: "commands" | "skills" | "mcps" | "plugins" | "providers"
}

export function MessageListProvider({
  children,
  workspaceId,
  sessionId,
  showThinking,
  highlightQuery,
  developerMode,
  displaySuggestions,
  providerConnectedCount,
  dispatchAction,
  setPrompt,
  variantModels,
  onAnotherAnswer,
  variantBusy,
  variantCurrentModel,
  onRevertToUserMessage,
  onForkAtMessage,
  onEditUserMessage,
  onRetryMessage,
}: MessageListProviderProps) {
  const value = React.useMemo(
    () => ({
      workspaceId,
      sessionId,
      showThinking,
      highlightQuery,
      developerMode,
      displaySuggestions,
      providerConnectedCount,
      dispatchAction,
      setPrompt,
      variantModels,
      onAnotherAnswer,
      variantBusy,
      variantCurrentModel,
      onRevertToUserMessage,
      onForkAtMessage,
      onEditUserMessage,
      onRetryMessage,
    }),
    [
      workspaceId,
      sessionId,
      showThinking,
      highlightQuery,
      developerMode,
      displaySuggestions,
      providerConnectedCount,
      dispatchAction,
      setPrompt,
      onRevertToUserMessage,
      onForkAtMessage,
      onEditUserMessage,
      onRetryMessage,
    ],
  )

  return (
    <MessageListContext.Provider value={value}>
      {children}
    </MessageListContext.Provider>
  )
}

export function useMessageList() {
  const context = React.useContext(MessageListContext)

  if (!context) {
    throw new Error("useMessageList must be used within a MessageListProvider")
  }

  return context
}

export function useSessionErrorMessage() {
  const { workspaceId, sessionId } = useMessageList();

  return useSessionActivityStore(state => state.getSessionError(workspaceId, sessionId));
}
