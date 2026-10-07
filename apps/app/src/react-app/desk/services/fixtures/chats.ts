import { chatDefaults } from "../desk-services";
import type { Chat } from "../types";
import { at } from "./sample-day";

const chat = (id: string, title: string, projectId: string | null, updatedAt: number): Chat => ({
  id,
  title,
  projectId,
  updatedAt,
  ...chatDefaults(projectId),
});

export const CHATS: Chat[] = [
  chat("notice", "Notice by email - valid?", "seorin", at(28, 9, 40)),
  chat("indemnity", "Seorin indemnity cap", "seorin", at(28, 8, 10)),
  chat("s-draft3", "Draft v3 against our standard", "seorin", at(25, 16)),
  chat("s-kim", "Kim Minjun's questions on liability", "seorin", at(24, 11)),
  chat("s-term", "Term and termination", "seorin", at(15, 10)),
  chat("s-dpa", "Data processing annex", "seorin", at(11, 14)),
  chat("s-kick", "Kickoff notes", "seorin", at(2, 10)),
  chat("hanbit-exh", "Hanbit exhibit list", "hanbit", at(25, 15)),
  chat("hb-timeline", "Timeline of the damages claim", "hanbit", at(22, 10)),
  chat("hb-reply", "Reply brief outline", "hanbit", at(18, 9)),
  chat("hb-witness", "Witness list", "hanbit", at(16, 13)),
  chat("hb-expert", "Expert report questions", "hanbit", at(10, 11)),
  chat("sup-worth", "Which renewals are worth renegotiating", "supplier", at(23, 10)),
  chat("sup-hansol", "Hansol notice letter", "supplier", at(21, 15)),
  chat("sup-list", "Counterparty list", "supplier", at(14, 10)),
  chat("nara-first", "First look at the data room", "nara", at(19, 10)),
  chat("nara-req", "Diligence request list", "nara", at(19, 15)),
  chat("style", "How I like drafts", null, at(1, 9)),
];
