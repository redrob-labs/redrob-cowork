import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DARK_BRAND_MARKS,
  needsDarkModeLift,
  providerLogoCandidates,
  simpleIconSlug,
} from "../src/react-app/design-system/provider-logo-src";

const appSrc = join(import.meta.dir, "..", "src");
const read = (relative: string) => readFileSync(join(appSrc, relative), "utf8");

/**
 * Simple Icons serves each mark in its own BRAND colour, and six of the brands this app can reach are
 * black or near-black. An `<img>` is outside `currentColor`, so those six were invisible on the dark
 * provider connect page while the coloured ones were fine - which is exactly what was reported: GitHub
 * and xAI missing, everything else present.
 *
 * The set was computed from Simple Icons' own colour data by relative luminance rather than guessed, so
 * what is pinned here is the two ends of that computation: the marks that must be lifted, and that a
 * coloured mark is NOT lifted (inverting one would show its complement).
 */
describe("dark-mode provider marks", () => {
  it("lifts the marks whose brand colour is black", () => {
    // github #181717 (luma 23), x #000000, vercel #000000, ollama #000000, moonshotai #000000.
    expect(needsDarkModeLift("github-copilot")).toBe(true);
    expect(needsDarkModeLift("xai")).toBe(true);
    expect(needsDarkModeLift("vercel")).toBe(true);
    expect(needsDarkModeLift("ollama")).toBe(true);
    expect(needsDarkModeLift("moonshotai")).toBe(true);
  });

  it("leaves a coloured mark alone", () => {
    // Meta #0467DF (luma 90.6) is the next darkest and reads fine; inverting it would make it orange.
    for (const id of ["meta", "deepseek", "gitlab", "cloudflare-workers-ai", "huggingface", "qwen"]) {
      expect(needsDarkModeLift(id)).toBe(false);
    }
  });

  it("does not lift a mark that never reaches the Simple Icons CDN", () => {
    // A favicon is a full-colour bitmap carrying its own background, so inverting it would wreck it.
    // `openai` is a known CDN miss and `x-ai` fails the slug gate; both land on the favicon step.
    expect(simpleIconSlug("openai")).toBeNull();
    expect(simpleIconSlug("x-ai")).toBeNull();
    expect(needsDarkModeLift("openai")).toBe(false);
    expect(needsDarkModeLift("x-ai")).toBe(false);
  });

  it("keeps the CDN url unchanged, so the lift is presentation only", () => {
    // The fix must not alter the request: a colour segment would key off the OS colour scheme, which
    // is not the same thing as this app's own theme setting.
    expect(providerLogoCandidates({ providerId: "github-copilot" })).toContain(
      "https://cdn.simpleicons.org/github",
    );
    expect(providerLogoCandidates({ providerId: "xai" })).toContain("https://cdn.simpleicons.org/x");
  });

  it("applies the lift in the icon component, and only on the CDN candidate", () => {
    const source = read("react-app/design-system/provider-icon.tsx");
    // The class alone is not the assertion: asserting only that the string appears let a broken wiring
    // pass, because `false && 'dark:invert'` still contains it. Pin the conditional.
    expect(source).toContain("liftOnDark && 'dark:invert'");
    expect(source).toContain("needsDarkModeLift(props.providerId)");
    // Guard the narrowing: without the origin check the class would survive onto the favicon fallback.
    expect(source).toContain('logoUrl.startsWith("https://cdn.simpleicons.org/")');
  });

  it("names every lifted mark, so the set cannot silently grow to every logo", () => {
    expect([...DARK_BRAND_MARKS].sort()).toEqual([
      "anthropic",
      "github",
      "moonshotai",
      "ollama",
      "vercel",
      "x",
    ]);
  });
});

/**
 * The sidebar row's right-hand corner. Two separate defects lived here:
 *
 *   - the outcome dot and the relative timestamp were each absolutely positioned at rest, 12px and 8px
 *     from the same edge, so on an unread row the dot sat on top of the stamp;
 *   - the row reserved 28px (`pe-7`) for a cluster that is up to 46px wide, so a two-digit stamp
 *     overhung the title.
 */
describe("sidebar session row right cluster", () => {
  const source = read("react-app/domains/session/sidebar/app-sidebar.tsx");

  it("reserves the measured width at rest", () => {
    expect(source).toContain("pe-12 group-hover/menu-sub-item:pe-24");
    expect(source).not.toContain("pe-7 group-hover/menu-sub-item:pe-24");
  });

  it("puts the dot and the timestamp in one flex row so they cannot overlap", () => {
    const cluster = source.slice(source.indexOf("const trailing = ("));
    const opening = cluster.slice(0, cluster.indexOf("<SessionHoverQuickActions"));
    expect(opening).toContain("flex -translate-y-1/2 items-center gap-1");
    // The dot must no longer carry its own right anchor.
    expect(opening).not.toContain("absolute right-3");
  });

  it("does not reserve the swap cluster twice on a row with children", () => {
    // `pe-12` already reserves it; the in-flow spacer only keeps the chevron clear.
    expect(source).toContain('className="w-6 shrink-0"');
    expect(source).not.toContain('className="w-11 shrink-0"');
  });
});

/**
 * A title longer than the row is arithmetic, not a bug: 19 CJK glyphs at 13px is about 270px against a
 * viewport of roughly 180px. What was a bug is that the cut had no ellipsis and no fade at rest - the
 * marquee mask needs 450ms of hover - so it read as a hard mid-glyph chop.
 */
describe("sidebar session title", () => {
  const source = read("react-app/domains/session/sidebar/session-title.tsx");

  it("fades the cut at rest, not only while the marquee runs", () => {
    expect(source).toContain('state.overflowing && "ow-fade-truncate"');
  });

  it("still uses the marquee mask while moving", () => {
    expect(source).toContain('state.moving ? "ow-session-title-moving"');
  });
});

/**
 * Retry has to be wired through the same context as the other per-message actions, or the button exists
 * and does nothing.
 */
describe("retry action wiring", () => {
  it("is on the context, the message list and the surface", () => {
    expect(read("components/chat/message-list-provider.tsx")).toContain("onRetryMessage");
    expect(read("components/chat/message-list.tsx")).toContain("onRetryMessage(lastRealItem.message.id)");
    const surface = read("react-app/domains/session/surface/session-surface.tsx");
    expect(surface).toContain("onRetryMessage={handleRetryMessage}");
    // Retry must seed the revert boundary before building the draft, or it appends instead of re-running.
    expect(surface).toContain("replaceComposerDraft(props.sessionId, text, boundary.id)");
  });
});

/**
 * The engine reads `compaction.auto` as `auto !== true`, so an unset value means OFF. The settings
 * toggle read `auto !== false`, so an unset value DISPLAYED as on. Opposite defaults, and the visible
 * one was the wrong one.
 */
describe("auto compaction default", () => {
  const source = read("react-app/shell/settings-route.tsx");

  it("displays what the engine will actually do", () => {
    expect(source).toContain("setAutoCompactContext(auto === true)");
    expect(source).not.toContain("setAutoCompactContext(auto !== false)");
  });

  it("writes the app's own default once when the field is absent", () => {
    expect(source).toContain("if (auto === undefined)");
    expect(source).toContain("opencode: { compaction: { auto: true } }");
  });
});
