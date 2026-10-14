/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines } from "lucide-react";
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
import { playCue, stopReadAloud, voiceAccess, voiceAccessKey, type VoiceAccess } from "../../domains/session/voice/read-aloud";
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
 * Why the mic cannot listen here, or null when it can. `access` is this connection's voice answer,
 * undefined until it is known; the server refuses a recording at High or Strict, or from a
 * collaborator, anyway. A collaborator is never shown the mic (see `voiceOffered`).
 */
export function micUnavailableReason(env: {
  media: boolean;
  connected: boolean;
  access: VoiceAccess | undefined;
}): string | null {
  if (!env.media) return t("desk.mic_reason_device");
  if (!env.connected || env.access === undefined) return t("desk.mic_reason_connecting");
  if (env.access === "privacy") return t("desk.mic_reason_privacy");
  return null;
}

/** Collaborators do not get voice, so for them the mic and the voice conversation are not offered. */
export function voiceOffered(access: VoiceAccess | undefined): boolean {
  return access !== "not_owner";
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
  /** False where this connection does not get voice: no mic and no voice conversation are shown. */
  voice?: boolean;
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

/** Mic (dictation) and Plan/Run on the left; the model, then the voice-conversation toggle, sit last — the toggle immediately left of Send, as ChatGPT places its voice button. */
export function DeskComposerToolsView(props: DeskComposerToolsViewProps) {
  // The voice-conversation toggle (talk out loud, Cowork reads replies aloud). Rendered LAST so it
  // sits next to Send. A waveform icon (not the old mute-speaker glyph) distinguishes it from the
  // dictation mic — the two controls were near-identical before.
  const converse =
    props.voice === false || props.talk === null ? null : (
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
        <AudioLines width={16} height={16} aria-hidden />
      </IconButton>
    );
  return (
    <span className="desk-composer-tools">
      {/*
        Round 8, item 12: the dictation mic button is removed from the composer. Voice input now
        lives entirely in the voice-chat overlay (tap the orb to talk); the composer row keeps only
        the mode selector, the model control, and the voice-chat toggle.
      */}
      <ComposerMode
        label={t("desk.mode_label")}
        options={modeOptions()}
        value={props.mode}
        onChange={(value) => props.onModeChange(value === "plan" ? "plan" : "run")}
      />
      {props.children}
      {converse}
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
  const setVoiceMicToggle = useFrameStore((state) => state.setVoiceMicToggle);
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
  const { data: access } = useQuery({
    queryKey: voiceAccessKey(workspaceId),
    enabled: Boolean(client && workspaceId),
    queryFn: async (): Promise<VoiceAccess> => (client && workspaceId ? voiceAccess(client, workspaceId) : "not_owner"),
    staleTime: STALE_MS,
  });
  const micUnavailable = micUnavailableReason({
    media:
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined",
    connected: Boolean(client && workspaceId),
    access,
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
    setVoice(phase.kind);
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
    setVoice("idle");
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

  // Round 14, item F: register a click-toggle for the voice overlay's ORB. Tapping the orb starts
  // talking (idle -> recording) and tapping again stops + transcribes, reusing the SAME recorder as
  // the (removed) mic button. Kept in a ref so the registered closure always sees the latest state.
  useEffect(() => {
    if (micUnavailable) {
      setVoiceMicToggle(null);
      return;
    }
    const toggle = () => {
      if (talkRef.current) stopReadAloud();
      const now = Date.now();
      if (phaseRef.current.kind === "recording") {
        apply(micRelease(phaseRef.current, now), now);
      } else {
        apply(micPress(phaseRef.current, now), now);
      }
    };
    setVoiceMicToggle(toggle);
    return () => setVoiceMicToggle(null);
    // apply/enter/begin/finish are stable closures over refs; re-register only when availability flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micUnavailable, setVoiceMicToggle]);

  return (
    <DeskComposerToolsView
      mic={mic}
      secondsLeft={left}
      micUnavailable={micUnavailable}
      voice={voiceOffered(access)}
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
  /** Change the privacy level from here. Omitted when the level cannot be set (web, sample data). */
  onPrivacyLevelChange?: (level: PrivacyLevel) => void;
  /** The level is admin-locked for this workspace: shown, not changeable. */
  privacyLocked?: boolean;
  /** Who locked it, for the note. */
  privacyLockedBy?: string | null;
  /** A level change is in flight. */
  privacyBusy?: boolean;
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
        <div className="flex flex-col gap-3">
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
          {/*
            Selectable levels, right here (round 2, item E2). The design system's PrivacyProtection is
            read-only by design; this adds a chooser beside it, backed by services.privacy.setLevel via
            onPrivacyLevelChange. Hidden on the web and on sample data (no setter), and locked out when
            an admin set the level.
          */}
          {input.desktop && !input.privacy?.preview && input.onPrivacyLevelChange ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                {t("desk.privacy_page_levels_title")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(["off", "standard", "high", "strict"] as const).map((id) => {
                  const active = level === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={input.privacyLocked || input.privacyBusy}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-[var(--dls-accent)] bg-[var(--dls-accent)] text-[var(--dls-accent-fg)]"
                          : "border-dls-border text-muted-foreground hover:bg-muted"
                      } ${input.privacyLocked || input.privacyBusy ? "cursor-not-allowed opacity-60" : ""}`}
                      onClick={() => input.onPrivacyLevelChange?.(id)}
                    >
                      {id === "off" ? t("desk.privacy_off") : privacyLevelLabel(id)}
                    </button>
                  );
                })}
              </div>
              {input.privacyLocked ? (
                <span className="text-2xs text-subtle-foreground">
                  {input.privacyLockedBy
                    ? t("desk.privacy_page_level_locked_by", { name: input.privacyLockedBy })
                    : t("desk.privacy_page_level_locked")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
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
      return { level: result.data.level, preview: result.preview, locked: result.data.locked, setBy: result.data.setBy };
    },
    staleTime: STALE_MS,
  });
  const queryClient = useQueryClient();
  const setLevel = useMutation({
    mutationFn: (level: PrivacyLevel) => services.privacy.setLevel(level),
    onSuccess: (result) => {
      queryClient.setQueryData(["desk-composer", scope, "privacy"], {
        level: result.data.level,
        preview: result.preview,
        locked: result.data.locked,
        setBy: result.data.setBy,
      });
      // The menu and the privacy page read the level too.
      void queryClient.invalidateQueries({ queryKey: ["desk-nav"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-privacy"] });
    },
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
      privacy={privacy.data ? { level: privacy.data.level, preview: privacy.data.preview } : null}
      onPrivacyLevelChange={
        privacy.data && !privacy.data.preview && isDesktopRuntime()
          ? (level) => setLevel.mutate(level)
          : undefined
      }
      privacyLocked={privacy.data?.locked ?? false}
      privacyLockedBy={privacy.data?.setBy ?? null}
      privacyBusy={setLevel.isPending}
      memory={memory}
      onMemoryChange={(next) => setMemory(props.chatKey, next)}
      project={project.data ?? null}
      notes={notes.data ?? null}
      checks={prefs.deskCrossCheck}
      onChecksChange={(next) => setPrefs((previous) => ({ ...previous, deskCrossCheck: next }))}
    />
  );
}
