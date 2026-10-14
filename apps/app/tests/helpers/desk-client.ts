import type { DeskServerClient } from "../../src/react-app/desk/services/real-services";

const unused = async (): Promise<never> => {
  throw new Error("not used");
};

/**
 * A full DeskServerClient for tests: the methods a test passes in, and every other
 * one rejects with "not used". Listing every member here (not spreading a Partial)
 * keeps this helper failing to compile when DeskServerClient grows a member.
 */
export function deskClient(methods: Partial<DeskServerClient> = {}): DeskServerClient {
  const rejecting: DeskServerClient = {
    listWorkspaces: unused,
    listSessions: unused,
    getSession: unused,
    listMemories: unused,
    saveMemory: unused,
    updateMemory: unused,
    deleteMemory: unused,
    listArtifacts: unused,
    listMcp: unused,
    getConfig: unused,
    patchConfig: unused,
    listCommands: unused,
    upsertCommand: unused,
    deleteCommand: unused,
    getSessionSnapshot: unused,
    listSchedules: unused,
    addSchedule: unused,
    updateSchedule: unused,
    answerScheduleWaiting: unused,
  };
  return { ...rejecting, ...methods };
}
