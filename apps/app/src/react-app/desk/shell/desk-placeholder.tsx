/** @jsxImportSource react */
import { EmptyState } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { DeskShell } from "./desk-shell";
import type { DeskNavId } from "./nav";

/** Screens routed now whose content comes in a later task. */
export type DeskPlaceholderScreen =
  | "playbooks"
  | "playbook"
  | "run"
  | "scheduled"
  | "history"
  | "guide"
  | "connectors"
  | "privacy"
  | "memory";

function placeholderTitle(screen: DeskPlaceholderScreen): string {
  switch (screen) {
    case "playbooks":
      return t("desk.nav_playbooks");
    case "playbook":
      return t("desk.screen_playbook");
    case "run":
      return t("desk.screen_run");
    case "scheduled":
      return t("desk.nav_scheduled");
    case "history":
      return t("desk.nav_history");
    case "guide":
      return t("desk.nav_guide");
    case "connectors":
      return t("desk.nav_connectors");
    case "privacy":
      return t("desk.nav_privacy");
    case "memory":
      return t("desk.nav_memory");
  }
}

/** The menu place a screen belongs to: one playbook and a run sit under Playbooks. */
function placeholderPlace(screen: DeskPlaceholderScreen): DeskNavId {
  switch (screen) {
    case "playbook":
    case "run":
      return "playbooks";
    default:
      return screen;
  }
}

/** A routed screen that is not built yet, inside the shell so the menu still leads everywhere. */
export function DeskPlaceholder(props: { screen: DeskPlaceholderScreen }) {
  const title = placeholderTitle(props.screen);
  return (
    <DeskShell current={placeholderPlace(props.screen)} title={title}>
      <EmptyState title={title} description={t("desk.placeholder_body")} />
    </DeskShell>
  );
}
