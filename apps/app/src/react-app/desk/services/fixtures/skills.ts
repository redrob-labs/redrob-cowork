import type { DeskSkill, LibrarySkill, SkillTaxonomy } from "../types";

/*
 * Sample skills for the Skills screen and the schedule dialog: one from the team, one of Han
 * Jiwoo's own, one added from the library, and a few library skills not added yet.
 */

const LAWYER = { profession: "lawyer" };
const ACCOUNTANT = { profession: "accountant" };
const VC = { profession: "vc" };

/** Sample installed skills. */
export const SKILLS: DeskSkill[] = [
  { name: "first-review", title: "Contract First-Pass Review", description: "Reviews a contract draft against the house positions and marks what departs.", origin: "team", tags: { ...LAWYER, task: "review", language: "en" }, scope: "project" },
  { name: "deadline-tracker", title: "Court Deadline Tracker", description: "Reads court orders and adds each deadline to the team calendar.", origin: "mine", tags: { ...LAWYER, task: "client", language: "en" }, scope: "project" },
  { name: "weekly-report", title: "Weekly Status Report", description: "Writes the weekly status report from the week's files.", origin: "library", tags: { ...LAWYER, task: "client", language: "en" }, scope: "project" },
];

/** What each sample skill says to do. */
export const SKILL_BODIES: Record<string, string> = {
  // Lawyer
  "first-review": "# Contract first review\n\n1. Read the contract and pull out the key terms.\n2. Compare each clause with the house positions.\n3. Mark every departure as accept, push back or must change.",
  "deadline-tracker": "# Court deadline watch\n\nRead each new court order, work out every deadline it sets under the Civil Procedure Act, and list them with who owns each.",
  "weekly-report": "# Weekly report\n\nRead the week's files and write a one-page status report: what moved, what is waiting, and what needs a decision.",
  "nda-review": "# NDA review\n\nCheck the term, the scope of confidential information, the carve-outs and the remedies, and say what to push back on.",
  "legal-memo": "# Legal memo\n\nWrite a one-page memo in this order: the issue, the conclusion, the reasoning, then the risks.",
  "client-update": "# Client update\n\nRead the week's filings and emails and write a short, plain-language update: what happened, what it means, what is next.",
  // Accountant
  "month-end-close": "# Month-end close\n\n1. Reconcile each account to its statement.\n2. Flag any variance over the threshold with a one-line reason.\n3. List what is still open and who owns it.",
  "tax-prep-checklist": "# Tax prep checklist\n\nFrom the client's entity type, build the list of forms and schedules the filing needs, then gather each and mark what is missing.",
  "statement-review": "# Statement review\n\nRead the financial statements, find the figures that do not tie out, and draft the audit notes with the question each one raises.",
  // VC Investor
  "startup-diligence": "# Startup diligence\n\nFirst pass: size the market, read the team, check the traction, and surface the two or three risks worth a second meeting.",
  "investment-memo": "# Investment memo\n\nWrite the memo: the thesis, the deal terms, what has to be true for this to work, and the return math at exit.",
  "deal-screener": "# Deal screener\n\nRead each inbound deck against the fund's thesis and rank it pass, watch, or meet — with one line on why.",
};

/** Sample library skills: three per profession (Lawyer, Accountant, VC Investor). */
export const LIBRARY: LibrarySkill[] = [
  // Lawyer
  { name: "nda-review", title: "NDA Review", description: "Reviews an NDA for term, scope, carve-outs and remedies, and says what to push back on.", tags: { ...LAWYER, task: "review", language: "en" } },
  { name: "legal-memo", title: "Legal Memo Writer", description: "Writes a one-page brief: issue, conclusion, reasoning, then the risks.", tags: { ...LAWYER, task: "memo", language: "en" } },
  { name: "client-update", title: "Client Update Summary", description: "Turns the week's filings and emails into a plain-language update for the client.", tags: { ...LAWYER, task: "client", language: "en" } },
  // Accountant
  { name: "month-end-close", title: "Month-End Close", description: "Walks the month-end close: reconcile each account, flag the variances, and list what is still open.", tags: { ...ACCOUNTANT, task: "close-books", language: "en" } },
  { name: "tax-prep-checklist", title: "Tax Prep Checklist", description: "Builds the filing checklist from the client's entity type and gathers every form it needs.", tags: { ...ACCOUNTANT, task: "tax", language: "en" } },
  { name: "statement-review", title: "Financial Statement Review", description: "Reviews the financial statements for the figures that do not tie out and drafts the audit notes.", tags: { ...ACCOUNTANT, task: "audit", language: "en" } },
  // VC Investor
  { name: "startup-diligence", title: "Startup Diligence", description: "Runs first-pass diligence on a startup: market, team, traction, and the risks worth a second look.", tags: { ...VC, task: "diligence", language: "en" } },
  { name: "investment-memo", title: "Investment Memo", description: "Drafts the investment memo: thesis, deal terms, what has to be true, and the return math.", tags: { ...VC, task: "memo", language: "en" } },
  { name: "deal-screener", title: "Deal Screener", description: "Screens inbound decks against the fund's thesis and ranks them pass, watch, or meet.", tags: { ...VC, task: "screen", language: "en" } },
];

export const TAXONOMY: SkillTaxonomy = {
  professions: [
    {
      id: "lawyer",
      label: { en: "Lawyer", ko: "변호사" },
      tasks: [
        { id: "client", label: { en: "Advise and update clients", ko: "의뢰인 자문과 진행 상황 공유" } },
        { id: "research", label: { en: "Research the law", ko: "법률 리서치" } },
        { id: "review", label: { en: "Review documents and contracts", ko: "문서와 계약서 검토" } },
        { id: "memo", label: { en: "Write briefs and memos", ko: "서면과 메모 작성" } },
        { id: "draft", label: { en: "Draft contracts", ko: "계약서 초안 작성" } },
      ],
    },
    {
      id: "accountant",
      label: { en: "Accountant (CPA)", ko: "회계사" },
      tasks: [
        { id: "close-books", label: { en: "Close the books and reconcile accounts", ko: "결산 마감과 계정 대사" } },
        { id: "tax", label: { en: "Prepare tax filings", ko: "세무 신고 준비" } },
        { id: "audit", label: { en: "Review and audit statements", ko: "재무제표 검토와 감사" } },
      ],
    },
    {
      id: "vc",
      label: { en: "VC Investor", ko: "벤처 투자자" },
      tasks: [
        { id: "diligence", label: { en: "Run diligence on a startup", ko: "스타트업 실사" } },
        { id: "memo", label: { en: "Write an investment memo", ko: "투자 메모 작성" } },
        { id: "screen", label: { en: "Screen the inbound deal flow", ko: "인바운드 딜 선별" } },
      ],
    },
  ],
  languages: [
    { id: "en", label: { en: "English", ko: "영어" } },
    { id: "ko", label: { en: "Korean", ko: "한국어" } },
    { id: "hi", label: { en: "Hindi", ko: "힌디어" } },
  ],
};
