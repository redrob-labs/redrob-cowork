import type { ScheduleBoard, ScheduleTarget } from "../types";
import { at } from "./sample-day";

const RENEWAL_SWEEP: ScheduleTarget = {
  kind: "prompt",
  text: "Contract renewal sweep\n\nFind every contract that renews on its own before 30 Nov, with its notice date, and ask me which to end.",
};
const DEADLINES: ScheduleTarget = { kind: "skill", name: "deadline-tracker", instructions: "Count under the Civil Procedure Act and skip public holidays." };
const FIRST_REVIEW: ScheduleTarget = { kind: "skill", name: "first-review" };

export const SCHEDULE_BOARD: ScheduleBoard = {
  waiting: [
    {
      id: "w1",
      scheduleId: "s1",
      target: RENEWAL_SWEEP,
      name: "Contract renewal sweep",
      projectId: "supplier",
      title: "Pick which contracts to end",
      description: "The sweep found 9 contracts that renew on their own before 30 Nov. Two have notice dates next week.",
      detail: "Hansol Logistics: notice by 3 Oct. Daeyang Packaging: notice by 6 Oct. Seven more after 20 Oct.",
      askedAt: at(28, 8, 14),
    },
    {
      id: "w2",
      scheduleId: "s2",
      target: DEADLINES,
      name: "deadline-tracker",
      projectId: "hanbit",
      title: "Add 2 deadlines to the team calendar",
      description: "From the order dated 23 Sep. Counted under the Civil Procedure Act, skipping the Chuseok holidays.",
      detail: "Reply brief: Fri 2 Oct. Exhibit list: Fri 16 Oct. Both assigned to Lee Dohyun.",
      askedAt: at(28, 7, 40),
    },
  ],
  schedules: [
    { id: "s1", target: RENEWAL_SWEEP, name: "Contract renewal sweep", projectId: "supplier", cadence: "Every Monday, 08:00 KST", nextRunAt: at(5, 8, 0, 10), lastRun: { state: "blocked", at: at(28, 8, 14), label: "Waiting for you" }, enabled: true },
    { id: "s2", target: DEADLINES, name: "deadline-tracker", projectId: "hanbit", cadence: "When a new file arrives", nextRunAt: null, lastRun: { state: "blocked", at: at(28, 7, 40), label: "Waiting for you" }, enabled: true },
    { id: "s3", target: FIRST_REVIEW, name: "first-review", projectId: "seorin", cadence: "When Seorin sends a draft", nextRunAt: null, lastRun: { state: "done", at: at(25, 15, 31), label: "4 departures" }, enabled: true },
    { id: "s4", target: RENEWAL_SWEEP, name: "Contract renewal sweep", projectId: "nara", cadence: "Every quarter, first Monday", nextRunAt: null, lastRun: { state: "stopped", at: at(1, 9, 0, 7), label: "Paused by you" }, enabled: false },
  ],
};
