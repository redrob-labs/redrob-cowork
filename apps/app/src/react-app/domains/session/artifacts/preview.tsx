/** @jsxImportSource react */
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { MarkdownBlock } from "../surface/markdown";
import { t } from "@/i18n";

interface PreviewLoadingProps extends React.ComponentProps<"div"> {}

export function PreviewLoading({ className, ...props }: PreviewLoadingProps) {
  return (
    <div className={cn("flex h-full items-center justify-center text-muted-foreground", className)} {...props}>
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

interface PreviewErrorProps extends React.ComponentProps<"div"> {
  message: string;
}

export function PreviewError({ message, className, ...props }: PreviewErrorProps) {
  return <div className={cn("p-4 text-sm text-muted-foreground", className)} {...props}>{message}</div>;
}

interface PlainTextProps extends React.ComponentProps<"pre"> {
  content: string;
}

export function PlainText({ content, className, ...props }: PlainTextProps) {
  return <pre className={cn("h-full overflow-auto p-4 text-xs leading-5 text-foreground whitespace-pre-wrap", className)} {...props}>{content}</pre>;
}

interface MarkdownPreviewProps extends React.ComponentProps<"div"> {
  content: string;
}

export function MarkdownPreview({ content, className, ...props }: MarkdownPreviewProps) {
  return (
    <div data-redrob-markdown-preview="" className={cn("h-full overflow-auto p-4", className)} {...props}>
      <MarkdownBlock text={content} />
    </div>
  );
}

type ArtifactPreviewMessage =
  | { method: "redrob/artifact-preview/ready" }
  | { method: "redrob/artifact-preview/blocked"; count: number };

/** A message from the preview sandbox, or null for anything else. */
export function readArtifactPreviewMessage(data: unknown): ArtifactPreviewMessage | null {
  if (!data || typeof data !== "object" || !("method" in data)) return null;
  if (data.method === "redrob/artifact-preview/ready") return { method: data.method };
  if (data.method !== "redrob/artifact-preview/blocked" || !("params" in data)) return null;
  const params = data.params;
  if (!params || typeof params !== "object" || !("count" in params)) return null;
  const count = params.count;
  return typeof count === "number" && Number.isInteger(count) && count > 0 ? { method: data.method, count } : null;
}

interface HTMLPreviewProps {
  title: string;
  content: string;
  /** The server-hosted sandbox document. Never on the app's own origin. */
  sandbox: { url: string; expectedOrigin: string };
  /** The page's own folder on the sandbox origin, for a page that is a file. Relative references resolve there. */
  basePath?: string | null;
  className?: string;
}

/**
 * A model-written page, rendered on the server's sandbox origin under a deny-by-default policy (see
 * apps/server/src/artifact-preview-sandbox.ts). The page reaches no network; when it tried to, the
 * notice says so rather than leaving it looking broken.
 */
export function HTMLPreview({ title, content, sandbox, basePath, className }: HTMLPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(0);

  useEffect(() => {
    setReady(false);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== sandbox.expectedOrigin) return;
      const message = readArtifactPreviewMessage(event.data);
      if (message?.method === "redrob/artifact-preview/ready") setReady(true);
      if (message?.method === "redrob/artifact-preview/blocked") setBlocked(message.count);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sandbox.url, sandbox.expectedOrigin]);

  useEffect(() => {
    if (!ready) return;
    setBlocked(0);
    frameRef.current?.contentWindow?.postMessage(
      { method: "redrob/artifact-preview/render", params: { html: content, ...(basePath ? { base: basePath } : {}) } },
      sandbox.expectedOrigin,
    );
  }, [ready, content, basePath, sandbox.expectedOrigin]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {blocked > 0 ? (
        <div role="status" className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          {t("artifact.preview_blocked_resources", { count: blocked })}
        </div>
      ) : null}
      <iframe
        key={sandbox.url}
        ref={frameRef}
        src={sandbox.url}
        title={title}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}

interface PdfPreviewProps {
  url: string;
  title: string;
  className?: string;
}

export function PdfPreview({ url, title, className }: PdfPreviewProps) {
  // Chromium's built-in PDF viewer (enabled via webPreferences.plugins) renders
  // reliably through <embed>; <object>/sandboxed <iframe> show a blank frame.
  // The blob URL comes from a trusted workspace file.
  return <embed src={url} type="application/pdf" title={title} className={cn("h-full w-full border-0", className)} />;
}

interface ImagePreviewProps extends React.ComponentProps<"div"> {
  src: string;
  alt: string;
}

export function ImagePreview({ src, alt, className, ...props }: ImagePreviewProps) {
  return (
    <div className={cn("flex h-full items-center justify-center overflow-auto bg-muted/30 p-3", className)} {...props}>
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

interface PreviewUnavailableProps extends React.ComponentProps<"div"> {}

export function PreviewUnavailable({ className, ...props }: PreviewUnavailableProps) {
  return <div className={cn("p-4 text-sm text-muted-foreground", className)} {...props}>{t("artifact.preview_unavailable")}</div>;
}
