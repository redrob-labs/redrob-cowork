import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DeskFrameContext } from "../src/react-app/desk/shell/desk-frame";
import { SessionEmptyHero } from "../src/react-app/domains/session/chat/session-empty-hero";
import { LocalProvider } from "../src/react-app/kernel/local-provider";
import { WorkspaceProvider } from "../src/react-app/shell/workspace-provider";

import { setLocale } from "../src/i18n";
import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import {
  agentForMode,
  appendTranscript,
  createDeskComposerStore,
  DESK_COMPOSER_STORE_KEY,
  memoryFor,
  modeFor,
  NEW_CHAT_KEY,
  resolvePromptAgent,
  talkFor,
  transcriptHandler,
} from "../src/react-app/desk/composer/composer-state";
import { replyToRead, voiceReplyStep } from "../src/react-app/domains/session/voice/voice-conversation";
import {
  crossCheckStatusValue,
  deliverTranscript,
  deskStatusItems,
  DeskComposerStatusView,
  DeskComposerToolsView,
  micFailureText,
  micUnavailableReason,
  secondsLeft,
  type DeskStatusInput,
} from "../src/react-app/desk/composer/desk-composer";
import { RedrobServerError } from "../src/app/lib/redrob-server";
import {
  base64Of,
  HOLD_MS,
  MAX_RECORDING_MS,
  micPress,
  micRelease,
  pickRecorderType,
  recordingFormat,
  spokenText,
  transcribeClip,
  type MicPhase,
} from "../src/react-app/domains/session/voice/voice-dictation";

const SRC = join(import.meta.dir, "..", "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8").replaceAll("\r\n", "\n");
const noop = () => {};

afterEach(() => setLocale("en"));

