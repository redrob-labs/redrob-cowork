import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { RedrobServerError, type RedrobTeamPolicyStatus } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import {
  TeamPolicyView,
  teamPolicyErrorToast,
  teamPolicyOutcomeToast,
} from "../src/react-app/desk/team/team-policy-group";

const noop = () => {};
const sync = (overrides: Partial<RedrobTeamPolicyStatus["sync"]> = {}): RedrobTeamPolicyStatus["sync"] => ({
  checkedAt: Date.parse("2026-10-06T09:00:00Z"),
  status: "unchanged",
  code: null,
  lastSuccessAt: Date.parse("2026-10-06T09:00:00Z"),
  stale: false,
  ...overrides,
});

const joined = (overrides: Partial<RedrobTeamPolicyStatus> = {}): RedrobTeamPolicyStatus => ({
  joined: true,
  accountId: "acc_team",
  version: 3,
  setBy: { userId: "usr_admin", name: "jiwon@example.com", role: "admin" },
  signedWithTestKey: false,
  privacy: { level: "high", locked: true },
  sync: sync(),
  ...overrides,
});

/** React escapes apostrophes in markup. */
const esc = (text: string) => text.replace(/'/g, "&#x27;");

const render = (status: RedrobTeamPolicyStatus | null) =>
  renderToStaticMarkup(<TeamPolicyView status={status} busy={false} onJoin={noop} onCheck={noop} onLeave={noop} />);

describe("the team policy in Settings", () => {
  test("before joining, it offers to follow the team's policy", () => {
    const html = render({ joined: false, accountId: null, version: null, sync: sync({ checkedAt: null, status: null }) });
    expect(html).toContain(esc(t("desk.team_policy_join_title")));
    expect(html).toContain(t("desk.team_policy_join"));
    expect(html).not.toContain(t("desk.team_policy_leave"));
  });

  test("when following, it says who set it, verified, and offers to check or leave", () => {
    const html = render(joined());
    expect(html).toContain(t("desk.team_policy_set_by", { name: "jiwon@example.com", role: t("desk.team_policy_role_admin") }));
    expect(html).toContain("Version 3");
    expect(html).toContain(t("desk.team_policy_check"));
    expect(html).toContain(t("desk.team_policy_leave"));
    expect(html).not.toContain(t("desk.team_policy_stale_title"));
    expect(html).not.toContain(t("desk.team_policy_test_key"));
  });

  test("it says when the policy has not been checked for a week, and when a test key signed it", () => {
    const html = render(joined({ signedWithTestKey: true, sync: sync({ stale: true }) }));
    expect(html).toContain(t("desk.team_policy_stale_title"));
    expect(html).toContain(t("desk.team_policy_test_key"));
  });

  test("a quiet check on opening interrupts only for what changed or went wrong", () => {
    expect(teamPolicyOutcomeToast({ status: "unchanged" }, true)).toBeNull();
    expect(teamPolicyOutcomeToast({ status: "unreachable" }, true)).toBeNull();
    expect(teamPolicyOutcomeToast({ status: "applied", version: 4 }, true)?.[0]).toBe(t("desk.team_policy_applied_title"));
    expect(teamPolicyOutcomeToast({ status: "removed" }, true)?.[2]).toBe("danger");
    expect(teamPolicyOutcomeToast({ status: "refused", code: "team_policy_bad_signature" }, true)?.[1]).toBe(
      t("desk.team_policy_refused_text"),
    );
    expect(teamPolicyOutcomeToast({ status: "refused", code: "team_policy_other_team" }, false)?.[1]).toBe(
      t("desk.team_policy_refused_other_team"),
    );
    // Asked for, every answer says something.
    expect(teamPolicyOutcomeToast({ status: "unchanged" }, false)?.[0]).toBe(t("desk.team_policy_current_title"));
    expect(teamPolicyOutcomeToast({ status: "not_connected" }, false)?.[0]).toBe(t("desk.team_policy_no_key_title"));
  });

  test("a refusal from the server is explained, not a generic failure", () => {
    expect(teamPolicyErrorToast(new RedrobServerError(403, "forbidden", "Insufficient token scope"))[0]).toBe(
      t("desk.team_policy_owner_title"),
    );
    expect(teamPolicyErrorToast(new RedrobServerError(403, "write_denied", "denied"))[0]).toBe(t("desk.team_policy_denied_title"));
    expect(teamPolicyErrorToast(new Error("offline"))[0]).toBe(t("desk.team_policy_failed"));
  });
});
