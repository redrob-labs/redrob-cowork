import type { DeskFile } from "../types";
import { at } from "./sample-day";

export const FILES: DeskFile[] = [
  { id: "f-notice", name: "Notice ending the Seorin MSA (KO, EN).docx", icon: "fileText", projectName: "Seorin MSA", when: at(28, 10, 12), fromChat: "Notice by email - valid?", kind: "notice" },
  { id: "f-note", name: "Note for the client.docx", icon: "fileText", projectName: "Seorin MSA", when: at(28, 10, 12), fromChat: "Notice by email - valid?", kind: "note" },
  { id: "f-plan", name: "Plan · Ending the Seorin MSA.md", icon: "route", projectName: "Seorin MSA", when: at(28, 9, 58), fromChat: "Notice by email - valid?", kind: "plan" },
  { id: "f-exhibits", name: "Hanbit exhibit index.xlsx", icon: "fileSheet", projectName: "Hanbit v. Daeil", when: at(25, 9), fromChat: "Hanbit exhibit list", kind: "sheet" },
  { id: "f-requests", name: "Diligence request list.docx", icon: "fileText", projectName: "Nara Series B diligence", when: at(19, 9), fromChat: "Diligence request list", kind: "list" },
];
