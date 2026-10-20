import type { Locale } from "@/content/locales";

/** The `}` that closes the `{` at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** One `{name, plural, one {# task} other {# tasks}}` argument (`=N` branches too), or null when it is not a plural. */
function plural(body: string, values: Record<string, string | number>, rules: Intl.PluralRules): string | null {
  const head = /^\s*(\w+)\s*,\s*plural\s*,/.exec(body);
  if (!head || !(head[1] in values)) return null;
  const n = Number(values[head[1]]);
  const branches = new Map<string, string>();
  let i = head[0].length;
  while (i < body.length) {
    const key = /^\s*(=\d+|\w+)\s*\{/.exec(body.slice(i));
    if (!key) break;
    const open = i + key[0].length - 1;
    const close = closing(body, open);
    if (close < 0) return null;
    branches.set(key[1], body.slice(open + 1, close));
    i = close + 1;
  }
  const branch = branches.get(`=${n}`) ?? branches.get(rules.select(n)) ?? branches.get("other");
  return branch === undefined ? null : branch.replace(/#/g, String(values[head[1]]));
}

/**
 * Fills a raw message (next-intl formatters cannot cross into a client component): `{name}` placeholders and ICU
 * plurals (`{count, plural, one {# session} other {# sessions}}`, the repository's convention for English counts).
 * Unknown placeholders stay as written.
 */
export function fill(template: string, values: Record<string, string | number>, locale: Locale = "en"): string {
  const rules = new Intl.PluralRules(locale === "id" ? "id-ID" : "en-US");
  let out = "";
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    const close = open < 0 ? -1 : closing(template, open);
    if (close < 0) return out + template.slice(i);
    out += template.slice(i, open);
    const body = template.slice(open + 1, close);
    const simple = /^(\w+)$/.exec(body);
    const branch = simple ? null : plural(body, values, rules);
    if (simple && simple[1] in values) out += String(values[simple[1]]);
    else if (branch !== null) out += fill(branch, values, locale);
    else out += template.slice(open, close + 1);
    i = close + 1;
  }
  return out;
}
