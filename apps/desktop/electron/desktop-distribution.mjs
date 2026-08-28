export const PUBLIC_DESKTOP_DISTRIBUTION = Object.freeze({
  flavor: "public",
  appName: "Redrob Work",
  appIdentifier: "io.redrob.work",
  protocolScheme: "redrob",
});

/**
 * One distribution remains: the local-first public build. The resolver is kept
 * so callers keep a single source for the app name, identifier, and scheme.
 */
export function resolveDesktopDistribution() {
  return PUBLIC_DESKTOP_DISTRIBUTION;
}
