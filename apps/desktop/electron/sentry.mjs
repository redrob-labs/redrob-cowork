import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let sentry = null;
let initialized = false;
let telemetryActive = false;
const __dirname = dirname(fileURLToPath(import.meta.url));

function envFlagEnabled(name) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function normalizeIdentifier(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export function resolveRedrobSentryAppVersion({ app, packageMetadata }) {
  const electronAppVersion = normalizeIdentifier(app?.getVersion?.());
  const packageVersion = normalizeIdentifier(packageMetadata?.version);
  if (app?.isPackaged) return electronAppVersion || packageVersion || "unknown";
  return packageVersion || electronAppVersion || "unknown";
}

export function resolveRedrobSentryRelease({ appVersion, environmentRelease = process.env.SENTRY_RELEASE }) {
  return normalizeIdentifier(environmentRelease) || `redrob-desktop@${normalizeIdentifier(appVersion) || "unknown"}`;
}

function parseBuildConfig(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const dsn = normalizeIdentifier(parsed?.dsn);
    const tracesSampleRate = Number(parsed?.tracesSampleRate);
    return {
      dsn,
      tracesSampleRate: Number.isFinite(tracesSampleRate) && tracesSampleRate >= 0 && tracesSampleRate <= 1
        ? tracesSampleRate
        : 0.01,
    };
  } catch {
    return { dsn: null, tracesSampleRate: 0.01 };
  }
}

function readBuildConfig(app) {
  if (app.isPackaged) {
    return parseBuildConfig(resolve(process.resourcesPath, "redrob-sentry.json"));
  }
  return parseBuildConfig(resolve(__dirname, "..", ".electron-runtime", "redrob-sentry.json"));
}

/** What leaves for Sentry: an event while crash reports are on, nothing otherwise. */
export function redrobSentryGate(event) {
  return telemetryActive ? event : null;
}

/** Test seam: a stand-in for the Sentry SDK, as if it had been initialized. */
export function installRedrobSentryForTests(fake) {
  sentry = fake;
  initialized = Boolean(fake);
  telemetryActive = false;
}

export async function initRedrobSentry({ app, distribution, packageMetadata }) {
  const buildConfig = readBuildConfig(app);
  const dsn = buildConfig.dsn;
  if (!dsn || envFlagEnabled("REDROB_DESKTOP_SENTRY_DISABLED")) return false;

  sentry = await import("@sentry/electron/main");
  const appVersion = resolveRedrobSentryAppVersion({ app, packageMetadata });
  const release = resolveRedrobSentryRelease({ appVersion });
  const sampleRate = buildConfig.tracesSampleRate;

  sentry.init({
    dsn,
    release,
    environment: process.env.REDROB_DESKTOP_SENTRY_ENVIRONMENT?.trim() || (app.isPackaged ? "production" : "development"),
    sendDefaultPii: false,
    integrations: (defaultIntegrations) => defaultIntegrations.filter(
      (integration) => !["BrowserWindowSession", "ElectronMinidump", "MainProcessSession", "SentryMinidump"].includes(integration.name),
    ),
    tracesSampler: () => telemetryActive ? sampleRate : 0,
    beforeSend: redrobSentryGate,
    beforeSendTransaction: redrobSentryGate,
    initialScope: {
      tags: {
        app: "desktop",
        app_version: appVersion,
        distribution: distribution.flavor,
        packaged: String(app.isPackaged),
      },
      contexts: {
        app: {
          app_identifier: distribution.appIdentifier,
          app_name: distribution.appName,
          app_version: appVersion,
        },
      },
    },
  });

  initialized = true;
  globalThis.__redrobDesktopTelemetry = {
    captureException,
    clearSession: clearRedrobSentrySession,
    setSession: setRedrobSentrySession,
  };
  return true;
}

export function setRedrobSentrySession(input) {
  const userId = normalizeIdentifier(input?.userId);
  const orgId = normalizeIdentifier(input?.orgId);
  if (!initialized || !sentry || !userId || !orgId) return false;

  telemetryActive = true;
  sentry.setUser({ id: userId });
  sentry.setTag("org_id", orgId);
  sentry.setContext("redrob_cloud", {
    organization_id: orgId,
    user_id: userId,
  });
  return true;
}

/**
 * Crash reports by consent, with no account behind them. The person turns them on in
 * onboarding or Settings; the only identity sent is a random id made for this install, so
 * reports from one computer can be grouped without saying whose it is. Off by default.
 */
export function setRedrobSentryConsent(input) {
  const enabled = input?.enabled === true;
  if (!enabled) {
    clearRedrobSentrySession();
    return false;
  }
  const installId = normalizeIdentifier(input?.installId);
  if (!initialized || !sentry || !installId) return false;
  telemetryActive = true;
  sentry.setUser({ id: installId });
  sentry.setTag("consent", "crash-reports");
  return true;
}

/** This install's random id, made once and kept in the app's data folder. */
export function resolveRedrobInstallId(userDataPath) {
  const path = resolve(userDataPath, "redrob-install-id");
  try {
    const existing = normalizeIdentifier(readFileSync(path, "utf8"));
    if (existing) return existing;
  } catch {
    // Not made yet.
  }
  const created = randomUUID();
  try {
    mkdirSync(userDataPath, { recursive: true });
    writeFileSync(path, created, "utf8");
  } catch {
    // An id that cannot be kept still groups this session's reports.
  }
  return created;
}

export function clearRedrobSentrySession() {
  telemetryActive = false;
  if (!initialized || !sentry) return false;

  sentry.setUser(null);
  sentry.setContext("redrob_cloud", null);
  return true;
}

export function captureException(error, context = {}) {
  if (!initialized || !sentry || !telemetryActive) return false;

  sentry.withScope((scope) => {
    if (context.surface) scope.setTag("surface", String(context.surface));
    if (context.route) scope.setTag("route", String(context.route));
    if (context.method) scope.setTag("method", String(context.method));
    sentry.captureException(error);
  });
  return true;
}
