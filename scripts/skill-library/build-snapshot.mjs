#!/usr/bin/env node
// Writes the copy of the Redrob Console's default skill library that redrob-server ships,
// apps/server/src/skill-library/snapshot.json. The server answers from the Console when it can
// and from this file when it cannot (offline, blocked, or the Console is down), so the Skills
// screen always has the library.
//
//   pnpm skill-library:snapshot                               # from the live Console
//   pnpm skill-library:snapshot --url <console api base>      # another Console
//   pnpm skill-library:snapshot --from /path/to/redrob-console # a local Console checkout
//   pnpm skill-library:snapshot --out <file>
//
// A checkout is read the way the Console builds its library: every
// apps/api/src/skills/library/<profession>/<task>/<name>/SKILL.md, with the taxonomy from
// apps/api/src/skills/taxonomy.ts and SKILL.md rendered by apps/api/src/skills/skill-format.ts
// (both import-free, so Node loads them as they are).

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};

const DEFAULT_URL = "https://console.redrob.ai/api/backend/v1";
const outFile = path.resolve(arg("--out") ?? path.join(repo, "apps/server/src/skill-library/snapshot.json"));
const from = arg("--from");

/** The fields of a library skill, in the Console's order, so the version hash matches its own. */
const pick = (skill) => ({
  name: skill.name,
  description: skill.description,
  body: skill.body,
  profession: skill.profession,
  task: skill.task,
  language: skill.language,
  family: skill.family,
  version: skill.version,
});

function findSkillFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findSkillFiles(full);
    return entry.name === "SKILL.md" ? [full] : [];
  });
}

async function fromCheckout(root) {
  const skillsDir = path.join(path.resolve(root), "apps/api/src/skills");
  const { SKILL_PROFESSIONS, SKILL_LANGUAGES, SKILL_LANGUAGE_IDS } = await import(pathToFileURL(path.join(skillsDir, "taxonomy.ts")).href);
  const { renderSkillMd } = await import(pathToFileURL(path.join(skillsDir, "skill-format.ts")).href);
  const YAML = createRequire(path.join(repo, "apps/server/package.json"))("yaml");

  const skills = findSkillFiles(path.join(skillsDir, "library")).map((file) => {
    const raw = readFileSync(file, "utf8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) throw new Error(`${file}: no frontmatter`);
    const { name, description, metadata } = YAML.parse(match[1]);
    if (typeof name !== "string" || typeof description !== "string" || !metadata) throw new Error(`${file}: incomplete frontmatter`);
    return pick({ name, description, body: match[2].trim(), ...metadata });
  });

  // The Console's order: profession, then task, as the taxonomy lists them; then family and language.
  const professionOrder = new Map(SKILL_PROFESSIONS.map((profession, index) => [profession.id, index]));
  const taskOrder = new Map(SKILL_PROFESSIONS.flatMap((profession) => profession.tasks.map((task, index) => [`${profession.id}/${task.id}`, index])));
  const languageOrder = new Map(SKILL_LANGUAGE_IDS.map((id, index) => [id, index]));
  skills.sort(
    (a, b) =>
      professionOrder.get(a.profession) - professionOrder.get(b.profession) ||
      taskOrder.get(`${a.profession}/${a.task}`) - taskOrder.get(`${b.profession}/${b.task}`) ||
      a.family.localeCompare(b.family) ||
      languageOrder.get(a.language) - languageOrder.get(b.language),
  );

  return {
    version: createHash("sha256").update(JSON.stringify(skills)).digest("hex").slice(0, 32),
    taxonomy: {
      professions: SKILL_PROFESSIONS.map((profession) => ({
        id: profession.id,
        label: { ...profession.label },
        tasks: profession.tasks.map((task) => ({ id: task.id, label: { ...task.label } })),
      })),
      languages: SKILL_LANGUAGES.map((language) => ({ id: language.id, label: { ...language.label } })),
    },
    skills: skills.map((skill) => ({ ...skill, content: renderSkillMd({ ...skill, source: "library" }) })),
  };
}

async function fromConsole(base) {
  const get = async (route) => {
    const response = await fetch(`${base}${route}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`GET ${base}${route}: ${response.status}`);
    return response.json();
  };
  const [list, taxonomy] = await Promise.all([get("/skill-library"), get("/skill-library/taxonomy")]);
  const skills = [];
  for (const summary of list.skills) {
    const detail = await get(`/skill-library/${encodeURIComponent(summary.name)}`);
    skills.push({ ...pick(detail), content: detail.content });
  }
  return { version: list.version, taxonomy, skills };
}

const snapshot = from
  ? await fromCheckout(from)
  : await fromConsole((arg("--url") ?? process.env.REDROB_CONSOLE_API_URL ?? DEFAULT_URL).replace(/\/+$/, ""));
if (!snapshot.skills.length) throw new Error("The library is empty; not writing a snapshot of nothing.");

writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${snapshot.skills.length} skills and ${snapshot.taxonomy.professions.length} professions to ${path.relative(repo, outFile)}`);
