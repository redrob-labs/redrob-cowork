import { describe, expect, test } from "bun:test";
import { agentContextDiagnosticsRequestSchema } from "@redrob/types/agent-context-diagnostics";

import {
  collectAgentContextDiagnosticObservations,
  isAgentContextDiagnosticsWorkspaceAllowed,
} from "../src/app/lib/agent-context-diagnostics";

describe("organization connection diagnostic observations", () => {
  test("reports a skipped probe with no rows on a local-only install", () => {
    const observations = collectAgentContextDiagnosticObservations();

    expect(observations).toEqual({
      organizationConnectionsProbe: {
        status: "skipped",
        code: "signed_out",
        totalCount: 0,
        truncated: false,
      },
      organizationConnections: [],
    });
    expect(agentContextDiagnosticsRequestSchema.safeParse(observations).success).toBe(true);
  });
  test("the request schema rejects client cloud credentials and extra fields", () => {
    const result = agentContextDiagnosticsRequestSchema.safeParse({
      organizationConnectionsProbe: {
        status: "observed",
        code: null,
        totalCount: 0,
        truncated: false,
      },
      organizationConnections: [],
      cloudCatalogProbe: {
        token: "must-never-cross",
        url: "https://provider.example.test/mcp",
      },
    });
    expect(result.success).toBe(false);
  });

  test("the request schema rejects organization rows without an observed probe", () => {
    const result = agentContextDiagnosticsRequestSchema.safeParse({
      organizationConnectionsProbe: {
        status: "skipped",
        code: "signed_out",
        totalCount: 0,
        truncated: false,
      },
      organizationConnections: [{
        id: "externalMcpConnection_123",
        name: "Customer search",
        credentialMode: "per_member",
        connected: true,
        connectedForMe: true,
        needsReconnect: false,
        missingFeatureCount: 0,
      }],
    });
    expect(result.success).toBe(false);
  });

  test("the request schema rejects duplicate organization connection IDs", () => {
    const summary = {
      id: "externalMcpConnection_123",
      name: "Customer search",
      credentialMode: "per_member" as const,
      connected: true,
      connectedForMe: true,
      needsReconnect: false,
      missingFeatureCount: 0,
    };
    const result = agentContextDiagnosticsRequestSchema.safeParse({
      organizationConnectionsProbe: {
        status: "observed",
        code: null,
        totalCount: 2,
        truncated: false,
      },
      organizationConnections: [summary, { ...summary, name: "Customer files" }],
    });
    expect(result.success).toBe(false);
  });

  test("the request schema rejects controls and recognizable sensitive values in names", () => {
    for (const name of [
      "Customer\nsearch",
      "Customer\u202esearch",
      "Customer\u2066search",
      "Customer Bearer diag-secret-authorization-canary-74ab",
      "Customer token=diag-secret-assignment-canary",
      "Customer https://private.example.test/mcp?access_token=diag-secret-url-canary",
      "Customer /Users/diagnostics/private/connection.json",
      "Customer C:\\Users\\diagnostics\\private\\connection.json",
      "Customer ~/private/connection.json",
    ]) {
      const result = agentContextDiagnosticsRequestSchema.safeParse({
        organizationConnectionsProbe: {
          status: "observed",
          code: null,
          totalCount: 1,
          truncated: false,
        },
        organizationConnections: [{
          id: "externalMcpConnection_123",
          name,
          credentialMode: "per_member",
          connected: true,
          connectedForMe: true,
          needsReconnect: false,
          missingFeatureCount: 0,
        }],
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("agent diagnostics workspace trust", () => {
  test("blocks explicit and legacy remote OpenCode while allowing local and remote Redrob Work", () => {
    expect(isAgentContextDiagnosticsWorkspaceAllowed({
      workspaceType: "remote",
      remoteType: "opencode",
    })).toBe(false);
    expect(isAgentContextDiagnosticsWorkspaceAllowed({
      workspaceType: "remote",
      remoteType: "redrob",
    })).toBe(true);
    expect(isAgentContextDiagnosticsWorkspaceAllowed({
      workspaceType: "remote",
    })).toBe(false);
    expect(isAgentContextDiagnosticsWorkspaceAllowed({
      workspaceType: "remote",
      remoteType: null,
    })).toBe(false);
    expect(isAgentContextDiagnosticsWorkspaceAllowed({
      workspaceType: "local",
      remoteType: null,
    })).toBe(true);
    expect(isAgentContextDiagnosticsWorkspaceAllowed(null)).toBe(false);
  });
});
