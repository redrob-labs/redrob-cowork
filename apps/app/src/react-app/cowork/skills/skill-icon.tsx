/** @jsxImportSource react */
import { useState } from "react";

import { skillTone } from "./skills";

type SkillIconProps = {
  /** Stable skill id used to choose the same tone everywhere. */
  name: string;
  /** Visual size for marketplace tile, detail hero, compact row, or `fill` (sized by its parent, e.g. a workflow mosaic cell). */
  size: "tile" | "hero" | "row" | "fill";
  /** Optional square artwork; a failed image falls back to the tone. */
  src?: string;
};

/** Decorative marketplace artwork with a reserved slot for future catalogue images. */
export function SkillIcon({ name, size, src }: SkillIconProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="cowork-skill-icon" data-size={size} data-tone={skillTone(name)} aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      ) : null}
    </span>
  );
}
