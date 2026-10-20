import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { SkillView } from "../src/react-app/cowork/skills/cowork-skill";
import { WorkflowView, type WorkflowViewProps } from "../src/react-app/cowork/skills/cowork-workflow";
import { SKILL_ART_NAMES, skillArt } from "../src/react-app/cowork/skills/skill-art";
import { SkillIcon } from "../src/react-app/cowork/skills/skill-icon";
import type { SkillRow } from "../src/react-app/cowork/skills/skills";
import { installSkills } from "../src/react-app/cowork/skills/use-skills";
import {
  availableWorkflows,
  findWorkflow,
  missingSkills,
  workflowGroups,
  workflowPath,
  workflowSearchText,
  workflowTitle,
} from "../src/react-app/cowork/skills/workflows";
import { POPULAR_SKILLS } from "../src/react-app/cowork/skills/popular-skills";
import { marketplaceSections, popularRows } from "../src/react-app/cowork/skills/use-marketplace";
import { GROUPED_SKILLS_PR305 } from "./helpers/console-catalogue-names";

const row = (name: string, overrides: Partial<SkillRow> = {}): SkillRow => ({
  name,
  title: `Title ${name}`,
  summary: `Summary of ${name}.`,
  description: `Use when ${name} is needed.`,
  tags: {},
  origin: "library",
  installed: null,
  ...overrides,
});
/** The live catalogue after PR #305: the 35 grouped skills, as the catalogue reader returns them. */
const allRows = () => GROUPED_SKILLS_PR305.map(({ name, ...grouping }) => row(name, grouping));
const added = (entry: SkillRow): SkillRow => ({ ...entry, installed: { name: entry.name, description: "", origin: "library", tags: {}, scope: "project" } });

describe("workflows are the catalogue families", () => {
  test("one workflow per family, in the Console's order, every grouped skill in exactly one", () => {
    const workflows = availableWorkflows(allRows(), "en");
    expect(workflows.map((workflow) => workflow.id)).toEqual([
      "natural-writing",
      "korean-research-papers",
      "korean-civil-cases",
      "korean-criminal-cases",
      "korean-patents",
      "korean-accounting-and-audit",
      "korean-consulting",
      "korean-venture-capital",
      "korean-news-and-pr",
      "design",
      "korean-file-conversion",
    ]);
    const members = workflows.flatMap((workflow) => workflow.rows.map((entry) => entry.name));
    expect(members).toHaveLength(35);
    expect(new Set(members).size).toBe(35);
  });

  test("skills run in step order, names follow the app language, ungrouped skills are left out", () => {
    const rows = [...allRows(), row("loose")].reverse();
    const patents = findWorkflow("korean-patents", rows, "en");
    expect(patents?.rows.map((entry) => entry.step)).toEqual([1, 2, 3, 4, 5]);
    expect(patents?.rows[0]?.name).toBe("kpat-invention-logic");
    expect(workflowTitle(patents!, "en")).toBe("(Korean) Patents");
    expect(workflowTitle(patents!, "ko-KR")).toBe("(국내) 특허 출원");
    expect(workflowPath("korean-patents")).toBe("/skills/workflow/korean-patents");
    expect(availableWorkflows(rows).some((workflow) => workflow.rows.some((entry) => entry.name === "loose"))).toBe(false);
    expect(findWorkflow("legal-drafting", rows, "en")).toBeNull();
    // A family the Console adds later is kept, after the known ones.
    const later = availableWorkflows([...rows, row("new-one", { category: "Brand new", step: 1 })]);
    expect(later.at(-1)?.id).toBe("brand-new");
    // Search matches either family name and the member titles.
    expect(workflowSearchText(patents!, "en")).toContain("(국내) 특허 출원");
    expect(workflowSearchText(patents!, "en")).toContain("Title kpat-drawings");
  });

  test("steps group alternatives; Add all lists only skills not yet added, in run order", () => {
    const writing = findWorkflow("natural-writing", allRows(), "en")!;
    expect(workflowGroups(writing.rows).map((group) => [group.step, group.rows.length])).toEqual([[1, 4]]);
    const research = findWorkflow("korean-research-papers", allRows(), "en")!;
    expect(workflowGroups(research.rows).map((group) => group.step)).toEqual([1, 2, 3, 4]);
    const rows = research.rows.map((entry) => entry.name === "researching-korean-literature" ? added(entry) : entry);
    expect(missingSkills(rows)).toEqual(["writing-korean-papers", "humanizing-korean-academic", "formatting-korean-papers"]);
  });
});

