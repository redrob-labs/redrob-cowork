/** @jsxImportSource react */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposerMode,
  ComposerStatus,
  CrossCheckSetting,
  IconButton,
  MemoryScope,
  PrivacyProtection,
  icons,
  type ComposerModeOption,
  type ComposerStatusItem,
  type CrossCheckLevel,
  type CrossCheckValue,
  type MemoryScopeOption,
} from "@redrob-labs/ui";

import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { t } from "../../../i18n";
import { useLocal } from "../../kernel/local-provider";
import { startDictation } from "../../domains/session/voice/voice-dictation";
import { createDeskServices } from "../services/real-services";
import type { ChatMemory, ChatMode, PrivacyLevel } from "../services/types";
import { useDeskConnection } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";
import {
  memoryFor,
  modeFor,
  transcriptHandler,
  useDeskComposerStore,
  type DeskCrossCheck,
} from "./composer-state";

const STATUS_ICON = { width: 14, height: 14, "aria-hidden": true };
const MIC_ICON = { width: 16, height: 16, "aria-hidden": true };
const STALE_MS = 30_000;

/** Why the mic cannot listen here, or null when it can. */
export function micUnavailableReason(env: { desktop: boolean; media: boolean; connected: boolean }): string | null {
  if (!env.desktop) return t("desk.mic_reason_web");
  if (!env.media) return t("desk.mic_reason_device");
  if (!env.connected) return t("desk.mic_reason_connecting");
  return null;
}

function modeOptions(): ComposerModeOption[] {
  return [
    { value: "plan", label: t("desk.mode_plan"), icon: "route", hint: t("desk.mode_plan_hint") },
    { value: "run", label: t("desk.mode_run"), icon: "play", hint: t("desk.mode_run_hint") },
  ];
}

export type DeskComposerToolsViewProps = {
  listening: boolean;
  /** Set when the mic cannot listen here; the button is disabled and says why. */
  micUnavailable: string | null;
  onMic: () => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** The model control, last. */
  children?: ReactNode;
};

/** Mic, then Plan or Run, then the model: the composer's tools inside the Desk frame. */
export function DeskComposerToolsView(props: DeskComposerToolsViewProps) {
  const label = props.micUnavailable
    ? t("desk.mic_unavailable_label", { reason: props.micUnavailable })
    : props.listening
      ? t("desk.mic_stop")
      : t("desk.mic_start");
  return (
    <span className="desk-composer-tools">
      <IconButton
        label={label}
        size="sm"
        round
        variant={props.listening ? "secondary" : "ghost"}
        aria-pressed={props.listening}
        disabled={Boolean(props.micUnavailable)}
        onClick={props.onMic}
      >
        {props.listening ? icons.micOff(MIC_ICON) : icons.mic(MIC_ICON)}
      </IconButton>
      <ComposerMode
        label={t("desk.mode_label")}
        options={modeOptions()}
        value={props.mode}
        onChange={(value) => props.onModeChange(value === "plan" ? "plan" : "run")}
      />
      {props.children}
    </span>
  );
}

export type DeskComposerToolsProps = {
  /** The session id, or the new chat key. */
  chatKey: string;
  draft: string;
  onDraftChange: (draft: string) => void;
  children?: ReactNode;
};

/** The tools wired up: Plan or Run per chat, and the mic writing into the draft. */
export function DeskComposerTools(props: DeskComposerToolsProps) {
  const { prefs } = useLocal();
  const mode = useDeskComposerStore((state) => modeFor(state.chats, props.chatKey, prefs.deskNewChatMode));
  const setMode = useDeskComposerStore((state) => state.setMode);
  const listening = useFrameStore((state) => state.voice);
  const setVoice = useFrameStore((state) => state.setVoice);
  const showToast = useFrameStore((state) => state.showToast);
  const client = useDeskConnection((state) => state.client);
  const draftRef = useRef(props.draft);
  draftRef.current = props.draft;
  const onDraftChangeRef = useRef(props.onDraftChange);
  onDraftChangeRef.current = props.onDraftChange;
  const stopRef = useRef<(() => void) | null>(null);

  const micUnavailable = micUnavailableReason({
    desktop: isDesktopRuntime(),
    media: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof RTCPeerConnection !== "undefined",
    connected: Boolean(client),
  });

  // Each start gets a number; a start that finishes after Stop (or unmount) is closed at once.
  const attemptRef = useRef(0);
  const release = () => {
    attemptRef.current += 1;
    stopRef.current?.();
    stopRef.current = null;
  };
  useEffect(() => () => {
    release();
    setVoice(false);
  }, [setVoice]);

  const onMic = () => {
    if (listening) {
      release();
      setVoice(false);
      return;
    }
    if (!client) return;
    const attempt = ++attemptRef.current;
    setVoice(true);
    showToast(t("desk.mic_toast_title"), t("desk.mic_toast_text"));
    const onTranscript = transcriptHandler(() => draftRef.current, (next) => onDraftChangeRef.current(next));
    startDictation(client, onTranscript).then(
      (stopDictation) => {
        if (attempt === attemptRef.current) stopRef.current = stopDictation;
        else stopDictation();
      },
      (error: unknown) => {
        if (attempt !== attemptRef.current) return;
        setVoice(false);
        showToast(t("desk.mic_failed"), error instanceof Error ? error.message : undefined);
      },
    );
  };

  return (
    <DeskComposerToolsView
      listening={listening}
      micUnavailable={micUnavailable}
      onMic={onMic}
      mode={mode}
      onModeChange={(next) => setMode(props.chatKey, next)}
    >
      {props.children}
    </DeskComposerToolsView>
  );
}

