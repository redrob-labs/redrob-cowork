import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { inferModelVendor } from "../src/app/lib/model-vendor";
import { ProviderIcon } from "../src/react-app/design-system/provider-icon";

/** What the model menu passes: the vendor behind the model id, as the row resolves it. */
function iconFor(modelId: string): string {
  const vendor = inferModelVendor(modelId);
  return renderToStaticMarkup(<ProviderIcon providerId={vendor?.id ?? "redrob"} providerName={vendor?.name} size={16} />);
}

describe("the recommended labs' marks", () => {
  const cases: Array<[string, string]> = [
    ["google/gemini-3.8-flash", "#3186FF"],
    ["meta/muse-spark-1.3", "#0082FB"],
    ["qwen/qwen3.8-max-0902", "#6336E7"],
    ["x-ai/grok-4.7", 'fill="currentColor" fill-rule="evenodd"'],
  ];

  for (const [modelId, signature] of cases) {
    test(`${modelId} draws its lab's own mark, in the app, not a downloaded image`, () => {
      const html = iconFor(modelId);
      expect(html).toContain("<svg");
      expect(html).toContain(signature);
      expect(html).not.toContain("<img");
      expect(html).not.toContain("simpleicons");
    });
  }

  test("Anthropic and OpenAI keep their inline marks", () => {
    expect(iconFor("anthropic/claude-opus-5.5")).toContain('viewBox="0 0 248 248"');
    expect(iconFor("gpt-6-astra")).toContain("<svg");
    expect(iconFor("gpt-6-astra")).not.toContain("<img");
  });

  test("two marks on one page do not share a gradient id", () => {
    const html = renderToStaticMarkup(
      <div>
        <ProviderIcon providerId="google" size={16} />
        <ProviderIcon providerId="google" size={16} />
      </div>,
    );
    const ids = [...html.matchAll(/<linearGradient[^>]* id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
  });
});
