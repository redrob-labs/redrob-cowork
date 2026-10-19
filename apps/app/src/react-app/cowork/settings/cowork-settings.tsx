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
  localizedLanguageName,
  subscribeToLocale,
  t,
  type Language,
} from "../../../i18n";
import {
  followLauncherLanguage,
  launcherLanguageState,
  pickAppLanguage,
  subscribeToLauncherLanguage,
  type LauncherLanguageState,
} from "../../../i18n/launcher-language";
import { replaceRedrobKey } from "../../domains/onboarding/redrob-key-connect";
import { RedrobKeyStep } from "../../domains/onboarding/redrob-key-step";
import { getSettingsTabLabel } from "../../domains/settings/shell/settings-tabs";
import { REDROB_CONSOLE_BILLING_URL, REDROB_CONSOLE_URL } from "../../domains/settings/redrob-provider";
import { useLocal, type LocalPreferences } from "../../kernel/local-provider";
import { requestFontZoom } from "../../shell/font-zoom";
import { resolveRedrobConnection } from "../../shell/redrob-connection";
import { PROJECTS_QUERY_KEY } from "../projects/cowork-projects";
import { coworkKeepAwake, type KeepAwakeSync } from "../run/keep-awake";
import { syncCrashReports } from "./crash-reports";
import { TeamFileGroup } from "../team/team-file-group";
import { TeamPolicyGroup } from "../team/team-policy-group";
import type { ChatMode } from "../services/types";
import { REDROB_KEY_QUERY_KEY, useRedrobKeyStatus, type RedrobKeyLink } from "../shell/account-menu";
import { useCoworkConnection } from "../shell/cowork-connection";
import { CoworkShell } from "../shell/cowork-shell";
import { useFrameStore } from "../store/frame-store";
import {
  COWORK_SETTINGS_SECTIONS,
  DEVELOPER_SETTINGS_TABS,
  TEXT_SIZES,
  coworkSettingsSectionLabel,
  coworkSettingsSectionLede,
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
  type CoworkSettingsSection,
  type TextSize,
} from "./settings-sections";
import { RouteReady } from "../shell/route-ready";

const NAV_ICON = { width: 15, height: 15, "aria-hidden": true };
const ROW_ICON = { width: 16, height: 16, "aria-hidden": true };
const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };

const SECTION_ICON: Record<CoworkSettingsSection, IconComponent> = {
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

const SETTINGS_QUERY_KEY = "cowork-settings";

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
    <div className="cowork-settings__row">
      <div className="cowork-settings__text">
        {props.controlId ? (
          <label className="cowork-settings__title" htmlFor={props.controlId}>
            {props.title}
          </label>
        ) : (
          <b className="cowork-settings__title" id={props.titleId}>
            {props.title}
          </b>
        )}
        {props.description ? <span className="cowork-settings__description">{props.description}</span> : null}
      </div>
      <div className="cowork-settings__control">{props.children}</div>
    </div>
  );
}

export function Group(props: { title: string; children: ReactNode }) {
  return (
    <section className="cowork-settings__group">
      <SectionMark label={props.title} as="heading" level={2} />
      <div className="cowork-settings__rows">{props.children}</div>
    </section>
  );
}

/* ---------- The section list ---------- */

export function SettingsNav(props: { current: CoworkSettingsSection; developerMode: boolean }) {
  return (
    <nav className="cowork-settings__nav" aria-label={t("cowork.account_settings")}>
      {COWORK_SETTINGS_SECTIONS.map((section) => (
        <Link
          key={section}
          className="cowork-settings__link"
          to={settingsSectionPath(section)}
          aria-current={section === props.current ? "page" : undefined}
        >
          <span className="cowork-settings__icon">{SECTION_ICON[section](NAV_ICON)}</span>
          <span>{coworkSettingsSectionLabel(section)}</span>
        </Link>
      ))}
      {props.developerMode ? (
        <>
          <p className="cowork-settings__head">{t("cowork.settings_developer")}</p>
          {DEVELOPER_SETTINGS_TABS.map((tab) => (
            <Link key={tab} className="cowork-settings__link" to={settingsSectionPath(tab)}>
              <span className="cowork-settings__icon">{icons.code(NAV_ICON)}</span>
              <span>{getSettingsTabLabel(tab)}</span>
            </Link>
          ))}
        </>
      ) : null}
    </nav>
  );
}

