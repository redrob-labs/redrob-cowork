/** @jsxImportSource react */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router";
import {
  Button,
  EmptyState,
  ProtectionStatus,
  Radio,
  SectionMark,
  Select,
  Skeleton,
  Switch,
  ThemeSwitch,
  icons,
  type IconComponent,
} from "@redrob-labs/ui";

import { getDesktopHomeDir, openDesktopUrl } from "../../../app/lib/desktop";
import { readStoredFontZoom } from "../../../app/lib/font-zoom";
import { createRedrobServerClient } from "../../../app/lib/redrob-server";
import { getInitialThemeMode, setThemeMode, subscribeToTheme, type ThemeMode } from "../../../app/theme";
import { isDesktopRuntime } from "../../../app/utils";
import {
  LANGUAGE_OPTIONS,
  currentLocale,
  isLanguage,
  setLocale,
  subscribeToLocale,
  t,
  type Language,
} from "../../../i18n";
import { replaceRedrobKey } from "../../domains/onboarding/redrob-key-connect";
import { RedrobKeyStep } from "../../domains/onboarding/redrob-key-step";
import { getSettingsTabLabel } from "../../domains/settings/shell/settings-tabs";
import { REDROB_CONSOLE_BILLING_URL, REDROB_CONSOLE_URL } from "../../domains/settings/redrob-provider";
import { useLocal, type LocalPreferences } from "../../kernel/local-provider";
import { requestFontZoom } from "../../shell/font-zoom";
import { resolveRedrobConnection } from "../../shell/redrob-connection";
import { PROJECTS_QUERY_KEY } from "../projects/desk-projects";
import { deskKeepAwake, type KeepAwakeSync } from "../run/keep-awake";
import { syncCrashReports } from "./crash-reports";
import { TeamFileGroup } from "../team/team-file-group";
import { ProfileGroup } from "./profile-group";
import { TeamPolicyGroup } from "../team/team-policy-group";
import type { ChatMode } from "../services/types";
import { REDROB_KEY_QUERY_KEY, useRedrobKeyConnected } from "../shell/account-menu";
import { useDeskConnection } from "../shell/desk-connection";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import {
  DESK_SETTINGS_SECTIONS,
  DEVELOPER_SETTINGS_TABS,
  TEXT_SIZES,
  deskSettingsSectionLabel,
  deskSettingsSectionLede,
  folderPlace,
  isTextSize,
  notificationPreference,
  notifiesWhenDone,
  removeFolder,
  resolveSettingsSection,
  settingsSectionPath,
  textSizeForZoom,
  textSizeLabel,
  zoomForTextSize,
  type DeskSettingsSection,
  type TextSize,
} from "./settings-sections";
import { RouteReady } from "../shell/route-ready";

const NAV_ICON = { width: 15, height: 15, "aria-hidden": true };
const ROW_ICON = { width: 16, height: 16, "aria-hidden": true };
const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };

const SECTION_ICON: Record<DeskSettingsSection, IconComponent> = {
  general: icons.sliders,
  folders: icons.folderOpen,
  plan: icons.gauge,
};

const CHAT_MODES: readonly ChatMode[] = ["plan", "run"];

/** The folders shown before a chat route has connected to the server. */
export const SAMPLE_FOLDERS: readonly string[] = [
  "/Users/you/Redrob Cowork",
  "/Users/you/Documents/Seorin MSA",
  "D:\\Scans",
];

const SETTINGS_QUERY_KEY = "desk-settings";

/* ---------- The row pattern ---------- */

type RowProps = {
  title: ReactNode;
  description?: ReactNode;
  /** The control the title labels, for a control that takes `id` but no `aria-label`. */
  controlId?: string;
  /** The title's own id, for a group of controls that points at it. */
  titleId?: string;
  children?: ReactNode;
};

export function Row(props: RowProps) {
  return (
    <div className="desk-settings__row">
      <div className="desk-settings__text">
        {props.controlId ? (
          <label className="desk-settings__title" htmlFor={props.controlId}>
            {props.title}
          </label>
        ) : (
          <b className="desk-settings__title" id={props.titleId}>
            {props.title}
          </b>
        )}
        {props.description ? <span className="desk-settings__description">{props.description}</span> : null}
      </div>
      <div className="desk-settings__control">{props.children}</div>
    </div>
  );
}

