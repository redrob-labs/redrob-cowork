import { describe, expect, test } from "bun:test";

import {
  buildRedrobProviderConfig,
  REDROB_API_KEY_ENV,
  REDROB_BASE_URL,
  REDROB_MODEL_ID,
  REDROB_OPUS_MODEL_ID,
} from "../src/react-app/domains/settings/redrob-provider";

describe("Redrob provider config", () => {
  test("uses the OpenAI-compatible driver and Redrob base URL", () => {
    const config = buildRedrobProviderConfig();
    expect(config.npm).toBe("@ai-sdk/openai-compatible");
    expect(config.options?.baseURL).toBe(REDROB_BASE_URL);
    expect(REDROB_BASE_URL).toBe("https://console.redrob.ai/api/backend/v1");
  });

  test("authenticates via the REDROB_API_KEY env var only", () => {
    const config = buildRedrobProviderConfig();
    expect(config.env).toEqual([REDROB_API_KEY_ENV]);
    expect(REDROB_API_KEY_ENV).toBe("REDROB_API_KEY");
    // No API key value is ever embedded in the config.
    expect(config.options?.apiKey).toBeUndefined();
  });

  test("declares no models, so the engine's own listing decides the catalogue", () => {
    const config = buildRedrobProviderConfig();
    expect(REDROB_MODEL_ID).toBe("auto");
    // This used to name `auto` and `claude-opus-5`, which capped the picker at those two ids no
    // matter how many the console served -- the app was shortening its own catalogue. The engine
    // fetches GET /models with the key and falls back to its own list without one, and it is the
    // side that knows which of those happened.
    expect(config.models).toBeUndefined();
    expect(config.npm).toBe("@ai-sdk/openai-compatible");
    expect(config.env).toEqual([REDROB_API_KEY_ENV]);
    // No per-model options anywhere: the console rejects the retired language fields.
    expect(config.options).toEqual({ baseURL: REDROB_BASE_URL });
  });
});
