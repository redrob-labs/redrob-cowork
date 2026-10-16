import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement } from "react";
import { Navigate } from "react-router";

import { RouteReady, coworkRoutes } from "../src/react-app/cowork/shell/cowork-routes";

/**
 * Reloading a Cowork screen other than the chat used to leave the boot overlay up forever: only the chat
 * (through the workspace route state), settings and welcome marked the route ready. Every Cowork screen that
 * renders its own content now goes through `RouteReady`; the chat keeps its own readiness, and the
 * redirects render nothing to be ready about.
 */
describe("cowork deep links lift the boot overlay", () => {
  const chat = <div data-chat />;
  const routes = coworkRoutes(chat) as ReactElement<{ path: string; element: ReactElement }>[];

  test("every screen route is wrapped in RouteReady", () => {
    const screens = routes.filter((route) => {
      const element = route.props.element;
      // Redirects (to the chat/guide, and from the old Playbooks paths to Skills) render no screen of their own.
      return element !== chat && isValidElement(element) && element.type !== Navigate && (element.type as { name?: string }).name !== "RedirectToChat" && (element.type as { name?: string }).name !== "RedirectToGuide";
    });
    expect(screens.length).toBeGreaterThanOrEqual(11);
    for (const route of screens) {
      expect({ path: route.props.path, wrapped: route.props.element.type === RouteReady }).toEqual({
        path: route.props.path,
        wrapped: true,
      });
    }
  });

  test("the chat routes keep their own readiness", () => {
    const chatRoutes = routes.filter((route) => route.props.element === chat);
    expect(chatRoutes.map((route) => route.props.path)).toEqual([
      "/chat",
      "/chat/:sessionId",
      "/workspace/:workspaceId/session",
      "/workspace/:workspaceId/session/:sessionId",
    ]);
  });
});

describe("cowork settings lift the boot overlay", () => {
  test("the Cowork settings screen is wrapped in RouteReady; the developer route marks itself", async () => {
    const { CoworkSettingsGateView } = await import("../src/react-app/cowork/settings/cowork-settings");
    const { MemoryRouter, Route, Routes } = await import("react-router");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const seen: string[] = [];
    // Render only far enough to see which branch the gate picks.
    function Probe(props: { developerMode: boolean }) {
      const element = CoworkSettingsGateView({ developer: <i data-dev />, developerMode: props.developerMode }) as ReactElement;
      seen.push(element.type === RouteReady ? "ready" : typeof element.type === "string" ? element.type : "other");
      return null;
    }
    renderToStaticMarkup(
      <MemoryRouter initialEntries={["/settings/general"]}>
        <Routes>
          <Route path="/settings/*" element={<Probe developerMode={false} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(seen).toEqual(["ready"]);
  });
});