export function Group(props: { title: string; children: ReactNode }) {
  return (
    <section className="desk-settings__group">
      <SectionMark label={props.title} as="heading" level={2} />
      <div className="desk-settings__rows">{props.children}</div>
    </section>
  );
}

/* ---------- The section list ---------- */

export function SettingsNav(props: { current: DeskSettingsSection; developerMode: boolean }) {
  return (
    <nav className="desk-settings__nav" aria-label={t("desk.account_settings")}>
      {DESK_SETTINGS_SECTIONS.map((section) => (
        <Link
          key={section}
          className="desk-settings__link"
          to={settingsSectionPath(section)}
          aria-current={section === props.current ? "page" : undefined}
        >
          <span className="desk-settings__icon">{SECTION_ICON[section](NAV_ICON)}</span>
          <span>{deskSettingsSectionLabel(section)}</span>
        </Link>
      ))}
      {props.developerMode ? (
        <>
          <p className="desk-settings__head">{t("desk.settings_developer")}</p>
          {DEVELOPER_SETTINGS_TABS.map((tab) => (
            <Link key={tab} className="desk-settings__link" to={settingsSectionPath(tab)}>
              <span className="desk-settings__icon">{icons.code(NAV_ICON)}</span>
              <span>{getSettingsTabLabel(tab)}</span>
            </Link>
          ))}
        </>
      ) : null}
    </nav>
  );
}

export function DeskSettingsView(props: { section: DeskSettingsSection; developerMode: boolean; children: ReactNode }) {
  return (
    <div className="desk-settings">
      <SettingsNav current={props.section} developerMode={props.developerMode} />
      <div className="desk-settings__main">
        <p className="desk-settings__lede">{deskSettingsSectionLede(props.section)}</p>
        {props.children}
      </div>
    </div>
  );
}

/* ---------- General ---------- */

export type GeneralValues = {
  mode: ChatMode;
  language: Language;
  theme: ThemeMode;
  textSize: TextSize;
  notify: boolean;
  keepAwake: boolean;
  /** Shown in the desktop app only, where reports can be sent. */
  crashReports?: boolean;
};

export type GeneralActions = {
  onMode: (mode: ChatMode) => void;
  onLanguage: (language: Language) => void;
  onTheme: (theme: ThemeMode) => void;
  onTextSize: (size: TextSize) => void;
  onNotify: (on: boolean) => void;
  onKeepAwake: (on: boolean) => void;
  onCrashReports?: (on: boolean) => void;
};

export type GeneralDeps = {
  setPrefs: (updater: (previous: LocalPreferences) => LocalPreferences) => void;
  setLocale: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setZoom: (zoom: number) => void;
  keepAwake: Pick<KeepAwakeSync, "setEnabled">;
  showToast: (title: string) => void;
};

/** What each General control does: the existing preference, locale, theme and zoom it sets. */
export function generalActions(deps: GeneralDeps): GeneralActions {
  return {
    onMode: (mode) => {
      deps.setPrefs((previous) => ({ ...previous, deskNewChatMode: mode }));
      deps.showToast(mode === "plan" ? t("desk.settings_mode_toast_plan") : t("desk.settings_mode_toast_run"));
    },
    onLanguage: deps.setLocale,
    onTheme: deps.setTheme,
    onTextSize: (size) => deps.setZoom(zoomForTextSize(size)),
    onNotify: (on) => deps.setPrefs((previous) => ({ ...previous, desktopNotifications: notificationPreference(on) })),
    onKeepAwake: (on) => {
      deps.setPrefs((previous) => ({ ...previous, deskKeepAwake: on }));
      deps.keepAwake.setEnabled(on);
    },
  };
}

/** English and 한국어, each in its own name. */
export function languageOptions() {
  return LANGUAGE_OPTIONS.map((option) => ({ value: option.value, label: option.nativeName }));
}

export function textSizeOptions() {
  return TEXT_SIZES.map((size) => ({ value: size.id, label: textSizeLabel(size.id) }));
}

