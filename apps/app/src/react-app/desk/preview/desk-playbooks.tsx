/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { useHref } from "react-router";
import { PlaybookRow, SectionMark } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { Playbook } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { PreviewPage, PreviewState } from "./preview-note";
import { previewIcon, previewKey, usePreviewServices } from "./preview";

/** The list of playbooks, each a link to its page. */
export function PlaybooksView(props: { playbooks: readonly Playbook[]; hrefFor: (id: string) => string }) {
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
                summary={playbook.summary}
                steps={playbook.steps.map((step) => ({ approval: Boolean(step.approval) }))}
                impact={[playbook.impact.figure, playbook.impact.label]}
                highImpact={playbook.highStakes}
                highImpactLabel={t("desk.preview_high_impact")}
                owner={playbook.owner}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** `/playbooks`. Sample playbooks until running them is connected. */
export function PlaybooksScreen() {
  const { services, scope } = usePreviewServices();
  const root = useHref("/").replace(/\/$/, "");
  const query = useQuery({ queryKey: previewKey(scope, "playbooks"), queryFn: () => services.playbooks.list(), staleTime: Infinity });
  const count = query.data?.data.length;
  return (
    <DeskShell
      current="playbooks"
      title={t("desk.nav_playbooks")}
      meta={count === undefined ? undefined : t("desk.preview_playbooks_meta", { count })}
    >
      <PreviewPage note={t("desk.preview_playbooks_note")}>
        <PreviewState query={query}>
          {(playbooks) => <PlaybooksView playbooks={playbooks} hrefFor={(id) => `${root}/playbook/${encodeURIComponent(id)}`} />}
        </PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
