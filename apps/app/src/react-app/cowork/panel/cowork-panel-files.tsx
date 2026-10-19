/** @jsxImportSource react */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button, EmptyState, Skeleton, icons } from "@redrob-labs/ui";

import { openWorkspaceFile, revealWorkspaceFile } from "../../../app/lib/desktop";
import { prettyArtifactTitle } from "../../../lib/artifacts";
import { isElectronRuntime } from "../../../app/lib/runtime-env";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import type { OpenTarget } from "../../domains/session/artifacts/open-target";
import { ImagePreview, MarkdownPreview, PlainText } from "../../domains/session/artifacts/preview";
import { usePanelTabStore } from "../../domains/session/panel/panel-tab-store";
import { SAMPLE_NOW } from "../services/fixtures/sample-day";
import { createCoworkServices } from "../services/real-services";
import type { CoworkFile } from "../services/types";
import { useCoworkConnection, type CoworkFileClient } from "../shell/cowork-connection";
import { formatNavTime } from "../shell/nav";
import { useFrameStore } from "../store/frame-store";
import { fileIcon, filePreviewKind, filesThisWeek, findCoworkFile } from "./cowork-files";

const ROW_ICON = { width: 16, height: 16, "aria-hidden": true };
const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };
const EMPTY_TARGETS: OpenTarget[] = [];

/** Whether Open and Show in folder can work: on the desktop, for a real file in a local workspace. */
export type FileActions = "ready" | "web" | "sample";

export function fileActionsFor(input: { desktop: boolean; workspaceRoot: string | null; file: Pick<CoworkFile, "path"> }): FileActions {
  if (!input.file.path || !input.workspaceRoot) return input.desktop ? "sample" : "web";
  return input.desktop ? "ready" : "web";
}

function FileIcon(props: { file: Pick<CoworkFile, "icon" | "name"> }) {
  return <span className="cowork-file__icon">{icons[fileIcon(props.file)](ROW_ICON)}</span>;
}

export type CoworkFilesListProps = {
  files: readonly CoworkFile[];
  now: number;
  locale: string;
  onOpen: (id: string) => void;
};

