import type { RedrobCommandItem } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import type { Playbook, PlaybookStep } from "../services/types";

/*
 * A playbook is a workspace command (`.opencode/commands/<name>.md`): a saved, named prompt
 * the engine already knows, that travels with the workspace export. The Desk reads it this
 * way:
 *
 *   # Weekly client update          <- the name people see (optional)
 *   1. Read where things stand      <- the steps, a list at the top (optional)
 *   2. Draft the update (ask first) <- "(ask first)" marks a step that stops for a person
 *
 *   Everything else is the prompt.
 *
 * The whole template is what Run sends, so the steps are part of what the AI reads.
 */

const ASK_FIRST = /\s*\((ask first|먼저 묻기)\)\s*$/i;

/** "weekly-client-update" as "Weekly client update", for a command saved without a title. */
export function humanizeName(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

/** The title and the steps a template starts with. */
export function parseTemplate(template: string): { title: string | null; steps: PlaybookStep[] } {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length && !lines[index]?.trim()) index += 1;
  const heading = lines[index]?.match(/^#\s+(.+)$/);
  const title = heading?.[1]?.trim() ?? null;
  if (heading) index += 1;
  while (index < lines.length && !lines[index]?.trim()) index += 1;
  const steps: PlaybookStep[] = [];
  for (; index < lines.length; index += 1) {
    const item = lines[index]?.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/);
    if (!item?.[1]) break;
    const text = item[1].trim();
    const approval = ASK_FIRST.test(text);
    steps.push({ label: text.replace(ASK_FIRST, ""), ...(approval ? { approval: t("desk.playbook_asks_first") } : {}) });
  }
  return { title, steps };
}

/** A command as a playbook. Fields a command does not carry are left empty and not shown. */
export function playbookFromCommand(command: Pick<RedrobCommandItem, "name" | "description" | "template" | "scope">): Playbook {
  const { title, steps } = parseTemplate(command.template);
  const description = command.description?.trim() ?? "";
  return {
    id: command.name,
    name: title ?? humanizeName(command.name),
    icon: "repeat",
    profession: "",
    highStakes: steps.some((step) => Boolean(step.approval)),
    purpose: description,
    summary: description,
    gets: "",
    needs: "",
    impact: { figure: "", label: "" },
    stake: "",
    sources: [],
    steps,
    owner: "",
    runCount: 0,
    lastRunAt: 0,
    team: command.scope === "workspace",
    cadence: "",
    prompt: command.template,
  };
}

/**
 * A playbook's file name. The server takes Latin letters, digits, _ and - only, so a name in
 * Korean gets a generated one; the title on top is what people see either way.
 */
export function playbookSlug(name: string, now = Date.now()): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || `playbook-${now.toString(36)}`;
}

/** What is saved for a playbook: the title on top, the steps, then the prompt. */
export function playbookTemplate(input: { name: string; steps: string[]; prompt: string }): string {
  const steps = input.steps.map((step) => step.trim()).filter(Boolean);
  return [
    `# ${input.name.trim()}`,
    steps.length ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n") : null,
    input.prompt.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
