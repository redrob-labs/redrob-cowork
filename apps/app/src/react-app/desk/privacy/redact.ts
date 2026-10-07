import type { PrivacyLevel } from "../services/types";

/**
 * Privacy protection, by patterns: before Send, private details in what the person typed are
 * swapped for placeholders such as [EMAIL_1]; the map back to the real values stays on this
 * computer, and the answer is shown with the real values put back. No model is involved, so
 * it catches what has a shape (an email, a phone number, an ID number) and the names the
 * person listed, not free-form private details.
 */

export type RedactCategory = "email" | "rrn" | "brn" | "card" | "phone" | "account" | "address" | "name";

/** Placeholder to the real value, per chat. */
export type PlaceholderMap = Record<string, string>;

export type PrivacySettings = { level: PrivacyLevel; names: readonly string[] };

const STANDARD: RedactCategory[] = ["email", "rrn", "card", "phone"];
const HIGH: RedactCategory[] = [...STANDARD, "account", "address", "brn"];
const STRICT: RedactCategory[] = [...HIGH, "name"];

export const LEVEL_CATEGORIES: Record<PrivacyLevel, readonly RedactCategory[]> = {
  off: [],
  standard: STANDARD,
  high: HIGH,
  strict: STRICT,
};

const LABEL: Record<RedactCategory, string> = {
  email: "EMAIL",
  rrn: "RRN",
  brn: "BRN",
  card: "CARD",
  phone: "PHONE",
  account: "ACCOUNT",
  address: "ADDRESS",
  name: "NAME",
};

const digits = (value: string) => value.replace(/\D/g, "");

/** 주민등록번호: a real birth date and a sex digit; without the hyphen, the checksum too. */
function validRrn(match: string): boolean {
  const value = digits(match);
  if (value.length !== 13) return false;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (!/[1-8]/.test(value[6] ?? "")) return false;
  // Numbers issued since October 2020 carry no checksum, so a hyphenated one is enough.
  if (/\d{6}-\d{7}/.test(match)) return true;
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(value[index]), 0);
  return (11 - (sum % 11)) % 10 === Number(value[12]);
}

/** 사업자등록번호: ten digits with their checksum. */
function validBrn(match: string): boolean {
  const value = digits(match);
  if (value.length !== 10) return false;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = weights.reduce((total, weight, index) => total + weight * Number(value[index]), 0);
  sum += Math.floor((Number(value[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

/** Card numbers: 13 to 19 digits that pass the Luhn check. */
function validCard(match: string): boolean {
  const value = digits(match);
  if (value.length < 13 || value.length > 19) return false;
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    let digit = Number(value[value.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

type Rule = { category: RedactCategory; pattern: RegExp; valid?: (match: string) => boolean; group?: number };

/** In order: the more specific shapes go first, so a phone pattern never takes an ID number. */
const RULES: Rule[] = [
  { category: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { category: "rrn", pattern: /(?<!\d)\d{6}-?\d{7}(?!\d)/g, valid: validRrn },
  { category: "brn", pattern: /(?<!\d)\d{3}-?\d{2}-?\d{5}(?!\d)/g, valid: validBrn },
  { category: "card", pattern: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g, valid: validCard },
  {
    category: "phone",
    pattern: /(?<![\w+])(?:\+82[\s-]?|0)(?:1[016789]|2|[3-6][1-5]|70)[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g,
  },
  { category: "phone", pattern: /\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,3}(?!\d)/g },
  { category: "phone", pattern: /\(\d{3}\)\s?\d{3}-\d{4}(?!\d)|(?<!\d)\d{3}-\d{3}-\d{4}(?!\d)/g },
  // A bank account: hyphenated groups with at least ten digits, or a long number after the word.
  { category: "account", pattern: /(?<!\d)\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,3})?(?!\d)/g, valid: (match) => digits(match).length >= 10 },
  { category: "account", pattern: /(?:계좌|account|acct)[^\d\n]{0,12}(\d{10,16})(?!\d)/gi, group: 1 },
  {
    category: "address",
    pattern: /(?:[가-힣]+(?:특별시|광역시|특별자치시|도|시)\s)?(?:[가-힣]+(?:시|군|구)\s)+[가-힣0-9]+(?:로|길)\s?\d+(?:-\d+)?/g,
  },
  {
    category: "address",
    pattern: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b\.?/g,
  },
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The names the person listed, longest first so a full name is taken before a part of it. */
function nameRule(names: readonly string[]): Rule | null {
  const listed = [...new Set(names.map((name) => name.trim()).filter((name) => name.length >= 2))].sort((a, b) => b.length - a.length);
  if (!listed.length) return null;
  return { category: "name", pattern: new RegExp(listed.map(escapeRegExp).join("|"), "g") };
}

const PLACEHOLDER = /\[(EMAIL|RRN|BRN|CARD|PHONE|ACCOUNT|ADDRESS|NAME)_(\d+)\]/g;

/** The placeholder for a value: the same one it had before in this chat, or the next free one. */
function placeholderFor(map: PlaceholderMap, category: RedactCategory, value: string): string {
  const existing = Object.entries(map).find(([, original]) => original === value);
  if (existing) return existing[0];
  const label = LABEL[category];
  let index = 1;
  while (map[`[${label}_${index}]`] !== undefined) index += 1;
  const placeholder = `[${label}_${index}]`;
  map[placeholder] = value;
  return placeholder;
}

export type Redaction = { text: string; map: PlaceholderMap; found: RedactCategory[] };

/** What the person typed, with each private detail the level covers swapped for its placeholder. */
export function redact(text: string, settings: PrivacySettings, previous: PlaceholderMap = {}): Redaction {
  const map: PlaceholderMap = { ...previous };
  const allowed = new Set(LEVEL_CATEGORIES[settings.level]);
  const names = allowed.has("name") ? nameRule(settings.names) : null;
  const rules = [...RULES.filter((rule) => allowed.has(rule.category)), ...(names ? [names] : [])];
  const found: RedactCategory[] = [];
  let next = text;
  for (const rule of rules) {
    next = next.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
      const captured = rule.group ? rest[rule.group - 1] : match;
      const value = typeof captured === "string" ? captured : match;
      if (rule.valid && !rule.valid(value)) return match;
      found.push(rule.category);
      return match.replace(value, placeholderFor(map, rule.category, value));
    });
  }
  return { text: next, map, found };
}

/** Puts the real values back. Placeholders this chat never made are left as they are. */
export function restore(text: string, map: PlaceholderMap): string {
  if (!text.includes("[")) return text;
  return text.replace(PLACEHOLDER, (placeholder) => map[placeholder] ?? placeholder);
}

/** The system line that keeps the placeholders intact through the answer. Model input, not copy. */
export const PLACEHOLDER_INSTRUCTION =
  "Some private details in this message were replaced with placeholders such as [EMAIL_1] or [NAME_1]. Keep every placeholder exactly as written, including the brackets, wherever you would use the detail. Do not guess what a placeholder stands for.";

/** Each category found once, in the order of the level's list. */
export function foundCategories(found: readonly RedactCategory[]): RedactCategory[] {
  return STRICT.filter((category) => found.includes(category));
}
