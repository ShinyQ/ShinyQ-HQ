/**
 * The client sheet (docs/agents/performance.md, "Classic and client stylesheets"): what the full Tailwind sheet has and
 * the Classic sheet lacks, ordered so that loading it after the Classic sheet gives every element the cascade the full
 * sheet would. Pure; used by the Turbopack loader (./loader.mjs) and the unit tests.
 *
 * Both inputs are flat CSS (no nesting) from the same Tailwind setup: `full` scans every source, `classic` skips the
 * lazy-only files. A rule of `full` that `classic` also has is a Classic rule, any other rule is the client's own and is
 * kept. Utilities are order-sensitive, so a Classic rule is copied too when a kept rule earlier in the same cascade layer
 * writes a property of the same family at the same specificity: its copy then still comes after it, as in `full`.
 * Theme variables, `@property` and the `@layer properties` fallback keep only what the Classic sheet lacks.
 */
import postcss from "postcss";

/** The line of globals.css that skips the lazy-only sources (written by scripts/client-sheet.ts). */
export const LAZY_SOURCES_IMPORT = '@import "./lazy-sources.css";';

/** Properties that can override one another and are not split into atoms below: one family each. */
const GROUPS = [
  [/^(gap|row-gap|column-gap|grid-gap)$/, "gap"],
  [/^outline/, "outline"],
  [/^(place|align|justify)-/, "align"],
  [/^overflow/, "overflow"],
  [/^flex/, "flex"],
  [/^background/, "background"],
  [/^transition/, "transition"],
  [/^animation/, "animation"],
  [/^text-decoration/, "text-decoration"],
  [/^(white-space|text-wrap)/, "white-space"],
  [/^mask/, "mask"],
  [/^list-style/, "list-style"],
  [/^container/, "container"],
  [/^(columns|column-)/, "columns"],
  [/^border-image/, "border-image"],
  [/^(width|inline-size)$/, "width"],
  [/^(height|block-size)$/, "height"],
  [/^(min-width|min-inline-size)$/, "min-width"],
  [/^(min-height|min-block-size)$/, "min-height"],
  [/^(max-width|max-inline-size)$/, "max-width"],
  [/^(max-height|max-block-size)$/, "max-height"],
];
/** What the `font` shorthand resets; these longhands do not override one another. */
const FONT_LONGHAND = /^(font-[a-z-]+|line-height)$/;
const SIDES = ["top", "right", "bottom", "left"];
/** Logical sides in the site's only writing mode (horizontal, left to right). */
const LOGICAL = { "": SIDES, inline: ["left", "right"], block: ["top", "bottom"], "inline-start": ["left"], "inline-end": ["right"], "block-start": ["top"], "block-end": ["bottom"] };
const CORNERS = { "top-left": "top-left", "top-right": "top-right", "bottom-left": "bottom-left", "bottom-right": "bottom-right", "start-start": "top-left", "start-end": "top-right", "end-start": "bottom-left", "end-end": "bottom-right" };
const GRID = {
  grid: ["template-columns", "template-rows", "template-areas", "auto-columns", "auto-rows", "auto-flow"],
  "grid-template": ["template-columns", "template-rows", "template-areas"],
  "grid-area": ["row-start", "row-end", "column-start", "column-end"],
  "grid-row": ["row-start", "row-end"],
  "grid-column": ["column-start", "column-end"],
};

const unprefixed = (prop) => prop.replace(/^-(webkit|moz|ms)-/, "");
const sidesOf = (rest) => (SIDES.includes(rest) ? [rest] : LOGICAL[rest]);

