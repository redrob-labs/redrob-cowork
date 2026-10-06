/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "@redrob-labs/ui";

import {
  RedrobServerError,
  type RedrobTeamPolicyStatus,
  type RedrobTeamPolicySyncOutcome,
} from "../../../app/lib/redrob-server";
import { currentLocale, t } from "../../../i18n";
import { Group, Row } from "../settings/desk-settings";
import { useDeskConnection } from "../shell/desk-connection";
import { privacyLevelLabel } from "../shell/nav";
import { useFrameStore } from "../store/frame-store";

/*
 * The team policy, as the Team settings show it.
 *
 * What a person sees here comes from redrob-server, which verified the policy's signature before
 * applying it. So unlike a team file, "Set by" is a fact: the console put the publisher's account in
 * the signed policy. Joining, checking and leaving all go through the server; nothing here decides
 * what is locked.
 */

export type TeamPolicyViewProps = {
  status: RedrobTeamPolicyStatus | null;
  busy: boolean;
  onJoin: () => void;
  onCheck: () => void;
  onLeave: () => void;
};

const roleLabel = (role: string) =>
  role === "admin" ? t("desk.team_policy_role_admin") : role === "developer" ? t("desk.team_policy_role_developer") : t("desk.team_policy_role_viewer");

function formatWhen(ms: number | null | undefined): string {
  if (!ms) return t("desk.team_policy_never");
  return new Intl.DateTimeFormat(currentLocale() === "ko" ? "ko-KR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

export function TeamPolicyView(props: TeamPolicyViewProps) {
  const { status } = props;
  if (!status?.joined || !status.setBy) {
    return (
      <Group title={t("desk.team_policy_title")}>
        <Row title={t("desk.team_policy_join_title")} description={t("desk.team_policy_join_text")}>
          <Button size="sm" variant="secondary" loading={props.busy} onClick={props.onJoin}>
            {t("desk.team_policy_join")}
          </Button>
        </Row>
      </Group>
    );
  }

  const lines = [
    t("desk.team_policy_set_by", { name: status.setBy.name, role: roleLabel(status.setBy.role) }),
    t("desk.team_policy_version", { version: status.version ?? 0, when: formatWhen(status.sync.checkedAt) }),
    status.privacy
      ? t(status.privacy.locked ? "desk.team_policy_level_locked" : "desk.team_policy_level", {
          level: privacyLevelLabel(status.privacy.level),
        })
      : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <Group title={t("desk.team_policy_title")}>
      <Row title={t("desk.team_policy_following")} description={lines.join(" ")}>
        <div className="flex flex-col gap-2">
          {status.sync.stale ? (
            <Alert tone="warning" title={t("desk.team_policy_stale_title")}>
              {t("desk.team_policy_stale_text", { when: formatWhen(status.sync.lastSuccessAt) })}
            </Alert>
          ) : null}
          {status.signedWithTestKey ? <Alert tone="info">{t("desk.team_policy_test_key")}</Alert> : null}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={props.busy} onClick={props.onCheck}>
              {t("desk.team_policy_check")}
            </Button>
            <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onLeave}>
              {t("desk.team_policy_leave")}
            </Button>
          </div>
        </div>
      </Row>
    </Group>
  );
}

type Toast = [title: string, text: string, tone?: "danger"];

/** What a check's outcome tells the person. Null when there is nothing worth interrupting them for. */
export function teamPolicyOutcomeToast(outcome: RedrobTeamPolicySyncOutcome, quiet: boolean): Toast | null {
  switch (outcome.status) {
    case "applied":
      return [t("desk.team_policy_applied_title"), t("desk.team_policy_applied_text", { version: outcome.version ?? 0 })];
    case "unchanged":
    case "not_joined":
      return quiet ? null : [t("desk.team_policy_current_title"), t("desk.team_policy_current_text")];
    case "no_policy":
      return [t("desk.team_policy_none_title"), t("desk.team_policy_none_text")];
    case "not_connected":
      return [t("desk.team_policy_no_key_title"), t("desk.team_policy_no_key_text"), "danger"];
    case "not_member":
      return [t("desk.team_policy_key_refused_title"), t("desk.team_policy_key_refused_text"), "danger"];
    case "removed":
      return [t("desk.team_policy_removed_title"), t("desk.team_policy_removed_text"), "danger"];
    case "refused":
      return [
        t("desk.team_policy_refused_title"),
        outcome.code === "team_policy_other_team" ? t("desk.team_policy_refused_other_team") : t("desk.team_policy_refused_text"),
        "danger",
      ];
    case "unreachable":
      return quiet ? null : [t("desk.team_policy_unreachable_title"), t("desk.team_policy_unreachable_text"), "danger"];
  }
}

/** A request the server refused, in words. */
export function teamPolicyErrorToast(error: unknown): Toast {
  if (error instanceof RedrobServerError && error.status === 403) {
    if (error.code === "write_denied") return [t("desk.team_policy_denied_title"), t("desk.team_policy_denied_text"), "danger"];
    return [t("desk.team_policy_owner_title"), t("desk.team_policy_owner_text"), "danger"];
  }
  return [t("desk.team_policy_failed"), t("desk.settings_try_again"), "danger"];
}

export function TeamPolicyGroup() {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RedrobTeamPolicyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const checkedOnOpen = useRef<string | null>(null);

  const run = async (action: () => Promise<RedrobTeamPolicyStatus & { outcome?: RedrobTeamPolicySyncOutcome }>, quiet = false) => {
    setBusy(true);
    try {
      const next = await action();
      setStatus(next);
      const toast = next.outcome ? teamPolicyOutcomeToast(next.outcome, quiet) : null;
      if (toast) showToast(...toast);
      if (!next.outcome || next.outcome.status === "applied" || next.outcome.status === "removed") {
        // Notes, privacy, playbooks and skills may all have changed under the screens that show them.
        await queryClient.invalidateQueries();
      }
    } catch (error) {
      if (!quiet) showToast(...teamPolicyErrorToast(error));
    } finally {
      setBusy(false);
    }
  };

  // Opening the Team screen is one of the moments a joined workspace checks for a newer policy.
  useEffect(() => {
    if (!client || !workspaceId || checkedOnOpen.current === workspaceId) return;
    checkedOnOpen.current = workspaceId;
    void (async () => {
      const current = await client.getTeamPolicy(workspaceId).catch(() => null);
      setStatus(current);
      if (current?.joined) await run(() => client.syncTeamPolicy(workspaceId), true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, workspaceId]);

  if (!client || !workspaceId) return null;

  return (
    <TeamPolicyView
      status={status}
      busy={busy}
      onJoin={() => void run(() => client.syncTeamPolicy(workspaceId, { join: true }))}
      onCheck={() => void run(() => client.syncTeamPolicy(workspaceId))}
      onLeave={() =>
        void run(async () => {
          const left = await client.leaveTeamPolicy(workspaceId);
          showToast(t("desk.team_policy_left_title"), t("desk.team_policy_left_text"));
          return left;
        })
      }
    />
  );
}
