/** @jsxImportSource react */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input } from "@redrob-labs/ui";

import { downloadTextAsFile } from "../../../app/lib/download";
import { t } from "../../../i18n";
import { Group, Row } from "../settings/desk-settings";
import { DeskDialog } from "../shell/desk-dialog";
import { useDeskConnection } from "../shell/desk-connection";
import { privacyLevelLabel } from "../shell/nav";
import { useFrameStore } from "../store/frame-store";
import { buildTeamFile, teamFileName, applyTeamFile, reviewTeamFile, type TeamReview } from "./team-file";

export type TeamFileViewProps = {
  name: string;
  busy: boolean;
  onName: (name: string) => void;
  onShare: () => void;
  onUse: () => void;
};

/** Share this workspace as a team file, or set this one up from a team file. */
export function TeamFileView(props: TeamFileViewProps) {
  return (
    <Group title={t("desk.team_title")}>
      <Row title={t("desk.team_share_title")} description={t("desk.team_share_text")}>
        <div className="flex flex-col gap-2">
          <Input
            id="desk-team-name"
            label={t("desk.team_name_label")}
            value={props.name}
            onChange={(event) => props.onName(event.target.value)}
          />
          <div>
            <Button size="sm" variant="secondary" loading={props.busy} onClick={props.onShare}>
              {t("desk.team_share")}
            </Button>
          </div>
        </div>
      </Row>
      <Row title={t("desk.team_use_title")} description={t("desk.team_use_text")}>
        <Button size="sm" variant="secondary" loading={props.busy} onClick={props.onUse}>
          {t("desk.team_use")}
        </Button>
      </Row>
    </Group>
  );
}

/** What a team file would change, in words. The parts that can run things come first. */
export function TeamReviewBody(props: { review: TeamReview }) {
  const { review } = props;
  const programs = review.connectors.filter((connector) => connector.runsProgram);
  const risky = programs.length > 0 || review.plugins.length > 0 || review.permissions;
  const setBy = review.team.privacy.setBy;
  const items = [
    t("desk.team_review_level", { level: privacyLevelLabel(review.team.privacy.level) }),
    setBy ? t("desk.team_review_set_by", { name: setBy }) : t("desk.team_review_set_by_unknown"),
    t("desk.team_review_notes", { added: review.notesAdded, removed: review.notesRemoved }),
    t("desk.team_review_playbooks", { playbooks: review.playbooks, skills: review.skills }),
    ...(review.connectors.length ? [t("desk.team_review_connectors", { names: review.connectors.map((connector) => connector.name).join(", ") })] : []),
    t("desk.team_review_changes", { count: review.changes }),
  ];
  return (
    <div className="flex flex-col gap-3">
      {risky ? (
        <Alert tone="warning" title={t("desk.team_review_risky_title")}>
          <ul className="list-disc pl-5">
            {programs.length ? <li>{t("desk.team_review_programs", { names: programs.map((connector) => connector.name).join(", ") })}</li> : null}
            {review.plugins.length ? <li>{t("desk.team_review_plugins", { names: review.plugins.join(", ") })}</li> : null}
            {review.permissions ? <li>{t("desk.team_review_permissions")}</li> : null}
          </ul>
          <p>{t("desk.team_review_risky_text")}</p>
        </Alert>
      ) : null}
      <ul className="list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>{t("desk.team_review_trust")}</p>
    </div>
  );
}

/** The team file group, wired to the open workspace. Nothing to show without one. */
export function TeamFileGroup() {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<TeamReview | null>(null);
  if (!client || !workspaceId) return null;

  const share = async () => {
    setBusy(true);
    try {
      const file = await buildTeamFile(client, workspaceId, name);
      downloadTextAsFile(teamFileName(), JSON.stringify(file, null, 2), "application/json");
      showToast(t("desk.team_shared_title"), t("desk.team_shared_text", { name: teamFileName() }));
    } catch {
      showToast(t("desk.team_failed"), t("desk.settings_try_again"), "danger");
    } finally {
      setBusy(false);
    }
  };

  // First what the file would change, without changing anything.
  const pick = async (picked: File) => {
    setBusy(true);
    try {
      setReview(await reviewTeamFile(client, workspaceId, JSON.parse(await picked.text())));
    } catch {
      showToast(t("desk.team_use_failed"), t("desk.team_use_failed_text"), "danger");
    } finally {
      setBusy(false);
    }
  };

  const use = async (reviewed: TeamReview) => {
    setBusy(true);
    try {
      const result = await applyTeamFile(client, workspaceId, reviewed);
      // Notes, privacy and playbooks all changed under the screens that show them.
      await queryClient.invalidateQueries();
      showToast(t("desk.team_used_title"), t("desk.team_used_text", { count: result.notesAdded }));
    } catch {
      showToast(t("desk.team_use_failed"), t("desk.team_use_failed_text"), "danger");
    } finally {
      setBusy(false);
      setReview(null);
    }
  };

  return (
    <>
      <TeamFileView name={name} busy={busy} onName={setName} onShare={() => void share()} onUse={() => input.current?.click()} />
      {review ? (
        <DeskDialog
          open
          title={t("desk.team_review_title")}
          onClose={() => setReview(null)}
          width={560}
          footer={
            <>
              <Button variant="ghost" onClick={() => setReview(null)}>
                {t("desk.team_review_cancel")}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void use(review)}>
                {t("desk.team_review_confirm")}
              </Button>
            </>
          }
        >
          <TeamReviewBody review={review} />
        </DeskDialog>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (picked) void pick(picked);
        }}
      />
    </>
  );
}
