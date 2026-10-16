/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { RedrobServerError } from "../../../app/lib/redrob-server";
import { voiceAllowedForPrivacy } from "../../domains/session/voice/read-aloud";
import {
  MAX_RECORDING_MS,
  micPress,
  micRelease,
  startRecording,
  transcribeClip,
  type MicPhase,
  type MicStep,
  type Recording,
} from "../../domains/session/voice/voice-dictation";
import { createCoworkServices } from "../services/real-services";
import { privacyLevelLabel } from "../shell/nav";
import type { ChatMemory, ChatMode, PrivacyLevel } from "../services/types";
import { useCoworkConnection } from "../shell/cowork-connection";
import { useFrameStore } from "../store/frame-store";
import {
  memoryFor,
  modeFor,
  transcriptHandler,
  useCoworkComposerStore,
  type CoworkCrossCheck,
} from "./composer-state";

const STATUS_ICON = { width: 14, height: 14, "aria-hidden": true };
const MIC_ICON = { width: 16, height: 16, "aria-hidden": true };
const STALE_MS = 30_000;

/**
 * Why the mic cannot listen here, or null when it can. `voiceAllowed` is the workspace's privacy
 * answer, undefined until it is known; the server refuses a recording at High or Strict anyway.
 */
export function micUnavailableReason(env: {
  media: boolean;
  connected: boolean;
  voiceAllowed: boolean | undefined;
}): string | null {
  if (!env.media) return t("cowork.mic_reason_device");
  if (!env.connected || env.voiceAllowed === undefined) return t("cowork.mic_reason_connecting");
  if (!env.voiceAllowed) return t("cowork.mic_reason_privacy");
  return null;
}

/** Whole seconds left in a recording that started at `startedAt`. */
export function secondsLeft(startedAt: number, now: number): number {
  return Math.max(0, Math.ceil((MAX_RECORDING_MS - (now - startedAt)) / 1000));
}

/** What a failed recording or transcription says, in the app's language where the reason is known. */
export function micFailureText(error: unknown): string | undefined {
  if (error instanceof RedrobServerError && error.code === "voice_off_for_privacy") return t("cowork.mic_reason_privacy");
  return error instanceof Error ? error.message : undefined;
}

function modeOptions(): ComposerModeOption[] {
  return [
    { value: "plan", label: t("cowork.mode_plan"), icon: "route", hint: t("cowork.mode_plan_hint") },
    { value: "run", label: t("cowork.mode_run"), icon: "play", hint: t("cowork.mode_run_hint") },
  ];
}

export type CoworkComposerToolsViewProps = {
  mic: MicPhase["kind"];
  /** Seconds left while recording; shown beside the mic. */
  secondsLeft: number | null;
  /** Set when the mic cannot listen here; the button is disabled and says why. */
  micUnavailable: string | null;
  onMicPress: () => void;
  onMicRelease: () => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** The model control, last. */
  children?: ReactNode;
};

/** Mic, then Plan or Run, then the model: the composer's tools inside the Cowork frame. */
export function CoworkComposerToolsView(props: CoworkComposerToolsViewProps) {
  const recording = props.mic === "recording";
  const label = props.micUnavailable
    ? t("cowork.mic_unavailable_label", { reason: props.micUnavailable })
    : recording
      ? t("cowork.mic_stop")
      : props.mic === "transcribing"
        ? t("cowork.mic_transcribing")
        : t("cowork.mic_start");
  return (
    <span className="cowork-composer-tools">
      <IconButton
        label={label}
        size="sm"
        round
        variant={recording ? "secondary" : "ghost"}
        aria-pressed={recording}
        aria-busy={props.mic === "transcribing"}
        disabled={Boolean(props.micUnavailable)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // Keep the release on this button even when the pointer drifts off it mid-hold.
          event.currentTarget.setPointerCapture?.(event.pointerId);
          props.onMicPress();
        }}
        onPointerUp={props.onMicRelease}
        onPointerCancel={props.onMicRelease}
        onClick={(event) => {
          // A keyboard press has no pointer: it is a tap, which starts or stops.
          if (event.detail !== 0) return;
          props.onMicPress();
          props.onMicRelease();
        }}
      >
        {recording ? icons.micOff(MIC_ICON) : icons.mic(MIC_ICON)}
      </IconButton>
      {recording && props.secondsLeft !== null ? (
        <span className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">
          {t("cowork.mic_seconds_left", { seconds: props.secondsLeft })}
        </span>
      ) : null}
      <ComposerMode
        label={t("cowork.mode_label")}
        options={modeOptions()}
        value={props.mode}
        onChange={(value) => props.onModeChange(value === "plan" ? "plan" : "run")}
      />
      {props.children}
    </span>
  );
}

