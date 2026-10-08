import http from "node:http";

/**
 * HTTP over an iroh QUIC connection, both ways, for live co-working.
 *
 * Each HTTP request is one bidirectional stream. The guest writes a head frame (method, path,
 * headers), then the body, then finishes its side; the host writes a head frame (status, headers),
 * then the response body as it arrives (so server-sent events stream), then finishes. A head frame
 * is a 4-byte big-endian length and that many bytes of JSON.
 *
 * The transport is iroh's (QUIC with TLS 1.3, end to end, direct when possible, relayed when not),
 * so nothing here encrypts or authenticates: the host trusts the connection's remote endpoint id,
 * which iroh has already proven, and nothing the guest says about itself.
 *
 * See docs/features/handoff-and-live-coworking/README.md, "Shape".
 */

export const COWORK_ALPN = Array.from(Buffer.from("redrob-cowork/1"));

/** Never forwarded from a guest: hop-by-hop headers, and the identity the host sets itself. */
const DROPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "x-redrob-host-token",
  "x-redrob-endpoint-id",
  "x-redrob-client-id",
  "origin",
  "referer",
]);
const DROPPED_RESPONSE_HEADERS = new Set(["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding"]);

export const TUNNEL_LIMITS = {
  headBytes: 64 * 1024,
  requestBodyBytes: 70 * 1024 * 1024,
  chunkBytes: 64 * 1024,
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function writeHead(send, value) {
  const json = encoder.encode(JSON.stringify(value));
  if (json.length > TUNNEL_LIMITS.headBytes) throw new Error("tunnel head too large");
  const frame = new Uint8Array(4 + json.length);
  new DataView(frame.buffer).setUint32(0, json.length);
  frame.set(json, 4);
  await send.writeAll(Array.from(frame));
}

export async function readHead(recv) {
  const lengthBytes = Uint8Array.from(await recv.readExact(4));
  const length = new DataView(lengthBytes.buffer).getUint32(0);
  if (length > TUNNEL_LIMITS.headBytes) throw new Error("tunnel head too large");
  return JSON.parse(decoder.decode(Uint8Array.from(await recv.readExact(length))));
}

function filterHeaders(headers, dropped) {
  const out = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (dropped.has(key) || typeof value !== "string") continue;
    out[key] = value;
  }
  return out;
}

/**
 * Host side: answers tunnelled requests by calling `target` (the local redrob-server) with the
 * guest's request, adding `x-redrob-endpoint-id` from the connection. `allowPath` can refuse a path
 * before it reaches the server; the server applies the guest token's own rules after.
 */
export async function serveTunnelConnection(connection, options) {
  const remoteId = connection.remoteId().toString();
  const fetchImpl = options.fetch ?? globalThis.fetch;
  for (;;) {
    let stream;
    try {
      stream = await connection.acceptBi();
    } catch {
      return;
    }
    void handleStream(stream, remoteId, options, fetchImpl).catch(() => undefined);
  }
}

async function handleStream(stream, remoteId, options, fetchImpl) {
  const respond = async (status, body) => {
    await writeHead(stream.send, { status, headers: { "content-type": "application/json" } });
    await stream.send.writeAll(Array.from(encoder.encode(JSON.stringify(body))));
    await stream.send.finish();
  };
  let head;
  try {
    head = await readHead(stream.recv);
  } catch {
    return respond(400, { code: "tunnel_bad_request", message: "Malformed tunnel request" });
  }
  const method = typeof head.method === "string" ? head.method.toUpperCase() : "GET";
  const path = typeof head.path === "string" && head.path.startsWith("/") && !head.path.startsWith("//") ? head.path : null;
  if (!path) return respond(400, { code: "tunnel_bad_request", message: "Malformed tunnel request" });
  if (options.allowPath && !options.allowPath(method, path, remoteId)) {
    return respond(403, { code: "tunnel_forbidden", message: "Not reachable through a live room" });
  }
  const bodyBytes = method === "GET" || method === "HEAD" ? [] : await stream.recv.readToEnd(TUNNEL_LIMITS.requestBodyBytes);
  const headers = { ...filterHeaders(head.headers, DROPPED_REQUEST_HEADERS), "x-redrob-endpoint-id": remoteId };
  const controller = new AbortController();
  let response;
  try {
    response = await fetchImpl(new URL(path, options.target), {
      method,
      headers,
      ...(bodyBytes.length ? { body: Uint8Array.from(bodyBytes) } : {}),
      signal: controller.signal,
    });
  } catch {
    return respond(502, { code: "tunnel_upstream_unreachable", message: "The host's Redrob Cowork did not answer" });
  }
  const responseHeaders = {};
  response.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders[name] = value;
  });
  await writeHead(stream.send, { status: response.status, headers: responseHeaders });
  // When the guest stops reading, the next write fails and the upstream request is aborted below,
  // so an event stream does not run on. (Waiting on `stopped()` instead would hold the stream's
  // lock in the binding and block the writes.)
  if (response.body) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let offset = 0; offset < value.length; offset += TUNNEL_LIMITS.chunkBytes) {
          await stream.send.writeAll(Array.from(value.subarray(offset, offset + TUNNEL_LIMITS.chunkBytes)));
        }
      }
    } catch {
      controller.abort();
      await stream.send.reset(0n).catch(() => undefined);
      return;
    }
  }
  await stream.send.finish().catch(() => undefined);
}

/**
 * Guest side: a plain HTTP server on 127.0.0.1 whose every request goes over `connection`. The app
 * talks to it exactly as it talks to any remote Redrob workspace.
 */
export async function startLoopbackProxy(connection, options = {}) {
  const server = http.createServer((request, response) => {
    void forward(connection, request, response).catch(() => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "tunnel_failed", message: "The connection to the host was lost" }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > TUNNEL_LIMITS.requestBodyBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function forward(connection, request, response) {
  const method = (request.method ?? "GET").toUpperCase();
  const body = method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readRequestBody(request);
  const stream = await connection.openBi();
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers[name] = value;
  }
  await writeHead(stream.send, { method, path: request.url ?? "/", headers });
  for (let offset = 0; offset < body.length; offset += TUNNEL_LIMITS.chunkBytes) {
    await stream.send.writeAll(Array.from(body.subarray(offset, offset + TUNNEL_LIMITS.chunkBytes)));
  }
  await stream.send.finish();
  const head = await readHead(stream.recv);
  response.writeHead(head.status ?? 502, filterHeaders(head.headers, DROPPED_RESPONSE_HEADERS));
  response.flushHeaders?.();
  request.once("close", () => void stream.recv.stop(0n).catch(() => undefined));
  for (;;) {
    let chunk;
    try {
      chunk = await stream.recv.read(TUNNEL_LIMITS.chunkBytes);
    } catch {
      break;
    }
    if (!chunk || chunk.length === 0) break;
    if (!response.write(Buffer.from(chunk))) await new Promise((resolve) => response.once("drain", resolve));
  }
  response.end();
}
