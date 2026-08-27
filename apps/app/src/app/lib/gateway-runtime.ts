// Gateway runtime detection primitives. Leaf module by design: keep it import-free
// so low-level clients can choose same-origin gateway behavior without cycles.
export type RedrobGatewayMarker = {
  version?: number;
  build?: string;
};

declare global {
  interface Window {
    __REDROB_GATEWAY__?: RedrobGatewayMarker;
  }
}

const DEN_AUTH_TOKEN_STORAGE_KEY = "redrob.den.authToken";

export function isRedrobGatewayRuntime() {
  return typeof window !== "undefined" && window.__REDROB_GATEWAY__?.version === 1;
}

export function getRedrobGatewayBuild(): string | null {
  if (!isRedrobGatewayRuntime()) return null;
  const build = window.__REDROB_GATEWAY__?.build?.trim() ?? "";
  return build || null;
}

export function getRedrobGatewayOrigin() {
  if (!isRedrobGatewayRuntime()) return null;
  const origin = window.location.origin.trim();
  return origin || null;
}

export function readRedrobGatewayDenToken() {
  if (!isRedrobGatewayRuntime()) return "";
  try {
    return window.localStorage.getItem(DEN_AUTH_TOKEN_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}
