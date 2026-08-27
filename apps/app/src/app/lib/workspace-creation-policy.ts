import { isRedrobGatewayRuntime } from "./gateway-runtime";

export function canCreateWorkspaces() {
  return !isRedrobGatewayRuntime();
}
