import type { QueryClient } from "@tanstack/react-query";

import { t } from "../../../i18n";
import { previewKey, type PreviewPart } from "../preview/preview";
import type { DeskServices } from "../services/desk-services";

/** After a skill is added, saved or removed: every list that shows it, and the schedule dialog's. */
export function invalidateSkills(queryClient: Pick<QueryClient, "invalidateQueries">, scope: string) {
  const parts: PreviewPart[] = ["skills", "library", "team"];
  for (const part of parts) {
    void queryClient.invalidateQueries({ queryKey: previewKey(scope, part) });
  }
}

export type SkillActionDeps = {
  skills: Pick<DeskServices["skills"], "install" | "remove">;
  queryClient: Pick<QueryClient, "invalidateQueries">;
  scope: string;
  showToast: (title: string, text?: string, tone?: "danger") => void;
};

/** Adds a library skill. A toast either way; false when it failed. */
export async function installSkill(deps: SkillActionDeps, name: string): Promise<boolean> {
  try {
    const result = await deps.skills.install(name);
    invalidateSkills(deps.queryClient, deps.scope);
    deps.showToast(t("desk.skill_added", { name }), result.preview ? t("desk.preview_toast_text") : undefined);
    return true;
  } catch {
    deps.showToast(t("desk.skill_add_failed"), t("desk.settings_try_again"), "danger");
    return false;
  }
}

/** Removes the person's own skill or an added library skill. A toast either way; false when it failed. */
export async function removeSkill(deps: SkillActionDeps, name: string): Promise<boolean> {
  try {
    const result = await deps.skills.remove(name);
    invalidateSkills(deps.queryClient, deps.scope);
    deps.showToast(t("desk.skill_removed", { name }), result.preview ? t("desk.preview_toast_text") : undefined);
    return true;
  } catch {
    deps.showToast(t("desk.skill_remove_failed"), t("desk.settings_try_again"), "danger");
    return false;
  }
}
