import type { ApprovalService } from "../approvals.js";
import type { ReloadEventStore } from "../events.js";
import type { TokenService } from "../tokens.js";
import type { Actor, ServerConfig } from "../types.js";

export type AuthMode = "none" | "client" | "host" | "host-token";

export interface RequestContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  config: ServerConfig;
  approvals: ApprovalService;
  reloadEvents: ReloadEventStore;
  tokens: TokenService;
  actor?: Actor;
}

export interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  auth: AuthMode;
  handler: (ctx: RequestContext) => Promise<Response>;
}

export type MatchedRoute = Route & { params: Record<string, string> };

export function matchRoute(routes: Route[], method: string, path: string): MatchedRoute | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = path.match(route.regex);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return { ...route, params };
  }
  return null;
}

export function addRoute(routes: Route[], method: string, path: string, auth: AuthMode, handler: Route["handler"]): void {
  const keys: string[] = [];
  const regex = pathToRegex(path, keys);
  routes.push({ method, regex, keys, auth, handler });
}

/**
 * `:name` matches one segment. A trailing `/*` matches the rest of the path, slashes included, under the
 * key `*`: what a route serving a folder's files needs, since a file can sit any depth below it.
 */
function pathToRegex(path: string, keys: string[]): RegExp {
  const rest = path.endsWith("/*");
  const pattern = (rest ? path.slice(0, -2) : path).replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  if (!rest) return new RegExp(`^${pattern}$`);
  keys.push("*");
  return new RegExp(`^${pattern}/(.*)$`);
}
