import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { SkillView } from "../src/react-app/cowork/skills/cowork-skill";
import { WorkflowView, type WorkflowViewProps } from "../src/react-app/cowork/skills/cowork-workflow";
import type { SkillRow } from "../src/react-app/cowork/skills/skills";
import { installSkills } from "../src/react-app/cowork/skills/use-skills";
import { missingSkills, type Workflow } from "../src/react-app/cowork/skills/workflows";
import { POPULAR_SKILLS } from "../src/react-app/cowork/skills/popular-skills";
import { marketplaceSections, popularRows } from "../src/react-app/cowork/skills/use-marketplace";

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
const added = (entry: SkillRow): SkillRow => ({ ...entry, installed: { name: entry.name, description: "", origin: "library", tags: {}, scope: "project" } });
/** A five-step family, as the catalogue reader groups it. */
const PATENTS: Workflow = {
  id: "korean-patents",
  category: "(Korean) Patents",
  rows: ["kpat-invention-logic", "kpat-prior-art-research", "kpat-document-composer", "kpat-drawings", "kpat-final-audit"]
    .map((name, index) => row(name, { category: "(Korean) Patents", step: index + 1 })),
};

describe("workflows data", () => {
  test("Add all lists only skills not yet added, in page order", () => {
    const members = PATENTS.rows.map((entry) => entry.name === "kpat-invention-logic" ? added(entry) : entry);
    const missing = missingSkills(members);
    expect(missing[0]).toBe("kpat-prior-art-research");
    expect(missing).not.toContain("kpat-invention-logic");
  });
});

describe("Popular shelf", () => {
  test("every Popular name is unique; the shelf keeps curated order and skips gaps", () => {
    for (const list of [POPULAR_SKILLS.en, POPULAR_SKILLS.ko]) expect(new Set(list).size).toBe(list.length);
    const rows = [...new Set([...POPULAR_SKILLS.en, ...POPULAR_SKILLS.ko])].map((name) => row(name)).reverse().filter((entry) => entry.name !== POPULAR_SKILLS.en[0]);
    expect(popularRows(rows, "en").map((entry) => entry.name)).toEqual(POPULAR_SKILLS.en.slice(1));
    expect(popularRows(rows, "ko-KR").map((entry) => entry.name)).toEqual(POPULAR_SKILLS.ko.filter((name) => name !== POPULAR_SKILLS.en[0]));
    // Page order: Your skills, then workflows, then Popular.
    expect(Object.keys(marketplaceSections(rows, "en"))).toEqual(["yours", "workflows", "popular"]);
  });
});

describe("Add controls", () => {
  const render = (node: React.ReactElement) => renderToStaticMarkup(React.createElement(MemoryRouter, null, node));
  const props = (overrides: Partial<WorkflowViewProps> = {}): WorkflowViewProps => ({
    workflow: PATENTS,
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
    expect(html.indexOf("Step 1")).toBeLessThan(html.indexOf("Step 2"));
    expect(html).toContain('href="/skill/kpat-drawings"');
    expect(addAll(html)).not.toContain("disabled");
    // Without a workspace, Add all is disabled; while a single add runs it waits too.
    expect(addAll(render(React.createElement(WorkflowView, props({ canAdd: false }))))).toContain("disabled");
    expect(addAll(render(React.createElement(WorkflowView, props({ pending: new Set(["kpat-drawings"]) }))))).toContain("disabled");
    // Everything added: no Add all at all.
    expect(render(React.createElement(WorkflowView, props({ workflow: { ...PATENTS, rows: PATENTS.rows.map(added) } })))).not.toContain("Add all");
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
