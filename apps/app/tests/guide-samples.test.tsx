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

  test("with a task card, the pick shows the card, its own scorecard and run, and the answer folded", async () => {
    const research = await loadGuideResearch();
    const task = research.professions.find((p) => p.id === "lawyer")?.tasks[0];
    const first = task?.picks.en?.find((pick) => !pick.benchmark);
    const key = sampleKey(first?.steps[0]?.model ?? "", first?.steps[0]?.effort);
    const samples = {
      "en/lawyer": GuideSamples.parse({
        [task?.id ?? ""]: {
          prompt: "The full prompt.",
          card: { brief: "Advise the client on two offers.", given: ["Case summary", "Offer 1"], asked: ["The real deadline", "A recommendation"], limit: "About 1,200 words", hard: "A deadline to compute." },
          checks: ["Objection due Nov 13", "Release wipes the guaranty", "Removes the consultant"],
          runs: {
            [key]: {
              output: "## Advice", date: "2026-10-09", effort: "high", costUsd: 0.11, latencyMs: 48_000, cut: false,
              verdicts: [{ verdict: "pass", quote: "by November 13" }, { verdict: "partial", quote: "" }, { verdict: "miss", quote: "" }],
            },
          },
        },
      }),
    };
    const html = renderToStaticMarkup(<ProfessionGuideView research={research} locale="en" samples={samples} />);
    expect(html).toContain("Advise the client on two offers.");
    expect(html).toContain("Everything was in the message");
    expect(html).toContain("<b>1 of 3, 1 partly</b>");
    expect(html).toContain("Scorecard 1 of 3, 1 partly");
    expect(html).toContain("<q class=\"rr-guide__quote\">by November 13</q>");
    expect(html).toContain("Graded by two models from different labs");
    expect(html).toContain("<dt>Time to answer</dt><dd>48 s</dd>");
    expect(html).toMatch(/<dt>Cost on Redrob<\/dt><dd>\$0\.11/);
    expect(html).toContain("<summary>Read the full answer</summary>");
    expect(html).toContain("<summary>See the exact prompt</summary>");
  });

  test("a run graded against an older scorecard shows no scorecard rather than misaligned marks", async () => {
    const research = await loadGuideResearch();
    const task = research.professions.find((p) => p.id === "lawyer")?.tasks[0];
    const first = task?.picks.en?.find((pick) => !pick.benchmark);
    const key = sampleKey(first?.steps[0]?.model ?? "", first?.steps[0]?.effort);
    const samples = {
      "en/lawyer": GuideSamples.parse({
        [task?.id ?? ""]: {
          prompt: "P",
          card: { brief: "B", given: [], asked: [], limit: null, hard: null },
          checks: ["One", "Two"],
          runs: { [key]: { output: "A", date: "2026-10-09", effort: "high", costUsd: 0.1, cut: false, verdicts: [{ verdict: "pass", quote: "" }] } },
        },
      }),
    };
    const html = renderToStaticMarkup(<ProfessionGuideView research={research} locale="en" samples={samples} />);
    expect(html).toContain("rr-guide__card");
    expect(html).not.toContain("rr-guide__scorecard");
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
