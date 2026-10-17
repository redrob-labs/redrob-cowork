/** @jsxImportSource react */
import type { ReactNode } from "react";
import { Alert, EmptyState, Skeleton } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { CoworkResult } from "../services/types";

/** Says plainly that the screen shows sample data and that its buttons do no real work. */
export function PreviewNote(props: { children: string }) {
  return (
    <Alert tone="info" title={t("cowork.preview_title")}>
      {props.children}
    </Alert>
  );
}

/** A screen's column: the sample-data note first while the data is sample data, then the screen. */
export function PreviewPage(props: { note: string; wide?: boolean; preview?: boolean; children: ReactNode }) {
  return (
    <div className={props.wide ? "cowork-settings__main cowork-preview--wide" : "cowork-settings__main"}>
      {props.preview === false ? null : <PreviewNote>{props.note}</PreviewNote>}
      {props.children}
    </div>
  );
}

/** Loading, a load that failed, or the data. */
export function PreviewState<T>(props: {
  query: { isLoading: boolean; data?: CoworkResult<T> };
  children: (data: T) => ReactNode;
}) {
  if (props.query.isLoading) return <Skeleton variant="text" lines={5} />;
  if (!props.query.data) return <EmptyState title={t("cowork.preview_error_title")} description={t("cowork.settings_try_again")} />;
  return <>{props.children(props.query.data.data)}</>;
}
