/** @jsxImportSource react */
import { useMemo, useState, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, EmptyState, MemoryList, SectionMark, Skeleton, Textarea, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { createCoworkServices } from "../services/real-services";
import type { MemoryNote, Project } from "../services/types";
import { memoryContext } from "../thread/memory-context";
import { useCoworkConnection } from "../shell/cowork-connection";
import { CoworkDialog } from "../shell/cowork-dialog";
import { CoworkShell } from "../shell/cowork-shell";
import { useFrameStore } from "../store/frame-store";
import {
  MEMORY_QUERY_KEY,
  canSaveEdit,
  forgetNote,
  invalidateNotes,
  memoryFilterFromParam,
  memoryMeta,
  memoryNotesKey,
  memoryScopes,
  memorySections,
  noteSource,
  saveNoteEdit,
  type MemoryActionDeps,
  type MemoryFilter,
} from "./memory";

export type MemoryViewProps = {
  filter: MemoryFilter;
  notes: readonly MemoryNote[];
  projects: readonly Project[];
  /** Chat titles by id, for where a note came from. */
  chatTitles: Readonly<Record<string, string>>;
  locale: string;
  preview: boolean;
  onEdit: (note: MemoryNote) => void;
  onForget: (note: MemoryNote) => void;
};

/** The scope picker and the notes in the chosen scope. */
export function MemoryView(props: MemoryViewProps) {
  const scopes = memoryScopes(props.notes, props.projects);
  // What a chat reading All my work leaves out: the oldest notes past the budget.
  const omitted = memoryContext([...props.notes], { memory: "all", projectId: null }).omitted;
  const sections = memorySections(props.notes, props.filter, props.projects);
  return (
    <div className="cowork-settings">
      <nav className="cowork-settings__nav" aria-label={t("cowork.memory_scopes_label")}>
        {scopes.map((scope) => (
          <Link
            key={scope.id}
            className="cowork-settings__link"
            to={scope.href}
            aria-current={scope.id === props.filter ? "page" : undefined}
          >
            <span>{scope.label}</span>
            <span className="cowork-memory__count">{scope.count}</span>
          </Link>
        ))}
      </nav>
      <div className="cowork-settings__main">
        {props.preview ? (
          <Alert tone="info" title={t("cowork.memory_preview_title")}>
            {t("cowork.memory_preview_text")}
          </Alert>
        ) : null}
        <p className="cowork-settings__lede">{t("cowork.memory_how")}</p>
        {omitted > 0 ? <p className="cowork-settings__note">{t("cowork.memory_omitted", { count: omitted })}</p> : null}
        {sections.length ? (
          sections.map((section) => (
            <section key={section.scope} className="cowork-settings__group">
              <SectionMark label={section.title} as="heading" level={2} trailing={section.notes.length} />
              <p className="cowork-settings__description">{section.lede}</p>
              <MemoryList
                items={section.notes.map((note) => ({
                  id: note.id,
                  text: note.text,
                  source: noteSource(note, note.chatId ? props.chatTitles[note.chatId] ?? null : null, props.locale),
                  locked: note.locked,
                  lockedLabel: t("cowork.memory_locked"),
                }))}
                editLabel={t("cowork.memory_edit")}
                forgetLabel={t("cowork.memory_forget")}
                onEdit={(_item, index) => {
                  const note = section.notes[index];
                  if (note) props.onEdit(note);
                }}
                onForget={(_item, index) => {
                  const note = section.notes[index];
                  if (note) props.onForget(note);
                }}
              />
            </section>
          ))
        ) : (
          <EmptyState
            icon={icons.bookOpen({ width: 20, height: 20, "aria-hidden": true })}
            title={t("cowork.memory_empty_title")}
            description={t("cowork.memory_empty_text")}
          />
        )}
      </div>
    </div>
  );
}

export type EditNoteDialogProps = {
  note: MemoryNote;
  text: string;
  busy: boolean;
  onTextChange: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function EditNoteDialog(props: EditNoteDialogProps) {
  return (
    <CoworkDialog
      open
      title={t("cowork.memory_edit_title")}
      onClose={props.onCancel}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>
            {t("cowork.memory_cancel")}
          </Button>
          <Button variant="primary" loading={props.busy} disabled={!canSaveEdit(props.note, props.text)} onClick={props.onSave}>
            {t("cowork.memory_save")}
          </Button>
        </>
      }
    >
      <Textarea
        id="cowork-memory-note"
        label={t("cowork.memory_note_label")}
        rows={4}
        value={props.text}
        onChange={(event) => props.onTextChange(event.target.value)}
      />
    </CoworkDialog>
  );
}

/** `/memory` and `/memory/:scope`: every note Redrob keeps, real where a server is connected. */
export function CoworkMemoryScreen() {
  const { scope: param } = useParams<{ scope?: string }>();
  const filter = memoryFilterFromParam(param);
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const services = useMemo(() => createCoworkServices({ client, workspaceId }), [client, workspaceId]);
  const scope = workspaceId ?? "preview";
  const notes = useQuery({ queryKey: memoryNotesKey(scope), queryFn: () => services.notes.list() });
  const projects = useQuery({
    queryKey: [MEMORY_QUERY_KEY, scope, "projects"],
    queryFn: async () => (await services.projects.list()).data,
    staleTime: 30_000,
  });
  const chats = useQuery({
    queryKey: [MEMORY_QUERY_KEY, scope, "chats"],
    queryFn: async () => (await services.chats.list()).data,
    staleTime: 30_000,
  });
  const [editing, setEditing] = useState<{ note: MemoryNote; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const deps: MemoryActionDeps = {
    notes: services.notes,
    invalidate: () => invalidateNotes(queryClient, scope),
    showToast,
  };
  const chatTitles = Object.fromEntries((chats.data ?? []).map((chat) => [chat.id, chat.title]));
  const result = notes.data;

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const saved = await saveNoteEdit(deps, editing.note, editing.text);
    setBusy(false);
    if (saved) setEditing(null);
  };

  return (
    <CoworkShell current="memory" title={t("cowork.nav_memory")} meta={result ? memoryMeta(result.data.length) : undefined}>
      {notes.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : !result ? (
        <EmptyState title={t("cowork.memory_error_title")} description={t("cowork.settings_try_again")} />
      ) : (
        <MemoryView
          filter={filter}
          notes={result.data}
          projects={projects.data ?? []}
          chatTitles={chatTitles}
          locale={locale}
          preview={result.preview}
          onEdit={(note) => setEditing({ note, text: note.text })}
          onForget={(note) => void forgetNote(deps, note)}
        />
      )}
      {editing ? (
        <EditNoteDialog
          note={editing.note}
          text={editing.text}
          busy={busy}
          onTextChange={(text) => setEditing({ ...editing, text })}
          onCancel={() => setEditing(null)}
          onSave={() => void save()}
        />
      ) : null}
    </CoworkShell>
  );
}
