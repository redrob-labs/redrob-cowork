import { INFERENCE_MODEL_ALIASES } from "@redrob/types/den/inference";

import {
  buildDenAuthUrl,
  getDenInferenceUrl,
  isSelfHostedControlPlane,
  HOSTED_DEFAULT_DEN_BASE_URL,
  readDenBootstrapConfig,
  readDenSettings,
} from "../../../app/lib/den";
import { isDefaultControlPlaneUrl } from "../settings/cloud/control-plane-url";
import { denSettingsChangedEvent } from "../../../app/lib/den-session-events";
import { useSyncExternalStore } from "react";

export const REDROB_MODELS_PROVIDER_ID = "redrob";
export const REDROB_MODELS_PROVIDER_NAME = "Redrob Models";
export const REDROB_MODELS_PROMO_HIDDEN_KEY = "redrob.redrobModelsPromo.hidden";
export const REDROB_MODELS_PROMO_LAST_SHOWN_KEY = "redrob.redrobModelsPromo.lastShownAt";
export const REDROB_MODELS_STARTUP_PROMO_SHOWN_KEY = "redrob.redrobModelsPromo.startupShown";
export const redrobModelsPromoChangedEvent = "redrob-redrob-models-promo-changed";
export const REDROB_MODELS_PROMO_SHOW_DELAY_MS = 4_000;
export const REDROB_MODELS_PROMO_VISIBLE_MS = 14_000;
export const REDROB_MODELS_PROMO_REPEAT_MS = 6 * 60 * 60 * 1000;

export function areRedrobWorkModelsPromosDisabled() {
  if (/^(1|true|yes|on)$/i.test(String(import.meta.env.VITE_DISABLE_REDROB_MODELS ?? "").trim())) {
    return true;
  }
  // Redrob Models are a hosted Redrob Cloud offering; self-hosted
  // deployments should never see the upsell surfaces.
  return isSelfHostedControlPlane();
}

export function isRedrobWorkModelsPromoEligibleForDenBaseUrl(baseUrl: string) {
  return !areRedrobWorkModelsPromosDisabled() && isDefaultControlPlaneUrl(baseUrl, HOSTED_DEFAULT_DEN_BASE_URL);
}

export function isRedrobWorkModelsPromoEligible() {
  return isRedrobWorkModelsPromoEligibleForDenBaseUrl(readDenSettings().baseUrl);
}

export function useRedrobWorkModelsPromoEligibility() {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(denSettingsChangedEvent, notify);
      return () => window.removeEventListener(denSettingsChangedEvent, notify);
    },
    isRedrobWorkModelsPromoEligible,
    isRedrobWorkModelsPromoEligible,
  );
}

export type RedrobWorkModelPreview = {
  id: string;
  title: string;
  subtitle: string;
};

export const REDROB_MODEL_PREVIEWS: RedrobWorkModelPreview[] = Object.entries(
  INFERENCE_MODEL_ALIASES,
)
  .filter(([, model]) => model.enabled)
  .map(([id, model]) => ({
    id,
    title: model.displayName.replace(/^Redrob Work:\s*/, ""),
    subtitle: "Redrob hosted",
  }));

export function hasRedrobWorkModelsProvider(providerIds: readonly string[]) {
  return providerIds.some((id) => id.trim().toLowerCase() === REDROB_MODELS_PROVIDER_ID);
}

/** Local engine has Redrob Models connected with at least one selectable model. */
export function hasRedrobWorkModelsAvailable(input: {
  providerConnectedIds: readonly string[];
  providers: ReadonlyArray<{ id: string; models?: Record<string, unknown> | null }>;
}) {
  if (!hasRedrobWorkModelsProvider(input.providerConnectedIds)) return false;
  const redrob = input.providers.find(
    (provider) => provider.id.trim().toLowerCase() === REDROB_MODELS_PROVIDER_ID,
  );
  return Object.keys(redrob?.models ?? {}).length > 0;
}

export function shouldShowRedrobWorkModelsSyncing(input: {
  entitled: boolean;
  available: boolean;
  workspaceReady: boolean;
  reloadPending: boolean;
}) {
  return input.entitled && !input.available && input.workspaceReady && input.reloadPending;
}

export function getRedrobWorkModelsActionUrl(
  isSignedIn: boolean,
  authMode: "sign-in" | "sign-up" = "sign-in",
) {
  const settings = readDenSettings();
  const baseUrl = settings.baseUrl || readDenBootstrapConfig().baseUrl;
  // Signed-in users go straight to the Redrob Models page - the value-prop
  // + subscribe surface — never to a bare auth or billing page.
  return isSignedIn ? getDenInferenceUrl(baseUrl) : buildDenAuthUrl(baseUrl, authMode);
}

export function isRedrobWorkModelsPromoHidden() {
  if (areRedrobWorkModelsPromosDisabled()) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REDROB_MODELS_PROMO_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function hideRedrobWorkModelsPromo() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REDROB_MODELS_PROMO_HIDDEN_KEY, "1");
    window.dispatchEvent(new Event(redrobModelsPromoChangedEvent));
  } catch {}
}

export function wasRedrobWorkModelsStartupPromoShown() {
  if (!isRedrobWorkModelsPromoEligible()) return true;
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(REDROB_MODELS_STARTUP_PROMO_SHOWN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markRedrobWorkModelsStartupPromoShown() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REDROB_MODELS_STARTUP_PROMO_SHOWN_KEY, "1");
  } catch {}
}

export function shouldShowRedrobWorkModelsPromo(now = Date.now()) {
  if (!isRedrobWorkModelsPromoEligible() || typeof window === "undefined" || isRedrobWorkModelsPromoHidden()) return false;
  try {
    const lastShown = Number(window.localStorage.getItem(REDROB_MODELS_PROMO_LAST_SHOWN_KEY) ?? "0");
    return !Number.isFinite(lastShown) || now - lastShown >= REDROB_MODELS_PROMO_REPEAT_MS;
  } catch {
    return true;
  }
}

export function markRedrobWorkModelsPromoShown(now = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REDROB_MODELS_PROMO_LAST_SHOWN_KEY, String(now));
  } catch {}
}