export type CoworkComposerToolsProps = {
  /** The session id, or the new chat key. */
  chatKey: string;
  draft: string;
  onDraftChange: (draft: string) => void;
  children?: ReactNode;
};

/** The tools wired up: Plan or Run per chat, and the mic writing into the draft. */
export function CoworkComposerTools(props: CoworkComposerToolsProps) {
  const { prefs } = useLocal();
  const mode = useCoworkComposerStore((state) => modeFor(state.chats, props.chatKey, prefs.coworkNewChatMode));
  const setMode = useCoworkComposerStore((state) => state.setMode);
  const setVoice = useFrameStore((state) => state.setVoice);
  const showToast = useFrameStore((state) => state.showToast);
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const draftRef = useRef(props.draft);
  draftRef.current = props.draft;
  const onDraftChangeRef = useRef(props.onDraftChange);
  onDraftChangeRef.current = props.onDraftChange;

  // The same question, and the same cache entry, as read-aloud's button.
  const { data: voiceAllowed } = useQuery({
    queryKey: ["voice-allowed", workspaceId],
    enabled: Boolean(client && workspaceId),
    queryFn: async () =>
      client && workspaceId ? voiceAllowedForPrivacy((await client.getConfig(workspaceId)).redrob) : false,
    staleTime: STALE_MS,
  });
  const micUnavailable = micUnavailableReason({
    media:
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined",
    connected: Boolean(client && workspaceId),
    voiceAllowed,
  });

  const [mic, setMic] = useState<MicPhase["kind"]>("idle");
  const [left, setLeft] = useState<number | null>(null);
  const phaseRef = useRef<MicPhase>({ kind: "idle" });
  const recordingRef = useRef<Promise<Recording> | null>(null);
  const tickRef = useRef<number | null>(null);
  // Each recording gets a number; anything that settles after a newer one began, or after unmount, is dropped.
  const attemptRef = useRef(0);

  const enter = (phase: MicPhase) => {
    phaseRef.current = phase;
    setMic(phase.kind);
    setVoice(phase.kind === "recording");
    if (phase.kind !== "recording" && tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
      setLeft(null);
    }
  };
  const fail = (attempt: number, error: unknown) => {
    if (attempt !== attemptRef.current) return;
    // Retire the attempt, so the same failure seen by a second handler is not shown twice.
    attemptRef.current += 1;
    enter({ kind: "idle" });
    showToast(t("cowork.mic_failed"), micFailureText(error));
  };

  useEffect(() => () => {
    attemptRef.current += 1;
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    void recordingRef.current?.then((recording) => recording.cancel(), () => undefined);
    recordingRef.current = null;
    setVoice(false);
  }, [setVoice]);

  const begin = (startedAt: number) => {
    const attempt = ++attemptRef.current;
    showToast(t("cowork.mic_toast_title"), t("cowork.mic_toast_text"));
    setLeft(secondsLeft(startedAt, startedAt));
    tickRef.current = window.setInterval(() => setLeft(secondsLeft(startedAt, Date.now())), 250);
    const started = startRecording(() => {
      // At the limit the recording is sent as if the mic were let go.
      if (attempt === attemptRef.current && phaseRef.current.kind === "recording") finish(attempt);
    });
    recordingRef.current = started;
    started.catch((error: unknown) => fail(attempt, error));
  };

  const finish = (attempt: number) => {
    enter({ kind: "transcribing" });
    const started = recordingRef.current;
    recordingRef.current = null;
    if (!started || !client || !workspaceId) return enter({ kind: "idle" });
    const onTranscript = transcriptHandler(() => draftRef.current, (next) => onDraftChangeRef.current(next));
    started
      .then((recording) => recording.finish())
      .then((clip) => (clip ? transcribeClip(client, workspaceId, clip) : null))
      .then(
        (text) => {
          if (attempt !== attemptRef.current) return;
          if (text) onTranscript(text);
          enter({ kind: "idle" });
        },
        (error: unknown) => fail(attempt, error),
      );
  };

  const apply = (step: MicStep, now: number) => {
    if (step.action === "start") {
      enter(step.phase);
      begin(now);
    } else if (step.action === "stop") {
      finish(attemptRef.current);
    } else {
      phaseRef.current = step.phase;
    }
  };

  return (
    <CoworkComposerToolsView
      mic={mic}
      secondsLeft={left}
      micUnavailable={micUnavailable}
      onMicPress={() => {
        if (micUnavailable) return;
        const now = Date.now();
        apply(micPress(phaseRef.current, now), now);
      }}
      onMicRelease={() => {
        const now = Date.now();
        apply(micRelease(phaseRef.current, now), now);
      }}
      mode={mode}
      onModeChange={(next) => setMode(props.chatKey, next)}
    >
      {props.children}
    </CoworkComposerToolsView>
  );
}

