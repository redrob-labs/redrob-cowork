/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, Radio, Skeleton, Textarea, icons } from "@redrob-labs/ui";

import { RedrobServerError, type RedrobHandoffPreview } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import { useDeskConnection, type DeskHandoffClient } from "../shell/desk-connection";
import { DeskDialog } from "../shell/desk-dialog";
import { useFrameStore } from "../store/frame-store";
import {
  HANDOFF_ASKS,
  askLabel,
  downloadBytes,
  entryLabel,
  findingKindLabel,
  findingWhere,
  formatBytes,
  handoffRequest,
  initialChoices,
  liveFindings,
  optionalEntries,
  toggle,
  type HandoffChoices,
} from "./handoff-logic";



const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };

export type HandoffFormProps = {
  preview: RedrobHandoffPreview;
  choices: HandoffChoices;
  onChange: (next: HandoffChoices) => void;
  /** Adding a read file changes what goes, so it asks for a new preview. */
  onIncludeRead: (paths: string[]) => void;
};

/** Everything the sender decides: who, why, what goes, and what to do with each secret. */
export function HandoffForm(props: HandoffFormProps) {
  const { preview, choices, onChange } = props;
  const { files, library } = optionalEntries(preview);
  const findings = liveFindings(preview, choices.exclude);
  const set = (patch: Partial<HandoffChoices>) => onChange({ ...choices, ...patch });
  return (
    <div className="desk-handoff">
      <p className="desk-hint">{t("desk.handoff_lede")}</p>
      <fieldset className="desk-handoff__group">
        <legend>{t("desk.handoff_ask_label")}</legend>
        {HANDOFF_ASKS.map((ask) => (
          <Radio key={ask} name="desk-handoff-ask" value={ask} label={askLabel(ask)} checked={choices.ask === ask} onChange={() => set({ ask })} />
        ))}
      </fieldset>
      <Input id="desk-handoff-to" label={t("desk.handoff_to_label")} hint={t("desk.handoff_to_hint")} value={choices.to} onChange={(event) => set({ to: event.target.value })} />
      <Textarea id="desk-handoff-note" label={t("desk.handoff_note_label")} rows={3} value={choices.note} onChange={(event) => set({ note: event.target.value })} />

      <section className="desk-handoff__group" aria-labelledby="desk-handoff-contents">
        <b id="desk-handoff-contents">{t("desk.handoff_contents_title")}</b>
        <p className="desk-hint">{t("desk.handoff_contents_always")}</p>
        {files.map((entry) => (
          <Checkbox
            key={entry.path}
            label={`${entryLabel(entry.path)} · ${formatBytes(entry.bytes)}`}
            hint={entry.kind === "read" ? t("desk.handoff_file_read") : t("desk.handoff_file_produced")}
            checked={!choices.exclude.includes(entry.path)}
            onChange={(event) => set({ exclude: toggle(choices.exclude, entry.path, !event.currentTarget.checked) })}
          />
        ))}
        {library.map((entry) => (
          <Checkbox
            key={entry.path}
            label={entryLabel(entry.path)}
            hint={entry.kind === "skill" ? t("desk.handoff_skill") : t("desk.handoff_playbook")}
            checked={!choices.exclude.includes(entry.path)}
            onChange={(event) => set({ exclude: toggle(choices.exclude, entry.path, !event.currentTarget.checked) })}
          />
        ))}
        {preview.readCandidates.filter((path) => !files.some((entry) => entry.path === `files/${path}`)).length > 0 ? (
          <div className="desk-handoff__group">
            <p className="desk-hint">{t("desk.handoff_read_offer")}</p>
            {preview.readCandidates
              .filter((path) => !files.some((entry) => entry.path === `files/${path}`))
              .map((path) => (
                <Checkbox
                  key={path}
                  label={path}
                  checked={choices.includeRead.includes(path)}
                  onChange={(event) => props.onIncludeRead(toggle(choices.includeRead, path, event.currentTarget.checked))}
                />
              ))}
          </div>
        ) : null}
        {preview.missing.length > 0 ? <p className="desk-hint">{t("desk.handoff_missing", { names: preview.missing.join(", ") })}</p> : null}
      </section>

      {findings.length > 0 ? (
        <Alert tone="warning" title={t("desk.handoff_secrets_title", { count: findings.length })}>
          <p>{t("desk.handoff_secrets_text")}</p>
          <ul className="desk-handoff__findings">
            {findings.map((finding) => (
              <li key={finding.id}>
                <Checkbox
                  label={`${findingKindLabel(finding.kind)}: ${finding.masked}`}
                  hint={`${findingWhere(finding)} · ${t("desk.handoff_keep_value")}`}
                  checked={choices.keep.includes(finding.id)}
                  onChange={(event) => set({ keep: toggle(choices.keep, finding.id, event.currentTarget.checked) })}
                />
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {preview.unscanned.filter((path) => !choices.exclude.includes(path)).length > 0 ? (
        <Alert tone="info" title={t("desk.handoff_unscanned_title")}>
          {t("desk.handoff_unscanned_text", {
            names: preview.unscanned.filter((path) => !choices.exclude.includes(path)).map(entryLabel).join(", "),
          })}
        </Alert>
      ) : null}
      <p className="desk-settings__note">
        {icons.lock(BUTTON_ICON)}
        {t("desk.handoff_privacy_note")}
      </p>
    </div>
  );
}

/** Why a handoff could not be made, in words a person can act on. */
export function handoffFailureText(error: unknown): string {
  if (error instanceof RedrobServerError) {
    if (error.code === "handoff_preview_stale") return t("desk.handoff_failed_stale");
    if (error.code === "handoff_too_large") return t("desk.handoff_failed_large");
    if (error.code === "engine_export_failed" || error.code === "engine_export_invalid") return t("desk.handoff_failed_engine");
  }
  return t("desk.settings_try_again");
}

export function HandoffDialog(props: { client: DeskHandoffClient; workspaceId: string; sessionId: string; onClose: () => void }) {
  const showToast = useFrameStore((state) => state.showToast);
  const [preview, setPreview] = useState<RedrobHandoffPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<HandoffChoices>(initialChoices);
  const [busy, setBusy] = useState(false);
  const { client, workspaceId, sessionId } = props;

  const load = (includeRead: string[]) => {
    setBusy(true);
    setError(null);
    client
      .previewHandoff(workspaceId, sessionId, { includeRead })
      .then((next) => {
        setPreview(next);
        setChoices((current) => ({ ...current, includeRead, keep: current.keep.filter((id) => next.findings.some((finding) => finding.id === id)) }));
      })
      .catch((reason: unknown) => setError(handoffFailureText(reason)))
      .finally(() => setBusy(false));
  };

  useEffect(() => load([]), [workspaceId, sessionId]);

  const send = () => {
    if (!preview) return;
    setBusy(true);
    client
      .createHandoff(workspaceId, sessionId, handoffRequest(choices, preview.fingerprint))
      .then((file) => {
        downloadBytes(file.filename ?? "handoff.redrobhandoff", file.data, "application/zip");
        showToast(t("desk.handoff_saved_title"), t("desk.handoff_saved_text"));
        props.onClose();
      })
      .catch((reason: unknown) => {
        // A stale preview is refreshed in place, so the next press works.
        if (reason instanceof RedrobServerError && reason.code === "handoff_preview_stale") load(choices.includeRead);
        setError(handoffFailureText(reason));
      })
      .finally(() => setBusy(false));
  };

  return (
    <DeskDialog
      open
      title={t("desk.handoff_title")}
      onClose={props.onClose}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!preview} onClick={send}>
            {t("desk.handoff_save")}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger" title={t("desk.handoff_failed")}>{error}</Alert> : null}
      {preview ? (
        <HandoffForm preview={preview} choices={choices} onChange={setChoices} onIncludeRead={load} />
      ) : !error ? (
        <Skeleton variant="text" lines={6} />
      ) : null}
    </DeskDialog>
  );
}

/** "Hand off" in the chat's header, for a chat on this computer. */
export function HandoffAction(props: { chatId: string | null }) {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const workspaceRoot = useDeskConnection((state) => state.workspaceRoot);
  const [open, setOpen] = useState(false);
  if (!client || !workspaceId || !workspaceRoot || !props.chatId) return null;
  return (
    <>
      <Button size="sm" variant="ghost" iconLeft={icons.share(BUTTON_ICON)} onClick={() => setOpen(true)}>
        {t("desk.handoff_action")}
      </Button>
      {open ? <HandoffDialog client={client} workspaceId={workspaceId} sessionId={props.chatId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
