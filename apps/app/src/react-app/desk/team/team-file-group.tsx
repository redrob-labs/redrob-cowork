/** @jsxImportSource react */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "@redrob-labs/ui";

import { downloadTextAsFile } from "../../../app/lib/download";
import { t } from "../../../i18n";
import { Group, Row } from "../settings/desk-settings";
import { useDeskConnection } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";
import { buildTeamFile, teamFileName, applyTeamFile } from "./team-file";

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

/** The team file group, wired to the open workspace. Nothing to show without one. */
export function TeamFileGroup() {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
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

  const use = async (picked: File) => {
    setBusy(true);
    try {
      const result = await applyTeamFile(client, workspaceId, JSON.parse(await picked.text()));
      // Notes, privacy and playbooks all changed under the screens that show them.
      await queryClient.invalidateQueries();
      showToast(t("desk.team_used_title"), t("desk.team_used_text", { count: result.notesAdded }));
    } catch {
      showToast(t("desk.team_use_failed"), t("desk.team_use_failed_text"), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TeamFileView name={name} busy={busy} onName={setName} onShare={() => void share()} onUse={() => input.current?.click()} />
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
          if (picked) void use(picked);
        }}
      />
    </>
  );
}
