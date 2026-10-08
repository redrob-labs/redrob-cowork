// Reads every leaderboard the Model Guide cites into one snapshot. Each reader returns
// `{ entries: { <name as the board prints it>: { value, ci? } } }`; matching a name to one of our
// models happens later, in match.mjs, so a snapshot keeps what the board said rather than what we
// guessed it meant.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

const unescapeHtml = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
const text = (s) => unescapeHtml(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Next.js pages stream their data with escaped quotes; most boards are only readable unescaped. */
const unescapeFlight = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

/** The JSON array or object that starts at `start` (an index of `[` or `{`), parsed. */
function balanced(s, start) {
  const open = s[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i += 1;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON");
}

function rows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
}

/** arena.ai: every board page carries its snapshot as `"entries":[{modelDisplayName, rating, ...}]`. */
export async function arenaElo(path) {
  const s = unescapeFlight(await get(`https://arena.ai/leaderboard/${path}`));
  const at = s.indexOf('"entries":[{');
  if (at < 0) throw new Error(`arena ${path}: no entries`);
  const list = balanced(s, at + '"entries":'.length);
  const entries = {};
  for (const e of list) {
    if (!e.modelDisplayName || typeof e.rating !== "number") continue;
    entries[e.modelDisplayName] = {
      value: Math.round(e.rating),
      ci: Math.round((e.ratingUpper - e.ratingLower) / 2),
    };
  }
  return { entries };
}

/** arena.ai Agent Arena: a success rate per agent, `rows[].avgScore.value`, printed as a percentage. */
export async function arenaAgent() {
  const s = unescapeFlight(await get("https://arena.ai/leaderboard/agent"));
  const at = s.indexOf('"rows":[{"rank"');
  if (at < 0) throw new Error("arena agent: no rows");
  const list = balanced(s, at + '"rows":'.length);
  const entries = {};
  for (const r of list) {
    if (!r.model || !r.avgScore) continue;
    entries[r.model] = { value: round(100 * r.avgScore.value, 2), ci: round(100 * (r.avgScore.ci || 0), 2) };
  }
  return { entries };
}

/** Artificial Analysis leaderboard tables: rank, creator, name, Elo, "-a / +b", release. */
export async function aaEloTable(path) {
  const html = await get(`https://artificialanalysis.ai/evaluations/${path}`);
  const entries = {};
  for (const tr of rows(html)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    if (cells.length < 5 || !/^\d+$/.test(cells[0]) || !/^\d+(\.\d+)?$/.test(cells[3])) continue;
    const ci = cells[4].match(/-(\d+)\s*\/\s*\+(\d+)/);
    entries[cells[2]] = { value: Number(cells[3]), ci: ci ? (Number(ci[1]) + Number(ci[2])) / 2 : undefined };
  }
  if (!Object.keys(entries).length) throw new Error(`aa ${path}: no rows`);
  return { entries, html };
}

/** AA-Briefcase also embeds, for its headline models, the rubric pass rate by deliverable file type. */
export function briefcaseByFile(html) {
  const s = unescapeFlight(html);
  const out = {};
  for (const m of s.matchAll(/"rubricByFileType":\{/g)) {
    const byFile = balanced(s, m.index + '"rubricByFileType":'.length);
    const name = [...s.slice(Math.max(0, m.index - 6000), m.index).matchAll(/"shortName":"([^"]+)"/g)].pop();
    if (name) out[name[1]] = Object.fromEntries(Object.entries(byFile).map(([k, v]) => [k, round(100 * v, 2)]));
  }
  return out;
}

/** The AA models page: one record per model variant, with the index, Terminal-Bench, tau2, price and speed. */
export async function aaModels() {
  const s = unescapeFlight(await get("https://artificialanalysis.ai/leaderboards/models"));
  const out = {};
  for (const m of s.matchAll(/\{"slug":"[^"]+","name":"[^"]+","shortName":"([^"]+)"/g)) {
    let record;
    try {
      record = balanced(s, m.index);
    } catch {
      continue;
    }
    if (out[record.shortName]) continue;
    out[record.shortName] = {
      deprecated: !!record.deprecated,
      creator: record.modelCreatorName,
      index: num(record.intelligenceIndex, 1),
      terminalBench: record.terminalBench40 == null ? null : round(100 * record.terminalBench40, 1),
      tau2: record.tau2 == null ? null : round(100 * record.tau2, 1),
      costPerTask: num(record.intelligenceIndexCostPerTask, 4),
      tokensPerSecond: num(record.medianOutputTokensPerSecond, 1),
      priceIn: record.price1mInputTokens ?? null,
      priceOut: record.price1mOutputTokens ?? null,
    };
  }
  if (Object.keys(out).length < 50) throw new Error("aa models: too few records, page shape changed?");
  return out;
}

/** Vals AI benchmark pages render a plain table: rank, model link, accuracy %, cost, prices, duration. */
export async function vals(slug) {
  const html = await get(`https://www.vals.ai/benchmarks/${slug}`);
  const entries = {};
  for (const tr of rows(html)) {
    const name = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    const pct = tr.match(/<td[^>]*>\s*(-?\d+(?:\.\d+)?)%\s*<\/td>/);
    if (!name || !pct) continue;
    entries[text(name[1])] = { value: Number(pct[1]) };
  }
  if (!Object.keys(entries).length) throw new Error(`vals ${slug}: no rows`);
  return { entries };
}

function round(x, d) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
function num(x, d) {
  return typeof x === "number" ? round(x, d) : null;
}
