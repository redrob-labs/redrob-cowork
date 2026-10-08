import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ModelOption } from "../src/app/types";
import { parseRedrobPricing } from "../src/app/lib/redrob-pricing";
import { t } from "../src/i18n";
import { buildModelRow, buildModelRows, friendlyGroups, visibleRows, EMPTY_FILTERS } from "../src/react-app/domains/session/modals/model-table";
import { abilityWords, bandWord, goodFor, questionCost, readsAtOnce } from "../src/react-app/domains/session/modals/model-words";
import { AiSettingsView } from "../src/react-app/domains/settings/pages/ai-view";
import {
  MODEL_PICKER_SETTINGS_SUBTITLE,
  resolveModelPickerSubtitle,
} from "../src/react-app/domains/session/modals/model-picker-modal";

function option(providerID: string, modelID: string, title = modelID): ModelOption {
  return { providerID, modelID, title, behaviorTitle: "", behaviorLabel: "", behaviorDescription: "", behaviorValue: null, isFree: false };
}

const PRICING = parseRedrobPricing({
  models: [
    { id: "auto", capabilities: { maxContextTokens: 2_000_000 } },
    { id: "google/gemini-3.8-flash", priceBand: "standard", estimatedCosts: [{ profile: "chat", costUsd: 0.0016 }], capabilities: { maxContextTokens: 1_048_576, tools: true, imageInput: true, thinkingLevels: ["low", "high"] } },
    { id: "gpt-6-astra", priceBand: "frontier", estimatedCosts: [{ profile: "chat", costUsd: 0.068 }], capabilities: { maxContextTokens: 1_050_000, tools: true } },
    { id: "mistralai/mistral-small", priceBand: "budget", estimatedCosts: [{ profile: "chat", costUsd: 0.0004 }], capabilities: { maxContextTokens: 32_768 } },
    { id: "qwen/qwen3-32b", priceBand: "budget", capabilities: { maxContextTokens: 131_072 } },
  ],
});

describe("the model list, in words", () => {
  test("says roughly what a question costs, rounded the way a person would say it", () => {
    expect(questionCost(0.0016)).toBe(t("model_words.cost_under_cent"));
    // A premium model at 0.84¢ must not read as cheaply as a budget one.
    expect(questionCost(0.0084)).toBe(t("model_words.cost_cents", { cents: 1 }));
    expect(questionCost(0.068)).toBe(t("model_words.cost_cents", { cents: 7 }));
    expect(questionCost(1.24)).toBe(t("model_words.cost_dollars", { dollars: 1.2 }));
    expect(questionCost(null)).toBeNull();
  });

  test("says how much it reads in books and pages, not tokens", () => {
    expect(readsAtOnce(1_048_576)).toBe(t("model_words.reads_books", { count: 10 }));
    expect(readsAtOnce(131_072)).toBe(t("model_words.reads_book"));
    expect(readsAtOnce(32_768)).toBe(t("model_words.reads_pages", { count: 50 }));
    expect(readsAtOnce(null)).toBeNull();
  });

  test("names the price band in plain words", () => {
    expect(bandWord("budget")).toBe(t("model_words.band_budget"));
    expect(bandWord("frontier")).toBe(t("model_words.band_frontier"));
    expect(bandWord(null)).toBeNull();
  });

  test("a recommended model's note wins; any other model gets a sentence from its facts", () => {
    const gemini = buildModelRow(option("redrob", "google/gemini-3.8-flash"), PRICING);
    expect(goodFor(gemini, "Fast and inexpensive")).toBe("Fast and inexpensive");
    expect(goodFor(gemini)).toBe(`${t("model_words.summary_standard")} ${t("model_words.summary_long")}`);
    const small = buildModelRow(option("redrob", "mistralai/mistral-small"), PRICING);
    expect(goodFor(small)).toBe(t("model_words.summary_budget"));
    expect(abilityWords(gemini)).toEqual([t("model_words.can_tools"), t("model_words.can_reason"), t("model_words.can_images")]);
  });

  test("leads with Auto and the recommended models, then groups the rest by lab, without repeating any", () => {
    const rows = buildModelRows(
      [
        option("redrob", "qwen/qwen3-32b", "Qwen3 32B"),
        option("redrob", "mistralai/mistral-small", "Mistral Small"),
        option("redrob", "gpt-6-astra", "gpt-6-astra"),
        option("redrob", "auto", "Redrob Auto"),
        option("redrob", "google/gemini-3.8-flash", "Gemini 3.8 Flash"),
      ],
      PRICING,
    );
    const groups = friendlyGroups(rows, ["anthropic/claude-opus-5.5", "gpt-6-astra", "google/gemini-3.8-flash"]);
    expect(groups.auto.map((row) => row.modelId)).toEqual(["auto"]);
    expect(groups.recommended.map((row) => row.modelId)).toEqual(["gpt-6-astra", "google/gemini-3.8-flash"]);
    expect(groups.labs.map((lab) => lab.name)).toEqual(["Mistral", "Qwen"]);
  });

  test("'Handle very long documents' is a filter a reader can tick", () => {
    const rows = buildModelRows([option("redrob", "google/gemini-3.8-flash"), option("redrob", "qwen/qwen3-32b")], PRICING);
    const long = visibleRows(rows, { ...EMPTY_FILTERS, capabilities: new Set(["longContext"]) }, "");
    expect(long.map((row) => row.modelId)).toEqual(["google/gemini-3.8-flash"]);
  });

  test("opened from Settings, it says it changes the model new chats start with", () => {
    expect(resolveModelPickerSubtitle(MODEL_PICKER_SETTINGS_SUBTITLE)).toBe(t("model_picker.settings_subtitle"));
    expect(resolveModelPickerSubtitle(undefined)).toBe(t("model_picker.session_subtitle"));
    const route = readFileSync(fileURLToPath(new URL("../src/react-app/shell/settings-route.tsx", import.meta.url)), "utf8");
    expect(route).toContain("subtitle={MODEL_PICKER_SETTINGS_SUBTITLE}");
    expect(route).toContain("providerId={browseProvider?.id ?? null}");
  });

  test("the friendly list is the default and the spec-sheet table is behind a switch", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/react-app/domains/session/modals/model-picker-modal.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("const [technical, setTechnical] = useState(false);");
    expect(source).toContain("!technical ? (\n                <FriendlyModelList");
    expect(source).toContain('t("model_words.technical")');
    expect(source).toContain("<GuideLink");
  });
});

