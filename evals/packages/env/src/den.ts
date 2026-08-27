/**
 * Den server harness - REMOVED.
 *
 * The cloud/enterprise layer (ee/) has been deleted from this repository.
 * This stub preserves type exports so dependent evals modules compile,
 * but all runtime functions throw immediately.
 */

export interface Den {
  apiUrl: string;
  webUrl: string;
}

export function defaultReuseAdmin(): never {
  throw new Error("Den has been removed from this repository.");
}

export function personDefaults(): never {
  throw new Error("Den has been removed from this repository.");
}

export function server(): never {
  throw new Error("Den has been removed from this repository.");
}
