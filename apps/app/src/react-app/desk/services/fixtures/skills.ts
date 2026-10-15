import type { DeskSkill, LibrarySkill, SkillTaxonomy } from "../types";

/*
 * The preview/no-server mode ships NO sample skills: the installed list and the library are empty,
 * so preview mode shows the real empty state instead of fabricated skills (real skills come from
 * redrob-server / the Console). Only TAXONOMY remains - the profession/task/language vocabulary the
 * skill dialog and filters are built from.
 */

/** No sample installed skills. */
export const SKILLS: DeskSkill[] = [];

/** No sample skill bodies. */
export const SKILL_BODIES: Record<string, string> = {};

/** No sample library skills. */
export const LIBRARY: LibrarySkill[] = [];

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
