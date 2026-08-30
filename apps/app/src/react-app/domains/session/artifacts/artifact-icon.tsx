/** @jsxImportSource react */
import { File, FileCode, FileImage, FileSpreadsheet, FileText, FileType, Globe, Presentation } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OpenTargetPreview } from "./open-target";

interface ArtifactIconProps {
  type: OpenTargetPreview;
  className?: string;
}

export function ArtifactIcon({ type, className }: ArtifactIconProps) {
  if (type === "browser") {
    return <Globe className={cn("size-3.5 shrink-0 text-spectrum-sky", className)} />;
  }

  if (type === "markdown") {
    return <FileText className={cn("size-3.5 shrink-0 text-spectrum-teal", className)} />;
  }

  if (type === "sheet") {
    return <FileSpreadsheet className={cn("size-3.5 shrink-0 text-spectrum-green", className)} />;
  }

  if (type === "slides") {
    return <Presentation className={cn("size-3.5 shrink-0 text-spectrum-yellow", className)} />;
  }

  if (type === "document") {
    return <FileText className={cn("size-3.5 shrink-0 text-spectrum-teal", className)} />;
  }

  if (type === "image") {
    return <FileImage className={cn("size-3.5 shrink-0 text-spectrum-violet", className)} />;
  }

  if (type === "pdf") {
    return <FileText className={cn("size-3.5 shrink-0 text-spectrum-red", className)} />;
  }

  if (type === "html") {
    return <FileCode className={cn("size-3.5 shrink-0 text-spectrum-orange", className)} />;
  }

  if (type === "text") {
    return <FileType className={cn("size-3.5 shrink-0 text-subtle-foreground", className)} />;
  }

  return <File className={cn("size-3.5 shrink-0 text-subtle-foreground", className)} />;
}
