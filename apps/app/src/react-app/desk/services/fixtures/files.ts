import type { DeskFile } from "../types";
import { at } from "./sample-day";

const NOTICE = [
  "**계약 해지 통지서**",
  "**Notice of termination**",
  "To: Seorin Bio Co., Ltd., at the address in Schedule 3 of the Master Services Agreement.",
  "Under clause 18.1, we give notice that the Agreement will end on November 30, 2026 and will not renew on December 1, 2026.",
  "Please acknowledge receipt in writing. A copy of this notice is also sent by email, under clause 14.3.",
  "Signed for the client by its authorized representative ____________",
].join("\n\n");

export const FILES: DeskFile[] = [
  { id: "f-notice", name: "Notice ending the Seorin MSA (KO, EN).docx", icon: "fileText", projectName: "Seorin MSA", when: at(28, 10, 12), fromChat: "Notice by email - valid?", chatId: "notice", kind: "notice", body: NOTICE },
  { id: "f-note", name: "Note for the client.docx", icon: "fileText", projectName: "Seorin MSA", when: at(28, 10, 12), fromChat: "Notice by email - valid?", chatId: "notice", kind: "note", body: "**Ending the Seorin MSA: how to send the notice**\n\nSend by registered mail by October 24, a week before the deadline, with an email copy.\n\nEmail alone is risky rather than invalid: clause 14.2 names courier or registered mail." },
  { id: "f-plan", name: "Plan · Ending the Seorin MSA.md", icon: "route", projectName: "Seorin MSA", when: at(28, 9, 58), fromChat: "Notice by email - valid?", chatId: "notice", kind: "plan", body: "**Ending the Seorin MSA by November 30**\n\n5 steps: read clauses 14 and 18 and Amendment 2, search the 37 emails, confirm when a notice takes effect, work back from November 30, draft the notice." },
  { id: "f-exhibits", name: "Hanbit exhibit index.xlsx", icon: "fileSheet", projectName: "Hanbit v. Daeil", when: at(25, 9), fromChat: "Hanbit exhibit list", chatId: "hanbit-exh", kind: "sheet", body: "**Exhibit index**\n\n42 exhibits, numbered by the date each was created. 3 have no date and are listed last." },
  { id: "f-requests", name: "Diligence request list.docx", icon: "fileText", projectName: "Nara Series B diligence", when: at(19, 9), fromChat: "Diligence request list", chatId: "nara-req", kind: "list", body: "**Diligence request list**\n\n38 requests in 7 areas, the financial ones first." },
];
