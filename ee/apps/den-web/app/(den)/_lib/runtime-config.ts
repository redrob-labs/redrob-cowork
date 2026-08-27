export type DenOrgMode = "single_org" | "multi_org";

export type DenWebRuntimeConfig = {
  redrobAppConnectUrl: string;
  redrobWebUrl: string;
  redrobAuthCallbackUrl: string;
  orgMode: DenOrgMode;
  singleOrgName: string;
  singleOrgSlug: string;
  singleOrgAllowPublicSignup: boolean;
  singleOrgSsoConfigured: boolean;
};

export const DEFAULT_REDROB_WEB_URL = "https://web.redrob.io";

export const EMPTY_RUNTIME_CONFIG: DenWebRuntimeConfig = {
  redrobAppConnectUrl: "",
  redrobWebUrl: DEFAULT_REDROB_WEB_URL,
  redrobAuthCallbackUrl: "",
  orgMode: "single_org",
  singleOrgName: "Redrob Work",
  singleOrgSlug: "default",
  singleOrgAllowPublicSignup: false,
  singleOrgSsoConfigured: false
};

let runtimeConfigPromise: Promise<DenWebRuntimeConfig> | null = null;

function normalizeOrgMode(value: unknown): DenOrgMode {
  return value === "multi_org" ? "multi_org" : "single_org";
}

function readStringProperty(value: object, key: string) {
  const property = Object.getOwnPropertyDescriptor(value, key)?.value;
  return typeof property === "string" ? property.trim() : "";
}

function readBooleanProperty(value: object, key: string) {
  return Object.getOwnPropertyDescriptor(value, key)?.value === true;
}

function normalizeRuntimeConfig(value: unknown): DenWebRuntimeConfig {
  if (typeof value !== "object" || value === null) {
    return EMPTY_RUNTIME_CONFIG;
  }

  const singleOrgName = readStringProperty(value, "singleOrgName");
  const singleOrgSlug = readStringProperty(value, "singleOrgSlug");
  return {
    redrobAppConnectUrl: readStringProperty(value, "redrobAppConnectUrl"),
    redrobWebUrl: readStringProperty(value, "redrobWebUrl") || DEFAULT_REDROB_WEB_URL,
    redrobAuthCallbackUrl: readStringProperty(value, "redrobAuthCallbackUrl"),
    orgMode: normalizeOrgMode(readStringProperty(value, "orgMode")),
    singleOrgName: singleOrgName || "Redrob Work",
    singleOrgSlug: singleOrgSlug || "default",
    singleOrgAllowPublicSignup: readBooleanProperty(value, "singleOrgAllowPublicSignup"),
    singleOrgSsoConfigured: readBooleanProperty(value, "singleOrgSsoConfigured")
  };
}

export function getRuntimeConfig(): Promise<DenWebRuntimeConfig> {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch("/api/runtime-config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          runtimeConfigPromise = null;
          return EMPTY_RUNTIME_CONFIG;
        }

        return normalizeRuntimeConfig(await response.json());
      })
      .catch(() => {
        runtimeConfigPromise = null;
        return EMPTY_RUNTIME_CONFIG;
      });
  }

  return runtimeConfigPromise;
}
