/** @jsxImportSource react */
import { useMemo, useSyncExternalStore } from "react";
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
import { usePending } from "./use-pending";

// The action buttons' glyph size; decorative, the button carries the label.
const ICON = { width: 14, height: 14, "aria-hidden": true };

/** How many featured skills the strip shows. */
export const SKILL_PICK_COUNT = 5;

/** The strip's skills: this language's popular list, in order, minus what is already attached. */
export function skillPicks(rows: readonly SkillRow[], locale: string, attached: readonly string[]): SkillRow[] {
  // Popular order first, then drop attached ones, then cap, so the next pick moves up.
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
  // The catalogue joined with what is installed, plus the services an install needs.
  const { services, scope, rows, preview } = useMarketplaceRows();
  // An install refreshes the skills queries through this client.
  const queryClient = useQueryClient();
  // An install that fails says so in the frame's toast.
  const showToast = useFrameStore((state) => state.showToast);
  // The popular list and the titles follow the app language.
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  // Skills installing right now, so their button spins and ignores a second press.
  const installing = usePending();
  // Recomputed only when the catalogue, the language or the tray changes.
  const picks = useMemo(() => (rows ? skillPicks(rows, locale, attached) : []), [rows, locale, attached]);
  // Sample data cannot install anything, so the strip only appears on a real workspace.
  if (preview !== false || picks.length === 0) return null;

  // Installs a library skill, then attaches it; a failed install attaches nothing.
  const add = (name: string) =>
    installing.run(name, async () => {
      // installSkill reports its own failure through the toast and resolves false.
      if (await installSkill({ skills: services.skills, queryClient, scope, showToast }, name)) onAttach(name);
    });

  return (
    <section className="cowork-skill-picks" aria-label={t("cowork.composer_picks_label")}>
      {/* Header: the strip's label on the left, All skills on the right edge. */}
      <div className="cowork-skill-picks__head">
        <h3 className="cowork-skill-picks__label">{t("cowork.composer_picks_label")}</h3>
        {/* Keeps the editor's focus on press, so the popup stays until the route changes. */}
        <Link className="cowork-skill-picks__all" to="/skills" onMouseDown={keepEditorFocus}>
          {t("cowork.composer_picks_all")}
          {icons.chevronRight({ width: 12, height: 12, "aria-hidden": true })}
        </Link>
      </div>
      {/* One row of picks; role restores list semantics that `list-style: none` drops in Safari. */}
      <ul className="cowork-skill-picks__row" role="list">
        {picks.map((row) => {
          // The title in the app language, falling back to the catalogue's own.
          const title = skillDisplayTitle(row, locale);
          // Installed skills are used (attached); library ones are added first.
          const installed = row.installed !== null;
          // True while this skill's install is in flight.
          const busy = installing.has(row.name);
          // The button's accessible name names the skill, since the glyph alone does not.
          const label = installed ? t("cowork.skills_use_label", { name: title }) : t("cowork.skill_add_label", { name: title });
          return (
            <li key={row.name} className="cowork-skill-picks__item" data-skill={row.name}>
              {/* The skill's tone-coded circle. */}
              <SkillIcon name={row.name} size="pick" />
              {/* Its title under the circle. */}
              <span className="cowork-skill-picks__title">{title}</span>
              {/* One icon button, its verb in a DS tooltip. */}
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <button
                      type="button"
                      className="cowork-skill-picks__action"
                      // Styles the button per verb: use (sparkle) or add (plus).
                      data-action={installed ? "use" : "add"}
                      aria-label={label}
                      // Announced as busy only while installing; absent otherwise.
                      aria-busy={busy || undefined}
                      disabled={busy}
                      // Keeps the editor's focus, so pressing does not close the popup.
                      onMouseDown={keepEditorFocus}
                      // Use attaches at once; Add installs, then attaches.
                      onClick={() => (installed ? onAttach(row.name) : add(row.name))}
                    >
                      {/* A spinner while installing, else the verb's glyph. */}
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
