import type { CoworkServerClient } from "../../src/react-app/cowork/services/real-services";

const unused = async (): Promise<never> => {
  throw new Error("not used");
};

/**
 * A full CoworkServerClient for tests: the methods a test passes in, and every other
 * one rejects with "not used". Listing every member here (not spreading a Partial)
 * keeps this helper failing to compile when CoworkServerClient grows a member.
 */
export function coworkClient(methods: Partial<CoworkServerClient> = {}): CoworkServerClient {
  const rejecting: CoworkServerClient = {
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