/** The atoms a declaration of `prop` sets: two declarations can override each other when their atoms meet. */
export function atoms(prop) {
  if (prop.startsWith("--")) return [prop];
  const p = unprefixed(prop);
  for (const box of ["padding", "margin", "scroll-padding", "scroll-margin"]) {
    if (p !== box && !p.startsWith(`${box}-`)) continue;
    const sides = sidesOf(p.slice(box.length + 1));
    return sides ? sides.map((s) => `${box}-${s}`) : [box];
  }
  if (p === "inset" || p.startsWith("inset-")) return sidesOf(p.slice(6)) ?? SIDES;
  if (SIDES.includes(p)) return [p];
  const radius = p.match(/^border(?:-([a-z]+-[a-z]+))?-radius$/);
  if (radius) {
    const corner = radius[1] && CORNERS[radius[1]];
    return corner ? [`radius-${corner}`] : ["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => `radius-${c}`);
  }
  const border = p.match(/^border(?:-(top|right|bottom|left|inline-start|inline-end|block-start|block-end|inline|block))?(?:-(width|style|color))?$/);
  if (border) {
    const parts = border[2] ? [border[2]] : ["width", "style", "color"];
    const out = sidesOf(border[1] ?? "").flatMap((s) => parts.map((q) => `border-${s}-${q}`));
    return border[1] || border[2] ? out : [...out, "border-image"];
  }
  for (const [re, group] of GROUPS) if (re.test(p)) return [group];
  if (p.startsWith("grid-") || p === "grid") return (GRID[p] ?? [p.slice(5)]).map((g) => `grid-${g}`);
  return [p];
}

/** Atoms a declaration of `prop` can be overridden through, given the atoms written so far. */
function exposed(prop, written) {
  const p = unprefixed(prop);
  if (p === "font") return ["font", ...[...written.keys()].filter((a) => FONT_LONGHAND.test(a))];
  return FONT_LONGHAND.test(p) ? [p, "font"] : atoms(prop);
}

/** Index of the bracket closing the one at `open` (parentheses or square brackets; quotes and escapes skipped). */
function closing(s, open) {
  const pair = { "(": ")", "[": "]" };
  const stack = [pair[s[open]]];
  for (let i = open + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") i++;
    else if (ch === '"' || ch === "'") {
      const end = s.indexOf(ch, i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (ch === "(" || ch === "[") stack.push(pair[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** Splits at commas outside brackets; null when a bracket never closes. */
function topLevel(list) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "\\") i++;
    else if (ch === "(" || ch === "[") {
      i = closing(list, i);
      if (i < 0) return null;
    } else if (ch === ",") {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts;
}

/** Unreadable specificity: treated as equal to every other. */
export const ANY = -1;
const IDENT = /^(?:\\[0-9a-fA-F]{1,6} ?|\\.|[\w-])+/;
const LEGACY_ELEMENTS = /^(before|after|first-line|first-letter)$/;

/** Specificity of one complex selector as a * 1e6 + b * 1e3 + c, or ANY when it cannot be read (nesting, `of S`). */
export function specificity(selector) {
  let a = 0;
  let b = 0;
  let c = 0;
  const s = selector.trim();
  let compoundStart = true;
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (/[\s>+~]/.test(ch)) {
      compoundStart = true;
      i++;
    } else if (ch === "*") {
      compoundStart = false;
      i++;
    } else if (ch === "#" || ch === ".") {
      const m = s.slice(i + 1).match(IDENT);
      if (!m) return ANY;
      if (ch === "#") a++;
      else b++;
      i += 1 + m[0].length;
      compoundStart = false;
    } else if (ch === "[") {
      const end = closing(s, i);
      if (end < 0) return ANY;
      b++;
      i = end + 1;
      compoundStart = false;
    } else if (ch === ":") {
      const element = s[i + 1] === ":";
      const start = i + (element ? 2 : 1);
      const m = s.slice(start).match(IDENT);
      if (!m) return ANY;
      const name = m[0].toLowerCase();
      let next = start + m[0].length;
      let args = null;
      if (s[next] === "(") {
        const end = closing(s, next);
        if (end < 0) return ANY;
        args = s.slice(next + 1, end);
        next = end + 1;
      }
      if (element || (args === null && LEGACY_ELEMENTS.test(name))) c++;
      else if (name === "is" || name === "not" || name === "has" || name === "matches") {
        const parts = topLevel(args);
        if (!parts) return ANY;
        const inner = parts.map(specificity);
        if (inner.includes(ANY)) return ANY;
        const top = Math.max(...inner);
        a += Math.floor(top / 1e6);
        b += Math.floor((top % 1e6) / 1e3);
        c += top % 1e3;
      } else if (name !== "where") {
        if (args !== null && /\bof\b/.test(args)) return ANY;
        b++;
      }
      i = next;
      compoundStart = false;
    } else {
      const tag = compoundStart ? s.slice(i).match(/^-?[a-zA-Z][\w-]*/) : null;
      if (!tag) return ANY;
      c++;
      i += tag[0].length;
      compoundStart = false;
    }
  }
  return a * 1e6 + b * 1e3 + c;
}

/** Specificities of a selector list (ANY in it: unreadable). */
function weights(selector) {
  const parts = topLevel(selector);
  return parts ? parts.map(specificity) : [ANY];
}

const DEFINITIONS = /^(-webkit-)?keyframes$|^(property|font-face|counter-style|font-feature-values|page)$/;

/** The leaves of a sheet in document order (style rules, statements, definitions), each with its at-rule context. */
function leaves(css) {
  const out = [];
  const visit = (container, ctx) => {
    for (const node of container.nodes) {
      if (node.type === "rule") {
        const decls = [];
        for (const d of node.nodes) {
          if (d.type === "decl") decls.push([d.prop, d.value, Boolean(d.important)]);
          else if (d.type !== "comment") throw new Error(`client sheet: a ${d.type} nested in "${node.selector}" (expected flat CSS)`);
        }
        const layer = ctx.filter((c) => c.startsWith("@layer ")).join(" ") || "@layer";
        const at = `${ctx.join("|")}|${node.selector}`;
        out.push({ kind: "rule", ctx, layer, node, at, decls, key: `${at}{${decls.map((d) => d.join(":")).join(";")}}` });
      } else if (node.type === "atrule") {
        if (!node.nodes || DEFINITIONS.test(node.name)) out.push({ kind: node.nodes ? "definition" : "statement", ctx, node, key: `${ctx.join("|")}|${node.toString()}` });
        else visit(node, [...ctx, `@${node.name} ${node.params}`]);
      }
    }
  };
  visit(postcss.parse(css), []);
  return out;
}

/** Appends `node` to `root` inside the at-rule chain `ctx`, reusing the last open wrappers when they match. */
function appendIn(root, ctx, node) {
  let parent = root;
  for (const c of ctx) {
    const last = parent.last;
    if (last && last.type === "atrule" && `@${last.name} ${last.params}` === c) parent = last;
    else {
      const space = c.indexOf(" ");
      const wrapper = postcss.atRule({ name: c.slice(1, space), params: c.slice(space + 1) });
      parent.append(wrapper);
      parent = wrapper;
    }
  }
  parent.append(node);
}

/** The client sheet: `full` minus `classic`, plus the copies that keep the cascade of `full` (see the file comment). */
export function splitClientSheet(full, classic) {
  const classicLeaves = leaves(classic);
  const classicKeys = new Set(classicLeaves.map((l) => l.key));
  const classicDecls = new Map();
  for (const l of classicLeaves) {
    if (l.kind !== "rule") continue;
    const known = classicDecls.get(l.at) ?? new Set();
    for (const d of l.decls) known.add(d.join(":"));
    classicDecls.set(l.at, known);
  }

  /** Per cascade layer: atom to the specificities (and importance) that kept rules wrote. */
  const written = new Map();
  const tag = (spec, important) => `${spec}${important ? "!" : ""}`;
  const overridden = (layer, decls, specs) => {
    const layerAtoms = written.get(layer);
    if (!layerAtoms) return false;
    return decls.some(([prop, , important]) =>
      exposed(prop, layerAtoms).some((atom) => {
        const seen = layerAtoms.get(atom);
        if (!seen) return false;
        if (seen.has(tag(ANY, important))) return true;
        return specs.some((s) => (s === ANY ? [...seen].some((t) => t.endsWith("!") === important) : seen.has(tag(s, important))));
      }),
    );
  };
  const write = (layer, decls, specs) => {
    const layerAtoms = written.get(layer) ?? new Map();
    written.set(layer, layerAtoms);
    for (const [prop, , important] of decls) {
      const p = unprefixed(prop);
      for (const atom of p === "font" || FONT_LONGHAND.test(p) ? [p] : atoms(prop)) {
        const seen = layerAtoms.get(atom) ?? new Set();
        for (const s of specs) seen.add(tag(s, important));
        layerAtoms.set(atom, seen);
      }
    }
  };

  const root = postcss.root();
  for (const leaf of leaves(full)) {
    if (leaf.kind !== "rule") {
      // Layer statements keep the layer order whichever sheet a browser reads first.
      if (!classicKeys.has(leaf.key) || (leaf.kind === "statement" && leaf.node.name === "layer")) appendIn(root, leaf.ctx, leaf.node.clone());
      continue;
    }
    const specs = weights(leaf.node.selector);
    if (classicKeys.has(leaf.key)) {
      if (!overridden(leaf.layer, leaf.decls, specs)) continue;
      appendIn(root, leaf.ctx, leaf.node.clone());
      write(leaf.layer, leaf.decls, specs);
      continue;
    }
    // The same selector in the same place with more declarations (theme variables, the properties fallback):
    // only what the Classic sheet lacks.
    const known = classicDecls.get(leaf.at);
    const decls = known ? leaf.decls.filter((d) => !known.has(d.join(":"))) : leaf.decls;
    if (decls.length === 0) continue;
    const rule = leaf.node.clone();
    if (known) {
      rule.removeAll();
      for (const [prop, value, important] of decls) rule.append(postcss.decl({ prop, value, important: important || undefined }));
    }
    appendIn(root, leaf.ctx, rule);
    write(leaf.layer, decls, specs);
  }
  return root.toString();
}