describe("Plan and Run", () => {
  test("each mode has its own agent", () => {
    expect(agentForMode("plan")).toBe("redrob-plan");
    expect(agentForMode("run")).toBe("redrob-run");
  });

  test("inside the frame the mode decides the agent; outside, the picked agent does", () => {
    expect(resolvePromptAgent({ inFrame: true, mode: "plan", selectedAgent: "build" })).toBe("redrob-plan");
    expect(resolvePromptAgent({ inFrame: true, mode: "run", selectedAgent: null })).toBe("redrob-run");
    expect(resolvePromptAgent({ inFrame: false, mode: "plan", selectedAgent: "build" })).toBe("build");
    expect(resolvePromptAgent({ inFrame: false, mode: "run", selectedAgent: null })).toBeNull();
  });

  test("a chat starts in the preference and keeps its own choice", () => {
    const store = createDeskComposerStore();
    expect(modeFor(store.getState().chats, "s1", "run")).toBe("run");
    expect(modeFor(store.getState().chats, "s1", "plan")).toBe("plan");
    store.getState().setMode("s1", "plan");
    expect(modeFor(store.getState().chats, "s1", "run")).toBe("plan");
    expect(modeFor(store.getState().chats, "s2", "run")).toBe("run");
  });

  test("the new chat screen's choices move to the session it creates", () => {
    const store = createDeskComposerStore();
    store.getState().setMode(NEW_CHAT_KEY, "plan");
    store.getState().setMemory(NEW_CHAT_KEY, "none");
    store.getState().claimNewChat("s9");
    const { chats } = store.getState();
    expect(modeFor(chats, "s9", "run")).toBe("plan");
    expect(memoryFor(chats, "s9", false)).toBe("none");
    // The next new chat starts from the preference again.
    expect(modeFor(chats, NEW_CHAT_KEY, "run")).toBe("run");
  });

  test("a chat's choices outlive a restart, the new chat screen's pending one does not", () => {
    const saved = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
      removeItem: (key: string) => void saved.delete(key),
    });
    const first = createDeskComposerStore({ storage });
    first.getState().setMode("s1", "plan");
    first.getState().setMemory("s1", "none");
    first.getState().setMode(NEW_CHAT_KEY, "plan");
    expect(saved.get(DESK_COMPOSER_STORE_KEY)).toContain('"s1"');
    expect(saved.get(DESK_COMPOSER_STORE_KEY)).not.toContain(`"${NEW_CHAT_KEY}"`);

    // A synchronous storage hydrates as the store is made, as localStorage does.
    const second = createDeskComposerStore({ storage });
    expect(modeFor(second.getState().chats, "s1", "run")).toBe("plan");
    expect(memoryFor(second.getState().chats, "s1", true)).toBe("none");
    expect(second.getState().chats[NEW_CHAT_KEY]).toBeUndefined();
  });

  test("memory is per chat, and This project only inside a project", () => {
    const store = createDeskComposerStore();
    expect(memoryFor(store.getState().chats, "s1", true)).toBe("project");
    expect(memoryFor(store.getState().chats, "s1", false)).toBe("all");
    store.getState().setMemory("s1", "project");
    expect(memoryFor(store.getState().chats, "s1", false)).toBe("all");
    store.getState().setMemory("s1", "none");
    expect(memoryFor(store.getState().chats, "s1", true)).toBe("none");
    expect(memoryFor(store.getState().chats, "s2", true)).toBe("project");
  });

  test("the prompt the chat route sends carries the resolved agent", () => {
    const route = read("react-app/shell/session-route.tsx");
    const start = route.indexOf("opencodeClient.session.promptAsync({\n              sessionID: targetSessionId,");
    expect(start).toBeGreaterThan(-1);
    const call = route.slice(start, route.indexOf("});", start));
    expect(call).toContain("agent: resolvePromptAgent({");
    expect(call).toContain("inFrame: inDeskFrame");
    expect(call).toContain("modeFor(useDeskComposerStore.getState().chats, targetSessionId, local.prefs.deskNewChatMode)");
    expect(call).not.toContain("agent: selectedAgent ?? undefined");
    expect(route.match(/useDeskComposerStore\.getState\(\)\.claimNewChat\(session\.id\)/g)?.length).toBe(2);
  });

  test("new chats start in Run and Cross-check defaults to When it matters, in the app's prefs", () => {
    const provider = read("react-app/kernel/local-provider.tsx");
    expect(provider).toContain("deskNewChatMode: DEFAULT_NEW_CHAT_MODE,");
    expect(provider).toContain("deskCrossCheck: DEFAULT_CROSS_CHECK,");
    const state = read("react-app/desk/composer/composer-state.ts");
    expect(state).toContain('DEFAULT_NEW_CHAT_MODE: ChatMode = "run"');
    expect(state).toContain('DEFAULT_CROSS_CHECK: DeskCrossCheck = { factCheck: "auto", challenge: "auto" }');
  });
});

