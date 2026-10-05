/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { useHref } from "react-router";
import { Button, EmptyState, PlaybookRow, SectionMark, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { Playbook } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import { PreviewPage, PreviewState } from "./preview-note";
import { previewIcon, previewKey, usePreviewServices } from "./preview";

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** The list of playbooks, each a link to its page. */
export function PlaybooksView(props: { playbooks: readonly Playbook[]; hrefFor: (id: string) => string }) {
  if (!props.playbooks.length) {
    return <EmptyState title={t("desk.playbooks_empty_title")} description={t("desk.playbooks_empty_text")} />;
  }
  return (
    <>
      <p className="desk-settings__lede">{t("desk.preview_playbooks_lede")}</p>
      <section className="desk-settings__group">
        <SectionMark label={t("desk.preview_playbooks_team")} as="heading" level={2} trailing={props.playbooks.length} />
        <ul className="desk-preview__list">
          {props.playbooks.map((playbook) => (
            <li key={playbook.id}>
              <PlaybookRow
                href={props.hrefFor(playbook.id)}
                icon={previewIcon(playbook.icon)}
                name={playbook.name}
                summary={playbook.summary || undefined}
                steps={playbook.steps.map((step) => ({ approval: Boolean(step.approval) }))}
                impact={playbook.impact.figure ? [playbook.impact.figure, playbook.impact.label] : undefined}
                highImpact={playbook.highStakes}
                highImpactLabel={t("desk.preview_high_impact")}
                owner={playbook.owner || undefined}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** `/playbooks`: the workspace's playbooks, real where a server is connected. */
export function PlaybooksScreen() {
  const { services, scope } = usePreviewServices();
  const openModal = useFrameStore((state) => state.openModal);
  const root = useHref("/").replace(/\/$/, "");
  const query = useQuery({ queryKey: previewKey(scope, "playbooks"), queryFn: () => services.playbooks.list(), staleTime: 30_000 });
  const count = query.data?.data.length;
  const preview = query.data?.preview ?? true;
  return (
    <DeskShell
      current="playbooks"
      title={t("desk.nav_playbooks")}
      meta={count === undefined ? undefined : t("desk.preview_playbooks_meta", { count })}
      actions={
        preview ? null : (
          <Button size="sm" variant="secondary" iconLeft={icons.plus(ICON)} onClick={() => openModal({ kind: "playbook" })}>
            {t("desk.playbook_new")}
          </Button>
        )
      }
    >
      <PreviewPage note={t("desk.preview_playbooks_note")} preview={preview}>
        <PreviewState query={query}>
          {(playbooks) => <PlaybooksView playbooks={playbooks} hrefFor={(id) => `${root}/playbook/${encodeURIComponent(id)}`} />}
        </PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