export function GeneralView(props: { values: GeneralValues; actions: GeneralActions }) {
  const { values, actions } = props;
  return (
    <>
      <Group title={t("desk.settings_group_starting")}>
        <Row
          title={t("desk.settings_new_chat_mode")}
          description={t("desk.settings_new_chat_mode_text")}
          titleId="desk-settings-mode"
        >
          <div className="desk-settings__radios" role="radiogroup" aria-labelledby="desk-settings-mode">
            {CHAT_MODES.map((mode) => (
              <Radio
                key={mode}
                name="desk-new-chat-mode"
                value={mode}
                label={mode === "plan" ? t("desk.mode_plan") : t("desk.mode_run")}
                checked={values.mode === mode}
                onChange={() => actions.onMode(mode)}
              />
            ))}
          </div>
        </Row>
        <Row
          title={t("desk.settings_language")}
          description={t("desk.settings_language_text")}
          controlId="desk-settings-language"
        >
          <Select
            id="desk-settings-language"
            size="sm"
            value={values.language}
            options={languageOptions()}
            onChange={(_event, option) => {
              if (isLanguage(option?.value)) actions.onLanguage(option.value);
            }}
          />
        </Row>
      </Group>
      <Group title={t("desk.settings_group_looks")}>
        <Row title={t("settings.theme_title")} description={t("desk.settings_theme_text")}>
          <ThemeSwitch
            size="md"
            value={values.theme}
            onChange={actions.onTheme}
            label={t("settings.theme_title")}
            labels={{
              system: t("settings.theme_system"),
              light: t("settings.theme_light"),
              dark: t("settings.theme_dark"),
            }}
          />
        </Row>
        <Row title={t("desk.settings_text_size")} controlId="desk-settings-text-size">
          <Select
            id="desk-settings-text-size"
            size="sm"
            value={values.textSize}
            options={textSizeOptions()}
            onChange={(_event, option) => {
              if (isTextSize(option?.value)) actions.onTextSize(option.value);
            }}
          />
        </Row>
      </Group>
      <Group title={t("desk.settings_group_working")}>
        <Row title={t("desk.settings_notify")} description={t("desk.settings_notify_text")}>
          <Switch
            aria-label={t("desk.settings_notify")}
            checked={values.notify}
            onChange={(event) => actions.onNotify(event.currentTarget.checked)}
          />
        </Row>
        <Row title={t("desk.settings_awake")} description={t("desk.settings_awake_text")}>
          <Switch
            aria-label={t("desk.settings_awake")}
            checked={values.keepAwake}
            onChange={(event) => actions.onKeepAwake(event.currentTarget.checked)}
          />
        </Row>
        {actions.onCrashReports && values.crashReports !== undefined ? (
          <Row title={t("desk.settings_crash_reports")} description={t("desk.settings_crash_reports_text")}>
            <Switch
              aria-label={t("desk.settings_crash_reports")}
              checked={values.crashReports}
              onChange={(event) => actions.onCrashReports?.(event.currentTarget.checked)}
            />
          </Row>
        ) : null}
      </Group>
    </>
  );
}

function readTextSize(): TextSize {
  if (typeof window === "undefined") return "default";
  return textSizeForZoom(readStoredFontZoom(window.localStorage));
}

function GeneralSection() {
  const { prefs, setPrefs } = useLocal();
  const showToast = useFrameStore((state) => state.showToast);
  const language = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const theme = useSyncExternalStore(subscribeToTheme, getInitialThemeMode, getInitialThemeMode);
  const [textSize, setTextSize] = useState(readTextSize);
  const actions = generalActions({
    setPrefs,
    setLocale,
    setTheme: setThemeMode,
    setZoom: requestFontZoom,
    keepAwake: deskKeepAwake(),
    showToast: (title) => showToast(title),
  });
  return (
    <GeneralView
      values={{
        mode: prefs.deskNewChatMode,
        language,
        theme,
        textSize,
        notify: notifiesWhenDone(prefs.desktopNotifications),
        keepAwake: prefs.deskKeepAwake,
        ...(isDesktopRuntime() ? { crashReports: prefs.crashReports } : {}),
      }}
      actions={{
        ...actions,
        onCrashReports: (on) => {
          setPrefs((previous) => ({ ...previous, crashReports: on }));
          void syncCrashReports(on);
        },
        onTextSize: (size) => {
          setTextSize(size);
          actions.onTextSize(size);
        },
      }}
    />
  );
}

/* ---------- Folders ---------- */

export type FolderRow = { path: string; name: string; where: string };

export function folderRows(folders: readonly string[], home: string | null): FolderRow[] {
  return folders.map((path) => ({ path, ...folderPlace(path, home) }));
}

