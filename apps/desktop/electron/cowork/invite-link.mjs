/**
 * `redrob://join?h=<host endpoint>&r=<host's home relay>&w=<workspace>&s=<session>&k=<secret>`.
 *
 * Everything a guest's app needs to dial the host and knock. The secret is the only part worth
 * stealing, and it is single-use and lasts a day; the host still allows each knock by hand.
 * `a` (direct socket addresses) is only written by development builds, for two instances on one
 * machine with no relay; a packaged build neither writes nor reads it, so invites never carry a
 * LAN address.
 */

const ENDPOINT_ID = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const SOCKET_ADDR = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]):\d{1,5}$/;

function relayOk(value, allowHttp) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    return url.protocol === "https:" || (allowHttp && url.protocol === "http:");
  } catch {
    return false;
  }
}

/**
 * @param {{ scheme: string, endpointId: string, relayUrl: string | null, workspaceId: string, sessionId: string, secret: string, directAddresses?: string[] }} invite
 */
export function buildInviteLink({ scheme, endpointId, relayUrl, workspaceId, sessionId, secret, directAddresses }) {
  const params = new URLSearchParams({ h: endpointId, r: relayUrl ?? "", w: workspaceId, s: sessionId, k: secret });
  if (directAddresses?.length) params.set("a", directAddresses.join(","));
  return `${scheme}://join?${params.toString()}`;
}

/**
 * The invite in `link`, or null if it is not one or anything in it is off. `schemes` are the
 * protocol names this build answers to; `dev` allows http relays and direct addresses.
 */
/** @param {unknown} link @param {{ schemes: string[], dev?: boolean }} options */
export function parseInviteLink(link, { schemes, dev = false }) {
  let url;
  try {
    url = new URL(String(link ?? "").trim());
  } catch {
    return null;
  }
  const scheme = url.protocol.replace(/:$/, "");
  // `redrob://join?...` parses with host "join"; `redrob:join?...` with pathname "join".
  const route = url.host || url.pathname.replace(/^\/+/, "");
  if (!schemes.includes(scheme) || route !== "join") return null;
  const get = (key) => url.searchParams.get(key) ?? "";
  const invite = {
    endpointId: get("h").toLowerCase(),
    relayUrl: get("r") || null,
    workspaceId: get("w"),
    sessionId: get("s"),
    secret: get("k"),
    directAddresses: dev && get("a") ? get("a").split(",") : [],
  };
  if (!ENDPOINT_ID.test(invite.endpointId)) return null;
  if (!SAFE_ID.test(invite.workspaceId) || !SAFE_ID.test(invite.sessionId)) return null;
  if (!SECRET.test(invite.secret)) return null;
  if (invite.relayUrl && !relayOk(invite.relayUrl, dev)) return null;
  if (!invite.directAddresses.every((addr) => SOCKET_ADDR.test(addr))) return null;
  return invite;
}
