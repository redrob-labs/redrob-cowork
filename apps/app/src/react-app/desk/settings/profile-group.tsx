/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, NameInput } from "@redrob-labs/ui";

import type { RedrobParticipantProfile } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import { useDeskConnection, type DeskProfileClient } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";
import { Group, Row } from "./desk-settings";

/** Shared with the handoff and live chat screens, which show the same name. */
export const PROFILE_QUERY_KEY: readonly string[] = ["desk", "profile"];

/** Mirrors DISPLAY_NAME_MAX_LENGTH in apps/server/src/participant-profile.ts. */
/** Matches the design system's NameInput: a real name can be long. */
export const DISPLAY_NAME_MAX_LENGTH = 120;

/** What will be saved: whitespace runs collapsed and trimmed, the same rule the server applies. */
export function cleanDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Whether Save would change anything and would be accepted. */
export function canSaveDisplayName(draft: string, saved: string): boolean {
  const next = cleanDisplayName(draft);
  return next !== saved && Array.from(next).length <= DISPLAY_NAME_MAX_LENGTH;
}

export type ProfileViewProps = {
  draft: string;
  saved: string;
  busy: boolean;
  onDraft: (value: string) => void;
  onSave: () => void;
};

/** Your name, as teammates see it on what you hand off and in chats you share. */
export function ProfileView(props: ProfileViewProps) {
  const save = canSaveDisplayName(props.draft, props.saved);
  return (
    <Group title={t("desk.profile_title")}>
      <Row title={t("desk.profile_name")} description={t("desk.profile_name_text")}>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (save) props.onSave();
          }}
        >
          <NameInput
            id="desk-profile-name"
            size="sm"
            label={t("desk.profile_name_label")}
            hint={t("desk.profile_name_hint")}
            required={false}
            value={{ full: props.draft }}
            onChange={(value) => props.onDraft(value.full ?? "")}
          />
          <Button type="submit" size="sm" variant="secondary" loading={props.busy} disabled={!save}>
            {t("common.save")}
          </Button>
        </form>
      </Row>
    </Group>
  );
}

/** The profile group, wired to the local server. Nothing to show before a chat has connected. */
export function ProfileGroup() {
  const client = useDeskConnection((state) => state.client);
  if (!client) return null;
  return <ConnectedProfileGroup client={client} />;
}

function ConnectedProfileGroup(props: { client: DeskProfileClient }) {
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => props.client.getProfile(), staleTime: 60_000 });
  const saved = profile.data?.displayName ?? "";
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);

  // The field follows the stored name until the person starts typing over it.
  useEffect(() => setDraft(saved), [saved]);

  if (profile.isError) return null;

  const onSave = () => {
    setBusy(true);
    props.client
      .updateProfile({ displayName: cleanDisplayName(draft) })
      .then((next: RedrobParticipantProfile) => {
        queryClient.setQueryData(PROFILE_QUERY_KEY, next);
        showToast(t("desk.profile_saved"));
      })
      .catch(() => showToast(t("desk.profile_save_failed"), t("desk.settings_try_again"), "danger"))
      .finally(() => setBusy(false));
  };

  return <ProfileView draft={draft} saved={saved} busy={busy || profile.isLoading} onDraft={setDraft} onSave={onSave} />;
}
