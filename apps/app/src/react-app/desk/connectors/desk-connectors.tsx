/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, ConnectorCard, EmptyState, SectionMark, Skeleton, icons, type IconName } from "@redrob-labs/ui";

import type { McpDirectoryInfo } from "../../../app/constants";
import { openDesktopUrl } from "../../../app/lib/desktop";
import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { t } from "../../../i18n";
import { McpAuthModal } from "../../domains/connections/mcp-auth-modal";
import { createDeskServices } from "../services/real-services";
import type { Connector } from "../services/types";
import { useDeskConnection } from "../shell/desk-connection";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import {
  CONNECTORS_QUERY_KEY,
  connectedCount,
  connectorStateLabel,
  invalidateConnectors,
  mcpStatusReader,
  setConnectorEnabled,
  signInConnector,
  visibleConnectors,
  type ConnectorActionDeps,
} from "./connectors";

const CARD_ICON = { width: 20, height: 20, "aria-hidden": true };

function isIconName(name: string): name is IconName {
  return Object.hasOwn(icons, name);
}

export type ConnectorsViewProps = {
  connectors: readonly Connector[];
  developerMode: boolean;
  /** Sample data: the buttons do nothing. */
  preview: boolean;
  onSignIn: (connector: Connector) => void;
  onTurnOn: (connector: Connector) => void;
  onTurnOff: (connector: Connector) => void;
};

function ConnectorTile(props: { connector: Connector } & Omit<ConnectorsViewProps, "connectors" | "developerMode">) {
  const { connector, preview } = props;
  const connected = connector.state === "connected";
  const off = connector.state === "off";
  const act = (run: (connector: Connector) => void) => (preview ? undefined : () => run(connector));
  return (
    <li>
      <ConnectorCard
        name={connector.name}
        maker={connected ? connector.maker : connectorStateLabel(connector.state)}
        category={connected ? connector.category : undefined}
        description={connector.does}
        icon={icons[isIconName(connector.icon) ? connector.icon : "plug"](CARD_ICON)}
        connected={connected}
        connectedLabel={t("desk.connectors_state_connected")}
        connectLabel={off ? t("desk.connectors_turn_on") : t("desk.connectors_sign_in")}
        disconnectLabel={t("desk.connectors_turn_off")}
        onConnect={act(off ? props.onTurnOn : props.onSignIn)}
        onDisconnect={act(props.onTurnOff)}
      />
    </li>
  );
}

function ConnectorSection(props: { title: string; lede?: string; list: readonly Connector[] } & Omit<ConnectorsViewProps, "connectors" | "developerMode">) {
  const { title, lede, list, ...tile } = props;
  if (!list.length) return null;
  return (
    <section className="desk-settings__group">
      <SectionMark label={title} as="heading" level={2} trailing={list.length} />
      {lede ? <p className="desk-settings__description">{lede}</p> : null}
      <ul className="desk-connectors">
        {list.map((connector) => (
          <ConnectorTile key={connector.id} connector={connector} {...tile} />
        ))}
      </ul>
    </section>
  );
}

/** Connected first, then the rest; in Developer mode, the tools your team built after them. */
export function ConnectorsView(props: ConnectorsViewProps) {
  const { connectors, developerMode, ...tile } = props;
  const shown = visibleConnectors(connectors, developerMode);
  const known = shown.filter((connector) => !connector.custom);
  const custom = shown.filter((connector) => connector.custom);
  return (
    <div className="desk-settings__main desk-connectors__main">
      {props.preview ? (
        <Alert tone="info" title={t("desk.connectors_preview_title")}>
          {t("desk.connectors_preview_text")}
        </Alert>
      ) : null}
      <p className="desk-settings__lede">{t("desk.connectors_lede")}</p>
      {shown.length ? (
        <>
          <ConnectorSection
            title={t("desk.connectors_connected_title")}
            list={known.filter((connector) => connector.state === "connected")}
            {...tile}
          />
          <ConnectorSection
            title={t("desk.connectors_other_title")}
            list={known.filter((connector) => connector.state !== "connected")}
            {...tile}
          />
          <ConnectorSection
            title={t("desk.connectors_team_title")}
            lede={t("desk.connectors_team_lede")}
            list={custom}
            {...tile}
          />
        </>
      ) : (
        <EmptyState
          icon={icons.plug(CARD_ICON)}
          title={t("desk.connectors_empty_title")}
          description={t("desk.connectors_empty_text")}
        />
      )}
    </div>
  );
}

/** Opens a web page outside the app: the system browser on the desktop, a new tab on the web. */
export function openExternal(url: string) {
  if (isDesktopRuntime()) {
    void openDesktopUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** `/connectors`: the apps Desk can reach, from the servers configured for this workspace. */
export function DeskConnectorsScreen() {
  const client = useDeskConnection((state) => state.client);
  const opencode = useDeskConnection((state) => state.opencode);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const workspaceRoot = useDeskConnection((state) => state.workspaceRoot);
  const developerMode = useFrameStore((state) => state.developerMode);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const services = useMemo(
    () => createDeskServices({ client, workspaceId, mcpStatus: mcpStatusReader(opencode, workspaceRoot) }),
    [client, opencode, workspaceId, workspaceRoot],
  );
  const scope = workspaceId ?? "preview";
  const list = useQuery({ queryKey: [CONNECTORS_QUERY_KEY, scope], queryFn: () => services.connectors.list() });
  const [signIn, setSignIn] = useState<McpDirectoryInfo | null>(null);
  const refresh = () => invalidateConnectors(queryClient, scope);
  const deps: ConnectorActionDeps = {
    client,
    workspaceId,
    openLink: openExternal,
    openSignIn: setSignIn,
    refresh,
    showToast,
  };
  const result = list.data;

  return (
    <DeskShell
      current="connectors"
      title={t("desk.nav_connectors")}
      meta={result ? t("desk.connectors_meta", { count: connectedCount(result.data, developerMode) }) : undefined}
    >
      {list.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : !result ? (
        <EmptyState title={t("desk.connectors_error_title")} description={t("desk.settings_try_again")} />
      ) : (
        <ConnectorsView
          connectors={result.data}
          developerMode={developerMode}
          preview={result.preview}
          onSignIn={(connector) => void signInConnector(deps, connector)}
          onTurnOn={(connector) => void setConnectorEnabled(deps, connector, true)}
          onTurnOff={(connector) => void setConnectorEnabled(deps, connector, false)}
        />
      )}
      {signIn ? (
        <McpAuthModal
          open
          client={opencode}
          entry={signIn}
          projectDir={workspaceRoot ?? ""}
          isRemoteWorkspace={workspaceRoot === null}
          onClose={() => setSignIn(null)}
          onComplete={async () => {
            setSignIn(null);
            await refresh();
          }}
        />
      ) : null}
    </DeskShell>
  );
}
