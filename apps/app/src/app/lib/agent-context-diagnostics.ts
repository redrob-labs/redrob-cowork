import {
  agentContextDiagnosticsReportSchema,
  type AgentContextDiagnosticsReport,
  type AgentContextDiagnosticsRequest,
} from "@redrob/types/agent-context-diagnostics";

export function isAgentContextDiagnosticsWorkspaceAllowed(workspace: {
  workspaceType: "local" | "remote";
  remoteType?: "redrob" | "opencode" | null;
} | null): boolean {
  if (!workspace) return false;
  return workspace.workspaceType === "local" || workspace.remoteType === "redrob";
}

/**
 * Organization MCP connections were observed from the control plane, so a
 * local-only install has nothing to report. The probe answers "skipped" for a
 * reason the report can render rather than pretending it observed an empty
 * organization.
 *
 * `organizationConnections*` are still part of the request contract in
 * `@redrob/types/agent-context-diagnostics`; they are removed from the contract
 * and from the server-side probe in the server pass of this change.
 */
export function collectAgentContextDiagnosticObservations(): AgentContextDiagnosticsRequest {
  return {
    organizationConnectionsProbe: {
      status: "skipped",
      code: "signed_out",
      totalCount: 0,
      truncated: false,
    },
    organizationConnections: [],
  };
}

export function serializeAgentContextDiagnosticsReport(report: AgentContextDiagnosticsReport) {
  const sanitized = agentContextDiagnosticsReportSchema.parse(report);
  return JSON.stringify(sanitized, null, 2);
}
