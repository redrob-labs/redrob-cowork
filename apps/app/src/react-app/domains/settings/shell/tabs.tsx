/** @jsxImportSource react */
import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type TabsSidebarProps = {
  children: React.ReactNode;
};

export function TabsSidebar(props: TabsSidebarProps) {
  return (
    <aside className={cn("space-y-6 md:sticky md:top-4 md:self-start")}>{props.children}</aside>
  );
}

type TabsGroupProps = {
  children: React.ReactNode;
};

export function TabsGroup(props: TabsGroupProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-sidebar p-3")}>
      {props.children}
    </div>
  );
}

type TabsGroupTitleProps = {
  children: React.ReactNode;
};

export function TabsGroupTitle(props: TabsGroupTitleProps) {
  return (
    // The design system's meta line: 12px medium in secondary ink, sentence
    // case and no tracking - "never uppercase and never a second typeface".
    <div className={cn("mb-2 px-2 text-xs font-medium text-muted-foreground")}>
      {props.children}
    </div>
  );
}

type TabsListProps = {
  children: React.ReactNode;
};

export function TabsList(props: TabsListProps) {
  return <div className={cn("space-y-1")}>{props.children}</div>;
}

type TabsTriggerProps = {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  beta?: boolean;
};

export function TabsTrigger(props: TabsTriggerProps) {
  return (
    <button
      type="button"
      aria-current={props.active ? "page" : undefined}
      className={cn(
        // A navigation row on the design system's control radius: sunken on
        // hover, and the brand-tinted selection with brand ink when current.
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-foreground",
        props.active && "bg-primary-soft text-primary-ink hover:bg-primary-soft hover:text-primary-ink",
      )}
      onClick={props.onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span>{props.children}</span>
        {props.beta ? (
          <Badge variant="warning">{t("common.beta")}</Badge>
        ) : null}
      </span>
    </button>
  );
}
