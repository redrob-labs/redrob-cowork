import type { HistoryEntry } from "../types";
import { at } from "./sample-day";

export const HISTORY: HistoryEntry[] = [
  {
    id: "h3", at: at(28, 8, 14), kind: "run", what: "Renewal sweep read 41 contracts, found 9", projectId: "supplier", state: "blocked", label: "Waiting for you", approvedBy: null, took: "4m 12s", sentOutside: false, filesChanged: 0,
    steps: [
      { label: "Read every contract in the folder", state: "done", meta: "41 of 41" },
      { label: "Found the ones that renew on their own in the next 60 days", state: "done", meta: "9 found" },
      { label: "Worked out the last day to give notice for each", state: "done", meta: "Earliest 3 Oct" },
      { label: "Compared each against what we have signed with that party", state: "done", meta: "2 differ" },
      { label: "Draft a notice letter for each one to end", state: "active", meta: "Waiting for you" },
      { label: "Send the letters from your email", state: "todo" },
    ],
  },
  { id: "h1", at: at(28, 7, 40), kind: "run", what: "Court deadline tracker read 1 new order", projectId: "hanbit", state: "blocked", label: "Waiting for you", approvedBy: null, took: "2m 10s", sentOutside: false, filesChanged: 0 },
  { id: "h2", at: at(28, 7, 12), kind: "chat", what: "Answered: is the Seorin indemnity cap market?", projectId: "seorin", state: "done", label: "Answered", approvedBy: null, took: "48s", sentOutside: false, filesChanged: 0 },
  { id: "h4", at: at(25, 16, 2), kind: "approval", what: "Sent the review note to Kim Minjun at Seorin", projectId: "seorin", state: "done", label: "Sent", approvedBy: "Han Jiwoo", took: null, sentOutside: true, filesChanged: 0 },
  {
    id: "h5", at: at(25, 15, 31), kind: "run", what: "First-pass review of Seorin draft v3", projectId: "seorin", state: "done", label: "4 departures", approvedBy: null, took: "3m 05s", sentOutside: false, filesChanged: 1,
    steps: [
      { label: "Read the draft against our standard positions", state: "done", meta: "38 clauses" },
      { label: "Marked every clause that departs from our standard", state: "done", meta: "4 found" },
      { label: "Suggested wording from clauses already agreed", state: "done", meta: "3 of 4" },
      { label: "Rated each departure", state: "done", meta: "1 must change" },
      { label: "Wrote a short note for the client", state: "done", meta: "You sent it at 16:02" },
    ],
  },
  { id: "h6", at: at(24, 11, 20), kind: "approval", what: "Added 3 deadlines to the team calendar", projectId: "hanbit", state: "done", label: "Added", approvedBy: "Lee Dohyun", took: null, sentOutside: false, filesChanged: 0 },
  { id: "h7", at: at(23, 9, 5), kind: "change", what: "Updated the exhibit index, 12 rows", projectId: "hanbit", state: "done", label: "Kept", approvedBy: "Han Jiwoo", took: "1m 40s", sentOutside: false, filesChanged: 1 },
  { id: "h8", at: at(21, 8, 13), kind: "approval", what: "Declined to send 1 notice letter", projectId: "supplier", state: "stopped", label: "You said no", approvedBy: "Han Jiwoo", took: null, sentOutside: false, filesChanged: 0 },
];
