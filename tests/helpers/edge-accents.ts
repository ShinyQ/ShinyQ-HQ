import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static guard for the owner's rule (R5 P10, 2026-10-13): no colored left or top edge stripe anywhere.
 * Color, state and category are marked with a dot or icon chip next to the label plus a full-outline
 * glow; neutral structural rules (`--color-line`, `--color-line-2`, `--color-glass-border`) stay.
 * The runtime twin is `e2e/edge-audit.ts`.
 */

/** Accent colors that must never mark a single left or top edge (`ink` too: a white stripe is still a stripe). */
const ACCENT = "(?:cyan|violet|pink|green|amber|blue|white|indigo|ink|current)";
const SIDE_CLASS = /(?:^|[\s"'`:])(border-(?:l|t|s|bs)(?:-(?:[1-9]\d*|\[[^\]]+\]))?)(?![\w-])/;
const ACCENT_BORDER_CLASS = new RegExp(`(?:^|[\\s"'\`:])(border-${ACCENT}(?:\\/\\d+)?)(?![\\w-])`);
const ACCENT_BG_CLASS = new RegExp(`(?:^|[\\s"'\`:])bg-${ACCENT}(?:\\/\\d+)?(?![\\w-])|\\$\\{`);
const THIN_H = /(?:^|\s)(h-(?:px|0\.5|1)|h-\[[1-4]px\])(?![\w.-])/;
const THIN_W = /(?:^|\s)(w-(?:px|0\.5|1)|w-\[[1-4]px\])(?![\w.-])/;
const has = (text: string, token: string) => new RegExp(`(?:^|[\\s"'\`:])${token}(?![\\w-])`).test(text);
const NEUTRAL = /var\(--color-(?:line|line-2|glass-border)\)|^\s*(?:0|none|transparent|inherit|initial|unset)\s*$|255[ ,_]+255[ ,_]+255|\b0[ ,_]+0[ ,_]+0\b/;

export interface EdgeAccent {
  file: string;
  line: number;
  /** Stable id for the ratchet list: `file: kind: detail` (no line number, so edits elsewhere do not churn it). */
  id: string;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Class strings (string and template literals) that pair a left/top border with an accent color, or draw a thin edge bar. */
export function scanClassStrings(file: string, text: string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  const literals = [...text.matchAll(/`[^`]*`/g), ...text.matchAll(/"[^"\n]*"/g)];
  const seen = new Set<string>();
  for (const m of literals) {
    const s = m[0];
    const side = SIDE_CLASS.exec(s)?.[1];
    const color = ACCENT_BORDER_CLASS.exec(s)?.[1];
    let detail: string | null = null;
    if (side && color) detail = `class: ${side} + ${color}`;
    if (!detail && has(s, "absolute") && ACCENT_BG_CLASS.test(s)) {
      const top = has(s, "top-0") && (has(s, "inset-x-0") || (has(s, "left-0") && has(s, "right-0")));
      const left = (has(s, "left-0") || has(s, "right-0")) && (has(s, "inset-y-0") || (has(s, "top-0") && has(s, "bottom-0")));
      const h = THIN_H.exec(s)?.[1];
      const w = THIN_W.exec(s)?.[1];
      if (top && h) detail = `bar: top ${h}`;
      else if (left && w) detail = `bar: side ${w}`;
    }
    if (!detail) continue;
    const id = `${file}: ${detail}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ file, line: lineOf(text, m.index ?? 0), id });
  }
  return out;
}

/** Inline style objects: a thin absolutely positioned bar on the left, right or top edge, or a borderLeft/borderTop accent. */
export function scanInlineStyles(file: string, text: string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  for (const m of text.matchAll(/style=\{\{([^{}]*)\}\}/g)) {
    const props = new Map([...m[1].matchAll(/(\w+):\s*([^,]+?)\s*(?:,|$)/g)].map((p) => [p[1], p[2].trim()]));
    const zero = (k: string) => props.get(k) === "0";
    const thin = (k: string) => Number(props.get(k)) > 0 && Number(props.get(k)) <= 12;
    let detail: string | null = null;
    if (props.get("position") === '"absolute"') {
      if ((zero("left") || zero("right")) && zero("top") && zero("bottom") && thin("width")) detail = `style: side bar width ${props.get("width")}`;
      else if (zero("top") && zero("left") && zero("right") && thin("height")) detail = `style: top bar height ${props.get("height")}`;
    }
    for (const key of ["borderLeft", "borderTop", "borderInlineStart", "borderLeftColor", "borderTopColor"]) {
      const value = props.get(key);
      if (value && !NEUTRAL.test(value)) detail = `style: ${key}`;
    }
    if (detail) out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: ${detail}` });
  }
  return out;
}

/** CSS: left/top border declarations with a non-neutral color, thin ::before/::after edge bars, inset edge shadows. */
export function scanCss(file: string, text: string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  for (const m of text.matchAll(/border-(?:left|top|inline-start|block-start)(?:-color)?\s*:\s*([^;{}]+);/g)) {
    if (NEUTRAL.test(m[1]) || /^\s*[\d.]+px\s+solid\s+var\(--color-(?:line|line-2|glass-border)\)\s*$/.test(m[1])) continue;
    out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: css: ${m[0].replace(/\s+/g, " ").trim()}` });
  }
  for (const m of text.matchAll(/([^{}]*::?(?:before|after)[^{}]*)\{([^{}]*)\}/g)) {
    const body = m[2];
    const decl = (k: string) => new RegExp(`(?:^|[;\\s])${k}\\s*:\\s*([^;]+);`).exec(body)?.[1].trim();
    if (decl("position") !== "absolute") continue;
    const px = (k: string) => Number.parseFloat(decl(k) ?? "NaN");
    const isZero = (k: string) => decl(k) === "0" || decl(k) === "0px";
    const sideBar = (isZero("left") || isZero("right")) && isZero("top") && isZero("bottom") && px("width") <= 4;
    const topBar = isZero("top") && isZero("left") && isZero("right") && px("height") <= 4;
    if (sideBar || topBar) out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: css bar: ${m[1].trim()}` });
  }
  out.push(...scanShadows(file, text, /box-shadow\s*:\s*([^;]+);/g, (s) => s));
  return out;
}

function scanShadows(file: string, text: string, pattern: RegExp, normalize: (s: string) => string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  for (const m of text.matchAll(pattern)) {
    for (const part of normalize(m[1]).split(/,(?![^(]*\))/)) {
      if (!/\binset\b/.test(part)) continue;
      const rest = part.replace(/\binset\b/, "").trim();
      const nums = rest.match(/^(?:-?[\d.]+(?:px)?\s+){1,4}/)?.[0].trim().split(/\s+/).map((n) => Number.parseFloat(n)) ?? [];
      const [x = 0, y = 0, blur = 0] = nums;
      const color = rest.replace(/^(?:-?[\d.]+(?:px)?\s+){1,4}/, "");
      if ((x !== 0 || y !== 0) && blur <= 2 && !NEUTRAL.test(color)) out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: inset shadow: ${part.trim()}` });
    }
  }
  return out;
}

/** Tailwind arbitrary shadows (`shadow-[inset_2px_0_0_var(--color-cyan)]`) in class strings. */
export function scanClassShadows(file: string, text: string): EdgeAccent[] {
  return scanShadows(file, text, /shadow-\[([^\]]+)\]/g, (s) => s.replace(/_/g, " "));
}

export function scanFile(file: string, text: string): EdgeAccent[] {
  if (file.endsWith(".css")) return scanCss(file, text);
  return [...scanClassStrings(file, text), ...scanInlineStyles(file, text), ...scanClassShadows(file, text)];
}

/** Every edge accent in the `.ts`, `.tsx` and `.css` files under `root` (repo-relative POSIX paths), test files excluded. */
export function scanTree(repo: string, root = "src"): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(path.join(repo, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(path.join(repo, rel)).isDirectory()) walk(rel);
      else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(...scanFile(rel, readFileSync(path.join(repo, rel), "utf8")));
    }
  };
  walk(root);
  return out;
}
