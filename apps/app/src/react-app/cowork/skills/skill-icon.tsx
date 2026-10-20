/** @jsxImportSource react */
import { skillArt } from "./skill-art";
import { skillTone } from "./skills";

type SkillIconProps = {
  /** Stable skill id used to choose the same tone everywhere. */
  name: string;
  /** Visual size for marketplace tile, detail hero, compact row, `pick` (hero composer strip), `mini` (composer tray), or `fill` (sized by its parent, e.g. a workflow mosaic cell). */
  size: "tile" | "hero" | "row" | "pick" | "mini" | "fill";
};

/** Rendered CSS width per size, so the browser picks the right art file for the screen density. */
const ART_SIZES: Record<SkillIconProps["size"], string> = {
  tile: "72px",
  hero: "128px",
  row: "40px",
  pick: "28px",
  mini: "22px",
  fill: "96px",
};

/** Decorative marketplace artwork: the skill's cover art when it has one, else a tone-coded circle from its stable name. */
export function SkillIcon({ name, size }: SkillIconProps) {
  const art = skillArt(name);
  return (
    <span className="cowork-skill-icon" data-size={size} data-tone={skillTone(name)} data-art={art ? "" : undefined} aria-hidden="true">
      {art ? <img className="cowork-skill-icon__art" src={art.src} srcSet={art.srcSet} sizes={ART_SIZES[size]} alt="" draggable={false} decoding="async" /> : null}
    </span>
  );
}
