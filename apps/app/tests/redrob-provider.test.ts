import { describe, expect, test } from "bun:test";

import {
  buildRedrobProviderConfig,
  REDROB_API_KEY_ENV,
  REDROB_BASE_URL,
  REDROB_MODEL_ID,
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

  test("routes the redrob-ai model with the Redrob request extras", () => {
    const config = buildRedrobProviderConfig();
    const model = config.models?.[REDROB_MODEL_ID];
    expect(REDROB_MODEL_ID).toBe("redrob-ai");
    expect(model).toBeDefined();
    expect(model?.options?.indicAssist).toBe(true);
    expect(model?.options?.detectLanguage).toBe(true);
  });
});
