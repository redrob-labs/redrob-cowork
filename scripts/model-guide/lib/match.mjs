// Boards print one model many ways: "claude-opus-5.5-high", "Claude Opus 5.5 (Max, Default
// Fallback)", "Claude Opus 5.5". Each name is reduced to a family ("claude opus 5 5") and an effort
// ("high"), and a model is matched on family alone, so a board that never ran our effort still counts
// with the effort it did run, printed beside the figure.

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "minimal", "default"]);

export function parseName(name) {
  const s = name
    .toLowerCase()
    .replace(/\b(?:with|default|opus [\d.]+) fallback\b/g, " ")
    .replace(/[()\-_.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = s.split(" ");
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && EFFORTS.has(last)) return { whole: s, family: tokens.slice(0, -1).join(" "), effort: last };
  return { whole: s, family: s, effort: null };
}

/**
 * The entry for `model` on a board: at its ranked effort when the board has it, otherwise its best
 * variant. A name equal to one of the model's names in full wins first, so "qwen3.8-max-0902" is never
 * read as Qwen3.8 at "max".
 */
export function findEntry(entries, model, higherIsBetter = true) {
  const names = [...(model.aliases || []), model.family];
  const hits = [];
  for (const [name, entry] of Object.entries(entries)) {
    const p = parseName(name);
    const exact = names.indexOf(p.whole);
    if (exact >= 0) {
      hits.push({ name, entry, effort: null, priority: exact });
      continue;
    }
    const fam = names.indexOf(p.family);
    if (fam >= 0 && p.effort) hits.push({ name, entry, effort: p.effort, priority: fam + names.length });
  }
  if (!hits.length) return null;
  // Priority is which of the model's names matched (an alias before the family), not whether the
  // effort was printed: "Muse Spark 1.3 Max" is the ranked effort of the same name as "Muse Spark 1.3".
  const tier = (h) => h.priority % names.length;
  const top = Math.min(...hits.map(tier));
  const pool = hits.filter((h) => tier(h) === top);
  const ranked = pool.find((h) => h.effort === model.effort);
  if (ranked) return { ...ranked, effort: null };
  // A name with no effort is a board that does not print one (Vals runs each model at its own setting).
  const bare = pool.find((h) => h.effort === null);
  if (bare) return bare;
  pool.sort((a, b) => (higherIsBetter ? b.entry.value - a.entry.value : a.entry.value - b.entry.value));
  return pool[0];
}