export function FoldersView(props: { rows: readonly FolderRow[]; removing: string | null; onRemove: (path: string) => void }) {
  return (
    <>
      <Group title={t("desk.settings_group_folders")}>
        {props.rows.length === 0 ? (
          <EmptyState
            compact
            icon={icons.folder({ width: 18, height: 18, "aria-hidden": true })}
            title={t("desk.settings_folders_empty_title")}
            description={t("desk.settings_folders_empty_text")}
          />
        ) : (
          props.rows.map((row) => (
            <div key={row.path} className="desk-settings__row desk-settings__row--folder">
              <span className="desk-settings__folder">{icons.folder(ROW_ICON)}</span>
              <div className="desk-settings__text">
                <b className="desk-settings__title">
                  {row.name} <span className="desk-settings__where">{row.where}</span>
                </b>
              </div>
              <div className="desk-settings__control">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("desk.settings_folder_remove_label", { name: row.name })}
                  loading={props.removing === row.path}
                  disabled={props.removing !== null}
                  onClick={() => props.onRemove(row.path)}
                >
                  {t("common.remove")}
                </Button>
              </div>
            </div>
          ))
        )}
      </Group>
      <p className="desk-settings__note">
        {icons.lock(BUTTON_ICON)}
        {t("desk.settings_folders_note")}
      </p>
    </>
  );
}

function FoldersSection() {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);
  const live = client && workspaceId ? { client, workspaceId } : null;
  const foldersKey = [SETTINGS_QUERY_KEY, "folders", live?.workspaceId ?? "preview"];
  const folders = useQuery({
    queryKey: foldersKey,
    queryFn: async () => (live ? (await live.client.listAuthorizedFolders(live.workspaceId)).folders : [...SAMPLE_FOLDERS]),
  });
  const home = useQuery({
    queryKey: [SETTINGS_QUERY_KEY, "home"],
    queryFn: () => (isDesktopRuntime() ? getDesktopHomeDir() : null),
    staleTime: Infinity,
  });

  if (folders.isLoading) return <Skeleton variant="text" lines={4} />;
  if (folders.isError) {
    return <EmptyState title={t("desk.settings_folders_error_title")} description={t("desk.settings_try_again")} />;
  }

  const list = folders.data ?? [];
  const onRemove = (path: string) => {
    setRemoving(path);
    removeFolder({ client: live?.client ?? null, workspaceId: live?.workspaceId ?? null, folders: list, showToast }, path)
      .then((rest) => {
        queryClient.setQueryData(foldersKey, rest);
        void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
      })
      .catch(() => showToast(t("desk.settings_folder_remove_failed"), t("desk.settings_try_again"), "danger"))
      .finally(() => setRemoving(null));
  };

  return <FoldersView rows={folderRows(list, home.data ?? null)} removing={removing} onRemove={onRemove} />;
}

/* ---------- Plan and usage ---------- */

export type KeyStepState = {
  busy: boolean;
  error: string | null;
  onSubmitKey: (apiKey: string) => void;
  onCancel: () => void;
};

export function keyLine(connected: boolean | null): string {
  if (connected === null) return t("desk.settings_key_checking");
  return connected ? t("desk.settings_key_connected") : t("desk.settings_key_not_connected");
}

export type PlanViewProps = {
  connected: boolean | null;
  onChangeKey: () => void;
  onOpenBilling: () => void;
  /** The key entry from onboarding, open over the screen while the key is being changed. */
  keyStep: KeyStepState | null;
};

export function PlanView(props: PlanViewProps) {
  return (
    <>
      <Group title={t("desk.settings_group_ai")}>
        <div className="desk-settings__auto">
          <ProtectionStatus
            tone="brand"
            icon={icons.sparkle({ width: 22, height: 22, "aria-hidden": true })}
            title={t("desk.settings_auto_title")}
            live={props.connected ? t("desk.settings_auto_live") : undefined}
          >
            {t("desk.settings_auto_text")}
          </ProtectionStatus>
          <div className="desk-settings__actions">
            <Link className="desk-settings__action" to="/guide">
              {icons.book(BUTTON_ICON)}
              {t("desk.settings_guide")}
            </Link>
            <a
              className="desk-settings__action"
              href={REDROB_CONSOLE_BILLING_URL}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                props.onOpenBilling();
              }}
            >
              {t("desk.settings_billing")}
              {icons.arrowUpRight(BUTTON_ICON)}
            </a>
          </div>
        </div>
        <Row title={t("desk.settings_key")} description={keyLine(props.connected)}>
          <Button size="sm" variant="secondary" iconLeft={icons.key(BUTTON_ICON)} onClick={props.onChangeKey}>
            {props.connected === false ? t("desk.settings_key_add") : t("desk.settings_key_change")}
          </Button>
        </Row>
      </Group>
      {props.keyStep ? (
        <RedrobKeyStep
          busy={props.keyStep.busy}
          error={props.keyStep.error}
          onSubmitKey={props.keyStep.onSubmitKey}
          onOpenConsole={() => void openDesktopUrl(REDROB_CONSOLE_URL).catch(() => undefined)}
          onSkip={props.keyStep.onCancel}
          skipLabel={t("desk.settings_key_cancel")}
          copy={{
            getKey: t("desk.settings_key_get"),
            label: t("desk.settings_key"),
            placeholder: t("desk.settings_key_placeholder"),
          }}
        />
      ) : null}
    </>
  );
}

