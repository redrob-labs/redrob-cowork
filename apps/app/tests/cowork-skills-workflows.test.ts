import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import { WorkflowView, type WorkflowViewProps } from "../src/react-app/cowork/skills/cowork-workflow";
import type { SkillRow } from "../src/react-app/cowork/skills/skills";
import { installSkills } from "../src/react-app/cowork/skills/use-skills";
import { WorkflowCard } from "../src/react-app/cowork/skills/workflow-card";
import {
  WORKFLOW_IDS,
  WORKFLOW_SKILLS,
  availableWorkflows,
  isWorkflowId,
  missingSkills,
  skillJurisdiction,
  workflowGroups,
  workflowPath,
  workflowRows,
} from "../src/react-app/cowork/skills/workflows";

/** The live catalogue's 96 names on 2026-10-19 (console.redrob.ai/skills/index.json). A typo in WORKFLOW_SKILLS fails here. */
const CATALOGUE_2026_10_19 = [
  "verify-before-claiming", "korean-localization", "commit-and-pr", "caveman", "ponytail", "eli5",
  "us-lawyer-nda", "us-lawyer-master-services-agreement", "us-lawyer-contract-review", "us-lawyer-demand-letter", "us-lawyer-cease-and-desist", "us-lawyer-privacy-policy", "us-lawyer-board-written-consent", "us-lawyer-engagement-letter", "us-lawyer-offer-letter-piia", "us-lawyer-83b-election", "us-lawyer-data-processing-addendum", "us-lawyer-certificate-of-incorporation", "us-lawyer-litigation-hold",
  "us-accountant-financial-statements", "us-accountant-bank-reconciliation", "us-accountant-adjusting-entries", "us-accountant-variance-analysis", "us-accountant-audit-workpaper", "us-accountant-book-to-tax", "us-accountant-mdna-memo", "us-accountant-sox-narrative", "us-accountant-form-1040-schedule-c", "us-accountant-asc606-revenue-memo", "us-accountant-asc842-lease-memo", "us-accountant-sales-tax-nexus-memo", "us-accountant-rnd-credit-memo",
  "us-vc-investment-memo", "us-vc-term-sheet-review", "us-vc-safe-convertible-analysis", "us-vc-cap-table-dilution", "us-vc-option-pool-analysis", "us-vc-diligence-summary", "us-vc-lp-update-letter", "us-vc-screening-pass-email", "us-vc-409a-valuation-review", "us-vc-management-rights-letter", "us-vc-side-letter-review", "us-vc-data-room-ddq", "us-vc-asc820-valuation-memo",
  "kr-lawyer-nda", "kr-lawyer-service-agreement", "kr-lawyer-contract-review", "kr-lawyer-demand-letter", "kr-lawyer-corporate-minutes", "kr-lawyer-articles-of-incorporation", "kr-lawyer-complaint-and-answer", "kr-lawyer-legal-opinion", "kr-lawyer-employment-rules", "kr-lawyer-shareholders-agreement", "kr-lawyer-stock-option-agreement", "kr-lawyer-privacy-policy", "kr-lawyer-provisional-remedies",
  "kr-accountant-financial-statements", "kr-accountant-account-reconciliation", "kr-accountant-adjusting-entries", "kr-accountant-vat-return", "kr-accountant-corporate-tax-adjustment", "kr-accountant-audit-workpaper", "kr-accountant-variance-icfr-memo", "kr-accountant-financial-ratios", "kr-accountant-year-end-settlement", "kr-accountant-capital-gains-tax", "kr-accountant-inheritance-gift-tax", "kr-accountant-deemed-interest-memo", "kr-accountant-entertainment-expense",
  "kr-vc-investment-memo", "kr-vc-term-sheet-review", "kr-vc-rcps-cb-safe-analysis", "kr-vc-cap-table-dilution", "kr-vc-diligence-summary", "kr-vc-lp-report", "kr-vc-decline-message", "kr-vc-deal-screening", "kr-vc-fund-agreement", "kr-vc-fund-of-funds-proposal", "kr-vc-carried-interest", "kr-vc-option-pool-design", "kr-vc-redemption-conversion",
  "documents-docx", "resume-cover-letter", "presentations-pptx", "pdf", "spreadsheets-xlsx", "hangul-hwpx", "graphic-design", "charts-infographics", "ui-ux-design", "image-prompts", "humanize-writing", "slop-check",
];

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
  });

  test("ten curated workflows, all shown when the catalogue has their skills", () => {
    expect(WORKFLOW_IDS).toHaveLength(10);
    expect(availableWorkflows(allRows()).map((workflow) => workflow.id)).toEqual([...WORKFLOW_IDS]);
    expect(isWorkflowId("legal-drafting")).toBe(true);
    expect(isWorkflowId("nope")).toBe(false);
    expect(workflowPath("vc-deal")).toBe("/skills/workflow/vc-deal");
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

  test("every workflow has localized copy free of dashes and filler words", () => {
    const banned = /[\u2013\u2014]|seamless|effortless|unlock|empower|AI-powered/i;
    for (const id of WORKFLOW_IDS) {
      const key = id.replace(/-/g, "_");
      for (const part of ["title", "sub"]) {
        const name = `cowork.skills_workflow_${key}_${part}` as keyof typeof en;
        expect(typeof en[name]).toBe("string");
        expect(typeof (ko as Record<string, string>)[name]).toBe("string");
        expect(en[name]).not.toMatch(banned);
        expect((ko as Record<string, string>)[name]).not.toMatch(banned);
      }
    }
    expect(en["cowork.skills_section_workflows"]).toBe("The whole job, one set");
    expect((ko as Record<string, string>)["cowork.skills_section_workflows"]).toBe("업무 전체를 한 세트로");
  });
});

describe("workflow markup", () => {
  const render = (node: React.ReactElement) => renderToStaticMarkup(React.createElement(MemoryRouter, null, node));
  const props = (overrides: Partial<WorkflowViewProps> = {}): WorkflowViewProps => ({
    id: "legal-company",
    rows: workflowRows("legal-company", allRows()),
    locale: "en",
    canAdd: true,
    busy: null,
    addingAll: false,
    backPath: "/skills",
    onBack: () => {},
    onAdd: () => {},
    onAddAll: () => {},
    ...overrides,
  });

  test("the card links to the workflow page and describes itself", () => {
    const html = render(React.createElement("ul", null, React.createElement(WorkflowCard, { id: "office", rows: workflowRows("office", allRows()), locale: "en", fromPath: "/skills" })));
    expect(html).toContain('href="/skills/workflow/office"');
    expect(html).toContain('aria-describedby="workflow-sub-office"');
    expect(html).toContain("cowork-workflow-card__cover");
    expect(html).not.toContain("title=");
  });

  test("the page groups skills, links each to its page and offers Add all", () => {
    const html = render(React.createElement(WorkflowView, props()));
    expect(html).toContain("United States");
    expect(html).toContain("Korea");
    expect(html.indexOf("United States")).toBeLessThan(html.indexOf("Korea"));
    expect(html).toContain('href="/skill/us-lawyer-83b-election"');
    expect(html).toContain("Add all 5");
  });

  test("Add all hides when everything is added and is disabled without a project", () => {
    const installed = props().rows.map((entry) => ({ ...entry, installed: { name: entry.name, description: "", origin: "library" as const, tags: {}, scope: "project" as const } }));
    expect(render(React.createElement(WorkflowView, props({ rows: installed })))).not.toContain("Add all");
    const disabled = render(React.createElement(WorkflowView, props({ canAdd: false })));
    expect(disabled).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Add all 5/);
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
