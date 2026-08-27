import { describe, expect, test } from "bun:test";

import { normalizeOrganizationServerInput } from "../src/app/lib/organization-server-input";

describe("normalizeOrganizationServerInput", () => {
  test("normalizes full URLs and bare hostnames to their origin", () => {
    expect(normalizeOrganizationServerInput("https://redrob.acme.com/werpiweur")).toBe(
      "https://redrob.acme.com",
    );
    expect(normalizeOrganizationServerInput("  redrob.acme.com  ")).toBe(
      "https://redrob.acme.com",
    );
    expect(normalizeOrganizationServerInput("http://localhost:3005/dashboard?x=1#y")).toBe(
      "http://localhost:3005",
    );
    expect(normalizeOrganizationServerInput("https://redrob.acme.com:8443/path")).toBe(
      "https://redrob.acme.com:8443",
    );
  });

  test("allows http only for loopback hosts", () => {
    expect(normalizeOrganizationServerInput("http://localhost:3005")).toBe(
      "http://localhost:3005",
    );
    expect(normalizeOrganizationServerInput("http://127.0.0.1")).toBe(
      "http://127.0.0.1",
    );
    expect(normalizeOrganizationServerInput("http://127.42.7.9:8080")).toBe(
      "http://127.42.7.9:8080",
    );
    expect(normalizeOrganizationServerInput("http://[::1]:3005")).toBe(
      "http://[::1]:3005",
    );
    expect(normalizeOrganizationServerInput("http://redrob.acme.com")).toBeNull();
    expect(normalizeOrganizationServerInput("http://den.internal:8080")).toBeNull();
  });

  test("keeps https available for non-loopback hosts", () => {
    expect(normalizeOrganizationServerInput("https://redrob.acme.com")).toBe(
      "https://redrob.acme.com",
    );
    expect(normalizeOrganizationServerInput("https://den.internal:8080/path")).toBe(
      "https://den.internal:8080",
    );
  });

  test("rejects unsupported schemes, empty values, and malformed input", () => {
    expect(normalizeOrganizationServerInput("ftp://redrob.acme.com")).toBeNull();
    expect(normalizeOrganizationServerInput("")).toBeNull();
    expect(normalizeOrganizationServerInput("not a url at all")).toBeNull();
    expect(normalizeOrganizationServerInput("https://")).toBeNull();
  });

  test("rejects URL-parser userinfo and backslash oddities", () => {
    expect(normalizeOrganizationServerInput("https://admin@redrob.acme.com")).toBeNull();
    expect(normalizeOrganizationServerInput("https://admin:secret@redrob.acme.com/path")).toBeNull();
    expect(normalizeOrganizationServerInput("https:\\redrob.acme.com\\dashboard")).toBeNull();
    expect(normalizeOrganizationServerInput("redrob.acme.com\\@attacker.example")).toBeNull();
  });
});