/** The same hand-off onboarding makes: the key goes to Redrob Code's auth store, never kept here. */
async function saveRedrobKey(apiKey: string) {
  const { normalizedBaseUrl, resolvedToken, resolvedHostToken } = await resolveRedrobConnection();
  if (!normalizedBaseUrl || !(resolvedToken || resolvedHostToken)) {
    throw new Error(t("welcome.redrob_key_error_server"));
  }
  await replaceRedrobKey(
    createRedrobServerClient({
      baseUrl: normalizedBaseUrl,
      token: resolvedToken || undefined,
      hostToken: resolvedHostToken || undefined,
    }),
    apiKey,
  );
}

function PlanSection() {
  const connected = useRedrobKeyConnected();
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmitKey = (apiKey: string) => {
    setBusy(true);
    setError(null);
    saveRedrobKey(apiKey)
      .then(() => {
        setOpen(false);
        void queryClient.invalidateQueries({ queryKey: REDROB_KEY_QUERY_KEY });
        showToast(t("desk.settings_key_saved"), t("desk.settings_key_saved_text"));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("welcome.redrob_key_error_server")))
      .finally(() => setBusy(false));
  };

  return (
    <PlanView
      connected={connected}
      onChangeKey={() => {
        setError(null);
        setOpen(true);
      }}
      onOpenBilling={() => void openDesktopUrl(REDROB_CONSOLE_BILLING_URL).catch(() => undefined)}
      keyStep={open ? { busy, error, onSubmitKey, onCancel: () => setOpen(false) } : null}
    />
  );
}

/* ---------- The screen ---------- */

function SectionBody(props: { section: DeskSettingsSection }) {
  switch (props.section) {
    case "general":
      return (
        <>
          <ProfileGroup />
          <GeneralSection />
          <TeamPolicyGroup />
          <TeamFileGroup />
        </>
      );
    case "folders":
      return <FoldersSection />;
    case "plan":
      return <PlanSection />;
  }
}

/** `/settings/general`, `/settings/folders`, `/settings/plan`, inside the Desk frame. */
export function DeskSettingsScreen(props: { section: DeskSettingsSection }) {
  const developerMode = useFrameStore((state) => state.developerMode);
  return (
    <DeskShell title={t("desk.account_settings")} meta={deskSettingsSectionLabel(props.section)} measure={false}>
      <DeskSettingsView section={props.section} developerMode={developerMode}>
        <SectionBody section={props.section} />
      </DeskSettingsView>
    </DeskShell>
  );
}

/**
 * `/settings/*` and `/workspace/:id/settings/*`. The Desk sections render here; a developer
 * page renders `developer` (the existing settings, with their own sidebar) while developer
 * mode is on; anything else, developer pages included when it is off, goes to General.
 */
export function DeskSettingsGate(props: { developer: ReactNode }) {
  const developerMode = useFrameStore((state) => state.developerMode);
  return <DeskSettingsGateView developer={props.developer} developerMode={developerMode} />;
}

export function DeskSettingsGateView(props: { developer: ReactNode; developerMode: boolean }) {
  const route = resolveSettingsSection(useParams()["*"], props.developerMode);
  if (route.kind === "developer") return props.developer;
  if (route.kind === "redirect") return <Navigate to={route.to} replace />;
  // The developer route marks itself ready once its data loads; the Desk screen has nothing to wait for.
  return (
    <RouteReady>
      <DeskSettingsScreen section={route.section} />
    </RouteReady>
  );
}
