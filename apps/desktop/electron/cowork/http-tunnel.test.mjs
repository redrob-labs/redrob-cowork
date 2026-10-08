import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";

import { COWORK_ALPN, serveTunnelConnection, startLoopbackProxy } from "./http-tunnel.mjs";

/**
 * Two real iroh endpoints on this machine, relays off, talking directly: the same code paths a
 * room uses, minus the relay. Skipped where the native binding is not installed for the platform.
 */
let iroh = null;
try {
  iroh = await import("@number0/iroh");
} catch {
  iroh = null;
}

describe("HTTP over iroh", { skip: iroh ? false : "@number0/iroh is not installed for this platform" }, () => {
  let upstream;
  let upstreamUrl;
  let host;
  let guest;
  let proxy;
  const seen = [];

  before(async () => {
    upstream = http.createServer((request, response) => {
      seen.push({ method: request.method, url: request.url, headers: request.headers });
      if (request.url === "/events") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write("data: one\n\n");
        setTimeout(() => {
          response.write("data: two\n\n");
          response.end();
        }, 300);
        return;
      }
      if (request.url === "/big") {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end(Buffer.alloc(1024 * 1024, 7));
        return;
      }
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        response.writeHead(request.url === "/missing" ? 404 : 200, { "content-type": "application/json" });
        response.end(JSON.stringify({ method: request.method, url: request.url, body }));
      });
    });
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    upstreamUrl = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (upstream.address()).port}`;

    const bind = async () => {
      const builder = iroh.Endpoint.builder();
      iroh.presetMinimal(builder);
      builder.relayMode(iroh.RelayMode.disabled());
      builder.alpns([COWORK_ALPN]);
      builder.bindAddr("127.0.0.1:0");
      return builder.bind();
    };
    host = await bind();
    guest = await bind();
    void (async () => {
      for (;;) {
        const incoming = await host.acceptNext().catch(() => null);
        if (!incoming) return;
        const connection = await (await incoming.accept()).connect();
        void serveTunnelConnection(connection, { target: upstreamUrl, allowPath: (_method, path) => !path.startsWith("/forbidden") });
      }
    })();
    const addr = new iroh.EndpointAddr(host.id(), null, host.boundSockets());
    const connection = await guest.connect(addr, COWORK_ALPN);
    proxy = await startLoopbackProxy(connection);
  });

  after(async () => {
    await proxy?.close();
    await guest?.close();
    await host?.close();
    await new Promise((resolve) => upstream?.close(resolve));
  });

  it("carries a request and its answer, with the host's endpoint header and never the guest's", async () => {
    const response = await fetch(`${proxy.url}/hello?x=1`, { headers: { authorization: "Bearer t", "x-redrob-endpoint-id": "forged", "x-redrob-host-token": "stolen" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { method: "GET", url: "/hello?x=1", body: "" });
    const last = seen.at(-1);
    assert.equal(last.headers.authorization, "Bearer t");
    assert.equal(last.headers["x-redrob-endpoint-id"], guest.id().toString());
    assert.equal(last.headers["x-redrob-host-token"], undefined);
  });

  it("carries a body and the upstream status", async () => {
    const response = await fetch(`${proxy.url}/missing`, { method: "POST", body: JSON.stringify({ a: 1 }), headers: { "content-type": "application/json" } });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).body, '{"a":1}');
  });

  it("streams server-sent events as they come, not at the end", async () => {
    const started = Date.now();
    const response = await fetch(`${proxy.url}/events`);
    const reader = response.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /data: one/);
    assert.ok(Date.now() - started < 300, "the first event arrived before the stream ended");
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    assert.match(rest, /data: two/);
  });

  it("carries a megabyte intact", async () => {
    const response = await fetch(`${proxy.url}/big`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes.length, 1024 * 1024);
    assert.ok(bytes.every((byte) => byte === 7));
  });

  it("refuses a path the host does not expose", async () => {
    const response = await fetch(`${proxy.url}/forbidden/thing`);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "tunnel_forbidden");
  });
});
