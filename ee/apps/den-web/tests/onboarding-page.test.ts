import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(import.meta.dir, "..", "app", "(den)");

function read(...segments: string[]) {
  return readFileSync(join(appRoot, ...segments), "utf8");
}

const screen = read("dashboard", "_components", "marketplace-onboarding-screen.tsx");
const page = read("dashboard", "(admin)", "onboarding", "page.tsx");
const publicInstallers = read("_lib", "public-installers.ts");

describe("Marketplace onboarding page", () => {
  test("reuses the landing download card and den choice cards", () => {
    expect(screen).toContain("DownloadRedrobWorkCard");
    expect(screen).toContain("DenChoiceCard");
    expect(screen).toContain("DenSectionHeader");
    expect(screen).toContain("DenBadge");
    expect(page).toContain("getPublicInstallers");
    expect(publicInstallers).toContain('name.startsWith("redrob-cloud-")');
    expect(publicInstallers).toContain('name.startsWith("redrob-enterprise-")');
  });

  test("offers Redrob Models and Bring your Own Keys as the model path", () => {
    expect(screen).toContain("onboarding-choice-redrob-models");
    expect(screen).toContain("onboarding-choice-byok");
    expect(screen).toContain("Turn on models");
    expect(screen).toContain("Bring your Own Keys");
    expect(screen).toContain("/redrob-mark.svg");
  });

  test("keeps the installed flag and inference check", () => {
    expect(screen).toContain("redrob:onboarding:app-installed");
    expect(screen).toContain("/v1/inference");
    expect(screen).toContain("onboarding-app-installed");
  });
});
