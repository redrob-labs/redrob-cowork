/** @jsxImportSource react */
// SPDX-FileCopyrightText: 2026-present Janghoon Lee (Redrob) and contributors
// SPDX-License-Identifier: MIT
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { create } from "zustand";

import type { RedrobServerClient } from "@/app/lib/redrob-server";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePlatform } from "@/react-app/kernel/platform";
import { t } from "@/i18n";

/**
 * "Share to Redrob Chat": the renderer names what to share; the local server reads it, presents
 * the Redrob Key to Redrob Chat, and hands back only the link (apps/server/src/redrob-chat-share.ts).
 */

export type RedrobChatShareVisibility = "public" | "unlisted" | "private";

export type RedrobChatShareRequest =
  | { kind: "transcript"; workspaceId: string; sessionId: string; title?: string }
  | { kind: "artifact"; workspaceId: string; path: string; title?: string };

/** Lets menus that hold no server client (the sidebar) open the one dialog the session page mounts. */
export const useRedrobChatShareStore = create<{
  request: RedrobChatShareRequest | null;
  open: (request: RedrobChatShareRequest) => void;
  close: () => void;
}>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

const VISIBILITIES: RedrobChatShareVisibility[] = ["unlisted", "public", "private"];

function visibilityLabel(option: RedrobChatShareVisibility): { title: string; hint: string } {
  if (option === "public") {
    return { title: t("redrob_chat_share.visibility_public"), hint: t("redrob_chat_share.visibility_public_hint") };
  }
  if (option === "private") {
    return { title: t("redrob_chat_share.visibility_private"), hint: t("redrob_chat_share.visibility_private_hint") };
  }
  return { title: t("redrob_chat_share.visibility_unlisted"), hint: t("redrob_chat_share.visibility_unlisted_hint") };
}

export type RedrobChatShareDialogProps = {
  client: RedrobServerClient | null;
  request: RedrobChatShareRequest | null;
  onClose: () => void;
};

export function RedrobChatShareDialog({ client, request, onClose }: RedrobChatShareDialogProps) {
  const platform = usePlatform();
  const [visibility, setVisibility] = useState<RedrobChatShareVisibility>("unlisted");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setVisibility("unlisted");
    setBusy(false);
    setUrl(null);
    setError(null);
    setCopied(false);
  }, [request]);

  const createLink = async () => {
    if (!client || !request || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = request.kind === "transcript"
        ? await client.shareToRedrobChat(request.workspaceId, {
            kind: "transcript",
            sessionId: request.sessionId,
            visibility,
            title: request.title,
          })
        : await client.shareToRedrobChat(request.workspaceId, {
            kind: "artifact",
            path: request.path,
            visibility,
            title: request.title,
          });
      setUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("redrob_chat_share.failed"));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("redrob_chat_share.copy_failed"));
    }
  };

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("redrob_chat_share.title")}</DialogTitle>
          <DialogDescription>
            {request?.kind === "artifact" ? t("redrob_chat_share.description_artifact") : t("redrob_chat_share.description_transcript")}
          </DialogDescription>
        </DialogHeader>

        {url ? (
          <Field>
            <FieldLabel htmlFor="redrob-chat-share-url">{t("redrob_chat_share.link_label")}</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="redrob-chat-share-url"
                type="text"
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button type="button" variant="outline" size="icon-sm" onClick={() => void copyLink()} aria-label={t("common.copy")}>
                {copied ? <Check /> : <Copy />}
              </Button>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => platform.openLink(url)} aria-label={t("redrob_chat_share.open")}>
                <ExternalLink />
              </Button>
            </div>
          </Field>
        ) : (
          <RadioGroup
            className="w-full gap-2"
            value={visibility}
            onValueChange={(value) => {
              if (value === "public" || value === "unlisted" || value === "private") setVisibility(value);
            }}
          >
            {VISIBILITIES.map((option) => (
              <FieldLabel key={option} htmlFor={`redrob-chat-share-${option}`}>
                <Field orientation="horizontal" size="sm">
                  <RadioGroupItem value={option} id={`redrob-chat-share-${option}`} disabled={busy} />
                  <FieldContent>
                    <FieldTitle>{visibilityLabel(option).title}</FieldTitle>
                    <FieldDescription>{visibilityLabel(option).hint}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        )}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <DialogFooter>
          <DialogClose disabled={busy} render={<Button variant="outline" type="button" disabled={busy} />}>
            {url ? t("common.close") : t("common.cancel")}
          </DialogClose>
          {url ? null : (
            <Button type="button" disabled={busy || !client} onClick={() => void createLink()}>
              {busy ? t("redrob_chat_share.creating") : t("redrob_chat_share.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
