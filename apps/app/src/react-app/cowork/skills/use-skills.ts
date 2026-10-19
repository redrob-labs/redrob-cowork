import type { QueryClient } from "@tanstack/react-query";

import { t } from "../../../i18n";
import { previewKey, type PreviewPart } from "../preview/preview";
import type { CoworkServices } from "../services/cowork-services";

/** After a skill is added, saved or removed: every list that shows it, and the schedule dialog's. */
export function invalidateSkills(queryClient: Pick<QueryClient, "invalidateQueries">, scope: string) {
  const parts: PreviewPart[] = ["skills", "library", "team"];
  for (const part of parts) {
    void queryClient.invalidateQueries({ queryKey: previewKey(scope, part) });
  }
}

export type SkillActionDeps = {
  skills: Pick<CoworkServices["skills"], "install" | "remove">;
  queryClient: Pick<QueryClient, "invalidateQueries">;
  scope: string;
  showToast: (title: string, text?: string, tone?: "danger") => void;
};

/** Adds a library skill. A toast either way; false when it failed. */
export async function installSkill(deps: SkillActionDeps, name: string): Promise<boolean> {
  try {
    const result = await deps.skills.install(name);
    invalidateSkills(deps.queryClient, deps.scope);
    deps.showToast(t("cowork.skill_added", { name }), result.preview ? t("cowork.preview_toast_text") : undefined);
    return true;
  } catch {
    deps.showToast(t("cowork.skill_add_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  }
}

/** Removes the person's own skill or an added library skill. A toast either way; false when it failed. */
export async function removeSkill(deps: SkillActionDeps, name: string): Promise<boolean> {
  try {
    const result = await deps.skills.remove(name);
    invalidateSkills(deps.queryClient, deps.scope);
    deps.showToast(t("cowork.skill_removed", { name }), result.preview ? t("cowork.preview_toast_text") : undefined);
    return true;
  } catch {
    deps.showToast(t("cowork.skill_remove_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  }
}

/**
 * A workflow's "Add all". Adds each name in turn, carries on past a failure, refreshes the
 * lists once and says what happened in one toast. Returns how many were added.
 */
export async function installSkills(deps: SkillActionDeps, names: readonly string[]): Promise<{ added: number; failed: number }> {
  let added = 0;
  let failed = 0;
  for (const name of names) {
    try {
      await deps.skills.install(name);
      added += 1;
    } catch {
      failed += 1;
    }
  }
  invalidateSkills(deps.queryClient, deps.scope);
  if (failed === 0) deps.showToast(t("cowork.skills_workflow_added", { count: added }));
  else deps.showToast(t("cowork.skills_workflow_add_partial", { added, total: names.length }), t("cowork.settings_try_again"), "danger");
  return { added, failed };
}
