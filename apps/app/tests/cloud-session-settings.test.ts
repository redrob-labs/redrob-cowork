import { describe, expect, test } from "bun:test";

import { cloudSessionOrganizationFromSettings } from "../src/react-app/domains/settings/cloud/cloud-session-provider";

describe("Cloud session settings projection", () => {
  test("restores the persisted active organization for late settings updates", () => {
    expect(cloudSessionOrganizationFromSettings({
      activeOrgId: " org_123 ",
      activeOrgName: " Redrob Work Labs ",
      activeOrgSlug: " redrob-labs ",
    })).toEqual({
      id: "org_123",
      name: "Redrob Work Labs",
      role: "member",
      slug: "redrob-labs",
    });
  });

  test("does not invent an organization before one is persisted", () => {
    expect(cloudSessionOrganizationFromSettings({
      activeOrgId: null,
      activeOrgName: null,
      activeOrgSlug: null,
    })).toBeNull();
  });
});
