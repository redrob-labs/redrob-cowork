/** @jsxImportSource react */
import {
  createContext,
  use,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { RedrobServerStore } from "./redrob-server-store";

const RedrobServerContext = createContext<RedrobServerStore | null>(null);

export function RedrobServerProvider(props: {
  store: RedrobServerStore;
  children: ReactNode;
}) {
  return (
    <RedrobServerContext.Provider value={props.store}>
      {props.children}
    </RedrobServerContext.Provider>
  );
}

export function useRedrobServer() {
  const store = use(RedrobServerContext);
  if (!store) {
    throw new Error("useRedrobServer must be used within an RedrobServerProvider");
  }

  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return store;
}
