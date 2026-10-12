/** @jsxImportSource react */
import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button, Checkbox, Textarea, Toast } from "@redrob-labs/ui";

import { buildDiagnosticsBundleJson } from "../../../app/lib/diagnostics-bundle";
import { downloadTextAsFile } from "../../../app/lib/download";

import { isMacPlatform } from "../../../app/utils";
import { t } from "../../../i18n";
import { usePlatform } from "../../kernel/platform";
import { kindsLabel, usePrivacyConfirmStore, type PrivacyConfirm } from "../privacy/privacy-send";
import { PlaybookDialog } from "../playbooks/playbook-dialog";
import { ProjectDialog } from "../projects/project-dialog";
import { useDeskRunEvents } from "../run/use-desk-run-events";
import { isDeskSettingsPath } from "../settings/settings-sections";
import { useFrameStore, type FrameModal, type FrameToast } from "../store/frame-store";
import { APP_VERSION, versionLabel } from "./account-menu";
import { DeskDialog } from "./desk-dialog";
import { SearchDialog } from "./search-dialog";
import { hasCommandPalette } from "../../shell/use-shell-shortcuts";
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
export function feedbackMailto(text: string, version: string, attachment: string | null = null): string {
  const subject = encodeURIComponent(t("desk.feedback_subject"));
  const attach = attachment ? `\n\n${t("desk.feedback_attach_line", { name: attachment })}` : "";
  const body = encodeURIComponent(`${text.trim()}${attach}\n\n${versionLabel(version)}`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export function canSendFeedback(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Hands the note to the email app, closes the dialog and says so. A blank note does nothing.
 * With diagnostics, the sanitized report is saved first and the email says to attach it: an
 * email link cannot carry a file.
 */
export async function submitFeedback(
  text: string,
  deps: {
    openLink: (url: string) => void;
    close: () => void;
    toast: (title: string, text?: string) => void;
    /** Saves the diagnostics file and returns its name, or null when it could not be made. */
    saveDiagnostics?: () => Promise<string | null>;
  },
): Promise<boolean> {
  if (!canSendFeedback(text)) return false;
  const attachment = deps.saveDiagnostics ? await deps.saveDiagnostics().catch(() => null) : null;
  deps.openLink(feedbackMailto(text, APP_VERSION, attachment));
  deps.close();
  deps.toast(
    t("desk.feedback_sent_title"),
    attachment ? t("desk.feedback_sent_attach", { name: attachment }) : t("desk.feedback_sent_text"),
  );
  return true;
}

/** The sanitized diagnostics report, saved to Downloads under a dated name. */
export async function saveFeedbackDiagnostics(now = new Date()): Promise<string> {
  const name = `redrob-diagnostics-${now.toISOString().replace(/[:.]/g, "-")}.json`;
  downloadTextAsFile(name, await buildDiagnosticsBundleJson(), "application/json");
  return name;
}

export type FeedbackDialogViewProps = {
  text: string;
  onTextChange: (text: string) => void;
  onCancel: () => void;
  onSend: () => void;
  /** Whether the diagnostics report goes with the note. */
  diagnostics?: boolean;
  onDiagnosticsChange?: (on: boolean) => void;
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
      {props.onDiagnosticsChange ? (
        <div className="mt-3">
          <Checkbox
            id="desk-feedback-diagnostics"
            label={t("desk.feedback_diagnostics")}
            hint={t("desk.feedback_diagnostics_hint")}
            checked={props.diagnostics === true}
            onChange={(event) => props.onDiagnosticsChange?.(event.currentTarget.checked)}
          />
        </div>
      ) : null}
    </DeskDialog>
  );
}

function FeedbackDialog(props: { onClose: () => void }) {
  const platform = usePlatform();
  const showToast = useFrameStore((state) => state.showToast);
  const [text, setText] = useState("");
  // On by default: a report a person can act on needs what the app was doing.
  const [diagnostics, setDiagnostics] = useState(true);
  return (
    <FeedbackDialogView
      text={text}
      onTextChange={setText}
      onCancel={props.onClose}
      diagnostics={diagnostics}
      onDiagnosticsChange={setDiagnostics}
      onSend={() =>
        void submitFeedback(text, {
          openLink: platform.openLink,
          close: props.onClose,
          toast: showToast,
          ...(diagnostics ? { saveDiagnostics: () => saveFeedbackDiagnostics() } : {}),
        })
      }
    />
  );
}

/** The confirmation at the bottom right. Keyed by the toast, so a new one replaces the old. */
export function DeskToast(props: { toast: FrameToast; onClose: () => void }) {
  if (!props.toast) return null;
  const { action } = props.toast;
  return (
    <div className="desk-toast" key={props.toast.id}>
      <Toast
        tone={props.toast.tone ?? "success"}
        title={props.toast.title}
        onClose={props.onClose}
        closeLabel={t("desk.toast_close")}
        action={
          action ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                action.run();
                props.onClose();
              }}
            >
              {action.label}
            </Button>
          ) : undefined
        }
      >
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

export type ShortcutKey = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/**
 * Ctrl+Shift+B (Cmd+Shift+B on a Mac). The physical key counts too, so it still works
 * while a Korean layout turns B into ã… .
 */
export function isToggleBrowserShortcut(event: ShortcutKey, mac: boolean): boolean {
  const mod = mac ? event.metaKey : event.ctrlKey;
  if (!mod || !event.shiftKey || event.altKey) return false;
  return event.code === "KeyB" || event.key.toLowerCase() === "b";
}

/** Whether this path is inside the Desk frame, where the side panel lives. */
export function isDeskFramePath(pathname: string): boolean {
  if (isDeskSettingsPath(pathname)) return true;
  return !/^\/(welcome|extensions|settings|__ds|workspace\/[^/]+\/(extensions|settings))(\/|$)/.test(pathname);
}

/**
 * Ctrl/Cmd+K opens Search on Desk screens. A screen with its own command palette (the developer and
 * settings screens) keeps Ctrl+K for that palette.
 */
function useSearchShortcut() {
  const { pathname } = useLocation();
  const modal = useFrameStore((state) => state.modal);
  const openModal = useFrameStore((state) => state.openModal);
  const closeModal = useFrameStore((state) => state.closeModal);
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;
    if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "k") return;
    if (hasCommandPalette() || !isDeskFramePath(pathname)) return;
    event.preventDefault();
    if (modal?.kind === "search") closeModal();
    else openModal({ kind: "search" });
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/** Ctrl/Cmd+Shift+B opens or closes the browser in the side panel, on any Desk screen. */
function useToggleBrowserShortcut() {
  const { pathname } = useLocation();
  const toggleBrowser = useFrameStore((state) => state.toggleBrowser);
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat || !isToggleBrowserShortcut(event, isMacPlatform()) || !isDeskFramePath(pathname)) return;
    event.preventDefault();
    toggleBrowser();
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
      {props.modal?.kind === "search" ? <SearchDialog onClose={props.onCloseModal} /> : null}
      {props.modal?.kind === "feedback" ? <FeedbackDialog onClose={props.onCloseModal} /> : null}
      {props.modal?.kind === "project" ? (
        <ProjectDialog key={props.modal.chatId ?? "new"} chatId={props.modal.chatId} onClose={props.onCloseModal} />
      ) : null}
      {props.modal?.kind === "playbook" ? (
        <PlaybookDialog playbookId={props.modal.playbookId} prompt={props.modal.prompt} onClose={props.onCloseModal} />
      ) : null}
      <PrivacyConfirmDialog />
      <DeskToast toast={props.toast} onClose={props.onCloseToast} />
    </>
  );
}

