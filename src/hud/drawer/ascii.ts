import type { RoomArchitecture, RoomView } from "@/content/room-views/types";

/**
 * Terminal ("README") view of a room for the Glass Drawer easter egg (appendix 02 section 8).
 * Pure string rendering: no React, no DOM. Box drawing characters are all one column wide.
 */

export interface ReadmeLabels {
  overview: string;
  architecture: string;
  results: string;
  stack: string;
  links: string;
}

export interface AsciiArchitectureOptions {
  /** Maximum line width in columns. Defaults to 72. */
  maxWidth?: number;
}

const DEFAULT_WIDTH = 72;
const GAP = 5;
/** Border plus one space of padding on each side. */
const BOX_CHROME = 4;
const MIN_TEXT = 3;
const BOX_LINES = 4;
const LABEL_LINE = 1;
const EM_DASH = /\u2014/g;

type ArchNode = RoomArchitecture["nodes"][number];

function chars(text: string): string[] {
  return Array.from(text);
}

function len(text: string): number {
  return chars(text).length;
}

function clean(text: string): string {
  return text.replace(EM_DASH, "-").replace(/\s+/g, " ").trim();
}

function fit(text: string, width: number): string {
  const c = chars(text);
  if (c.length <= width) return text + " ".repeat(width - c.length);
  if (width <= 3) return c.slice(0, width).join("");
  return c.slice(0, width - 3).join("") + "...";
}

function trimLines(lines: string[]): string[] {
  return lines.map((line) => line.replace(/\s+$/, ""));
}

function boxLines(node: ArchNode, text: number): string[] {
  const bar = "─".repeat(text + 2);
  return [
    `┌${bar}┐`,
    `│ ${fit(clean(node.label), text)} │`,
    `│ ${fit(`[${node.kind}]`, text)} │`,
    `└${bar}┘`,
  ];
}

