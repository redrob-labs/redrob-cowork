/*
 * Signs team policies with the TEST keys in ./vectors/test-keys.json, for tests and for generating
 * the shared contract vectors. Never imported by server code: a packaged build has no reason to
 * sign anything, and these keys are public.
 */
import testKeys from "./vectors/test-keys.json" with { type: "json" };
import { TEAM_POLICY_JWS_TYPE } from "./jws.js";
import type { TeamPolicy } from "./policy.js";

type TestKid = "test-2026-10-active" | "test-2026-10-standby";

const b64 = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");

export async function signTestPolicy(
  payload: unknown,
  options: { kid?: TestKid | string; header?: Record<string, unknown>; signWith?: TestKid } = {},
): Promise<string> {
  const kid = options.kid ?? "test-2026-10-active";
  const signer = testKeys.keys.find((key) => key.kid === (options.signWith ?? kid)) ?? testKeys.keys[0]!;
  const header = { alg: "ES256", typ: TEAM_POLICY_JWS_TYPE, kid, ...options.header };
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey("jwk", signer.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)),
  );
  return `${input}.${b64(signature)}`;
}

export function samplePolicy(overrides: Partial<TeamPolicy> = {}): TeamPolicy {
  return {
    v: 2,
    accountId: "acc_vectors",
    version: 1,
    issuedAt: "2026-10-06T00:00:00.000Z",
    setBy: { userId: "usr_admin", name: "Park Hyunjin", role: "admin" },
    privacy: {
      level: "high",
      locked: true,
      names: [["김지원", "Jiwon Kim"], ["Acme Robotics"]],
      keep: { amounts: true, dates: true },
      transforms: {},
    },
    notes: [{ id: "note_1", text: "House style: numbered clauses" }],
    connectors: { allow: [{ name: "notes", type: "remote", url: "https://notes.example.com/mcp" }], allowLocalPrograms: false },
    skills: [{ name: "house-style", description: "House style", content: "Use numbered clauses." }],
    ...overrides,
  };
}
