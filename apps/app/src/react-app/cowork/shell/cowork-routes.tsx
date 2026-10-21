/** @jsxImportSource react */
import type { ReactNode } from "react";
import { Navigate, Route, useParams } from "react-router";

import { CoworkConnectorsScreen } from "../connectors/cowork-connectors";
import { CoworkMemoryScreen } from "../memory/cowork-memory";
import { CoworkPrivacyScreen } from "../privacy/cowork-privacy";
import { GuideScreen } from "../preview/cowork-guide";
import { HistoryScreen } from "../preview/cowork-history";
import { RadarScreen } from "../preview/radar-screen";
import { ScheduledScreen } from "../preview/cowork-scheduled";
import { ProjectScreen, ProjectsScreen } from "../projects/cowork-projects";
import { SkillScreen } from "../skills/cowork-skill";
import { SkillsScreen } from "../skills/cowork-skills";
import { WorkflowScreen } from "../skills/cowork-workflow";
import { RouteReady } from "./route-ready";

export { RouteReady };

const ready = (element: ReactNode) => <RouteReady>{element}</RouteReady>;

/** `/chat` or `/chat/<id>`. */
export function chatPath(sessionId?: string | null): string {
  const id = sessionId?.trim();
  return id ? `/chat/${encodeURIComponent(id)}` : "/chat";
}

/** `/session[/:id]` land on the chat (a session deep-link). */
export function RedirectToChat() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  return <Navigate to={chatPath(sessionId)} replace />;
}

/** `/` and any unknown path land on Model Chart — the default landing. */
export function RedirectToGuide() {
  return <Navigate to="/guide" replace />;
}

/**
 * The Cowork routes, as `<Route>` elements for the app's `<Routes>`.
 *
 * `chat` renders on `/chat[/:sessionId]` and on the workspace session routes. Those stay
 * routed rather than redirected: the session route keeps the open workspace in the URL and
 * rewrites `/chat/<id>` to `/workspace/<workspace>/session/<id>` itself, so a redirect back
 * would loop. One element for all four keeps the chat mounted while the URL settles.
 */
export function coworkRoutes(chat: ReactNode) {
  return [
    <Route key="chat" path="/chat" element={chat} />,
    <Route key="chat-session" path="/chat/:sessionId" element={chat} />,
    <Route key="workspace-session" path="/workspace/:workspaceId/session" element={chat} />,
    <Route key="workspace-session-id" path="/workspace/:workspaceId/session/:sessionId" element={chat} />,
    <Route key="session" path="/session" element={<RedirectToChat />} />,
    <Route key="session-id" path="/session/:sessionId" element={<RedirectToChat />} />,
    <Route key="projects" path="/projects" element={ready(<ProjectsScreen />)} />,
    <Route key="project" path="/project/:projectId" element={ready(<ProjectScreen />)} />,
    <Route key="privacy" path="/privacy" element={ready(<CoworkPrivacyScreen />)} />,
    <Route key="connectors" path="/connectors" element={ready(<CoworkConnectorsScreen />)} />,
    // The Cowork Memory screen is always on; the old memory flag only gates the settings tab.
    <Route key="memory" path="/memory" element={ready(<CoworkMemoryScreen />)} />,
    <Route key="memory-scope" path="/memory/:scope" element={ready(<CoworkMemoryScreen />)} />,
    <Route key="skills" path="/skills" element={ready(<SkillsScreen />)} />,
    // A workflow (one catalogue skill family); an unknown id returns to Skills.
    <Route key="workflow" path="/skills/workflow/:id" element={ready(<WorkflowScreen />)} />,
    <Route key="skill" path="/skill/:name" element={ready(<SkillScreen />)} />,
    // Playbooks became skills: old links land on Skills.
    <Route key="playbooks" path="/playbooks" element={<Navigate to="/skills" replace />} />,
    <Route key="playbook" path="/playbook/:playbookId" element={<Navigate to="/skills" replace />} />,
    <Route key="run" path="/run" element={<Navigate to="/skills" replace />} />,
    // Screens that show sample data until a server is connected.
    <Route key="scheduled" path="/scheduled" element={ready(<ScheduledScreen />)} />,
    <Route key="history" path="/history" element={ready(<HistoryScreen />)} />,
    <Route key="guide" path="/guide" element={ready(<GuideScreen />)} />,
    // Radar subpages under Trending AI: /radar/news and /radar/social (an unknown feed returns to /guide).
    <Route key="radar" path="/radar/:feed" element={ready(<RadarScreen />)} />,
    <Route key="root" path="/" element={<RedirectToGuide />} />,
    <Route key="fallback" path="*" element={<RedirectToGuide />} />,
  ];
}