describe("Popular shelf", () => {
  test("lists the five picks in order, in both languages, skipping gaps", () => {
    const picks = ["docx-to-hwpx", "ko-civil-analysis", "ko-civil-formatting", "vc-pitch-deck", "kr-fs-preparation"];
    expect(POPULAR_SKILLS.en).toEqual(picks);
    expect(POPULAR_SKILLS.ko).toEqual(picks);
    const rows = allRows().reverse();
    expect(popularRows(rows, "en").map((entry) => entry.name)).toEqual(picks);
    expect(popularRows(rows, "ko-KR").map((entry) => entry.name)).toEqual(picks);
    expect(popularRows(rows.filter((entry) => entry.name !== "vc-pitch-deck"), "en").map((entry) => entry.name)).toEqual(picks.filter((name) => name !== "vc-pitch-deck"));
    // Page order: Your skills, then workflows, then Popular.
    expect(Object.keys(marketplaceSections(rows, "en"))).toEqual(["yours", "workflows", "popular"]);
  });
});

describe("Skill art", () => {
  test("each of the 35 grouped skills has art at three sizes; others keep the tone circle", () => {
    expect([...SKILL_ART_NAMES].sort()).toEqual(GROUPED_SKILLS_PR305.map((entry) => entry.name).sort());
    expect(skillArt("kpat-drawings")).toEqual({
      src: "/skill-art/kpat-drawings.png",
      srcSet: "/skill-art/kpat-drawings.png 128w, /skill-art/kpat-drawings@2x.png 256w, /skill-art/kpat-drawings@3x.png 384w",
    });
    expect(skillArt("caveman")).toBeNull();
    const icon = renderToStaticMarkup(React.createElement(SkillIcon, { name: "vc-pitch-deck", size: "tile" }));
    expect(icon).toContain('src="/skill-art/vc-pitch-deck.png"');
    expect(icon).toContain('sizes="72px"');
    expect(renderToStaticMarkup(React.createElement(SkillIcon, { name: "mine", size: "tile" }))).not.toContain("<img");
  });
});

describe("Add controls", () => {
  const render = (node: React.ReactElement) => renderToStaticMarkup(React.createElement(MemoryRouter, null, node));
  const props = (overrides: Partial<WorkflowViewProps> = {}): WorkflowViewProps => ({
    workflow: findWorkflow("korean-patents", allRows(), "en")!,
    locale: "en",
    canAdd: true,
    pending: new Set(),
    addingAll: false,
    backPath: "/skills",
    onBack: () => {},
    onAdd: () => {},
    onAddAll: () => {},
    ...overrides,
  });
  const addAll = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*?Add all 5/)?.[0]?.match(/<button[^>]*>/)?.[0] ?? "";

  test("follow the workspace, a running add, and what is already added", () => {
    const html = render(React.createElement(WorkflowView, props()));
    expect(html.indexOf("Step 1")).toBeLessThan(html.indexOf("Step 5"));
    expect(html).toContain('href="/skill/kpat-drawings"');
    expect(addAll(html)).not.toContain("disabled");
    // Without a workspace, Add all is disabled; while a single add runs it waits too.
    expect(addAll(render(React.createElement(WorkflowView, props({ canAdd: false }))))).toContain("disabled");
    expect(addAll(render(React.createElement(WorkflowView, props({ pending: new Set(["kpat-drawings"]) }))))).toContain("disabled");
    // Everything added: no Add all at all.
    expect(render(React.createElement(WorkflowView, props({ workflow: { ...props().workflow, rows: props().workflow.rows.map(added) } })))).not.toContain("Add all");
    // A deep-linked library skill offers Add only when a workspace is connected.
    const detail = (connected: boolean) => render(React.createElement(SkillView, {
      skill: { name: "pdf", description: "Use when making a PDF.", tags: {}, body: "", installed: null },
      taxonomy: null, locale: "en", connected, busy: false, backPath: "/skills", onBack: () => {}, onRun: () => {}, onAdd: () => {},
    }));
    // The library skill's only button is Add.
    const addButton = (html: string) => html.match(/<button[^>]*>/)?.[0] ?? "";
    expect(addButton(detail(false))).toContain("disabled");
    expect(addButton(detail(true))).not.toContain("disabled");
  });
});

describe("installSkills", () => {
  test("carries on past a failure, refreshes once and toasts once", async () => {
    const installed: string[] = [];
    const invalidated: unknown[] = [];
    const toasts: Array<[string, string | undefined, string | undefined]> = [];
    const result = await installSkills(
      {
        skills: {
          install: async (name: string) => {
            if (name === "b") throw new Error("nope");
            installed.push(name);
            return { data: null, preview: false };
          },
          remove: async () => ({ data: null, preview: false }),
        },
        queryClient: { invalidateQueries: async (filter: unknown) => void invalidated.push(filter) },
        scope: "w",
        showToast: (title, text, tone) => void toasts.push([title, text, tone]),
      },
      ["a", "b", "c"],
    );
    expect(result).toEqual({ added: 2, failed: 1 });
    expect(installed).toEqual(["a", "c"]);
    expect(invalidated).toHaveLength(3);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[2]).toBe("danger");
  });
});
