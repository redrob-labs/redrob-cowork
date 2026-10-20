/**
 * The live catalogue's 96 skill names on 2026-10-19 (console.redrob.ai/skills/index.json).
 * Curated lists (workflows, Popular) and Search are checked against it, so a typo fails a test.
 */
export const CATALOGUE_2026_10_19 = [
  "verify-before-claiming", "korean-localization", "commit-and-pr", "caveman", "ponytail", "eli5",
  "us-lawyer-nda", "us-lawyer-master-services-agreement", "us-lawyer-contract-review", "us-lawyer-demand-letter", "us-lawyer-cease-and-desist", "us-lawyer-privacy-policy", "us-lawyer-board-written-consent", "us-lawyer-engagement-letter", "us-lawyer-offer-letter-piia", "us-lawyer-83b-election", "us-lawyer-data-processing-addendum", "us-lawyer-certificate-of-incorporation", "us-lawyer-litigation-hold",
  "us-accountant-financial-statements", "us-accountant-bank-reconciliation", "us-accountant-adjusting-entries", "us-accountant-variance-analysis", "us-accountant-audit-workpaper", "us-accountant-book-to-tax", "us-accountant-mdna-memo", "us-accountant-sox-narrative", "us-accountant-form-1040-schedule-c", "us-accountant-asc606-revenue-memo", "us-accountant-asc842-lease-memo", "us-accountant-sales-tax-nexus-memo", "us-accountant-rnd-credit-memo",
  "us-vc-investment-memo", "us-vc-term-sheet-review", "us-vc-safe-convertible-analysis", "us-vc-cap-table-dilution", "us-vc-option-pool-analysis", "us-vc-diligence-summary", "us-vc-lp-update-letter", "us-vc-screening-pass-email", "us-vc-409a-valuation-review", "us-vc-management-rights-letter", "us-vc-side-letter-review", "us-vc-data-room-ddq", "us-vc-asc820-valuation-memo",
  "kr-lawyer-nda", "kr-lawyer-service-agreement", "kr-lawyer-contract-review", "kr-lawyer-demand-letter", "kr-lawyer-corporate-minutes", "kr-lawyer-articles-of-incorporation", "kr-lawyer-complaint-and-answer", "kr-lawyer-legal-opinion", "kr-lawyer-employment-rules", "kr-lawyer-shareholders-agreement", "kr-lawyer-stock-option-agreement", "kr-lawyer-privacy-policy", "kr-lawyer-provisional-remedies",
  "kr-accountant-financial-statements", "kr-accountant-account-reconciliation", "kr-accountant-adjusting-entries", "kr-accountant-vat-return", "kr-accountant-corporate-tax-adjustment", "kr-accountant-audit-workpaper", "kr-accountant-variance-icfr-memo", "kr-accountant-financial-ratios", "kr-accountant-year-end-settlement", "kr-accountant-capital-gains-tax", "kr-accountant-inheritance-gift-tax", "kr-accountant-deemed-interest-memo", "kr-accountant-entertainment-expense",
  "kr-vc-investment-memo", "kr-vc-term-sheet-review", "kr-vc-rcps-cb-safe-analysis", "kr-vc-cap-table-dilution", "kr-vc-diligence-summary", "kr-vc-lp-report", "kr-vc-decline-message", "kr-vc-deal-screening", "kr-vc-fund-agreement", "kr-vc-fund-of-funds-proposal", "kr-vc-carried-interest", "kr-vc-option-pool-design", "kr-vc-redemption-conversion",
  "documents-docx", "resume-cover-letter", "presentations-pptx", "pdf", "spreadsheets-xlsx", "hangul-hwpx", "graphic-design", "charts-infographics", "ui-ux-design", "image-prompts", "humanize-writing", "slop-check",
];

/**
 * The live catalogue's 35 grouped skills after redrob-console PR #305, with the family and step
 * each carries in `metadata` (category, category_ko, step). Workflows, Popular and the cover art are
 * checked against it.
 */
export const GROUPED_SKILLS_PR305: ReadonlyArray<{ name: string; category: string; categoryKo: string; step: number }> = [
  ...["humanizing-english-casual", "humanizing-english-workplace", "humanizing-korean-banmal", "humanizing-korean-jondaetmal"].map((name) => ({ name, category: "Natural writing", categoryKo: "자연스러운 글쓰기", step: 1 })),
  ...[["researching-korean-literature", 1], ["writing-korean-papers", 2], ["humanizing-korean-academic", 3], ["formatting-korean-papers", 4]].map(([name, step]) => ({ name: String(name), category: "(Korean) Research papers", categoryKo: "(국내) 학술 논문", step: Number(step) })),
  ...[["ko-civil-analysis", 1], ["ko-civil-formatting", 2]].map(([name, step]) => ({ name: String(name), category: "(Korean) Civil cases", categoryKo: "(국내) 민사 소송", step: Number(step) })),
  ...[["ko-criminal-analysis", 1], ["ko-criminal-formatting", 2]].map(([name, step]) => ({ name: String(name), category: "(Korean) Criminal cases", categoryKo: "(국내) 형사 변론", step: Number(step) })),
  ...[["kpat-invention-logic", 1], ["kpat-prior-art-research", 2], ["kpat-document-composer", 3], ["kpat-drawings", 4], ["kpat-final-audit", 5]].map(([name, step]) => ({ name: String(name), category: "(Korean) Patents", categoryKo: "(국내) 특허 출원", step: Number(step) })),
  ...[["kr-fs-preparation", 1], ["kr-jet", 2], ["kr-audit-adjustments", 3], ["kr-audit-report", 4]].map(([name, step]) => ({ name: String(name), category: "(Korean) Accounting and audit", categoryKo: "(국내) 회계·감사", step: Number(step) })),
  ...[["kc-proposal", 1], ["kc-diagnosis", 2], ["kc-report", 3]].map(([name, step]) => ({ name: String(name), category: "(Korean) Consulting", categoryKo: "(국내) 경영 컨설팅", step: Number(step) })),
  ...[["vc-pitch-deck", 1], ["vc-deck-scorecard", 2], ["tusim-research", 3], ["tusim-narrative", 4], ["tusim-document-formatter", 5]].map(([name, step]) => ({ name: String(name), category: "(Korean) Venture capital", categoryKo: "(국내) 벤처 투자", step: Number(step) })),
  ...[["korean-press-release", 1], ["korean-straight-news", 2]].map(([name, step]) => ({ name: String(name), category: "(Korean) News and PR", categoryKo: "(국내) 보도·홍보", step: Number(step) })),
  ...[["composing-graphics", 1], ["composing-color-themes", 2]].map(([name, step]) => ({ name: String(name), category: "Design", categoryKo: "디자인", step: Number(step) })),
  ...["docx-to-hwpx", "hwpx-to-docx"].map((name) => ({ name, category: "(Korean) File conversion", categoryKo: "(국내) 문서 변환", step: 1 })),
];
