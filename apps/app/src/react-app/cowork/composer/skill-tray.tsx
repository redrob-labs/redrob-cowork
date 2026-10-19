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
  if (!skills?.length) return text;
  const tokens = skills.map((name) => `[skill ${name}]`).join(" ");
  return text.trim() ? `${tokens} ${text}` : `${tokens} `;
}

/** `skills` with `name` added at the end, once. */
export function attachSkill(skills: readonly string[], name: string): string[] {
  return skills.includes(name) ? [...skills] : [...skills, name];
}

/** `skills` without `name`. */
export function detachSkill(skills: readonly string[], name: string): string[] {
  return skills.filter((entry) => entry !== name);
}

/** "kr-lawyer-nda" as "Kr lawyer nda": the fallback title for a skill the catalogue does not know. */
export function humanizeSkillName(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

/** Display titles for skill names, from the installed list and the catalogue, in the current language. */
export function useSkillTitles(): (name: string) => string {
  const { rows } = useMarketplaceRows();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  return useMemo(() => {
    const byName = new Map(rows?.map((row) => [row.name, row]));
    return (name: string) => {
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
  const titleOf = useSkillTitles();
  return (
    <ul className="cowork-skill-tray" aria-label={t("cowork.composer_tray_label")}>
      {skills.map((name) => {
        const title = titleOf(name);
        return (
          <li key={name} className="cowork-skill-tray__item" data-skill={name}>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <button
                    type="button"
                    className="cowork-skill-tray__chip"
                    aria-label={t("cowork.composer_tray_remove", { name: title })}
                    onClick={() => onRemove(name)}
                  >
                    <SkillIcon name={name} size="mini" />
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
