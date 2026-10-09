/** @jsxImportSource react */
import type { ReactNode } from "react";
import { Navigate, Route, useParams } from "react-router";

import { DeskConnectorsScreen } from "../connectors/desk-connectors";
import { DeskMemoryScreen } from "../memory/desk-memory";
import { DeskPrivacyScreen } from "../privacy/desk-privacy";
import { GuideScreen } from "../preview/desk-guide";
import { HistoryScreen } from "../preview/desk-history";
import { ScheduledScreen } from "../preview/desk-scheduled";
import { ProjectScreen, ProjectsScreen } from "../projects/desk-projects";
import { SkillScreen } from "../skills/desk-skill";
import { SkillsScreen } from "../skills/desk-skills";
import { RouteReady } from "./route-ready";

export { RouteReady };

const ready = (element: ReactNode) => <RouteReady>{element}</RouteReady>;

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
    <Route key="projects" path="/projects" element={ready(<ProjectsScreen />)} />,
    <Route key="project" path="/project/:projectId" element={ready(<ProjectScreen />)} />,
    <Route key="privacy" path="/privacy" element={ready(<DeskPrivacyScreen />)} />,
    <Route key="connectors" path="/connectors" element={ready(<DeskConnectorsScreen />)} />,
    // The Desk Memory screen is always on; the old memory flag only gates the settings tab.
    <Route key="memory" path="/memory" element={ready(<DeskMemoryScreen />)} />,
    <Route key="memory-scope" path="/memory/:scope" element={ready(<DeskMemoryScreen />)} />,
    <Route key="skills" path="/skills" element={ready(<SkillsScreen />)} />,
    <Route key="skill" path="/skill/:name" element={ready(<SkillScreen />)} />,
    // Playbooks became skills: old links land on Skills.
    <Route key="playbooks" path="/playbooks" element={<Navigate to="/skills" replace />} />,
    <Route key="playbook" path="/playbook/:playbookId" element={<Navigate to="/skills" replace />} />,
    <Route key="run" path="/run" element={<Navigate to="/skills" replace />} />,
    // Screens that show sample data until a server is connected.
    <Route key="scheduled" path="/scheduled" element={ready(<ScheduledScreen />)} />,
    <Route key="history" path="/history" element={ready(<HistoryScreen />)} />,
    <Route key="guide" path="/guide" element={ready(<GuideScreen />)} />,
    <Route key="root" path="/" element={<RedirectToChat />} />,
    <Route key="fallback" path="*" element={<RedirectToChat />} />,
  ];
}