export function CoworkSettingsView(props: { section: CoworkSettingsSection; developerMode: boolean; children: ReactNode }) {
  return (
    <div className="cowork-settings">
      <SettingsNav current={props.section} developerMode={props.developerMode} />
      <div className="cowork-settings__main">
        <p className="cowork-settings__lede">{coworkSettingsSectionLede(props.section)}</p>
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
  /** Redrob Launcher's language and whether Cowork follows it; absent or null locale without a launcher. */
  launcher?: LauncherLanguageState;
};

export type GeneralActions = {
  onMode: (mode: ChatMode) => void;
  onLanguage: (language: Language) => void;
  /** "Same as Redrob Launcher": go back to following the launcher's language. */
  onFollowLauncher?: () => void;
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
      deps.setPrefs((previous) => ({ ...previous, coworkNewChatMode: mode }));
      deps.showToast(mode === "plan" ? t("cowork.settings_mode_toast_plan") : t("cowork.settings_mode_toast_run"));
    },
    onLanguage: deps.setLocale,
    onTheme: deps.setTheme,
    onTextSize: (size) => deps.setZoom(zoomForTextSize(size)),
    onNotify: (on) => deps.setPrefs((previous) => ({ ...previous, desktopNotifications: notificationPreference(on) })),
    onKeepAwake: (on) => {
      deps.setPrefs((previous) => ({ ...previous, coworkKeepAwake: on }));
      deps.keepAwake.setEnabled(on);
    },
  };
}

/** English and 한국어, each in its own name, after "Same as Redrob Launcher (X)" when a launcher is found. */
export function languageOptions(launcher: Language | null = null) {
  const own = LANGUAGE_OPTIONS.map((option) => ({ value: option.value as string, label: option.nativeName as string }));
  if (!launcher) return own;
  return [{ value: LAUNCHER_LANGUAGE, label: t("cowork.settings_language_launcher", { language: localizedLanguageName(launcher) }) }, ...own];
}

/** The Language select's value for "follow Redrob Launcher". */
export const LAUNCHER_LANGUAGE = "launcher";

export function textSizeOptions() {
  return TEXT_SIZES.map((size) => ({ value: size.id, label: textSizeLabel(size.id) }));
}

