import { icons, type IconName } from "@redrob-labs/ui";

import type { OpenTarget } from "../../domains/session/artifacts/open-target";
import type { DeskFile, DeskFileKind } from "../services/types";

/** Where redrob-server keeps the files Desk wrote, relative to the workspace (`listArtifacts`). */
export const DESK_OUTBOX = ".opencode/redrob/outbox";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The way a chat answer's open target spells a workspace path (see `open-target.ts`). */
function normalizeFilePath(path: string): string {
  return path
    .trim()
    .replace(/[\\]+/g, "/")
    .replace(/^\.\//, "")
    .replace(/^workspaces\/[^/]+\//i, "")
    .replace(/^workspace\/(?:ws_[^/]+|\d+|[0-9a-f-]{6,})\//i, "");
}

/**
 * One id for one file, wherever it comes from: a row in the Files list (a workspace-relative
 * path) or a file name clicked in a chat answer (an open target's `file:<path>` id). Both
 * resolve to `file:` and the lower-cased path, as the open target does.
 */
export function deskFileIdFor(pathOrTargetId: string): string {
  const path = pathOrTargetId.startsWith("file:") ? pathOrTargetId.slice("file:".length) : pathOrTargetId;
  return `file:${normalizeFilePath(path).toLowerCase()}`;
}

/** The name a person sees for a file: the last part of a path, never the path. */
export function displayFileName(pathOrName: string): string {
  const parts = pathOrName.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1]?.trim() ?? "";
}

/** The files Desk wrote in the seven days up to `now`, newest first. */
export function filesThisWeek(files: readonly DeskFile[], now: number): DeskFile[] {
  return files.filter((file) => file.when <= now && file.when > now - WEEK_MS).sort((a, b) => b.when - a.when);
}

const SHEET = /\.(xlsx|xls|xlsm|csv|tsv|ods)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const CODE = /\.(json|jsonc|ya?ml|toml|xml|html?|css|scss|js|jsx|ts|tsx|py|sh)$/i;

/** A file's icon from its name, for files the server lists without one. */
export function fileIconFor(name: string): IconName {
  if (SHEET.test(name)) return "fileSheet";
  if (IMAGE.test(name)) return "fileImage";
  if (/\.pdf$/i.test(name)) return "filePdf";
  if (/\.zip$/i.test(name)) return "fileZip";
  if (CODE.test(name)) return "fileCode";
  return "fileText";
}

export function fileKindFor(name: string): DeskFileKind {
  return SHEET.test(name) ? "sheet" : "file";
}

function isIconName(name: string): name is IconName {
  return Object.hasOwn(icons, name);
}

/** The icon to draw for a file: its own when the design system has it, else one from its name. */
export function fileIcon(file: Pick<DeskFile, "icon" | "name">): IconName {
  return isIconName(file.icon) ? file.icon : fileIconFor(file.name);
}

/** A file named in a chat answer, as the panel shows it when the Files list does not have it. */
export function fileFromTarget(target: OpenTarget, projectName: string, chatId: string | null): DeskFile {
  const name = displayFileName(target.name || target.value);
  return {
    id: deskFileIdFor(target.id),
    name,
    icon: fileIconFor(name),
    projectName,
    when: target.updatedAt ?? 0,
    fromChat: null,
    ...(chatId ? { chatId } : {}),
    kind: fileKindFor(name),
    path: target.value,
  };
}

/**
 * The file the panel was asked to open: a row of the list by its id, else a file of the open
 * chat by the same normalized id. Null when neither has it.
 */
export function findDeskFile(
  id: string,
  files: readonly DeskFile[],
  chat: { targets: readonly OpenTarget[]; projectName: string; chatId: string | null },
): DeskFile | null {
  const direct = files.find((file) => file.id === id);
  if (direct) return direct;
  if (!id.startsWith("file:")) return null;
  const wanted = deskFileIdFor(id);
  const listed = files.find((file) => file.path !== undefined && deskFileIdFor(file.path) === wanted);
  if (listed) return listed;
  const target = chat.targets.find((entry) => entry.kind === "file" && deskFileIdFor(entry.id) === wanted);
  return target ? fileFromTarget(target, chat.projectName, chat.chatId) : null;
}

export type FilePreviewKind = "markdown" | "text" | "image" | "none";

/** How the panel previews a file, by its name. Office files and spreadsheets open in Office. */
export function filePreviewKind(name: string): FilePreviewKind {
  if (/\.(md|markdown|mdx)$/i.test(name)) return "markdown";
  if (IMAGE.test(name)) return "image";
  if (/\.(txt|csv|tsv|log)$/i.test(name) || CODE.test(name)) return "text";
  return "none";
}
