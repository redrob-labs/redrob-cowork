import { expect, test } from "bun:test";
import {
  getDesktopGrant,
  getDesktopHandoffGrant,
  getDesktopHandoffRedrobUrl,
} from "../app/(den)/_lib/desktop-handoff";

test("preserves the complete Redrob Work desktop handoff URL", () => {
  const redrobUrl = "redrob://den-auth?grant=one-time-code&denBaseUrl=https%3A%2F%2Fapi.example.test";
  const payload = { grant: "one-time-code", redrobUrl };

  expect(getDesktopHandoffRedrobUrl(payload)).toBe(redrobUrl);
  expect(getDesktopHandoffGrant(payload, redrobUrl)).toBe("one-time-code");
});

test("extracts a one-time grant from an Redrob Work desktop handoff", () => {
  expect(
    getDesktopGrant(
      "redrob://den-auth?grant=one-time-code&baseUrl=https%3A%2F%2Fapi.example.test"
    )
  ).toBe("one-time-code");
});

test("rejects missing and malformed desktop handoffs", () => {
  expect(
    getDesktopGrant(
      "redrob://den-auth?baseUrl=https%3A%2F%2Fapi.example.test"
    )
  ).toBeNull();
  expect(getDesktopGrant("not a url")).toBeNull();
  expect(getDesktopGrant(null)).toBeNull();
});
