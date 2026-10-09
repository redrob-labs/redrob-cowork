import { describe, expect, test } from "bun:test";

// The marker lives in localStorage; bun has no window, so give it the two parts the module touches.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
    dispatchEvent: () => true,
  },
  configurable: true,
});

const { guideProfessions, guideUse, loadGuideResearch } = await import("../src/react-app/desk/guide/model-guide");
const { markNewChatUsesDefault, takeNewChatUsesDefault } = await import("../src/react-app/kernel/model-config");

type Research = Awaited<ReturnType<typeof loadGuideResearch>>;

/** The shown pick at the same place as the first research pick that matches. */
function find(research: Research, match: (pick: Research["professions"][number]["tasks"][number]["picks"][string][number]) => boolean) {
  const shown = guideProfessions(research, "en");
  for (const [p, profession] of research.professions.entries())
    for (const [t, task] of profession.tasks.entries())
      for (const [language, picks] of Object.entries(task.picks)) {
        const at = picks.findIndex(match);
        if (at >= 0) return shown[p]?.tasks?.[t]?.picksByLanguage?.[language]?.[at];
      }
  return undefined;
}

describe("Use for new chats", () => {
  test("a Redrob Cowork pick names the Redrob model and the ranked level", async () => {
    const research = await loadGuideResearch();
    const pick = find(research, (k) => k.harness === "redrob-desk" && k.steps[0]?.model === "claude-opus-5-5");
    expect(pick).toBeDefined();
    const use = pick ? guideUse(research, pick, null) : null;
    expect(use).toEqual({
      ok: true,
      model: { providerID: "redrob", modelID: "anthropic/claude-opus-5.5" },
      variant: "high",
      name: "Claude Opus 5.5",
      effort: "High",
    });
  });

  test("the level the reader tried wins over the ranked one", async () => {
    const research = await loadGuideResearch();
    const pick = find(research, (k) => k.harness === "redrob-desk" && k.steps[0]?.model === "claude-opus-5-5");
    const low = pick?.efforts?.find((level) => level.label === "Low") ?? null;
    expect(low).not.toBeNull();
    const use = pick ? guideUse(research, pick, low) : null;
    expect(use?.ok && use.variant).toBe("low");
  });

  test("a model Redrob runs at its provider default sends no level", async () => {
    const research = await loadGuideResearch();
    const pick = find(research, (k) => k.harness === "redrob-desk" && k.steps[0]?.model === "gpt-6-astra");
    const use = pick ? guideUse(research, pick, null) : null;
    expect(use).toMatchObject({ ok: true, model: { providerID: "redrob", modelID: "gpt-6-astra" }, variant: null, effort: null });
  });

  test("a text-then-image pick starts the chat on its text model", async () => {
    const research = await loadGuideResearch();
    const pick = find(research, (k) => k.harness === "redrob-desk" && k.steps.length > 1);
    const use = pick ? guideUse(research, pick, null) : null;
    expect(use?.ok).toBe(true);
    expect(use?.ok && use.model.modelID).not.toBe("openai/gpt-5.4-image-2");
  });

  test("a pick on another product, or a model Redrob does not serve, cannot be used, and says why", async () => {
    const research = await loadGuideResearch();
    const elsewhere = find(research, (k) => k.harness === "chatgpt-work" && !k.benchmark);
    expect(elsewhere ? guideUse(research, elsewhere, null) : null).toMatchObject({ ok: false, reason: "elsewhere", harness: "ChatGPT Work" });
    const haiku = find(research, (k) => k.steps[0]?.model === "claude-haiku-5-5");
    expect(haiku ? guideUse(research, haiku, null) : null).toEqual({ ok: false, reason: "not-on-redrob", name: "Claude Haiku 5.5" });
  });

  test("the next new chat starts on the chosen default once, then new chats follow the open chat again", () => {
    expect(takeNewChatUsesDefault()).toBe(false);
    markNewChatUsesDefault();
    expect(takeNewChatUsesDefault()).toBe(true);
    expect(takeNewChatUsesDefault()).toBe(false);
  });
});
