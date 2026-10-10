/**
 * Input PII scrubber (T10). Runs before the model call and before any logging, so AI Gateway logs
 * and Analytics Engine events only ever hold the scrubbed question.
 */

const RULES: { tag: string; pattern: RegExp }[] = [
  { tag: "[email]", pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu },
  { tag: "[url]", pattern: /\bhttps?:\/\/\S+|\bwww\.\S+/gi },
  // Indonesian NIK / KK (16 digits) and NPWP (15 digits, often dotted: 12.345.678.9-012.345).
  { tag: "[id-number]", pattern: /\b\d{2}\.?\d{3}\.?\d{3}\.?\d-?\d{3}\.?\d{3}\b|\b\d{15,16}\b/g },
  // Phones: +62 / 62 / 08 Indonesian numbers and generic international numbers with 9+ digits.
  { tag: "[phone]", pattern: /(?:\+|\b)(?:62|0)8\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,5}\b|\+\d{1,3}[\s.-]?\(?\d{2,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g },
  // Card numbers: 13 to 19 digits, optionally grouped by spaces or dashes.
  { tag: "[card]", pattern: /\b(?:\d[ -]?){12,18}\d\b/g },
  // Long digit runs (account numbers and the like).
  { tag: "[number]", pattern: /\b\d{10,}\b/g },
];

export function scrubPII(text: string): string {
  return RULES.reduce((out, { tag, pattern }) => out.replace(pattern, tag), text);
}

/** True when scrubbing changed the text (the UI warns "don't share personal information"). */
export function hasPII(text: string): boolean {
  return scrubPII(text) !== text;
}
