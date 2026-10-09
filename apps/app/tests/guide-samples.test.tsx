import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GuideSamples, loadGuideSamples, sampleKey } from "../src/react-app/desk/guide/guide-samples";
import { loadGuideResearch } from "../src/react-app/desk/guide/model-guide";
import { ProfessionGuideView } from "../src/react-app/desk/preview/desk-guide";

describe("the guide's sample runs", () => {
  test("each pick shows its own model's run of the task's prompt, rendered and sanitised", async () => {
    const research = await loadGuideResearch();
    const lawyer = research.professions.find((p) => p.id === "lawyer");
    const task = lawyer?.tasks[0];
    const first = task?.picks.en?.find((pick) => !pick.benchmark);
    expect(first).toBeDefined();
    const key = sampleKey(first?.steps[0]?.model ?? "", first?.steps[0]?.effort);
    const samples = {
      "en/lawyer": GuideSamples.parse({
        [task?.id ?? ""]: {
          prompt: "Advise the client on the settlement offer.",
          runs: {
            [key]: { output: "## Advice\n\n- Take the offer\n\n<script>alert(1)</script>", date: "2026-10-09", effort: "high", costUsd: 0.2, cut: false },
          },
        },
      }),
    };
    const html = renderToStaticMarkup(<ProfessionGuideView research={research} locale="en" samples={samples} />);
    expect(html).toContain("The task, as every model got it");
    expect(html).toContain("<summary>Advise the client on the settlement offer.</summary>");
    expect(html).toContain("rr-guide__output rr-guide__output--rich");
    expect(html).toContain("<h2");
    expect(html).toContain("Take the offer");
    expect(html).not.toContain("<script>");
    expect(html).toContain("A real run on Redrob, on 2026-10-09");
    expect(html).not.toContain("Sample output, illustrative");
  });

  test("with no samples, no empty prompt and output boxes", async () => {
    const research = await loadGuideResearch();
    const html = renderToStaticMarkup(<ProfessionGuideView research={research} locale="en" />);
    expect(html).not.toContain("rr-guide__sample");
  });

  test("a profession or language with no samples loads as empty, and an unsafe id never builds a path", async () => {
    expect(await loadGuideSamples("en", "nobody")).toEqual({});
    expect(await loadGuideSamples("../..", "lawyer")).toEqual({});
  });
});
