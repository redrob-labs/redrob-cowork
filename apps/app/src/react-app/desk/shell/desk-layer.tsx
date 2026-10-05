/** @jsxImportSource react */
import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button, Textarea, Toast } from "@redrob-labs/ui";

import { isMacPlatform } from "../../../app/utils";
import { t } from "../../../i18n";
import { usePlatform } from "../../kernel/platform";
import { useFrameStore, type FrameModal, type FrameToast } from "../store/frame-store";
import { APP_VERSION, versionLabel } from "./account-menu";
import { DeskDialog } from "./desk-dialog";
import { chatPath } from "./desk-routes";

/**
 * Key caps, printed as they are on the keyboard. Korean keyboards print the same Latin
 * labels, so these are not translated.
 */
const KEY = { ctrl: "Ctrl", cmd: "Cmd", shift: "Shift", enter: "Enter", esc: "Esc", b: "B", n: "N" };

export type ShortcutRow = { id: string; label: string; keys: string[] };

/** The rows of the shortcuts dialog, with Cmd in place of Ctrl on a Mac. */
export function shortcutRows(mac: boolean): ShortcutRow[] {
  const mod = mac ? KEY.cmd : KEY.ctrl;
  return [
    { id: "send", label: t("desk.shortcut_send"), keys: [KEY.enter] },
    { id: "new-line", label: t("desk.shortcut_new_line"), keys: [KEY.shift, KEY.enter] },
    { id: "browser", label: t("desk.shortcut_browser"), keys: [mod, KEY.shift, KEY.b] },
    { id: "new-chat", label: t("desk.nav_new_chat"), keys: [mod, KEY.n] },
    { id: "close-dialog", label: t("desk.shortcut_close_dialog"), keys: [KEY.esc] },
  ];
}

export function ShortcutsDialog(props: { mac: boolean; onClose: () => void }) {
  return (
    <DeskDialog open title={t("desk.account_shortcuts")} onClose={props.onClose} width={440}>
      <dl className="desk-keys">
        {shortcutRows(props.mac).map((row) => (
          <div key={row.id}>
            <dt>{row.label}</dt>
            <dd>
              {row.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="desk-hint">{t("desk.shortcuts_mac_note", { cmd: KEY.cmd, ctrl: KEY.ctrl })}</p>
    </DeskDialog>
  );
}

/** Where feedback goes: the support address of the desktop app. */
export const SUPPORT_EMAIL = "support@redrob.io";

/** An email to support with the note and the app version, nothing from the person's chats. */
export function feedbackMailto(text: string, version: string): string {
  const subject = encodeURIComponent(t("desk.feedback_subject"));
  const body = encodeURIComponent(`${text.trim()}\n\n${versionLabel(version)}`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export function canSendFeedback(text: string): boolean {
  return text.trim().length > 0;
}

/** Hands the note to the email app, closes the dialog and says so. A blank note does nothing. */
export function submitFeedback(
  text: string,
  deps: { openLink: (url: string) => void; close: () => void; toast: (title: string, text?: string) => void },
): boolean {
  if (!canSendFeedback(text)) return false;
  deps.openLink(feedbackMailto(text, APP_VERSION));
  deps.close();
  deps.toast(t("desk.feedback_sent_title"), t("desk.feedback_sent_text"));
  return true;
}

export type FeedbackDialogViewProps = {
  text: string;
  onTextChange: (text: string) => void;
  onCancel: () => void;
  onSend: () => void;
};

export function FeedbackDialogView(props: FeedbackDialogViewProps) {
  return (
    <DeskDialog
      open
      title={t("desk.feedback_title")}
      onClose={props.onCancel}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>
            {t("desk.feedback_cancel")}
          </Button>
          <Button variant="primary" disabled={!canSendFeedback(props.text)} onClick={props.onSend}>
            {t("desk.feedback_send")}
          </Button>
        </>
      }
    >
      <Textarea
        id="desk-feedback-text"
        label={t("desk.feedback_label")}
        hint={t("desk.feedback_hint")}
        rows={5}
        value={props.text}
        onChange={(event) => props.onTextChange(event.target.value)}
      />
    </DeskDialog>
  );
}

function FeedbackDialog(props: { onClose: () => void }) {
  const platform = usePlatform();
  const showToast = useFrameStore((state) => state.showToast);
  const [text, setText] = useState("");
  return (
    <FeedbackDialogView
      text={text}
      onTextChange={setText}
      onCancel={props.onClose}
      onSend={() => submitFeedback(text, { openLink: platform.openLink, close: props.onClose, toast: showToast })}
    />
  );
}

/** The confirmation at the bottom right. Keyed by the toast, so a new one replaces the old. */
export function DeskToast(props: { toast: FrameToast; onClose: () => void }) {
  if (!props.toast) return null;
  return (
    <div className="desk-toast" key={props.toast.id}>
      <Toast tone="success" title={props.toast.title} onClose={props.onClose} closeLabel={t("desk.toast_close")}>
        {props.toast.text}
      </Toast>
    </div>
  );
}

/**
 * Whether Ctrl/Cmd+N on this path is the Desk's to handle. The session page already
 * answers it with a new chat in the open workspace, and onboarding keeps it out.
 */
export function deskOwnsNewChatShortcut(pathname: string): boolean {
  return !/^\/(chat|welcome|extensions|workspace\/[^/]+\/(session|extensions))(\/|$)/.test(pathname);
}

/** Ctrl/Cmd+N opens a new chat from the Desk screens the session page does not cover. */
function useNewChatShortcut() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;
    if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "n") return;
    if (!deskOwnsNewChatShortcut(pathname)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))) {
      return;
    }
    event.preventDefault();
    navigate(chatPath());
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

export type DeskLayerViewProps = {
  modal: FrameModal;
  toast: FrameToast;
  mac: boolean;
  onCloseModal: () => void;
  onCloseToast: () => void;
};

/** The open dialog, if it is one of the frame's, and the toast. */
export function DeskLayerView(props: DeskLayerViewProps) {
  return (
    <>
      {props.modal?.kind === "keys" ? <ShortcutsDialog mac={props.mac} onClose={props.onCloseModal} /> : null}
      {props.modal?.kind === "feedback" ? <FeedbackDialog onClose={props.onCloseModal} /> : null}
      <DeskToast toast={props.toast} onClose={props.onCloseToast} />
    </>
  );
}

/** The frame's one layer over every screen: the open dialog and the toast. Mounted once. */
export function DeskLayer() {
  const modal = useFrameStore((state) => state.modal);
  const toast = useFrameStore((state) => state.toast);
  const closeModal = useFrameStore((state) => state.closeModal);
  const hideToast = useFrameStore((state) => state.hideToast);
  useNewChatShortcut();

  return (
    <DeskLayerView
      modal={modal}
      toast={toast}
      mac={isMacPlatform()}
      onCloseModal={closeModal}
      onCloseToast={hideToast}
    />
  );
}
