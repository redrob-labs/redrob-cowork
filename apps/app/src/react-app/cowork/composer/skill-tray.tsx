/** @jsxImportSource react */
import { useMemo, useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { SkillIcon } from "../skills/skill-icon";
import { skillDisplayTitle } from "../skills/skills";
import { useMarketplaceRows } from "../skills/use-marketplace";

/*
 * The composer's skill tray. Picking a skill (the hero's recommended strip, the / menu, the + menu)
 * no longer writes a `[skill name]` token into the text: it attaches the skill to the composer, shown
 * as a small icon in the panel's upper section, and nothing runs until the message is sent. At send
 * the attached skills are prepended as `[skill name]` tokens, which the existing send path already
 * turns into skill parts, so the engine contract is unchanged.
 */

/** The draft with each attached skill prepended as a `[skill name]` token; unchanged with none attached. */
export function withSkillTokens(text: string, skills: readonly string[] | undefined): string {
  // Nothing attached: the draft goes out exactly as typed.
  if (!skills?.length) return text;
  // One token per skill, in the order they were attached.
  const tokens = skills.map((name) => `[skill ${name}]`).join(" ");
  // A trailing space after skills alone, as the old inline token left it.
  return text.trim() ? `${tokens} ${text}` : `${tokens} `;
}

/** `skills` with `name` added at the end, once; the same array when it is already there. */
export function attachSkill(skills: readonly string[], name: string): readonly string[] {
  // Returning the same array lets React skip the re-render for a repeat pick.
  return skills.includes(name) ? skills : [...skills, name];
}

/** `skills` without `name`. */
export function detachSkill(skills: readonly string[], name: string): readonly string[] {
  // Order of the rest is kept.
  return skills.filter((entry) => entry !== name);
}

/** "kr-lawyer-nda" as "Kr lawyer nda": the fallback title for a skill the catalogue does not know. */
export function humanizeSkillName(name: string): string {
  // Hyphens and underscores both read as spaces.
  const words = name.replace(/[-_]+/g, " ").trim();
  // Sentence case; a name made only of separators keeps its raw form.
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

/** Display titles for skill names, from the installed list and the catalogue, in the current language. */
export function useSkillTitles(): (name: string) => string {
  // Installed and catalogue skills, one row per name.
  const { rows } = useMarketplaceRows();
  // Titles follow the app language.
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  return useMemo(() => {
    // Index once per catalogue or language change, not per lookup.
    const byName = new Map(rows?.map((row) => [row.name, row]));
    return (name: string) => {
      // A known skill gets its localized title; an unknown one a readable fallback.
      const row = byName.get(name);
      return row ? skillDisplayTitle(row, locale) : humanizeSkillName(name);
    };
  }, [rows, locale]);
}

type ComposerSkillTrayProps = {
  /** Attached skill names, in the order they were added. */
  skills: readonly string[];
  /** Detaches one skill. */
  onRemove: (name: string) => void;
};

/** The attached skills: small circles with the title on hover or focus, each removable. */
export function ComposerSkillTray(props: ComposerSkillTrayProps) {
  // Nothing attached, nothing rendered, and no catalogue query fired for an empty tray.
  return props.skills.length ? <SkillTrayList {...props} /> : null;
}

function SkillTrayList({ skills, onRemove }: ComposerSkillTrayProps) {
  // Name to title, for the tooltip and the remove button's label.
  const titleOf = useSkillTitles();
  return (
    <ul className="cowork-skill-tray" aria-label={t("cowork.composer_tray_label")}>
      {skills.map((name) => {
        // Resolved once per chip, used twice below.
        const title = titleOf(name);
        return (
          <li key={name} className="cowork-skill-tray__item" data-skill={name}>
            {/* The title shows in a DS tooltip on hover or focus. */}
            <Tooltip>
              <TooltipTrigger
                render={(
                  // The whole chip is the remove button; the × appears on hover.
                  <button
                    type="button"
                    className="cowork-skill-tray__chip"
                    aria-label={t("cowork.composer_tray_remove", { name: title })}
                    onClick={() => onRemove(name)}
                  >
                    {/* The skill's tone-coded circle at tray size. */}
                    <SkillIcon name={name} size="mini" />
                    {/* The × badge; decorative, the label above says what pressing does. */}
                    <span className="cowork-skill-tray__remove" aria-hidden="true">
                      <X width={10} height={10} strokeWidth={2.5} />
                    </span>
                  </button>
                )}
              />
              <TooltipContent>{title}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
