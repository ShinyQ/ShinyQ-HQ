import { askLinkTarget, type AskLinkTarget } from "./links";

/**
 * The safe markdown subset of Ask answers (owner request 2026-10-16): paragraphs, bullet and
 * numbered lists, bold, italic, inline code and allowlisted links. A tiny parser to plain data; the
 * dock renders it as React elements and the server checks read `markdownToPlain`. HTML is never
 * interpreted, unclosed markers stay literal (a streaming answer), and heading lines become bold text.
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; target: AskLinkTarget; children: Inline[] }
  | { type: "br" };

export type Block = { type: "p"; children: Inline[] } | { type: "ul"; items: Inline[][] } | { type: "ol"; start: number; items: Inline[][] };

export interface MarkdownOptions {
  /** Origins that count as this site (absolute links to them become site paths). */
  origins?: readonly string[];
}

const BULLET = /^\s{0,3}[-*+\u2022]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const ESCAPABLE = /[\\`*_[\]()#+\-.!]/;
const MAX_DEPTH = 3;
const WORD = /[\p{L}\p{N}]/u;

const runLength = (s: string, at: number, c: string) => {
  let n = 0;
  while (s[at + n] === c) n++;
  return n;
};

/** Index of the marker that closes emphasis opened before `from`, or -1. */
function findClose(s: string, from: number, c: string, width: number): number {
  for (let j = from + 1; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "`") {
      const end = s.indexOf("`", j + 1);
      if (end > j) {
        j = end;
        continue;
      }
    }
    if (s[j] !== c) continue;
    const run = runLength(s, j, c);
    const before = s[j - 1];
    if (width === 2 && run >= 2 && !/\s/.test(before)) return j + run - 2;
    if (width === 1 && run === 1 && !/\s/.test(before) && (c !== "_" || !WORD.test(s[j + 1] ?? ""))) return j;
    j += run - 1;
  }
  return -1;
}

function matchLink(s: string, at: number): { label: string; url: string; end: number } | null {
  const close = s.indexOf("](", at + 1);
  if (close < 0) return null;
  const label = s.slice(at + 1, close);
  if (!label || /[\n[\]]/.test(label)) return null;
  let end = -1;
  let parens = 0;
  for (let j = close + 2; j < s.length; j++) {
    const ch = s[j];
    if (ch === undefined || /\s/.test(ch)) return null;
    if (ch === "(") parens++;
    else if (ch === ")") {
      if (parens === 0) {
        end = j;
        break;
      }
      parens--;
    }
  }
  if (end < 0) return null;
  const url = s.slice(close + 2, end);
  if (!url) return null;
  return { label, url, end };
}

export function parseInline(source: string, options: MarkdownOptions & { links?: boolean } = {}, depth = 0): Inline[] {
  const { links = true } = options;
  const out: Inline[] = [];
  let text = "";
  const push = (node: Inline) => {
    if (text) out.push({ type: "text", text });
    text = "";
    out.push(node);
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\" && ESCAPABLE.test(source[i + 1] ?? "")) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (c === "\n") {
      push({ type: "br" });
      i++;
      continue;
    }
    if (c === "`") {
      const end = source.indexOf("`", i + 1);
      if (end > i + 1 && !source.slice(i + 1, end).includes("\n")) {
        push({ type: "code", text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if ((c === "*" || c === "_") && depth < MAX_DEPTH) {
      const width = source[i + 1] === c ? 2 : 1;
      const open = i + width;
      const next = source[open] ?? "";
      const intraword = c === "_" && WORD.test(source[i - 1] ?? "");
      if (next && !/\s/.test(next) && !intraword) {
        const close = findClose(source, open - 1, c, width);
        if (close > open) {
          push({ type: width === 2 ? "strong" : "em", children: parseInline(source.slice(open, close), options, depth + 1) });
          i = close + width;
          continue;
        }
      }
      text += source.slice(i, open);
      i = open;
      continue;
    }
    if (c === "[" && links) {
      const link = matchLink(source, i);
      if (link) {
        const children = parseInline(link.label, { ...options, links: false }, depth + 1);
        const target = askLinkTarget(link.url, options.origins);
        if (target) push({ type: "link", target, children });
        else {
          if (text) out.push({ type: "text", text });
          text = "";
          out.push(...children);
        }
        i = link.end + 1;
        continue;
      }
    }
    text += c;
    i++;
  }
  if (text) out.push({ type: "text", text });
  return mergeText(out);
}

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const last = out.at(-1);
    if (node.type === "text" && last?.type === "text") last.text += node.text;
    else out.push(node);
  }
  return out;
}

export function parseMarkdown(source: string, options: MarkdownOptions = {}): Block[] {
  const blocks: Block[] = [];
  const state = { para: [] as string[], list: null as { type: "ul" | "ol"; start: number; items: string[] } | null };
  const inline = (s: string) => parseInline(s, options);
  const flushPara = () => {
    if (state.para.length) blocks.push({ type: "p", children: inline(state.para.join("\n")) });
    state.para = [];
  };
  const flushList = () => {
    const list = state.list;
    if (list) blocks.push(list.type === "ul" ? { type: "ul", items: list.items.map(inline) } : { type: "ol", start: list.start, items: list.items.map(inline) });
    state.list = null;
  };
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const heading = HEADING.exec(raw);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "p", children: [{ type: "strong", children: inline(heading[1]) }] });
      continue;
    }
    const bullet = BULLET.exec(raw);
    const ordered = bullet ? null : ORDERED.exec(raw);
    if (bullet || ordered) {
      const type = bullet ? "ul" : "ol";
      flushPara();
      if (state.list && state.list.type !== type) flushList();
      if (!state.list) state.list = { type, start: ordered ? Number(ordered[1]) : 1, items: [] };
      state.list.items.push(bullet ? bullet[1] : ordered![2]);
      continue;
    }
    if (state.list && /^\s/.test(raw)) {
      state.list.items[state.list.items.length - 1] += ` ${raw.trim()}`;
      continue;
    }
    flushList();
    state.para.push(raw.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

const plainInline = (nodes: Inline[]): string =>
  nodes.map((n) => (n.type === "text" || n.type === "code" ? n.text : n.type === "br" ? "\n" : plainInline(n.children))).join("");

/** The answer as plain text: marks dropped, links as their labels, list items one per line. */
export function markdownToPlain(source: string): string {
  return parseMarkdown(source)
    .map((b) => (b.type === "p" ? plainInline(b.children) : b.items.map(plainInline).join("\n")))
    .join("\n\n");
}
