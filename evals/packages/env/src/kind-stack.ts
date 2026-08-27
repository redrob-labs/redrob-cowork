/**
 * Kubernetes Den-stack harness - REMOVED.
 *
 * The cloud/enterprise layer (ee/) and helm charts have been deleted from
 * this repository. This stub preserves exports so dependent evals modules
 * compile, but all runtime functions throw immediately.
 */

export const DEMO_PASSWORD = "removed";

export function ensureKindDenReady(): never {
  throw new Error("Kind Den stack has been removed from this repository.");
}

export function exposeEndpointHandles(): never {
  throw new Error("Kind Den stack has been removed from this repository.");
}

export function kubeProfileConfig(): never {
  throw new Error("Kind Den stack has been removed from this repository.");
}
