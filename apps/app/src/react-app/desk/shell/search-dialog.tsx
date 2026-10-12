/** @jsxImportSource react */
import { useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { createDeskServices } from "../services/real-services";
import type { Chat } from "../services/types";
import { DeskDialog } from "./desk-dialog";
import { useDeskConnection } from "./desk-connection";
import { chatPath } from "./desk-routes";

const RESULT_LIMIT = 8;

export type SearchResult = { id: string; label: string; meta?: string; path: string };

/** The places Search can jump to, before any chat. */
function places(): SearchResult[] {
  return [
    { id: "new-chat", label: t("desk.nav_new_chat"), path: chatPath() },
    { id: "projects", label: t("desk.nav_projects"), path: "/projects" },
    { id: "playbooks", label: t("desk.nav_playbooks"), path: "/playbooks" },
    { id: "scheduled", label: t("desk.nav_scheduled"), path: "/scheduled" },
    { id: "history", label: t("desk.nav_history"), path: "/history" },
    { id: "settings", label: t("titlebar.settings"), path: "/settings" },
  ];
}

/** What a query matches: places by name, then chats by title, newest first. */
export function searchResults(query: string, chats: readonly Chat[]): SearchResult[] {
  const q = query.trim().toLowerCase();
  const chatResults = [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chat) => ({
      id: `chat-${chat.id}`,
      label: chat.title.trim() || t("desk.untitled_chat"),
      meta: t("titlebar.search_chat"),
      path: chatPath(chat.id),
    }));
  const all = [...places(), ...chatResults];
  return (q ? all.filter((result) => result.label.toLowerCase().includes(q)) : all).slice(0, RESULT_LIMIT);
}

/**
 * Search from the title bar or Ctrl+K on Desk screens: places and chats by name. The developer and
 * settings screens keep their own command palette, which the title bar opens instead.
 */
export function SearchDialog(props: { onClose: () => void }) {
  const navigate = useNavigate();
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const chatsVersion = useDeskConnection((state) => state.chatsVersion);
  const services = useMemo(() => createDeskServices({ client, workspaceId }), [client, workspaceId]);
  const chats = useQuery({
    queryKey: ["desk-search", workspaceId ?? "preview", "chats", chatsVersion],
    // Sample chats would read as the person's own, so a preview lists none.
    queryFn: async () => {
      const result = await services.chats.list();
      return result.preview ? [] : result.data;
    },
    staleTime: 30_000,
  });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = searchResults(query, chats.data ?? []);

  const go = (result: SearchResult | undefined) => {
    if (!result) return;
    props.onClose();
    navigate(result.path);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (results.length ? (index + step + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  };

  return (
    <DeskDialog open title={t("titlebar.search")} onClose={props.onClose} width={520}>
      <div className="desk-search">
        <label className="desk-search__field">
          {icons.search({ width: 16, height: 16, "aria-hidden": true })}
          <input
            className="desk-search__input"
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls="desk-search-results"
            aria-activedescendant={results[active] ? `desk-search-${results[active].id}` : undefined}
            aria-label={t("titlebar.search_placeholder")}
            placeholder={t("titlebar.search_placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </label>
        <ul id="desk-search-results" role="listbox" className="desk-search__results" aria-label={t("titlebar.search")}>
          {results.map((result, index) => (
            <li
              key={result.id}
              id={`desk-search-${result.id}`}
              role="option"
              aria-selected={index === active}
              className="desk-search__result"
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                go(result);
              }}
            >
              <span>{result.label}</span>
              {result.meta ? <span className="desk-search__meta">{result.meta}</span> : null}
            </li>
          ))}
          {results.length === 0 ? <li className="desk-search__empty">{t("titlebar.search_empty")}</li> : null}
        </ul>
      </div>
    </DeskDialog>
  );
}
