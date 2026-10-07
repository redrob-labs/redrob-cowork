import { create } from "zustand";

import type { ProjectsClient } from "./projects";
import { folderBaseName } from "./projects";

/** What the person said to the folder ask in a project, during this visit to it. */
export type FolderAnswer = { kind: "not-now" } | { kind: "allowed"; folder: string };

export type FolderAskState = {
  answers: Record<string, FolderAnswer>;
  notNow(projectId: string): void;
  allowed(projectId: string, folder: string): void;
  /** Desk needs the folder again: forget the answer, so it asks if there is still no folder. */
  needFolder(projectId: string): void;
};

/**
 * In memory only. Not now hides the ask; the next time Desk needs the folder (the next time
 * the project opens) it asks again, as long as the project still has no folder of the person's.
 */
export function createFolderAskStore() {
  return create<FolderAskState>()((set) => {
    const answer = (projectId: string, next: FolderAnswer | null) =>
      set((state) => {
        const answers = { ...state.answers };
        if (next) answers[projectId] = next;
        else delete answers[projectId];
        return { answers };
      });
    return {
      answers: {},
      notNow: (projectId) => answer(projectId, { kind: "not-now" }),
      allowed: (projectId, folder) => answer(projectId, { kind: "allowed", folder }),
      needFolder: (projectId) => answer(projectId, null),
    };
  });
}

export const useFolderAskStore = createFolderAskStore();

export type FolderAskView = { kind: "ask" } | { kind: "allowed"; folder: string } | { kind: "none" };

/**
 * The ask shows in a project whose folder Desk made, while the person has given it no folder of
 * theirs and has not said Not now. Right after Allow, the success alert shows instead.
 */
export function folderAskView(input: {
  managed: boolean;
  folders: readonly string[] | null;
  answer: FolderAnswer | undefined;
}): FolderAskView {
  if (input.answer?.kind === "allowed") return { kind: "allowed", folder: input.answer.folder };
  if (!input.managed || !input.folders || input.folders.length > 0) return { kind: "none" };
  return input.answer?.kind === "not-now" ? { kind: "none" } : { kind: "ask" };
}

/**
 * Allow: the person picks a folder, and it joins the folders the project may use (the ones it
 * had stay). Returns the folder's name, or null when the person closed the picker.
 */
export async function allowProjectFolder(
  deps: {
    pick: () => Promise<string | null>;
    client: Pick<ProjectsClient, "listAuthorizedFolders" | "setAuthorizedFolders">;
  },
  projectId: string,
): Promise<string | null> {
  const picked = (await deps.pick())?.trim();
  if (!picked) return null;
  const { folders } = await deps.client.listAuthorizedFolders(projectId);
  const next = folders.includes(picked) ? folders : [...folders, picked];
  await deps.client.setAuthorizedFolders(projectId, next);
  return folderBaseName(picked);
}