/** Strict, before Send: how many details will be hidden, then Send or Edit. */
export function PrivacyConfirmDialogView(props: { confirm: PrivacyConfirm; onAnswer: (send: boolean) => void }) {
  return (
    <DeskDialog
      open
      title={t("desk.privacy_confirm_title", { count: props.confirm.count })}
      onClose={() => props.onAnswer(false)}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onAnswer(false)}>
            {t("desk.privacy_confirm_edit")}
          </Button>
          <Button variant="primary" onClick={() => props.onAnswer(true)}>
            {t("desk.privacy_confirm_send")}
          </Button>
        </>
      }
    >
      <p>{t("desk.privacy_confirm_text", { kinds: kindsLabel(props.confirm.kinds) })}</p>
    </DeskDialog>
  );
}

function PrivacyConfirmDialog() {
  const pending = usePrivacyConfirmStore((state) => state.pending);
  const answer = usePrivacyConfirmStore((state) => state.answer);
  return pending ? <PrivacyConfirmDialogView confirm={pending} onAnswer={answer} /> : null;
}

/** The frame's one layer over every screen: the open dialog and the toast. Mounted once. */
export function DeskLayer() {
  const modal = useFrameStore((state) => state.modal);
  const toast = useFrameStore((state) => state.toast);
  const closeModal = useFrameStore((state) => state.closeModal);
  const hideToast = useFrameStore((state) => state.hideToast);
  useNewChatShortcut();
  useSearchShortcut();
  useToggleBrowserShortcut();
  useDeskRunEvents();

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