function crossCheckLevels() {
  return [
    { value: "off", label: t("desk.check_off") },
    { value: "auto", label: t("desk.check_auto") },
    { value: "always", label: t("desk.check_always") },
  ];
}

function crossChecks() {
  return [
    { id: "factCheck", name: t("desk.check_fact"), text: t("desk.check_fact_text") },
    { id: "challenge", name: t("desk.check_challenge"), text: t("desk.check_challenge_text") },
  ];
}

/** The status line's word for Cross-check, through the design system's rule, in the app's language. */
export function crossCheckStatusValue(checks: DeskCrossCheck): string {
  const definitions = crossChecks();
  const value = CrossCheckSetting.value(checks, definitions, crossCheckLevels());
  if (value === "On") return t("desk.check_on");
  const some = /^(\d+) of (\d+) on$/.exec(value);
  return some ? t("desk.check_some_on", { on: Number(some[1]), of: Number(some[2]) }) : value;
}

function isLevel(value: string | undefined): value is CrossCheckLevel {
  return value === "off" || value === "auto" || value === "always";
}

export function toDeskCrossCheck(value: CrossCheckValue, previous: DeskCrossCheck): DeskCrossCheck {
  const { factCheck, challenge } = value;
  return {
    factCheck: isLevel(factCheck) ? factCheck : previous.factCheck,
    challenge: isLevel(challenge) ? challenge : previous.challenge,
  };
}

export function memoryStatusValue(memory: ChatMemory): string {
  return memory === "none" ? t("desk.memory_off") : t("desk.memory_on");
}

function isChatMemory(value: string): value is ChatMemory {
  return value === "project" || value === "all" || value === "none";
}

const PRIVACY_N: Record<PrivacyLevel, number> = { off: 0, standard: 1, high: 2 };

function privacyLabel(level: PrivacyLevel): string {
  if (level === "high") return t("desk.privacy_high");
  if (level === "standard") return t("desk.privacy_standard");
  return t("desk.privacy_off");
}

export type DeskStatusInput = {
  /** False on the web, where the check cannot run. */
  desktop: boolean;
  privacy: { level: PrivacyLevel; preview: boolean } | null;
  memory: ChatMemory;
  onMemoryChange: (memory: ChatMemory) => void;
  /** The project this chat is in; null outside one (the Personal workspace). */
  project: { name: string } | null;
  notes: { all: number; project: number; you: number } | null;
  checks: DeskCrossCheck;
  onChecksChange: (checks: DeskCrossCheck) => void;
};

