/** @jsxImportSource react */
import { useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { icons } from "@redrob-labs/ui";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { useFrameStore } from "../store/frame-store";
import { SkillIcon } from "../skills/skill-icon";
import { skillDisplayTitle, type SkillRow } from "../skills/skills";
import { popularRows, useMarketplaceRows } from "../skills/use-marketplace";
import { installSkill } from "../skills/use-skills";

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** How many featured skills the strip shows. */
export const SKILL_PICK_COUNT = 5;

/** The strip's skills: this language's popular list, in order, minus what is already attached. */
export function skillPicks(rows: readonly SkillRow[], locale: string, attached: readonly string[]): SkillRow[] {
  return popularRows(rows, locale).filter((row) => !attached.includes(row.name)).slice(0, SKILL_PICK_COUNT);
}

/** Every control in the popup keeps the editor's focus (and so the popup) through a press. */
const keepEditorFocus = (event: { preventDefault: () => void }) => event.preventDefault();

type ComposerSkillPicksProps = {
  /** Skills already in the composer's tray; they leave the strip. */
  attached: readonly string[];
  /** Puts a skill in the composer's tray. Never runs it. */
  onAttach: (name: string) => void;
};

/**
 * The new-chat composer's featured skills: a horizontal popup under the panel, shown while the
 * text box is focused and still empty. Each pick is a small circle, its title and one small icon
 * button (name in a DS tooltip). Add (plus) installs a library skill and then attaches it; Use
 * (sparkle, the Skills nav glyph: "use this skill") attaches an installed one. Neither
 * runs it. "All skills" on the header's right edge opens the Skills page.
 */
export function ComposerSkillPicks({ attached, onAttach }: ComposerSkillPicksProps) {
  const { services, scope, rows, preview } = useMarketplaceRows();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const picks = useMemo(() => (rows ? skillPicks(rows, locale, attached) : []), [rows, locale, attached]);
  // Sample data cannot install anything, so the strip only appears on a real workspace.
  if (preview !== false || picks.length === 0) return null;

  const add = (name: string) => {
    if (pending.has(name)) return;
    setPending((current) => new Set(current).add(name));
    void installSkill({ skills: services.skills, queryClient, scope, showToast }, name)
      .then((ok) => {
        if (ok) onAttach(name);
      })
      .finally(() =>
        setPending((current) => {
          const next = new Set(current);
          next.delete(name);
          return next;
        }),
      );
  };

  return (
    <section className="cowork-skill-picks" aria-label={t("cowork.composer_picks_label")}>
      <div className="cowork-skill-picks__head">
        <h3 className="cowork-skill-picks__label">{t("cowork.composer_picks_label")}</h3>
        <Link className="cowork-skill-picks__all" to="/skills" onMouseDown={keepEditorFocus}>
          {t("cowork.composer_picks_all")}
          {icons.chevronRight({ width: 12, height: 12, "aria-hidden": true })}
        </Link>
      </div>
      <ul className="cowork-skill-picks__row" role="list">
        {picks.map((row) => {
          const title = skillDisplayTitle(row, locale);
          const installed = row.installed !== null;
          const busy = pending.has(row.name);
          const label = installed ? t("cowork.skills_use_label", { name: title }) : t("cowork.skill_add_label", { name: title });
          return (
            <li key={row.name} className="cowork-skill-picks__item" data-skill={row.name}>
              <SkillIcon name={row.name} size="pick" />
              <span className="cowork-skill-picks__title">{title}</span>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <button
                      type="button"
                      className="cowork-skill-picks__action"
                      data-action={installed ? "use" : "add"}
                      aria-label={label}
                      aria-busy={busy || undefined}
                      disabled={busy}
                      onMouseDown={keepEditorFocus}
                      onClick={() => (installed ? onAttach(row.name) : add(row.name))}
                    >
                      {busy ? (
                        <span className="cowork-skill-picks__spin">{icons.refresh(ICON)}</span>
                      ) : installed ? (
                        icons.sparkle(ICON)
                      ) : (
                        icons.plus(ICON)
                      )}
                    </button>
                  )}
                />
                {/* Below the button, so the bubble never covers the skill's title above it. */}
                <TooltipContent side="bottom">{installed ? t("cowork.skills_use") : t("cowork.skill_add")}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