describe("the mic", () => {
  test("appends what was said to the draft", () => {
    expect(appendTranscript("", "Hello")).toBe("Hello");
    expect(appendTranscript("Draft", "  more  ")).toBe("Draft more");
    expect(appendTranscript("Draft\n", "more")).toBe("Draft\nmore");
    expect(appendTranscript("Draft", "   ")).toBe("Draft");
  });

  test("only writes the draft, never sends", () => {
    let draft = "Note:";
    const setDraft = mock((next: string) => {
      draft = next;
    });
    const send = mock(noop);
    const onTranscript = transcriptHandler(() => draft, setDraft);
    onTranscript("first");
    onTranscript("second");
    onTranscript("  ");
    expect(draft).toBe("Note: first second");
    expect(setDraft).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
    // Outside a voice conversation the transcript only joins the draft, even where sending is offered.
    expect(deliverTranscript({ talk: false, draft: "Note:", text: "first", send: () => true })).toBe("drafted");
    // The wired tools send only through the one callback a voice conversation uses.
    const tools = read("react-app/desk/composer/desk-composer.tsx");
    const wired = tools.slice(tools.indexOf("export function DeskComposerTools("), tools.indexOf("function crossCheckLevels"));
    expect(wired).not.toMatch(/onSend\b|onSend\(|promptAsync|onSubmit/);
    expect(read("react-app/domains/session/voice/voice-dictation.ts")).not.toContain("response.create");
  });

  test("a hold stops on release; a tap keeps recording until the next press", () => {
    const idle: MicPhase = { kind: "idle" };
    const held = micPress(idle, 1_000);
    expect(held.action).toBe("start");
    expect(micRelease(held.phase, 1_000 + HOLD_MS)).toEqual({ phase: { kind: "transcribing" }, action: "stop" });

    const tapped = micRelease(held.phase, 1_000 + HOLD_MS - 1);
    expect(tapped).toEqual({ phase: { kind: "recording", pressedAt: 1_000, latched: true }, action: null });
    // The release of the second tap does nothing more: the press already stopped it.
    const second = micPress(tapped.phase, 5_000);
    expect(second).toEqual({ phase: { kind: "transcribing" }, action: "stop" });
    expect(micRelease(second.phase, 5_100).action).toBeNull();

    // While the last clip is being written down, the mic does nothing.
    expect(micPress({ kind: "transcribing" }, 6_000).action).toBeNull();
    expect(micRelease(idle, 6_000).action).toBeNull();
  });

  test("counts down the minute a recording may last", () => {
    expect(MAX_RECORDING_MS).toBe(60_000);
    expect(secondsLeft(0, 0)).toBe(60);
    expect(secondsLeft(0, 500)).toBe(60);
    expect(secondsLeft(0, 59_001)).toBe(1);
    expect(secondsLeft(0, 61_000)).toBe(0);
  });

  test("records in a container the gateway takes", () => {
    expect(pickRecorderType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecorderType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecorderType(() => false)).toBeUndefined();
    expect(recordingFormat("audio/webm;codecs=opus")).toBe("webm");
    expect(recordingFormat("audio/ogg; codecs=opus")).toBe("ogg");
    expect(recordingFormat("audio/mp4")).toBe("m4a");
    expect(recordingFormat("audio/wav")).toBeNull();
  });

  test("sends the clip once, in the app's language, and keeps only words", async () => {
    setLocale("ko");
    const calls: unknown[] = [];
    const client = {
      transcribeAudio: async (workspaceId: string, recording: { audio: string; format: string; language?: string }) => {
        calls.push({ workspaceId, ...recording });
        return { text: "  회의 요약해 줘  " };
      },
    };
    const audio = base64Of(new Uint8Array([1, 2, 3, 250]));
    expect(audio).toBe(Buffer.from([1, 2, 3, 250]).toString("base64"));
    expect(await transcribeClip(client, "ws", { audio, format: "webm" })).toBe("회의 요약해 줘");
    expect(calls).toEqual([{ workspaceId: "ws", audio, format: "webm", language: "ko" }]);
    expect(spokenText(" ... ")).toBeNull();
    // A minute of audio is far past the argument limit of one fromCharCode call.
    const long = new Uint8Array(200_000).fill(65);
    expect(base64Of(long)).toBe(Buffer.from(long).toString("base64"));
  });

  test("says why it cannot listen", () => {
    expect(micUnavailableReason({ media: false, connected: true, voiceAllowed: true })).toBe(en["desk.mic_reason_device"]);
    expect(micUnavailableReason({ media: true, connected: false, voiceAllowed: true })).toBe(en["desk.mic_reason_connecting"]);
    expect(micUnavailableReason({ media: true, connected: true, voiceAllowed: undefined })).toBe(en["desk.mic_reason_connecting"]);
    expect(micUnavailableReason({ media: true, connected: true, voiceAllowed: false })).toBe(en["desk.mic_reason_privacy"]);
    expect(micUnavailableReason({ media: true, connected: true, voiceAllowed: true })).toBeNull();
  });

  test("a privacy refusal reads in the app's language; other failures keep their message", () => {
    setLocale("ko");
    expect(micFailureText(new RedrobServerError(403, "voice_off_for_privacy", "Voice is off"))).toBe(ko["desk.mic_reason_privacy"]);
    expect(micFailureText(new RedrobServerError(502, "transcription_failed", "Out of credit."))).toBe("Out of credit.");
    expect(micFailureText("nope")).toBeUndefined();
  });

  test("works on the web too: the recording goes through Work, not to a vendor from the window", () => {
    const tools = read("react-app/desk/composer/desk-composer.tsx");
    const reason = tools.slice(tools.indexOf("export function micUnavailableReason"), tools.indexOf("export function secondsLeft"));
    expect(reason).not.toContain("desktop");
    const dictation = read("react-app/domains/session/voice/voice-dictation.ts");
    expect(dictation).not.toMatch(/api\.openai\.com|desktopFetch|createVoiceRealtimeSession/);
  });
});

describe("a voice conversation", () => {
  test("sends what was said with what was typed, and falls back to the draft when the chat is busy", () => {
    const sent: string[] = [];
    const send = (message: string) => {
      sent.push(message);
      return true;
    };
    expect(deliverTranscript({ talk: true, draft: "Re: Q3.", text: " 요약해 줘 ", send })).toBe("sent");
    expect(sent).toEqual(["Re: Q3. 요약해 줘"]);
    expect(deliverTranscript({ talk: true, draft: "", text: "Hi", send: () => false })).toBe("drafted");
    expect(deliverTranscript({ talk: true, draft: "", text: "Hi" })).toBe("drafted");
  });

  test("is off by default, per chat, and moves from the new chat screen to the chat it starts", () => {
    const store = createDeskComposerStore();
    expect(talkFor(store.getState().chats, NEW_CHAT_KEY)).toBe(false);
    store.getState().setTalk(NEW_CHAT_KEY, true);
    store.getState().awaitReply(NEW_CHAT_KEY);
    store.getState().claimNewChat("s1");
    expect(talkFor(store.getState().chats, "s1")).toBe(true);
    expect(talkFor(store.getState().chats, "s2")).toBe(false);
    // The answer is awaited by the chat that was started, once.
    expect(store.getState().takeReply("s2")).toBe(false);
    expect(store.getState().takeReply("s1")).toBe(true);
    expect(store.getState().takeReply("s1")).toBe(false);
  });

  test("the toggle is kept across a restart, a pending answer is not", () => {
    const memory = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    });
    const store = createDeskComposerStore({ storage });
    store.getState().setTalk("s1", true);
    store.getState().awaitReply("s1");
    const saved = memory.get(DESK_COMPOSER_STORE_KEY) ?? "";
    expect(JSON.parse(saved).state).toEqual({ chats: { s1: { talk: true } } });
  });

  test("reads the whole answer to the last thing said, and nothing before it has one", () => {
    const message = (id: string, role: "user" | "assistant", text?: string) => ({
      id,
      role,
      parts: text === undefined ? [] : [{ type: "text" as const, text }],
    });
    expect(replyToRead([message("u1", "user", "Hi")])).toBeNull();
    expect(replyToRead([message("u1", "user", "Hi"), message("a1", "assistant")])).toBeNull();
    expect(
      replyToRead([
        message("u0", "user", "Earlier"),
        message("a0", "assistant", "Old answer"),
        message("u1", "user", "Summarise"),
        message("a1", "assistant", "Revenue is up."),
        message("a2", "assistant", "Costs are flat."),
      ]),
    ).toEqual({ id: "a2", text: "Revenue is up.\n\nCosts are flat." });
  });

  test("the toggle shows only where a spoken message can be sent, and says whether it is on", () => {
    const view = (talk: boolean | null, micUnavailable: string | null = null) =>
      renderToStaticMarkup(
        <DeskComposerToolsView mic="idle" secondsLeft={null} micUnavailable={micUnavailable} onMicPress={noop} onMicRelease={noop} talk={talk} onTalkChange={noop} mode="run" onModeChange={noop} />,
      );
    expect(view(null)).not.toContain(en["desk.voice_chat_start"]);
    expect(view(false)).toMatch(new RegExp(`aria-label="${en["desk.voice_chat_start"]}"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="${en["desk.voice_chat_start"]}"`));
    expect(view(true)).toContain(`aria-label="${en["desk.voice_chat_stop"]}"`);
    const off = view(false, en["desk.mic_reason_privacy"]);
    expect(off).toMatch(new RegExp(`aria-label="${en["desk.voice_chat_start"]}. ${en["desk.mic_reason_privacy"]}"[^>]*disabled=""`));
  });

  test("the answer is read once, after the spoken turn ends and its words have arrived", () => {
    const user = { id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "Summarise" }] };
    const answer = { id: "a1", role: "assistant" as const, parts: [{ type: "text" as const, text: "Revenue is up." }] };
    let awaited = true;
    const takeReply = () => {
      const was = awaited;
      awaited = false;
      return was;
    };
    // Running: nothing is read, and nobody is asked yet.
    let step = voiceReplyStep({ streaming: false, due: false }, { streaming: true, messages: [user], takeReply });
    expect(step.read).toBeNull();
    expect(awaited).toBe(true);
    // The turn ends before the answer's words have arrived: the wait goes on.
    step = voiceReplyStep(step.wait, { streaming: false, messages: [user], takeReply });
    expect(step).toEqual({ wait: { streaming: false, due: true }, read: null });
    // They arrive: read once.
    step = voiceReplyStep(step.wait, { streaming: false, messages: [user, answer], takeReply });
    expect(step.read).toEqual({ id: "a1", text: "Revenue is up." });
    step = voiceReplyStep(step.wait, { streaming: false, messages: [user, answer], takeReply });
    expect(step.read).toBeNull();
    // A typed message's turn is not read: nobody was waiting for it.
    step = voiceReplyStep({ streaming: true, due: false }, { streaming: false, messages: [user, answer], takeReply });
    expect(step.read).toBeNull();
  });

  test("the session sends a spoken message itself, and runs the wait on every look", () => {
    const surface = read("react-app/domains/session/surface/session-surface.tsx");
    expect(surface).toContain("onSendText={handleSendText}");
    expect(surface).toContain("useDeskComposerStore.getState().takeReply(props.sessionId)");
    expect(surface).toContain("voiceReplyStep(replyWaitRef.current");
    expect(read("react-app/domains/session/chat/new-task-composer.tsx")).toContain("onSendText={handleSendText}");
  });
});

