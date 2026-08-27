export const REDROB_DEPLOYMENT_ENV_VAR = "VITE_REDROB_DEPLOYMENT";

export type RedrobWorkDeployment = "desktop" | "web";

function normalizeDeployment(value: string | undefined): RedrobWorkDeployment {
  const normalized = value?.trim().toLowerCase();
  return normalized === "web" ? "web" : "desktop";
}

export function getRedrobWorkDeployment(): RedrobWorkDeployment {
  const envValue =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_REDROB_DEPLOYMENT === "string"
      ? import.meta.env.VITE_REDROB_DEPLOYMENT
      : undefined;

  return normalizeDeployment(envValue);
}

export function isWebDeployment(): boolean {
  return getRedrobWorkDeployment() === "web";
}

export function isDesktopDeployment(): boolean {
  return getRedrobWorkDeployment() === "desktop";
}
