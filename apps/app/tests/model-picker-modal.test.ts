import { describe, expect, test } from "bun:test";

import en from "../src/i18n/locales/en";
import {
  MODEL_PICKER_DEFAULT_SUBTITLE,
  MODEL_PICKER_UNAVAILABLE_SUBTITLE,
  resolveModelPickerSubtitle,
} from "../src/react-app/domains/session/modals/model-picker-modal";

/**
 * The two exported constants hold translation KEYS, not display text, and
 * `resolveModelPickerSubtitle` translates at render time.
 *
 * That split is deliberate and load-bearing: a module-scope `t(...)` would
 * resolve before the locale is loaded and freeze the English string for the
 * lifetime of the app, with nothing to catch it -- `t()` takes a plain `string`
 * so typecheck stays silent, and the value is a perfectly good string. Asserting
 * the keys EXIST in the bundle is what makes the indirection safe: a typo in one
 * of them would otherwise render the key itself to the user.
 */
describe("model picker subtitle", () => {
  test("the exported constants are keys that exist in the bundle", () => {
    // `toHaveProperty` reads a dotted string as a NESTED path, and these keys are
    // flat with dots in the name, so check membership directly.
    const keys = Object.keys(en);
    for (const key of [MODEL_PICKER_DEFAULT_SUBTITLE, MODEL_PICKER_UNAVAILABLE_SUBTITLE]) {
      expect(key).toMatch(/^model_picker\./);
      expect(keys).toContain(key);
    }
  });

  test("resolves the default subtitle to translated text, not the key", () => {
    const resolved = resolveModelPickerSubtitle(undefined);
    expect(resolved).toBe(en[MODEL_PICKER_DEFAULT_SUBTITLE as keyof typeof en]);
    expect(resolved).not.toBe(MODEL_PICKER_DEFAULT_SUBTITLE);
  });

  test("supports the unavailable-model recovery subtitle", () => {
    expect(resolveModelPickerSubtitle(MODEL_PICKER_UNAVAILABLE_SUBTITLE)).toBe(
      "The model you were using is no longer available, please select a different model for this session.",
    );
  });
});