function crossCheckLevels() {
  return [
    { value: "off", label: t("cowork.check_off") },
    { value: "auto", label: t("cowork.check_auto") },
    { value: "always", label: t("cowork.check_always") },
  ];
}

function crossChecks() {
  return [
    { id: "factCheck", name: t("cowork.check_fact"), text: t("cowork.check_fact_text") },
    { id: "challenge", name: t("cowork.check_challenge"), text: t("cowork.check_challenge_text") },
  ];
}

/** The status line's word for Cross-check, through the design system's rule, in the app's language. */
export function crossCheckStatusValue(checks: CoworkCrossCheck): string {
  const definitions = crossChecks();
  const value = CrossCheckSetting.value(checks, definitions, crossCheckLevels());
  if (value === "On") return t("cowork.check_on");
  const some = /^(\d+) of (\d+) on$/.exec(value);
  return some ? t("cowork.check_some_on", { on: Number(some[1]), of: Number(some[2]) }) : value;
}

function isLevel(value: string | undefined): value is CrossCheckLevel {
  return value === "off" || value === "auto" || value === "always";
}

export function toCoworkCrossCheck(value: CrossCheckValue, previous: CoworkCrossCheck): CoworkCrossCheck {
  const { factCheck, challenge } = value;
  return {
    factCheck: isLevel(factCheck) ? factCheck : previous.factCheck,
    challenge: isLevel(challenge) ? challenge : previous.challenge,
  };
}

export function memoryStatusValue(memory: ChatMemory): string {
  return memory === "none" ? t("cowork.memory_off") : t("cowork.memory_on");
}

function isChatMemory(value: string): value is ChatMemory {
  return value === "project" || value === "all" || value === "none";
}

const PRIVACY_N: Record<PrivacyLevel, number> = { off: 0, standard: 1, high: 2, strict: 3 };

export type CoworkStatusInput = {
  /** False on the web, where the check cannot run. */
  desktop: boolean;
  privacy: { level: PrivacyLevel; preview: boolean } | null;
  memory: ChatMemory;
  onMemoryChange: (memory: ChatMemory) => void;
  /** The project this chat is in; null outside one (the Personal workspace). */
  project: { name: string } | null;
  notes: { all: number; project: number; you: number } | null;
  checks: CoworkCrossCheck;
  onChecksChange: (checks: CoworkCrossCheck) => void;
  /** Round 38 (item 2): show the setting value/level on each chip. True on the hero
   *  (the main new-chat screen keeps the values visible); false in-chat, where the
   *  chips are icon + title only. Defaults to true. */
  showValues?: boolean;
};

