/** @jsxImportSource react */
import { useEffect, type ReactNode } from "react";

import { useOptionalBootState } from "../../shell/boot-state";

/**
 * Lifts the boot overlay for a Desk screen that has nothing to wait for. Only the chat (through the
 * workspace route state), welcome and the developer settings route used to mark the route ready, so a
 * reload on /projects, /guide, /run, the Desk settings or any other Desk screen kept the overlay up
 * forever. The overlay still waits for the runtime's own boot phase; this only says the screen is ready.
 */
export function RouteReady(props: { children: ReactNode }) {
  const markRouteReady = useOptionalBootState()?.markRouteReady;
  useEffect(() => {
    markRouteReady?.();
  }, [markRouteReady]);
  return <>{props.children}</>;
}