describe("Settings, AI: providers first, models under each", () => {
  const view = (overrides: Partial<Parameters<typeof AiSettingsView>[0]> = {}) =>
    renderToStaticMarkup(
      <AiSettingsView
        busy={false}
        providerAuthBusy={false}
        connectedProviders={[
          { id: "openai", name: "OpenAI", source: "api" },
          { id: "redrob", name: "Redrob" },
        ]}
        modelCounts={{ redrob: 344, openai: 12 }}
        disconnectingProviderId={null}
        providerConnectError={null}
        providerDisconnectStatus={null}
        providerDisconnectError={null}
        onOpenProviderAuth={() => undefined}
        onBrowseModels={() => undefined}
        onDisconnectProvider={() => undefined}
        canDisconnectProvider={() => true}
        canAddProviders
        {...overrides}
      />,
    );

  test("each connected provider says what it is, how many models it has, and offers to browse them; Redrob first", () => {
    const html = view();
    expect(html).toContain(t("settings.ai_redrob_line"));
    expect(html).toContain(t("settings.ai_account_line", { provider: "OpenAI" }));
    expect(html).not.toContain("{provider}");
    expect(html).toContain(t("settings.ai_model_count", { count: 344 }));
    expect(html).toContain('data-testid="ai-browse-redrob"');
    expect(html).toContain('data-testid="ai-browse-openai"');
    expect(html.indexOf('data-provider="redrob"')).toBeLessThan(html.indexOf('data-provider="openai"'));
  });

  test("below them: connect another account, and browse every model at once", () => {
    const html = view();
    expect(html).toContain(t("settings.ai_connect"));
    expect(html).toContain(t("settings.ai_browse_all", { count: 356 }));
    expect(html).not.toContain(t("settings.models_title"));
  });

  test("without permission to add providers, there is no connect button", () => {
    expect(view({ canAddProviders: false })).not.toContain('data-testid="ai-connect-account"');
  });
});

describe("the connect dialog", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/react-app/domains/connections/provider-auth/provider-auth-modal.tsx", import.meta.url)),
    "utf8",
  );

  test("each row says what the provider is, instead of printing its id", () => {
    expect(source).toContain("{providerPlainLine(entry)}");
    expect(source).not.toContain("font-mono text-2xs text-subtle-foreground opacity-60");
    expect(t("provider_auth.line_account", { provider: "Anthropic" })).toContain("Anthropic");
    expect(t("provider_auth.method_api_key")).not.toBe("API key");
    expect(t("provider_auth.method_oauth")).not.toBe("OAuth");
  });

  test("Redrob leads the connected group", () => {
    expect(source).toContain('Number(b.id === "redrob") - Number(a.id === "redrob")');
  });
});
