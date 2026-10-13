/**
 * Pure helpers for the in-world (troika) font cuts: which characters 3D text can render and which
 * unicode sets each cut keeps. Shared by scripts/troika-fonts.ts and tests/content/troika-fonts.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every text cut keeps these: ASCII, Latin-1, a few Latin Extended letters, typographic punctuation, up and down arrows.
 * Latin-1 skips the soft hyphen (U+00AD): the @fontsource Inter latin cuts do not map it.
 */
export const LATIN_RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], [0xa0, 0xac], [0xae, 0xff], [0x131, 0x131], [0x152, 0x153], [0x2013, 0x2013], [0x2018, 0x201a], [0x201c, 0x201e],
  [0x2022, 0x2022], [0x2026, 0x2026], [0x2032, 0x2033], [0x2039, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122],
  [0x2191, 0x2191], [0x2193, 0x2193], [0x2212, 0x2212],
];

/** The symbols fallback always keeps these (arrows and the tier mark shapes), used or not. */
export const SYMBOL_BASE: readonly number[] = [0x20, 0xa0, 0x2190, 0x2192, 0x25b2, 0x25b6, 0x25b8, 0x25bc, 0x25c6, 0x25c7];

/** GSUB features troika 0.52 applies (troika-three-text.esm.js `supportedFeatures`) plus GPOS kerning. */
export const LAYOUT_FEATURES = ["kern", "liga", "rlig", "ccmp", "mset", "isol", "init", "fina", "medi", "half", "pres", "blws"] as const;

export const inLatin = (cp: number) => LATIN_RANGES.some(([a, b]) => cp >= a && cp <= b);

export function latinCodePoints(): number[] {
  return LATIN_RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
}

export function symbolCodePoints(used: Iterable<number>): number[] {
  return [...new Set([...SYMBOL_BASE, ...[...used].filter((cp) => !inLatin(cp))])].sort((a, b) => a - b);
}

export function toUnicodes(cps: readonly number[]): string {
  return cps.map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`).join(",");
}

function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

/**
 * Every printable code point in-world text can show, with the first file that uses it: content and
 * messages in both locales and the 3D source (dev prototypes excluded), `\uXXXX` and `\u{...}` escapes decoded.
 */
export function inWorldCodePoints(root = process.cwd()): Map<number, string> {
  const sources = [
    ...walk(path.join(root, "content"), [".json"]),
    ...walk(path.join(root, "messages"), [".json"]),
    ...walk(path.join(root, "src", "experience"), [".ts", ".tsx"]).filter((f) => !f.includes(`${path.sep}prototype${path.sep}`)),
  ];
  const found = new Map<number, string>();
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    const add = (cp: number) => {
      if (cp >= 0x20 && cp !== 0x7f && !found.has(cp)) found.set(cp, path.relative(root, file));
    };
    for (const char of text) add(char.codePointAt(0)!);
    for (const m of text.matchAll(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})/g)) add(parseInt(m[1] ?? m[2], 16));
  }
  return found;
}
