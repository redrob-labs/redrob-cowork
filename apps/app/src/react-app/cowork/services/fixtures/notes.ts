import type { MemoryNote } from "../types";
import { at } from "./sample-day";

// The prototype marks the team notes `how: 'admin'`; here they are told notes with `locked`.
export const NOTES: MemoryNote[] = [
  { id: "n1", scope: "project:seorin", text: "Our standard limit is 12 months of fees; 9 is the floor", chatId: "s-draft3", when: at(25), how: "told" },
  { id: "n2", scope: "project:seorin", text: "Seorin's lawyer prefers changes as a Word redline", chatId: "s-kim", when: at(24), how: "learned" },
  { id: "n3", scope: "project:seorin", text: "Person 1 decides for Seorin", chatId: "s-kim", when: at(24), how: "learned" },
  { id: "n4", scope: "project:seorin", text: "Korean law, disputes heard in Seoul", chatId: "s-term", when: at(15), how: "learned" },
  { id: "n5", scope: "project:seorin", text: "Our standard notice period is 60 days", chatId: "indemnity", when: at(28), how: "learned" },
  { id: "n6", scope: "project:seorin", text: "New sub-processors need Seorin's written approval", chatId: "s-dpa", when: at(11), how: "learned" },
  { id: "n7", scope: "project:seorin", text: "Our client is the service provider; argue from their side", chatId: "s-kick", when: at(2), how: "told" },
  { id: "n8", scope: "project:hanbit", text: "Court filings go in by 17:00 Seoul time", chatId: "hb-timeline", when: at(22), how: "told" },
  { id: "n9", scope: "project:hanbit", text: "The expert report is due on 14 October", chatId: "hb-expert", when: at(10), how: "learned" },
  { id: "n10", scope: "project:hanbit", text: "Exhibits are numbered by the date they were created", chatId: "hanbit-exh", when: at(25), how: "told" },
  { id: "n11", scope: "project:hanbit", text: "Opposing counsel accepts service by email", chatId: "hb-witness", when: at(16), how: "learned" },
  { id: "n12", scope: "project:supplier", text: "Renegotiate anything more than 5% above market", chatId: "sup-worth", when: at(23), how: "told" },
  { id: "n13", scope: "project:supplier", text: "Hansol's contracts renew on 1 January", chatId: "sup-hansol", when: at(21), how: "learned" },
  { id: "n14", scope: "project:supplier", text: "Send notices by registered mail, with an email copy", chatId: "sup-hansol", when: at(21), how: "told" },
  { id: "n15", scope: "project:nara", text: "The data room closes on 9 October", chatId: "nara-first", when: at(19), how: "learned" },
  { id: "n16", scope: "you", text: "Write in American English, with short dashes", chatId: "style", when: at(1), how: "told" },
  { id: "n17", scope: "you", text: "Answer first, then the reasons", chatId: "style", when: at(1), how: "told" },
  { id: "n18", scope: "you", text: "Keep edits to my drafts small", chatId: "style", when: at(1), how: "told" },
  { id: "n19", scope: "you", text: "Show exchange rates beside converted amounts", chatId: "nara-first", when: at(19), how: "told" },
  { id: "n20", scope: "you", text: "Call me Jiwoo", chatId: "style", when: at(1), how: "told" },
  { id: "n21", scope: "team", text: "House style: numbered clauses, defined terms in bold", when: at(20, 9, 0, 8), how: "told", locked: true },
  { id: "n22", scope: "team", text: "Never send ID or bank numbers", when: at(20, 9, 0, 8), how: "told", locked: true },
];