/** Privacy, Memory and Cross-check: what will happen to this message, before Send. */
export function coworkStatusItems(input: CoworkStatusInput): ComposerStatusItem[] {
  // Round 38 (item 2): the hero keeps the value/level visible; the in-chat row is
  // icon + title only. Default to showing values (hero/sample renders).
  const showValues = input.showValues !== false;
  // Sample data is not protection: only a real state can turn the chip on.
  const level = input.privacy && !input.privacy.preview ? input.privacy.level : "off";
  const privacyOn = input.desktop && level !== "off";
  const levels = [
    { id: "standard", label: t("cowork.privacy_standard"), n: 1 },
    { id: "high", label: t("cowork.privacy_high"), n: 2 },
    { id: "strict", label: t("cowork.privacy_strict"), n: 3 },
  ];
  const notes = input.notes;
  const memoryOptions: MemoryScopeOption[] = [
    ...(input.project
      ? [{
          value: "project",
          label: t("cowork.memory_project"),
          detail: notes ? t("cowork.memory_project_detail", { count: notes.project, name: input.project.name, you: notes.you }) : undefined,
          summary: t("cowork.memory_project_summary"),
        }]
      : []),
    {
      value: "all",
      label: t("cowork.memory_all"),
      detail: notes ? t("cowork.memory_all_detail", { count: notes.all }) : undefined,
      summary: t("cowork.memory_all_summary"),
    },
    { value: "none", label: t("cowork.memory_off"), detail: t("cowork.memory_none_detail"), off: true },
  ];
  const checksOff = input.checks.factCheck === "off" && input.checks.challenge === "off";

  return [
    {
      id: "privacy",
      icon: icons.shieldCheck(STATUS_ICON),
      tone: privacyOn ? "safe" : "plain",
      name: t("cowork.status_privacy"),
      // Round 38 (item 2): value/level only on the hero (showValues); in-chat is icon + title.
      value: showValues ? (privacyOn ? privacyLevelLabel(level) : t("cowork.privacy_off")) : undefined,
      level: showValues && privacyOn ? { n: PRIVACY_N[level], of: levels.length } : undefined,
      panelLabel: t("cowork.nav_privacy"),
      panel: (
        <PrivacyProtection
          compact
          state={privacyOn ? "on" : "off"}
          level={level}
          levels={levels}
          showLevels={false}
          onLabel={t("cowork.privacy_on_title")}
          running={input.privacy?.preview ? t("cowork.privacy_sample") : t("cowork.privacy_running")}
          lede={t("cowork.privacy_lede")}
          offTitle={input.desktop ? t("cowork.privacy_page_off_title") : t("cowork.privacy_off_title")}
          offText={input.desktop ? t("cowork.privacy_page_off_text") : t("cowork.privacy_off_text")}
        />
      ),
    },
    {
      id: "memory",
      icon: icons.bookOpen(STATUS_ICON),
      tone: input.memory === "none" ? "plain" : "on",
      name: t("cowork.status_memory"),
      value: showValues ? memoryStatusValue(input.memory) : undefined,
      panelLabel: t("cowork.nav_memory"),
      panel: (
        <MemoryScope
          compact
          value={input.memory}
          options={memoryOptions}
          label={t("cowork.memory_scope_label")}
          onTitle={t("cowork.memory_on_title")}
          offTitle={t("cowork.memory_off_title")}
          offText={t("cowork.memory_off_text")}
          lede={t("cowork.memory_lede")}
          foot={<span>{t("cowork.memory_foot")}</span>}
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
      name: t("cowork.status_check"),
      value: showValues ? crossCheckStatusValue(input.checks) : undefined,
      panelLabel: t("cowork.status_check"),
      panel: (
        <CrossCheckSetting
          compact
          value={input.checks}
          checks={crossChecks()}
          levels={crossCheckLevels()}
          lede={t("cowork.check_lede")}
          whenItMatters={t("cowork.check_when")}
          foot={<span>{t("cowork.check_foot")}</span>}
          onChange={(value) => input.onChecksChange(toCoworkCrossCheck(value, input.checks))}
        />
      ),
    },
  ];
}

export function CoworkComposerStatusView(props: CoworkStatusInput) {
  return <ComposerStatus className="cowork-composer-status" label={t("cowork.status_label")} items={coworkStatusItems(props)} />;
}

/** The status line wired up: privacy from the Cowork services, memory per chat, Cross-check from prefs. */
export function CoworkComposerStatus(props: { chatKey: string; showValues?: boolean }) {
  const { prefs, setPrefs } = useLocal();
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const services = useMemo(() => createCoworkServices({ client, workspaceId }), [client, workspaceId]);
  const scope = workspaceId ?? "preview";

  const privacy = useQuery({
    queryKey: ["cowork-composer", scope, "privacy"],
    queryFn: async () => {
      const result = await services.privacy.get();
      return { level: result.data.level, preview: result.preview };
    },
    staleTime: STALE_MS,
  });
  const project = useQuery({
    queryKey: ["cowork-composer", scope, "project"],
    enabled: Boolean(client && workspaceId),
    queryFn: async () => {
      const workspace = (await client?.listWorkspaces())?.items.find((entry) => entry.id === workspaceId);
      if (!workspace || workspace.kind === "personal") return null;
      return { name: workspace.displayName?.trim() || workspace.name };
    },
    staleTime: STALE_MS,
  });
  const notes = useQuery({
    queryKey: ["cowork-composer", scope, "notes"],
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
  const memory = useCoworkComposerStore((state) => memoryFor(state.chats, props.chatKey, inProject));
  const setMemory = useCoworkComposerStore((state) => state.setMemory);

  // Round 33: on a real workspace, the whole status row paints its default values
  // (Privacy Off, etc.) for one frame while the connection + privacy query resolve,
  // then flips to the true values -- the "blink" on the Conversations home. Hold a
  // fixed-height placeholder until the privacy answer is in, so nothing flips. Gated
  // on a bound workspace: with no workspace (sample/static render) there is nothing
  // to resolve, so the row renders immediately as before (keeps the SSR test green).
  if (workspaceId && privacy.isPending) {
    return <div className="cowork-composer-status cowork-composer-status--loading" aria-hidden="true" />;
  }

  return (
    <CoworkComposerStatusView
      desktop={isDesktopRuntime()}
      showValues={props.showValues}
      privacy={privacy.data ?? null}
      memory={memory}
      onMemoryChange={(next) => setMemory(props.chatKey, next)}
      project={project.data ?? null}
      notes={notes.data ?? null}
      checks={prefs.coworkCrossCheck}
      onChecksChange={(next) => setPrefs((previous) => ({ ...previous, coworkCrossCheck: next }))}
    />
  );
}
