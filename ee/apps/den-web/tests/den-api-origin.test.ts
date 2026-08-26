import { describe, expect, test } from "bun:test";

import { denApiCredentialsForEndpoint, denApiEndpointForWebOrigin, denApiOriginForWebOrigin } from "../app/(den)/_lib/den-api-origin";

describe("Den API browser origin", () => {
  test("prefixes the hosted app origin with the api subdomain", () => {
    expect(denApiOriginForWebOrigin("https://app.redrob.io")).toBe("https://api.app.redrob.io");
  });

  test("prefixes custom web hosts with the api subdomain", () => {
    expect(denApiOriginForWebOrigin("https://den.example.com")).toBe("https://api.den.example.com");
  });

  test("leaves existing api hosts stable", () => {
    expect(denApiOriginForWebOrigin("https://api.redrob.io")).toBe("https://api.redrob.io");
  });

  test("builds direct API URLs instead of same-origin Den proxy URLs", () => {
    expect(denApiEndpointForWebOrigin("/v1/me", "https://app.redrob.io")).toBe("https://api.app.redrob.io/v1/me");
  });

  test("keeps Better Auth traffic on the same-origin auth proxy", () => {
    expect(denApiEndpointForWebOrigin("/api/auth/sign-in/email", "https://app.redrob.io")).toBe("/api/auth/sign-in/email");
    expect(denApiEndpointForWebOrigin("/api/auth/callback/google?code=provider-token", "https://app.redrob.io")).toBe(
      "/api/auth/callback/google?code=provider-token",
    );
  });

  test("includes cookies for same-site direct API-origin browser requests", () => {
    expect(denApiCredentialsForEndpoint("https://api.app.redrob.io/v1/me", "https://app.redrob.io")).toBe("include");
    expect(denApiCredentialsForEndpoint("/api/runtime-config", "https://app.redrob.io")).toBe("include");
    expect(denApiCredentialsForEndpoint("https://external.example.com/v1/me", "https://app.redrob.io")).toBe("omit");
  });

  test("omits cookies for public direct API endpoints", () => {
    expect(denApiCredentialsForEndpoint(
      "https://api.app.redrob.io/v1/orgs/sso/resolve?email=omar%40redrob.io",
      "https://app.redrob.io",
      "/v1/orgs/sso/resolve?email=omar%40redrob.io",
    )).toBe("omit");
  });
});
