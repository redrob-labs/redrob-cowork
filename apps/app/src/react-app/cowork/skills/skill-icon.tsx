/** @jsxImportSource react */
import { skillTone } from "./skills";

type SkillIconProps = {
  /** Stable skill id used to choose the same tone everywhere. */
  name: string;
  /** Visual size for marketplace tile, detail hero, compact row, or `fill` (sized by its parent, e.g. a workflow mosaic cell). */
  size: "tile" | "hero" | "row" | "fill";
};

/** Decorative marketplace artwork: a tone-coded circle chosen from the skill's stable name. */
export function SkillIcon({ name, size }: SkillIconProps) {
  return <span className="cowork-skill-icon" data-size={size} data-tone={skillTone(name)} aria-hidden="true" />;
}
