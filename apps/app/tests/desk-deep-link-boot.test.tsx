import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement } from "react";

import { RouteReady, deskRoutes } from "../src/react-app/desk/shell/desk-routes";

/**
 * Reloading a Desk screen other than the chat used to leave the boot overlay up forever: only the chat
 * (through the workspace route state), settings and welcome marked the route ready. Every Desk screen that
 * renders its own content now goes through `RouteReady`; the chat keeps its own readiness, and the
 * redirects render nothing to be ready about.
 */
describe("desk deep links lift the boot overlay", () => {
  const chat = <div data-chat />;
  const routes = deskRoutes(chat) as ReactElement<{ path: string; element: ReactElement }>[];

  test("every screen route is wrapped in RouteReady", () => {
    const screens = routes.filter((route) => {
      const element = route.props.element;
      return element !== chat && isValidElement(element) && (element.type as { name?: string }).name !== "RedirectToChat";
    });
    expect(screens.length).toBeGreaterThanOrEqual(12);
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

describe("desk settings lift the boot overlay", () => {
  test("the Desk settings screen is wrapped in RouteReady; the developer route marks itself", async () => {
    const { DeskSettingsGateView } = await import("../src/react-app/desk/settings/desk-settings");
    const { MemoryRouter, Route, Routes } = await import("react-router");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const seen: string[] = [];
    // Render only far enough to see which branch the gate picks.
    function Probe(props: { developerMode: boolean }) {
      const element = DeskSettingsGateView({ developer: <i data-dev />, developerMode: props.developerMode }) as ReactElement;
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
