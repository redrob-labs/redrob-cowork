import { describe, expect, test } from "bun:test";

import { LANGUAGE_SOURCE_KEY } from "./index";
import { hasAppLanguagePick, launcherLocale, launcherLanguageState, syncLauncherLanguage } from "./launcher-language";

function fakeStorage(values: Record<string, string>) {
  return { getItem: (key: string) => values[key] ?? null };
}

describe("Redrob Launcher language", () => {
  test("Cowork's own override in the launcher file wins over the suite language", () => {
    expect(launcherLocale({ language: "ko", chosen: true, app: "en" })).toBe("en");
    expect(launcherLocale({ language: "ko", chosen: false, app: null })).toBe("ko");
  });

  test("a code Cowork has no translation for draws in English; a region falls back to its language", () => {
    expect(launcherLocale({ language: "ja", chosen: true, app: null })).toBe("en");
    expect(launcherLocale({ language: "ko-kr", chosen: true, app: null })).toBe("ko");
  });

  test("no file, or a file that names nothing, asks for nothing", () => {
    expect(launcherLocale(null)).toBeNull();
    expect(launcherLocale({ language: null, chosen: false, app: null })).toBeNull();
  });

  test("only a pick made inside Cowork counts as Cowork's own choice", () => {
    expect(hasAppLanguagePick(fakeStorage({ [LANGUAGE_SOURCE_KEY]: "app" }))).toBe(true);
    expect(hasAppLanguagePick(fakeStorage({ [LANGUAGE_SOURCE_KEY]: "launcher" }))).toBe(false);
    // A language stored before the sync existed has no source: it follows the launcher.
    expect(hasAppLanguagePick(fakeStorage({ "redrob.language": "en" }))).toBe(false);
    expect(hasAppLanguagePick(null)).toBe(false);
  });

  test("without a launcher file the sync publishes no launcher language and changes nothing", async () => {
    await syncLauncherLanguage(async () => null);
    expect(launcherLanguageState()).toEqual({ locale: null, following: false });
  });
});


test("an older launcher read cannot overwrite a newer one", async () => {
  // Resolve reads manually so the newer request can finish first.
  let resolveOlder: ((value: { language: string; chosen: boolean; app: string | null }) => void) | null = null;
  const older = syncLauncherLanguage(() => new Promise((resolve) => {
    resolveOlder = resolve;
  }));
  // The later request publishes English immediately.
  await syncLauncherLanguage(async () => ({ language: "en", chosen: true, app: null }), () => undefined);
  // The older Korean read completes last and must now be ignored.
  resolveOlder?.({ language: "ko", chosen: true, app: null });
  await older;
  expect(launcherLanguageState().locale).toBe("en");
});