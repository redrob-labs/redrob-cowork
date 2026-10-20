import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { SkillView } from "../src/react-app/cowork/skills/cowork-skill";
import { WorkflowView, type WorkflowViewProps } from "../src/react-app/cowork/skills/cowork-workflow";
import type { SkillRow } from "../src/react-app/cowork/skills/skills";
import { installSkills } from "../src/react-app/cowork/skills/use-skills";
import {
  WORKFLOW_IDS,
  WORKFLOW_SKILLS,
  availableWorkflows,
  isWorkflowId,
  missingSkills,
  skillJurisdiction,
  workflowGroups,
  workflowRows,
} from "../src/react-app/cowork/skills/workflows";
import { POPULAR_SKILLS } from "../src/react-app/cowork/skills/popular-skills";
import { marketplaceSections, popularRows } from "../src/react-app/cowork/skills/use-marketplace";
import { CATALOGUE_2026_10_19 } from "./helpers/console-catalogue-names";

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
const allRows = () => CATALOGUE_2026_10_19.map((name) => row(name));

describe("featured workflows data", () => {
  test("every member is a real catalogue skill and sits in one workflow only", () => {
    expect(new Set(CATALOGUE_2026_10_19).size).toBe(96);
    const seen = new Set<string>();
    for (const id of WORKFLOW_IDS) {
      expect(WORKFLOW_SKILLS[id].length).toBeGreaterThanOrEqual(2);
      for (const name of WORKFLOW_SKILLS[id]) {
        expect(CATALOGUE_2026_10_19).toContain(name);
        expect(seen.has(name)).toBe(false);
        seen.add(name);
      }
    }
    // All ten are shown when the catalogue has their skills, and only known ids route.
    expect(availableWorkflows(allRows()).map((workflow) => workflow.id)).toEqual([...WORKFLOW_IDS]);
    expect(isWorkflowId("legal-drafting")).toBe(true);
    expect(isWorkflowId("nope")).toBe(false);
  });

  test("missing names are skipped and a workflow under two skills is hidden", () => {
    const rows = allRows().filter((entry) => entry.name !== "us-lawyer-nda");
    expect(workflowRows("legal-drafting", rows).map((entry) => entry.name)).not.toContain("us-lawyer-nda");
    const thin = [row("documents-docx")];
    expect(availableWorkflows(thin)).toEqual([]);
  });

  test("groups by country with the person's language first", () => {
    const members = workflowRows("legal-drafting", allRows());
    expect(workflowGroups(members, "en").map((group) => group.jurisdiction)).toEqual(["us", "kr"]);
    expect(workflowGroups(members, "ko").map((group) => group.jurisdiction)).toEqual(["kr", "us"]);
    expect(workflowGroups(workflowRows("office", allRows()), "ko").map((group) => group.jurisdiction)).toEqual([null]);
    expect(skillJurisdiction("kr-vc-lp-report")).toBe("kr");
    expect(skillJurisdiction("pdf")).toBeNull();
  });

  test("Add all lists only skills not yet added, in page order", () => {
    const members = workflowRows("vc-captable", allRows()).map((entry) =>
      entry.name === "kr-vc-cap-table-dilution" ? { ...entry, installed: { name: entry.name, description: "", origin: "library" as const, tags: {}, scope: "project" as const } } : entry,
    );
    const missing = missingSkills(members, "ko");
    expect(missing[0]).toBe("kr-vc-option-pool-design");
    expect(missing).not.toContain("kr-vc-cap-table-dilution");
  });
});

describe("Popular shelf", () => {
  test("every Popular name is a real, unique catalogue skill; the shelf keeps curated order and skips gaps", () => {
    for (const list of [POPULAR_SKILLS.en, POPULAR_SKILLS.ko]) {
      expect(new Set(list).size).toBe(list.length);
      for (const name of list) expect(CATALOGUE_2026_10_19).toContain(name);
    }
    const rows = allRows().reverse().filter((entry) => entry.name !== POPULAR_SKILLS.en[0]);
    expect(popularRows(rows, "en").map((entry) => entry.name)).toEqual(POPULAR_SKILLS.en.slice(1));
    expect(popularRows(rows, "ko-KR").map((entry) => entry.name)).toEqual(POPULAR_SKILLS.ko.filter((name) => name !== POPULAR_SKILLS.en[0]));
    // Page order: Your skills, then the catalogue families, then workflows, then Popular.
    expect(Object.keys(marketplaceSections(rows, "en"))).toEqual(["yours", "categories", "workflows", "popular"]);
  });
});

describe("Add controls", () => {
  const render = (node: React.ReactElement) => renderToStaticMarkup(React.createElement(MemoryRouter, null, node));
  const added = (entry: SkillRow): SkillRow => ({ ...entry, installed: { name: entry.name, description: "", origin: "library", tags: {}, scope: "project" } });
  const props = (overrides: Partial<WorkflowViewProps> = {}): WorkflowViewProps => ({
    id: "legal-company",
    rows: workflowRows("legal-company", allRows()),
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
    expect(html.indexOf("United States")).toBeLessThan(html.indexOf("Korea"));
    expect(html).toContain('href="/skill/us-lawyer-83b-election"');
    expect(addAll(html)).not.toContain("disabled");
    // Without a workspace, Add all is disabled; while a single add runs it waits too.
    expect(addAll(render(React.createElement(WorkflowView, props({ canAdd: false }))))).toContain("disabled");
    expect(addAll(render(React.createElement(WorkflowView, props({ pending: new Set(["us-lawyer-83b-election"]) }))))).toContain("disabled");
    // Everything added: no Add all at all.
    expect(render(React.createElement(WorkflowView, props({ rows: props().rows.map(added) })))).not.toContain("Add all");
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
