declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toEqual: (expected: unknown) => void;
};

import {
  REDROB_EXTENSION_CATALOG,
  filterRedrobWorkExtensionCatalogForPlatform,
  resolveRedrobWorkExtensionCatalogPlatform,
} from "./constants";

function filteredIds(platform: "darwin" | "linux" | "windows" | "web") {
  return filterRedrobWorkExtensionCatalogForPlatform(REDROB_EXTENSION_CATALOG, platform)
    .flatMap((entry) => entry.id ? [entry.id] : []);
}

describe("Redrob Work extension catalog platform filter", () => {
  test("resolves browser runtime to web and desktop runtime to OS", () => {
    expect(resolveRedrobWorkExtensionCatalogPlatform("web", "macos")).toEqual("web");
    expect(resolveRedrobWorkExtensionCatalogPlatform("desktop", "macos")).toEqual("darwin");
    expect(resolveRedrobWorkExtensionCatalogPlatform("desktop", "windows")).toEqual("windows");
    expect(resolveRedrobWorkExtensionCatalogPlatform("desktop", "linux")).toEqual("linux");
  });

  test("hides desktop-only extensions in web", () => {
    expect(filteredIds("web")).toEqual(["redrob-voice", "ollama", "redrob"]);
  });

  test("keeps Redrob Work Browser desktop-only and Computer Use mac-only", () => {
    expect(filteredIds("darwin")).toEqual(["redrob-browser", "computer-use", "redrob-voice", "ollama", "redrob"]);
    expect(filteredIds("linux")).toEqual(["redrob-browser", "redrob-voice", "ollama", "redrob"]);
  });
});
