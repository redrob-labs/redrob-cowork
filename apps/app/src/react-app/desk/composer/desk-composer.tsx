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
import { playCue, stopReadAloud, voiceAllowedForPrivacy } from "../../domains/session/voice/read-aloud";
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
import { createDeskServices } from "../services/real-services";
import { privacyLevelLabel } from "../shell/nav";
import type { ChatMemory, ChatMode, PrivacyLevel } from "../services/types";
import { useDeskConnection } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";
import {
  appendTranscript,
  memoryFor,
  modeFor,
  talkFor,
  transcriptHandler,
  useDeskComposerStore,
  type DeskCrossCheck,
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
  if (!env.media) return t("desk.mic_reason_device");
  if (!env.connected || env.voiceAllowed === undefined) return t("desk.mic_reason_connecting");
  if (!env.voiceAllowed) return t("desk.mic_reason_privacy");
  return null;
}

/**
 * Where a transcript goes. In a voice conversation it is sent at once, with whatever was typed
 * before it, when the chat can take a message; otherwise, and always outside one, it joins the draft.
 */
export function deliverTranscript(input: {
  talk: boolean;
  draft: string;
  text: string;
  send?: (message: string) => boolean;
}): "sent" | "drafted" {
  return input.talk && input.send?.(appendTranscript(input.draft, input.text)) ? "sent" : "drafted";
}

/** Whole seconds left in a recording that started at `startedAt`. */
export function secondsLeft(startedAt: number, now: number): number {
  return Math.max(0, Math.ceil((MAX_RECORDING_MS - (now - startedAt)) / 1000));
}

/** What a failed recording or transcription says, in the app's language where the reason is known. */
export function micFailureText(error: unknown): string | undefined {
  if (error instanceof RedrobServerError && error.code === "voice_off_for_privacy") return t("desk.mic_reason_privacy");
  return error instanceof Error ? error.message : undefined;
}

function modeOptions(): ComposerModeOption[] {
  return [
    { value: "plan", label: t("desk.mode_plan"), icon: "route", hint: t("desk.mode_plan_hint") },
    { value: "run", label: t("desk.mode_run"), icon: "play", hint: t("desk.mode_run_hint") },
  ];
}

export type DeskComposerToolsViewProps = {
  mic: MicPhase["kind"];
  /** Seconds left while recording; shown beside the mic. */
  secondsLeft: number | null;
  /** Set when the mic cannot listen here; the button is disabled and says why. */
  micUnavailable: string | null;
  onMicPress: () => void;
  onMicRelease: () => void;
  /** Whether this chat is a voice conversation; null where a spoken message cannot be sent. */
  talk: boolean | null;
  onTalkChange: (talk: boolean) => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** The model control, last. */
  children?: ReactNode;
};

/** Mic, then Plan or Run, then the model: the composer's tools inside the Desk frame. */
export function DeskComposerToolsView(props: DeskComposerToolsViewProps) {
  const recording = props.mic === "recording";
  const label = props.micUnavailable
    ? t("desk.mic_unavailable_label", { reason: props.micUnavailable })
    : recording
      ? t("desk.mic_stop")
      : props.mic === "transcribing"
        ? t("desk.mic_transcribing")
        : t("desk.mic_start");
  return (
    <span className="desk-composer-tools">
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
          {t("desk.mic_seconds_left", { seconds: props.secondsLeft })}
        </span>
      ) : null}
      {props.talk === null ? null : (
        <IconButton
          label={
            props.micUnavailable
              ? t("desk.voice_chat_unavailable_label", { reason: props.micUnavailable })
              : props.talk
                ? t("desk.voice_chat_stop")
                : t("desk.voice_chat_start")
          }
          size="sm"
          round
          variant={props.talk ? "secondary" : "ghost"}
          aria-pressed={props.talk}
          disabled={Boolean(props.micUnavailable)}
          onClick={() => props.onTalkChange(!props.talk)}
        >
          {props.talk ? icons.volume(MIC_ICON) : icons.volumeOff(MIC_ICON)}
        </IconButton>
      )}
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
  /**
   * Sends `message` as pressing Send would, and says whether it went. Without it there is no voice
   * conversation here, and the mic only writes into the draft.
   */
  onSendText?: (message: string) => boolean;
  children?: ReactNode;
};

/** The tools wired up: Plan or Run per chat, the mic writing into the draft, or talking with Desk. */
export function DeskComposerTools(props: DeskComposerToolsProps) {
  const { prefs } = useLocal();
  const mode = useDeskComposerStore((state) => modeFor(state.chats, props.chatKey, prefs.deskNewChatMode));
  const setMode = useDeskComposerStore((state) => state.setMode);
  const talk = useDeskComposerStore((state) => talkFor(state.chats, props.chatKey));
  const setTalk = useDeskComposerStore((state) => state.setTalk);
  const setVoice = useFrameStore((state) => state.setVoice);
  const showToast = useFrameStore((state) => state.showToast);
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const draftRef = useRef(props.draft);
  draftRef.current = props.draft;
  const onDraftChangeRef = useRef(props.onDraftChange);
  onDraftChangeRef.current = props.onDraftChange;
  const onSendTextRef = useRef(props.onSendText);
  onSendTextRef.current = props.onSendText;
  const talkRef = useRef(talk);
  talkRef.current = talk;
  const chatKeyRef = useRef(props.chatKey);
  chatKeyRef.current = props.chatKey;

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
    showToast(t("desk.mic_failed"), micFailureText(error));
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
    // In a conversation the toggle's own note already said what the mic does.
    if (!talkRef.current) showToast(t("desk.mic_toast_title"), t("desk.mic_toast_text"));
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
          enter({ kind: "idle" });
          if (!text) return;
          const talking = talkRef.current && Boolean(onSendTextRef.current);
          const delivered = deliverTranscript({
            talk: talking,
            draft: draftRef.current,
            text,
            send: onSendTextRef.current,
          });
          if (delivered === "sent") {
            useDeskComposerStore.getState().awaitReply(chatKeyRef.current);
            void playCue(client, workspaceId);
            return;
          }
          onTranscript(text);
          if (talking) showToast(t("desk.voice_chat_busy_title"), t("desk.voice_chat_busy_text"));
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
    <DeskComposerToolsView
      mic={mic}
      secondsLeft={left}
      micUnavailable={micUnavailable}
      onMicPress={() => {
        if (micUnavailable) return;
        // In a conversation, talking over Desk stops it, as it would a person.
        if (talk) stopReadAloud();
        const now = Date.now();
        apply(micPress(phaseRef.current, now), now);
      }}
      onMicRelease={() => {
        const now = Date.now();
        apply(micRelease(phaseRef.current, now), now);
      }}
      talk={props.onSendText ? talk : null}
      onTalkChange={(next) => {
        setTalk(props.chatKey, next);
        if (next) {
          showToast(t("desk.voice_chat_toast_title"), t("desk.voice_chat_toast_text"));
        } else {
          stopReadAloud();
          useDeskComposerStore.getState().takeReply(props.chatKey);
        }
      }}
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

const PRIVACY_N: Record<PrivacyLevel, number> = { off: 0, standard: 1, high: 2, strict: 3 };

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
      value: privacyOn ? privacyLevelLabel(level) : t("desk.privacy_off"),
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
