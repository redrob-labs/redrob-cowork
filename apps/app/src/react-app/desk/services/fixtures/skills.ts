import type { DeskSkill, LibrarySkill, SkillTaxonomy } from "../types";

/*
 * Sample skills for the Skills screen and the schedule dialog: one from the team, one of Han
 * Jiwoo's own, one added from the library, and a few library skills not added yet.
 */

const LAWYER = { profession: "lawyer" };

/** Sample installed skills. */
export const SKILLS: DeskSkill[] = [
  { name: "first-review", description: "Reviews a contract draft against the house positions and marks what departs.", origin: "team", tags: { ...LAWYER, task: "review", language: "en" }, scope: "project" },
  { name: "deadline-tracker", description: "Reads court orders and adds each deadline to the team calendar.", origin: "mine", tags: { ...LAWYER, task: "client", language: "en" }, scope: "project" },
  { name: "weekly-report", description: "Writes the weekly status report from the week's files.", origin: "library", tags: { ...LAWYER, task: "client", language: "en" }, scope: "project" },
];

/** What each sample skill says to do. */
export const SKILL_BODIES: Record<string, string> = {
  "first-review": "# Contract first review\n\n1. Read the contract and pull out the key terms.\n2. Compare each clause with the house positions.\n3. Mark every departure as accept, push back or must change.",
  "deadline-tracker": "# Court deadline watch\n\nRead each new court order, work out every deadline it sets under the Civil Procedure Act, and list them with who owns each.",
  "weekly-report": "# Weekly report\n\nRead the week's files and write a one-page status report: what moved, what is waiting, and what needs a decision.",
  "nda-review": "# NDA review\n\nCheck the term, the scope of confidential information, the carve-outs and the remedies, and say what to push back on.",
  "legal-memo-ko": "# 법률 메모\n\n쟁점, 결론, 근거, 위험 순서로 한 쪽 분량의 메모를 씁니다.",
};

/** Sample library skills. Two are already installed above. */
export const LIBRARY: LibrarySkill[] = [
  { name: "weekly-report", description: "Writes the weekly status report from the week's files.", tags: { ...LAWYER, task: "client", language: "en" } },
  { name: "nda-review", description: "Reviews an NDA for term, scope, carve-outs and remedies.", tags: { ...LAWYER, task: "review", language: "en" } },
  { name: "legal-memo-ko", description: "쟁점과 결론을 담은 법률 메모를 작성합니다.", tags: { ...LAWYER, task: "memo", language: "ko" } },
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
      tasks: [{ id: "close-books", label: { en: "Close the books and reconcile accounts", ko: "결산 마감과 계정 대사" } }],
    },
  ],
  languages: [
    { id: "en", label: { en: "English", ko: "영어" } },
    { id: "ko", label: { en: "Korean", ko: "한국어" } },
    { id: "hi", label: { en: "Hindi", ko: "힌디어" } },
  ],
};