const markupOf = (html: string, pattern: string) => html.search(new RegExp(pattern));

describe("the tools row", () => {
  test("is Mic, then Plan or Run, then the model", () => {
    const html = renderToStaticMarkup(
      <DeskComposerToolsView mic="idle" secondsLeft={null} micUnavailable={null} onMicPress={noop} onMicRelease={noop} talk={null} onTalkChange={noop} mode="run" onModeChange={noop}>
        <button type="button" data-model="1">Redrob Auto</button>
      </DeskComposerToolsView>,
    );
    const mic = markupOf(html, `aria-label="${en["desk.mic_start"]}"`);
    const plan = markupOf(html, `aria-label="${en["desk.mode_plan"]}"`);
    const run = markupOf(html, `aria-label="${en["desk.mode_run"]}"`);
    const model = markupOf(html, 'data-model="1"');
    expect(mic).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(mic);
    expect(run).toBeGreaterThan(plan);
    expect(model).toBeGreaterThan(run);
    expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*aria-label="${en["desk.mode_run"]}"`));
  });

  test("the mic says Stop talking and counts down while recording, and why it is off when it cannot listen", () => {
    const view = (props: { mic: "idle" | "recording" | "transcribing"; secondsLeft?: number; micUnavailable?: string }) =>
      renderToStaticMarkup(
        <DeskComposerToolsView
          mic={props.mic}
          secondsLeft={props.secondsLeft ?? null}
          micUnavailable={props.micUnavailable ?? null}
          onMicPress={noop}
          onMicRelease={noop}
          talk={null}
          onTalkChange={noop}
          mode="plan"
          onModeChange={noop}
        />,
      );
    const recording = view({ mic: "recording", secondsLeft: 42 });
    expect(recording).toContain(`aria-label="${en["desk.mic_stop"]}"`);
    expect(recording).toContain('aria-pressed="true"');
    expect(recording).toContain(en["desk.mic_seconds_left"].replace("{seconds}", "42"));
    const transcribing = view({ mic: "transcribing" });
    expect(transcribing).toContain(`aria-label="${en["desk.mic_transcribing"]}"`);
    expect(transcribing).toContain('aria-busy="true"');
    expect(transcribing).not.toContain(en["desk.mic_seconds_left"].replace("{seconds}", ""));
    const off = view({ mic: "idle", micUnavailable: en["desk.mic_reason_privacy"] });
    expect(off).toMatch(new RegExp(`aria-label="Talk to Desk. ${en["desk.mic_reason_privacy"]}"[^>]*disabled=""`));
  });
});

const status = (patch: Partial<DeskStatusInput> = {}): DeskStatusInput => ({
  desktop: true,
  privacy: { level: "high", preview: true },
  memory: "all",
  onMemoryChange: noop,
  project: null,
  notes: { all: 22, project: 4, you: 6 },
  checks: { factCheck: "auto", challenge: "auto" },
  onChecksChange: noop,
  ...patch,
});

describe("the status line", () => {
  test("privacy reads High, safe, only from a real state", () => {
    const [privacy] = deskStatusItems(status({ privacy: { level: "high", preview: false } }));
    expect(privacy?.id).toBe("privacy");
    expect(privacy?.tone).toBe("safe");
    expect(privacy?.value).toBe(en["desk.privacy_high"]);
    expect(privacy?.level).toEqual({ n: 2, of: 3 });
    const panel = renderToStaticMarkup(<>{privacy?.panel}</>);
    expect(panel).toContain(`${en["desk.privacy_on_title"]}: ${en["desk.privacy_high"]}`);
  });

  test("sample data or no state reads Off, never protected", () => {
    for (const privacy of [{ level: "high" as const, preview: true }, null]) {
      const [item] = deskStatusItems(status({ privacy }));
      expect(item?.tone).toBe("plain");
      expect(item?.value).toBe(en["desk.privacy_off"]);
      expect(item?.level).toBeUndefined();
      expect(renderToStaticMarkup(<>{item?.panel}</>)).toContain(en["desk.privacy_page_off_title"]);
    }
  });

  test("privacy says off on the web", () => {
    const [privacy] = deskStatusItems(status({ desktop: false }));
    expect(privacy?.value).toBe(en["desk.privacy_off"]);
    expect(renderToStaticMarkup(<>{privacy?.panel}</>)).toContain(en["desk.privacy_off_title"]);
  });

  test("memory is On for every AI or Off for this chat, with This project only in a project", () => {
    const on = deskStatusItems(status())[1];
    expect(on?.value).toBe(en["desk.memory_on"]);
    const outside = renderToStaticMarkup(<>{on?.panel}</>);
    expect(outside).not.toContain(en["desk.memory_project"]);
    expect(outside).toContain("22 notes, across every project");

    const off = deskStatusItems(status({ memory: "none" }))[1];
    expect(off?.value).toBe(en["desk.memory_off"]);
    expect(off?.tone).toBe("plain");
    expect(renderToStaticMarkup(<>{off?.panel}</>)).toContain(en["desk.memory_off_title"]);

    const inProject = renderToStaticMarkup(<>{deskStatusItems(status({ memory: "project", project: { name: "Seorin" } }))[1]?.panel}</>);
    expect(inProject).toContain(en["desk.memory_project"]);
    expect(inProject).toContain("4 notes about Seorin, and 6 about you");
  });

  test("Cross-check reads the design system's word for the checks", () => {
    expect(crossCheckStatusValue({ factCheck: "auto", challenge: "auto" })).toBe("When it matters");
    expect(crossCheckStatusValue({ factCheck: "always", challenge: "always" })).toBe("Always");
    expect(crossCheckStatusValue({ factCheck: "off", challenge: "off" })).toBe("Off");
    expect(crossCheckStatusValue({ factCheck: "auto", challenge: "always" })).toBe("On");
    expect(crossCheckStatusValue({ factCheck: "auto", challenge: "off" })).toBe("1 of 2 on");
    const check = deskStatusItems(status({ checks: { factCheck: "off", challenge: "off" } }))[2];
    expect(check?.tone).toBe("plain");
    expect(check?.value).toBe("Off");
  });

  test("everything it says is in Korean too", () => {
    setLocale("ko");
    expect(crossCheckStatusValue({ factCheck: "auto", challenge: "auto" })).toBe(ko["desk.check_auto"]);
    expect(crossCheckStatusValue({ factCheck: "auto", challenge: "always" })).toBe(ko["desk.check_on"]);
    expect(crossCheckStatusValue({ factCheck: "auto", challenge: "off" })).toBe("2개 중 1개 켜짐");
    const html = renderToStaticMarkup(<DeskComposerStatusView {...status()} />);
    expect(html).toContain(ko["desk.status_privacy"]);
    expect(html).toContain(ko["desk.memory_on"]);
    expect(html).toContain(ko["desk.status_label"]);
    expect(html).not.toMatch(/>[^<]*[A-Za-z]{3,}[^<]*</);
  });
});

function Providers(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <LocalProvider>
        <WorkspaceProvider client={null} selectedWorkspaceRoot="">
          {props.children}
        </WorkspaceProvider>
      </LocalProvider>
    </QueryClientProvider>
  );
}

describe("the new chat screen", () => {
  test("renders the serif line, the Desk placeholder and the tools in order inside the frame", () => {
    const html = renderToStaticMarkup(
      <Providers>
        <DeskFrameContext value={true}>
          <SessionEmptyHero providerCount={1} onRunTask={noop} />
        </DeskFrameContext>
      </Providers>,
    );
    expect(html).toContain(`<h2 class="desk-new__line">${en["desk.new_chat_line"]}</h2>`);
    expect(html).toContain(en["desk.composer_placeholder"]);
    expect(html).not.toContain(en["hero.title"]);
    const mic = markupOf(html, `aria-label="Talk to Desk`);
    const plan = markupOf(html, `aria-label="${en["desk.mode_plan"]}"`);
    const send = markupOf(html, `aria-label="${en["composer.run_task"]}"`);
    expect(mic).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(mic);
    expect(send).toBeGreaterThan(plan);
    expect(html).toContain(`aria-label="${en["desk.status_label"]}"`);
  });

  test("outside the frame the hero is unchanged", () => {
    const html = renderToStaticMarkup(
      <Providers>
        <SessionEmptyHero providerCount={1} onRunTask={noop} />
      </Providers>,
    );
    expect(html).toContain(en["hero.title"]);
    expect(html).not.toContain("desk-new__line");
    expect(html).not.toContain(en["desk.mode_plan"]);
  });

  test("shows the serif line and the Desk placeholder inside the frame", () => {
    const hero = read("react-app/domains/session/chat/session-empty-hero.tsx");
    expect(hero).toContain('<h2 className="desk-new__line">{t("desk.new_chat_line")}</h2>');
    const composer = read("react-app/domains/session/surface/composer/composer.tsx");
    expect(composer).toContain('placeholder={inDeskFrame ? t("desk.composer_placeholder") : t("composer.placeholder")}');
    expect(en["desk.composer_placeholder"]).toBe("Ask Desk to do something, or type / to run a playbook");
    const css = read("app/index.css");
    const line = css.slice(css.indexOf(".desk-new__line {"), css.indexOf("}", css.indexOf(".desk-new__line {")));
    expect(line).toContain("font-family: var(--font-serif)");
  });

  test("the composer puts the Desk tools before Send and the status under the field, only in the frame", () => {
    const composer = read("react-app/domains/session/surface/composer/composer.tsx");
    expect(composer).toContain("{inDeskFrame ? null : modelControls}");
    expect(composer).toMatch(/<DeskComposerTools\s+chatKey=\{deskChatKey\}\s+draft=\{props.draft\}\s+onDraftChange=\{props.onDraftChange\}\s+onSendText=\{props.onSendText\}\s*>\s+\{modelControls\}/);
    expect(composer).toContain("{inDeskFrame ? <DeskComposerStatus chatKey={deskChatKey} /> : null}");
    expect(composer).toContain("const showAgentPicker = !inDeskFrame && props.selectedAgent !== null;");
  });
});
