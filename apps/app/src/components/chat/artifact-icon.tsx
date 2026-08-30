/** @jsxImportSource react */
import { File, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileType, FileVideo, Globe, Presentation } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ArtifactType } from "@/lib/artifacts";

interface ArtifactIconProps {
  className?: string;
  type: ArtifactType;
}

export function ArtifactIcon({ className, type }: ArtifactIconProps) {
  if (type === "website") {
    return <Globe className={cn("text-spectrum-sky", className)} />;
  }

  if (type === "markdown") {
    return <FileText className={cn("text-spectrum-teal", className)} />;
  }

  if (type === "sheet") {
    return <FileSpreadsheet className={cn("text-spectrum-green", className)} />;
  }

  if (type === "slides") {
    return <Presentation className={cn("text-spectrum-yellow", className)} />;
  }

  if (type === "document") {
    return <FileText className={cn("text-spectrum-teal", className)} />;
  }

  if (type === "image") {
    return <FileImage className={cn("text-spectrum-violet", className)} />;
  }

  if (type === "video") {
    return <FileVideo className={cn("text-spectrum-pink", className)} />;
  }

  if (type === "audio") {
    return <FileAudio className={cn("text-spectrum-lime", className)} />;
  }

  if (type === "pdf") {
    return <FileText className={cn("text-spectrum-red", className)} />;
  }

  if (type === "html") {
    return <FileCode className={cn("text-spectrum-orange", className)} />;
  }

  if (type === "text") {
    return <FileType className={cn("text-slate-9", className)} />;
  }

  return <File className={cn("text-slate-9", className)} />;
}