/** Privacy, Memory and Cross-check: what will happen to this message, before Send. */
export function deskStatusItems(input: DeskStatusInput): ComposerStatusItem[] {
  // Sample data is not protection: only a real state can turn the chip on.
  const level = input.privacy && !input.privacy.preview ? input.privacy.level : "off";
  const privacyOn = input.desktop && level !== "off";
  const levels = [
    { id: "standard", label: t("desk.privacy_standard"), n: 1 },
    { id: "high", label: t("desk.privacy_high"), n: 2 },
    { id: "strict", label: t("desk.privacy_strict"), n: 3 },
  ];
  const notes = input.notes;
  const memoryOptions: MemoryScopeOption[] = [
    ...(input.project
      ? [{
          value: "project",
          label: t("desk.memory_project"),
          detail: notes ? t("desk.memory_project_detail", { count: notes.project, name: input.project.name, you: notes.you }) : undefined,
          summary: t("desk.memory_project_summary"),
        }]
      : []),
    {
      value: "all",
      label: t("desk.memory_all"),
      detail: notes ? t("desk.memory_all_detail", { count: notes.all }) : undefined,
      summary: t("desk.memory_all_summary"),
    },
    { value: "none", label: t("desk.memory_off"), detail: t("desk.memory_none_detail"), off: true },
  ];
  const checksOff = input.checks.factCheck === "off" && input.checks.challenge === "off";

  return [
    {
      id: "privacy",
      icon: icons.shieldCheck(STATUS_ICON),
      tone: privacyOn ? "safe" : "plain",
      name: t("desk.status_privacy"),
      value: privacyOn ? privacyLabel(level) : t("desk.privacy_off"),
      level: privacyOn ? { n: PRIVACY_N[level], of: levels.length } : undefined,
      panelLabel: t("desk.nav_privacy"),
      panel: (
        <PrivacyProtection
          state={privacyOn ? "on" : "off"}
          level={level}
          levels={levels}
          showLevels={false}
          onLabel={t("desk.privacy_on_title")}
          running={input.privacy?.preview ? t("desk.privacy_sample") : t("desk.privacy_running")}
          lede={t("desk.privacy_lede")}
          offTitle={input.desktop ? t("desk.privacy_page_off_title") : t("desk.privacy_off_title")}
          offText={input.desktop ? t("desk.privacy_page_off_text") : t("desk.privacy_off_text")}
        />
      ),
    },
    {
      id: "memory",
      icon: icons.bookOpen(STATUS_ICON),
      tone: input.memory === "none" ? "plain" : "on",
      name: t("desk.status_memory"),
      value: memoryStatusValue(input.memory),
      panelLabel: t("desk.nav_memory"),
      panel: (
        <MemoryScope
          value={input.memory}
          options={memoryOptions}
          label={t("desk.memory_scope_label")}
          onTitle={t("desk.memory_on_title")}
          offTitle={t("desk.memory_off_title")}
          offText={t("desk.memory_off_text")}
          lede={t("desk.memory_lede")}
          foot={<span>{t("desk.memory_foot")}</span>}
          onChange={(value) => {
            if (isChatMemory(value)) input.onMemoryChange(value);
          }}
        />
      ),
    },
    {
      id: "check",
      icon: icons.compare(STATUS_ICON),
      tone: checksOff ? "plain" : "on",
      name: t("desk.status_check"),
      value: crossCheckStatusValue(input.checks),
      panelLabel: t("desk.status_check"),
      panel: (
        <CrossCheckSetting
          value={input.checks}
          checks={crossChecks()}
          levels={crossCheckLevels()}
          lede={t("desk.check_lede")}
          whenItMatters={t("desk.check_when")}
          foot={<span>{t("desk.check_foot")}</span>}
          onChange={(value) => input.onChecksChange(toDeskCrossCheck(value, input.checks))}
        />
      ),
    },
  ];
}

export function DeskComposerStatusView(props: DeskStatusInput) {
  return <ComposerStatus className="desk-composer-status" label={t("desk.status_label")} items={deskStatusItems(props)} />;
}

/** The status line wired up: privacy from the Desk services, memory per chat, Cross-check from prefs. */
export function DeskComposerStatus(props: { chatKey: string }) {
  const { prefs, setPrefs } = useLocal();
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const services = useMemo(() => createDeskServices({ client, workspaceId }), [client, workspaceId]);
  const scope = workspaceId ?? "preview";

  const privacy = useQuery({
    queryKey: ["desk-composer", scope, "privacy"],
    queryFn: async () => {
      const result = await services.privacy.get();
      return { level: result.data.level, preview: result.preview };
    },
    staleTime: STALE_MS,
  });
  const project = useQuery({
    queryKey: ["desk-composer", scope, "project"],
    enabled: Boolean(client && workspaceId),
    queryFn: async () => {
      const workspace = (await client?.listWorkspaces())?.items.find((entry) => entry.id === workspaceId);
      if (!workspace || workspace.kind === "personal") return null;
      return { name: workspace.displayName?.trim() || workspace.name };
    },
    staleTime: STALE_MS,
  });
  const notes = useQuery({
    queryKey: ["desk-composer", scope, "notes"],
    queryFn: async () => {
      const { data } = await services.notes.list();
      return {
        all: data.length,
        project: data.filter((note) => note.scope === `project:${workspaceId}`).length,
        you: data.filter((note) => note.scope === "you").length,
      };
    },
    staleTime: STALE_MS,
  });

  const inProject = Boolean(project.data);
  const memory = useDeskComposerStore((state) => memoryFor(state.chats, props.chatKey, inProject));
  const setMemory = useDeskComposerStore((state) => state.setMemory);

  return (
    <DeskComposerStatusView
      desktop={isDesktopRuntime()}
      privacy={privacy.data ?? null}
      memory={memory}
      onMemoryChange={(next) => setMemory(props.chatKey, next)}
      project={project.data ?? null}
      notes={notes.data ?? null}
      checks={prefs.deskCrossCheck}
      onChecksChange={(next) => setPrefs((previous) => ({ ...previous, deskCrossCheck: next }))}
    />
  );
}