/** What Cowork wrote this week, newest first: icon, name, project and when. Each row opens the file. */
export function CoworkFilesList(props: CoworkFilesListProps) {
  if (props.files.length === 0) {
    return (
      <EmptyState
        compact
        icon={icons.folderOpen({ width: 20, height: 20, "aria-hidden": true })}
        title={t("cowork.panel_files_empty_title")}
        description={t("cowork.panel_files_empty_text")}
      />
    );
  }
  return (
    <div className="cowork-files">
      <p className="cowork-files__lede">{t("cowork.files_lede")}</p>
      <ul className="cowork-files__list">
        {props.files.map((file) => (
          <li key={file.id}>
            <button type="button" className="cowork-file-row" onClick={() => props.onOpen(file.id)}>
              <FileIcon file={file} />
              <span className="cowork-file-row__text">
                <b>{file.name}</b>
                <span>{file.projectName}</span>
              </span>
              <span className="cowork-file-row__when">{formatNavTime(file.when, props.now, props.locale)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type CoworkFileViewProps = {
  file: CoworkFile;
  now: number;
  locale: string;
  /** The chat that wrote the file, when known. */
  chat: { id: string; title: string } | null;
  actions: FileActions;
  preview: ReactNode;
  onBack: () => void;
  onOpenInOffice: () => void;
  onShowInFolder: () => void;
};

/** One file: its name, its folder and when, a preview, the chat that wrote it, and Open and Show in folder. */
export function CoworkFileView(props: CoworkFileViewProps) {
  const { file } = props;
  const ready = props.actions === "ready";
  return (
    <div className="cowork-file">
      <button type="button" className="cowork-file__back" onClick={props.onBack}>
        {icons.arrowLeft(BUTTON_ICON)}
        {t("cowork.files_back")}
      </button>
      <div className="cowork-file__head">
        <FileIcon file={file} />
        <div>
          {/* The panel header uses the same humanized title as the in-chat card
              (prettyArtifactTitle), falling back to the raw filename when the path is empty. */}
          <b>{prettyArtifactTitle(file.path || file.name)}</b>
          <span>
            <span>{t("cowork.file_folder", { project: file.projectName })}</span>
            {file.when > 0 ? <span>{formatNavTime(file.when, props.now, props.locale)}</span> : null}
          </span>
        </div>
      </div>
      <div className="cowork-file__preview">{props.preview}</div>
      {props.chat ? (
        <p className="cowork-file__from">
          {t("cowork.file_from_chat")} <Link to={`/chat/${encodeURIComponent(props.chat.id)}`}>{props.chat.title}</Link>
        </p>
      ) : null}
      <div className="cowork-file__actions">
        <Button size="sm" variant="primary" iconLeft={icons.external(BUTTON_ICON)} disabled={!ready} onClick={props.onOpenInOffice}>
          {t("cowork.file_open_office")}
        </Button>
        <Button size="sm" variant="secondary" iconLeft={icons.folderOpen(BUTTON_ICON)} disabled={!ready} onClick={props.onShowInFolder}>
          {t("cowork.file_show_folder")}
        </Button>
      </div>
      {ready ? null : (
        <p className="cowork-file__note">{t(props.actions === "web" ? "cowork.file_actions_web" : "cowork.file_actions_sample")}</p>
      )}
    </div>
  );
}

type PreviewData = { kind: "text"; text: string } | { kind: "image"; data: ArrayBuffer; type: string | null } | { kind: "none" };

/**
 * The one query that reads a file for preview. The Files preview and the Artifacts list rows share
 * it, so they share one cache entry of one shape and opening a row costs no second read.
 */
export function filePreviewQuery(file: CoworkFile, client: CoworkFileClient | null, workspaceId: string | null) {
  const kind = filePreviewKind(file.name);
  return {
    queryKey: ["cowork-file-preview", workspaceId, file.id] as const,
    enabled: !file.body && Boolean(client && workspaceId && file.path) && kind !== "none",
    queryFn: async (): Promise<PreviewData> => {
      if (!client || !workspaceId || !file.path) return { kind: "none" };
      if (kind === "image") {
        const result = await client.downloadWorkspaceFile(workspaceId, file.path);
        return { kind: "image", data: result.data, type: result.contentType };
      }
      return { kind: "text", text: (await client.readWorkspaceFile(workspaceId, file.path)).content };
    },
    retry: false,
    staleTime: 30_000,
  };
}

/**
 * The file's preview, drawn by the artifact panel's previewers: a sample's own text, or the
 * file read from the workspace. Office files and spreadsheets say to open them in Office.
 */
export function CoworkFilePreview(props: { file: CoworkFile; client: CoworkFileClient | null; workspaceId: string | null }) {
  const { file, client, workspaceId } = props;
  const kind = filePreviewKind(file.name);
  const query = useQuery(filePreviewQuery(file, client, workspaceId));
  const image = query.data?.kind === "image" ? query.data : null;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([image.data], image.type ? { type: image.type } : {}));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  if (file.body) return <MarkdownPreview content={file.body} />;
  if (query.isLoading) return <Skeleton variant="text" lines={4} />;
  const data = query.data;
  if (data?.kind === "text") return kind === "markdown" ? <MarkdownPreview content={data.text} /> : <PlainText content={data.text} />;
  if (imageUrl) return <ImagePreview src={imageUrl} alt={file.name} />;
  return <p className="cowork-file__none">{t("cowork.file_no_preview")}</p>;
}

/**
 * The Files side of the panel: this week's files, or the one the frame store has open. Real
 * files where the chat route has published a server and workspace, sample files otherwise.
 * A file named in the open chat's answer opens here even when the list does not have it.
 */
export function CoworkPanelFiles(props: { chatId: string | null }) {
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const workspaceRoot = useCoworkConnection((state) => state.workspaceRoot);
  const fileId = useFrameStore((state) => state.panel.file);
  const openFile = useFrameStore((state) => state.openFile);
  const showToast = useFrameStore((state) => state.showToast);
  const targets = usePanelTabStore((state) => (props.chatId ? state.transcriptArtifactTargets[props.chatId] : undefined) ?? EMPTY_TARGETS);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const services = useMemo(() => createCoworkServices({ client, workspaceId }), [client, workspaceId]);
  const scope = workspaceId ?? "preview";

  const files = useQuery({
    queryKey: ["cowork-files", scope],
    queryFn: () => services.files.list(),
    staleTime: 30_000,
  });
  const projects = useQuery({
    queryKey: ["cowork-nav", scope, "projects"],
    queryFn: async () => (await services.projects.list()).data,
    staleTime: 30_000,
  });
  const now = files.data?.preview ? SAMPLE_NOW : Date.now();
  const all = files.data?.data ?? [];
  const projectName = projects.data?.find((project) => project.id === workspaceId)?.name ?? "";
  const file = fileId ? findCoworkFile(fileId, all, { targets, projectName, chatId: props.chatId }) : null;

  const chatTitle = useQuery({
    queryKey: ["cowork-file-chat", scope, file?.chatId],
    enabled: Boolean(file?.chatId && !file.fromChat),
    queryFn: async () => (file?.chatId ? (await services.chats.get(file.chatId)).data?.title ?? null : null),
    staleTime: 30_000,
  });

  if (files.isLoading) return <Skeleton variant="text" lines={5} />;
  if (!file) return <CoworkFilesList files={filesThisWeek(all, now)} now={now} locale={locale} onOpen={openFile} />;

  const title = file.fromChat ?? chatTitle.data;
  const path = file.path;
  const run = (action: (root: string, relativePath: string) => Promise<void>, failed: string) => {
    if (!workspaceRoot || !path) return;
    action(workspaceRoot, path).catch(() => showToast(failed));
  };
  return (
    <CoworkFileView
      file={file}
      now={now}
      locale={locale}
      chat={file.chatId && title ? { id: file.chatId, title } : null}
      actions={fileActionsFor({ desktop: isElectronRuntime(), workspaceRoot, file })}
      preview={<CoworkFilePreview file={file} client={client} workspaceId={workspaceId} />}
      onBack={() => openFile(null)}
      onOpenInOffice={() => run(openWorkspaceFile, t("cowork.file_open_failed"))}
      onShowInFolder={() => run(revealWorkspaceFile, t("cowork.file_reveal_failed"))}
    />
  );
}