export function GeneralView(props: { values: GeneralValues; actions: GeneralActions }) {
  const { values, actions } = props;
  return (
    <>
      <Group title={t("cowork.settings_group_starting")}>
        <Row
          title={t("cowork.settings_new_chat_mode")}
          description={t("cowork.settings_new_chat_mode_text")}
          titleId="cowork-settings-mode"
        >
          <div className="cowork-settings__radios" role="radiogroup" aria-labelledby="cowork-settings-mode">
            {CHAT_MODES.map((mode) => (
              <Radio
                key={mode}
                name="cowork-new-chat-mode"
                value={mode}
                label={mode === "plan" ? t("cowork.mode_plan") : t("cowork.mode_run")}
                checked={values.mode === mode}
                onChange={() => actions.onMode(mode)}
              />
            ))}
          </div>
        </Row>
        <Row
          title={t("cowork.settings_language")}
          description={t("cowork.settings_language_text")}
          controlId="cowork-settings-language"
        >
          <Select
            id="cowork-settings-language"
            size="sm"
            value={values.launcher?.following ? LAUNCHER_LANGUAGE : values.language}
            options={languageOptions(values.launcher?.locale ?? null)}
            onChange={(_event, option) => {
              if (option?.value === LAUNCHER_LANGUAGE) actions.onFollowLauncher?.();
              else if (isLanguage(option?.value)) actions.onLanguage(option.value);
            }}
          />
        </Row>
      </Group>
      <Group title={t("cowork.settings_group_looks")}>
        <Row title={t("settings.theme_title")} description={t("cowork.settings_theme_text")}>
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
        <Row title={t("cowork.settings_text_size")} controlId="cowork-settings-text-size">
          <Select
            id="cowork-settings-text-size"
            size="sm"
            value={values.textSize}
            options={textSizeOptions()}
            onChange={(_event, option) => {
              if (isTextSize(option?.value)) actions.onTextSize(option.value);
            }}
          />
        </Row>
      </Group>
      <Group title={t("cowork.settings_group_working")}>
        <Row title={t("cowork.settings_notify")} description={t("cowork.settings_notify_text")}>
          <Switch
            aria-label={t("cowork.settings_notify")}
            checked={values.notify}
            onChange={(event) => actions.onNotify(event.currentTarget.checked)}
          />
        </Row>
        <Row title={t("cowork.settings_awake")} description={t("cowork.settings_awake_text")}>
          <Switch
            aria-label={t("cowork.settings_awake")}
            checked={values.keepAwake}
            onChange={(event) => actions.onKeepAwake(event.currentTarget.checked)}
          />
        </Row>
        {actions.onCrashReports && values.crashReports !== undefined ? (
          <Row title={t("cowork.settings_crash_reports")} description={t("cowork.settings_crash_reports_text")}>
            <Switch
              aria-label={t("cowork.settings_crash_reports")}
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
  const launcher = useSyncExternalStore(subscribeToLauncherLanguage, launcherLanguageState, launcherLanguageState);
  const theme = useSyncExternalStore(subscribeToTheme, getInitialThemeMode, getInitialThemeMode);
  const [textSize, setTextSize] = useState(readTextSize);
  const actions = generalActions({
    setPrefs,
    // A pick here is Cowork's own choice, so it wins over Redrob Launcher's from now on.
    setLocale: pickAppLanguage,
    setTheme: setThemeMode,
    setZoom: requestFontZoom,
    keepAwake: coworkKeepAwake(),
    showToast: (title) => showToast(title),
  });
  return (
    <GeneralView
      values={{
        mode: prefs.coworkNewChatMode,
        language,
        theme,
        textSize,
        notify: notifiesWhenDone(prefs.desktopNotifications),
        keepAwake: prefs.coworkKeepAwake,
        ...(isDesktopRuntime() ? { crashReports: prefs.crashReports } : {}),
        launcher,
      }}
      actions={{
        ...actions,
        onFollowLauncher: () => void followLauncherLanguage(),
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
      <Group title={t("cowork.settings_group_folders")}>
        {props.rows.length === 0 ? (
          <EmptyState
            compact
            icon={icons.folder({ width: 18, height: 18, "aria-hidden": true })}
            title={t("cowork.settings_folders_empty_title")}
            description={t("cowork.settings_folders_empty_text")}
          />
        ) : (
          props.rows.map((row) => (
            <div key={row.path} className="cowork-settings__row cowork-settings__row--folder">
              <span className="cowork-settings__folder">{icons.folder(ROW_ICON)}</span>
              <div className="cowork-settings__text">
                <b className="cowork-settings__title">
                  {row.name} <span className="cowork-settings__where">{row.where}</span>
                </b>
              </div>
              <div className="cowork-settings__control">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("cowork.settings_folder_remove_label", { name: row.name })}
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
      <p className="cowork-settings__note">
        {icons.lock(BUTTON_ICON)}
        {t("cowork.settings_folders_note")}
      </p>
    </>
  );
}

function FoldersSection() {
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
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
    return <EmptyState title={t("cowork.settings_folders_error_title")} description={t("cowork.settings_try_again")} />;
  }

  const list = folders.data ?? [];
  const onRemove = (path: string) => {
    setRemoving(path);
    removeFolder({ client: live?.client ?? null, workspaceId: live?.workspaceId ?? null, folders: list, showToast }, path)
      .then((rest) => {
        queryClient.setQueryData(foldersKey, rest);
        void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
      })
      .catch(() => showToast(t("cowork.settings_folder_remove_failed"), t("cowork.settings_try_again"), "danger"))
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

export function keyLine(connected: boolean | null, link: RedrobKeyLink = connected ? "own" : "none"): string {
  if (connected === null) return t("cowork.settings_key_checking");
  if (!connected) return t("cowork.settings_key_not_connected");
  return link === "launcher" ? t("cowork.settings_key_launcher") : t("cowork.settings_key_connected");
}

export type PlanViewProps = {
  connected: boolean | null;
  /** Where the key came from; "launcher" shows the Redrob Launcher line and offers to add an own key. */
  link?: RedrobKeyLink;
  onChangeKey: () => void;
  onOpenBilling: () => void;
  /** The key entry from onboarding, open over the screen while the key is being changed. */
  keyStep: KeyStepState | null;
};

export function PlanView(props: PlanViewProps) {
  return (
    <>
      <Group title={t("cowork.settings_group_ai")}>
        <div className="cowork-settings__auto">
          <ProtectionStatus
            tone="brand"
            icon={icons.sparkle({ width: 22, height: 22, "aria-hidden": true })}
            title={t("cowork.settings_auto_title")}
            live={props.connected ? t("cowork.settings_auto_live") : undefined}
          >
            {t("cowork.settings_auto_text")}
          </ProtectionStatus>
          <div className="cowork-settings__actions">
            <Link className="cowork-settings__action" to="/guide">
              {icons.book(BUTTON_ICON)}
              {t("cowork.settings_guide")}
            </Link>
            <a
              className="cowork-settings__action"
              href={REDROB_CONSOLE_BILLING_URL}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                props.onOpenBilling();
              }}
            >
              {t("cowork.settings_billing")}
              {icons.arrowUpRight(BUTTON_ICON)}
            </a>
          </div>
        </div>
        <Row title={t("cowork.settings_key")} description={keyLine(props.connected, props.link)}>
          <Button size="sm" variant="secondary" iconLeft={icons.key(BUTTON_ICON)} onClick={props.onChangeKey}>
            {props.connected === false || props.link === "launcher"
              ? t("cowork.settings_key_add")
              : t("cowork.settings_key_change")}
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
          skipLabel={t("cowork.settings_key_cancel")}
          copy={{
            getKey: t("cowork.settings_key_get"),
            label: t("cowork.settings_key"),
            placeholder: t("cowork.settings_key_placeholder"),
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
  const status = useRedrobKeyStatus();
  const connected = status === null ? null : status.connected;
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
        showToast(t("cowork.settings_key_saved"), t("cowork.settings_key_saved_text"));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("welcome.redrob_key_error_server")))
      .finally(() => setBusy(false));
  };

  return (
    <PlanView
      connected={connected}
      link={status?.link}
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

function SectionBody(props: { section: CoworkSettingsSection }) {
  switch (props.section) {
    case "general":
      return (
        <>
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

/** `/settings/general`, `/settings/folders`, `/settings/plan`, inside the Cowork frame. */
export function CoworkSettingsScreen(props: { section: CoworkSettingsSection }) {
  const developerMode = useFrameStore((state) => state.developerMode);
  return (
    <CoworkShell title={t("cowork.account_settings")} meta={coworkSettingsSectionLabel(props.section)} measure={false}>
      <CoworkSettingsView section={props.section} developerMode={developerMode}>
        <SectionBody section={props.section} />
      </CoworkSettingsView>
    </CoworkShell>
  );
}

/**
 * `/settings/*` and `/workspace/:id/settings/*`. The Cowork sections render here; a developer
 * page renders `developer` (the existing settings, with their own sidebar) while developer
 * mode is on; anything else, developer pages included when it is off, goes to General.
 */
export function CoworkSettingsGate(props: { developer: ReactNode }) {
  const developerMode = useFrameStore((state) => state.developerMode);
  return <CoworkSettingsGateView developer={props.developer} developerMode={developerMode} />;
}

export function CoworkSettingsGateView(props: { developer: ReactNode; developerMode: boolean }) {
  const route = resolveSettingsSection(useParams()["*"], props.developerMode);
  if (route.kind === "developer") return props.developer;
  if (route.kind === "redirect") return <Navigate to={route.to} replace />;
  // The developer route marks itself ready once its data loads; the Cowork screen has nothing to wait for.
  return (
    <RouteReady>
      <CoworkSettingsScreen section={route.section} />
    </RouteReady>
  );
}