/** Word wrap to `width` columns. Words longer than the width are split hard. */
export function wrap(text: string, width: number): string[] {
  const w = Math.max(1, Math.floor(width));
  const words = clean(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    let rest = word;
    while (len(rest) > w) {
      if (line) {
        lines.push(line);
        line = "";
      }
      const c = chars(rest);
      lines.push(c.slice(0, w).join(""));
      rest = c.slice(w).join("");
    }
    if (!rest) continue;
    if (!line) line = rest;
    else if (len(line) + 1 + len(rest) <= w) line += ` ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function connector(right: boolean, left: boolean, async: boolean): string {
  const dash = async ? "┄" : "─";
  if (right && left) return `◀${dash.repeat(GAP - 2)}▶`;
  if (right) return `${dash.repeat(GAP - 1)}▶`;
  return `◀${dash.repeat(GAP - 1)}`;
}

function flowArrow(async: boolean): string {
  return async ? "┄┄┄▶" : "───▶";
}

/** Box-drawing diagram: one column per layer, one band per row, then a "flows:" list of every edge. */
export function renderAsciiArchitecture(arch: RoomArchitecture, options: AsciiArchitectureOptions = {}): string {
  const maxWidth = Math.max(1, Math.floor(options.maxWidth ?? DEFAULT_WIDTH));
  const nodes = arch.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nameOf = (id: string) => clean(byId.get(id)?.label ?? id);
  const out: string[] = [];

  if (nodes.length > 0) {
    const layers = Math.max(...nodes.map((n) => Math.max(0, n.layer))) + 1;
    const rows = Math.max(...nodes.map((n) => Math.max(0, n.row))) + 1;

    const wanted = Math.max(...nodes.map((n) => Math.max(len(clean(n.label)), len(`[${n.kind}]`))));
    const available = Math.floor((maxWidth - (layers - 1) * GAP) / layers) - BOX_CHROME;
    const text = Math.max(MIN_TEXT, Math.min(wanted, available));
    const boxWidth = text + BOX_CHROME;
    const totalWidth = layers * boxWidth + (layers - 1) * GAP;
    const colX = (layer: number) => layer * (boxWidth + GAP);

    // cells[row][layer] keeps nodes in input order; several nodes in one cell stack vertically.
    const cells: ArchNode[][][] = Array.from({ length: rows }, () => Array.from({ length: layers }, () => []));
    for (const n of nodes) cells[Math.max(0, n.row)][Math.max(0, n.layer)].push(n);
    const slot = new Map<string, number>();
    for (const row of cells) for (const cell of row) cell.forEach((n, i) => slot.set(n.id, i));

    for (let r = 0; r < rows; r++) {
      const depth = Math.max(1, ...cells[r].map((c) => c.length));
      const grid = Array.from({ length: depth * BOX_LINES }, () => Array<string>(totalWidth).fill(" "));
      const put = (line: number, x: number, s: string) => chars(s).forEach((ch, i) => (grid[line][x + i] = ch));

      cells[r].forEach((cell, layer) =>
        cell.forEach((n, i) => boxLines(n, text).forEach((s, k) => put(i * BOX_LINES + k, colX(layer), s))),
      );

      // Connectors between adjacent layers on this row, keyed by gap and stack slot.
      const links = new Map<string, { gap: number; slot: number; right: boolean; left: boolean; async: boolean }>();
      for (const e of arch.edges) {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b || a.row !== r || b.row !== r || Math.abs(a.layer - b.layer) !== 1) continue;
        const gap = Math.min(a.layer, b.layer);
        const s = Math.min(slot.get(a.id) ?? 0, slot.get(b.id) ?? 0);
        const key = `${gap}:${s}`;
        const link = links.get(key) ?? { gap, slot: s, right: false, left: false, async: false };
        if (b.layer > a.layer) link.right = true;
        else link.left = true;
        link.async ||= Boolean(e.async);
        links.set(key, link);
      }
      for (const link of [...links.values()].sort((x, y) => x.gap - y.gap || x.slot - y.slot)) {
        put(link.slot * BOX_LINES + LABEL_LINE, colX(link.gap) + boxWidth, connector(link.right, link.left, link.async));
      }

      if (r > 0) out.push("");
      out.push(...grid.map((line) => line.join("")));
    }
  }

  if (out.length > 0) out.push("");
  out.push("flows:");
  for (const e of arch.edges) {
    let line = `  ${nameOf(e.from)} ${flowArrow(Boolean(e.async))} ${nameOf(e.to)}`;
    if (e.async) line += " (async)";
    if (e.label) line += ` : ${clean(e.label)}`;
    out.push(line);
  }

  return trimLines(out).join("\n");
}

const README_WIDTH = 72;

function hanging(prefix: string, text: string, width = README_WIDTH): string[] {
  const raw = text.replace(EM_DASH, "-").replace(/\s*\n\s*/g, " ");
  if (len(prefix) + len(raw) <= width) return [prefix + raw];
  const indent = " ".repeat(len(prefix));
  return wrap(text, width - len(prefix)).map((line, i) => (i === 0 ? prefix : indent) + line);
}

/** Terminal-style README of a room: same content as the drawer, plain text. */
export function renderReadme(view: RoomView, labels: ReadmeLabels): string {
  const out: string[] = ["$ cat README.md", "", `# ${clean(view.title)}`];
  if (view.subtitle) out.push(...wrap(view.subtitle, README_WIDTH));
  out.push(...wrap([view.code, ...view.meta].map(clean).filter(Boolean).join(" · "), README_WIDTH));

  if (view.sections.length > 0) {
    out.push("", `## ${clean(labels.overview)}`);
    for (const section of view.sections) {
      if (section.title) out.push("", `### ${clean(section.title)}`);
      if (section.body) out.push("", ...wrap(section.body, README_WIDTH));
      if (section.bullets?.length) {
        out.push("");
        for (const bullet of section.bullets) out.push(...hanging("- ", bullet));
      }
      if (section.items?.length) {
        out.push("");
        for (const item of section.items) {
          out.push(...hanging("- ", item.meta ? `${item.title} (${item.meta})` : item.title));
        }
      }
      if (section.chips?.length) out.push("", ...wrap(section.chips.join(", "), README_WIDTH));
    }
  }

  if (view.architecture) {
    out.push(
      "",
      `## ${clean(labels.architecture)}`,
      "",
      "```",
      renderAsciiArchitecture(view.architecture, { maxWidth: README_WIDTH }),
      "```",
    );
  }

  if (view.metrics.length > 0) {
    out.push("", `## ${clean(labels.results)}`, "");
    for (const m of view.metrics) {
      out.push(...hanging("- ", `${m.value}  ${m.label}${m.context ? ` (${m.context})` : ""}`));
    }
  }

  if (view.stack.length > 0) {
    out.push("", `## ${clean(labels.stack)}`, "", ...wrap(view.stack.map((s) => s.name).join(", "), README_WIDTH));
  }

  const links = [view.page, view.external].filter((href): href is string => Boolean(href));
  if (links.length > 0) {
    out.push("", `## ${clean(labels.links)}`, "");
    for (const href of links) out.push(...hanging("- ", href));
  }

  return trimLines(out.join("\n").replace(EM_DASH, "-").split("\n")).join("\n");
}
