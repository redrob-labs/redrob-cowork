/** @jsxImportSource react */
import type { ReactNode } from "react";
import { Navigate, Route, useParams } from "react-router";

import { ProjectScreen, ProjectsScreen } from "../projects/desk-projects";
import { DeskPlaceholder, type DeskPlaceholderScreen } from "./desk-placeholder";

/** `/chat` or `/chat/<id>`. */
export function chatPath(sessionId?: string | null): string {
  const id = sessionId?.trim();
  return id ? `/chat/${encodeURIComponent(id)}` : "/chat";
}

/** `/session[/:id]`, `/` and any unknown path land on the chat. */
export function RedirectToChat() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  return <Navigate to={chatPath(sessionId)} replace />;
}

const PLACEHOLDER_ROUTES: ReadonlyArray<{ path: string; screen: DeskPlaceholderScreen }> = [
  { path: "/playbooks", screen: "playbooks" },
  { path: "/playbook/:playbookId", screen: "playbook" },
  { path: "/run", screen: "run" },
  { path: "/scheduled", screen: "scheduled" },
  { path: "/history", screen: "history" },
  { path: "/guide", screen: "guide" },
  { path: "/connectors", screen: "connectors" },
  { path: "/privacy", screen: "privacy" },
  { path: "/memory", screen: "memory" },
  { path: "/memory/:scope", screen: "memory" },
];

/**
 * The Desk routes, as `<Route>` elements for the app's `<Routes>`.
 *
 * `chat` renders on `/chat[/:sessionId]` and on the workspace session routes. Those stay
 * routed rather than redirected: the session route keeps the open workspace in the URL and
 * rewrites `/chat/<id>` to `/workspace/<workspace>/session/<id>` itself, so a redirect back
 * would loop. One element for all four keeps the chat mounted while the URL settles.
 */
export function deskRoutes(chat: ReactNode) {
  return [
    <Route key="chat" path="/chat" element={chat} />,
    <Route key="chat-session" path="/chat/:sessionId" element={chat} />,
    <Route key="workspace-session" path="/workspace/:workspaceId/session" element={chat} />,
    <Route key="workspace-session-id" path="/workspace/:workspaceId/session/:sessionId" element={chat} />,
    <Route key="session" path="/session" element={<RedirectToChat />} />,
    <Route key="session-id" path="/session/:sessionId" element={<RedirectToChat />} />,
    <Route key="projects" path="/projects" element={<ProjectsScreen />} />,
    <Route key="project" path="/project/:projectId" element={<ProjectScreen />} />,
    ...PLACEHOLDER_ROUTES.map(({ path, screen }) => (
      <Route key={path} path={path} element={<DeskPlaceholder screen={screen} />} />
    )),
    <Route key="root" path="/" element={<RedirectToChat />} />,
    <Route key="fallback" path="*" element={<RedirectToChat />} />,
  ];
}
