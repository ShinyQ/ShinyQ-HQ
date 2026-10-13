/**
 * L2 Workshop repo skyline (F3, owner approved 2026-10-14): the public repos as a bar skyline, height by
 * stars on a log scale, color by language. Pure (no React or three): Vitest runs it in node. Positions
 * are relative to the skyline origin (x 0 at the middle, z 0 at the plinth's south face, rows run north).
 */

/** One public repo as the 3D chunk receives it (`CareerData.repos`). */
export interface WorkshopRepo {
  /** Room slug (`repo-<slug>` is its drawer, `repoSlug` in `@/content/workshop`). */
  slug: string;
  name: string;
  language: string;
  stars: number;
}

export const SKYLINE = {
  /** Columns per row and the column pitch (u); bars are `bar` wide, so neighbours keep a slit between them. */
  cols: 10,
  pitch: 1.8,
  bar: 1.5,
  /** Bar height range (u): a repo without stars still shows a stub. */
  minH: 0.8,
  maxH: 8,
  /** Plinth height under the bars. */
  plinth: 0.3,
  /** Floating name labels for the most starred repos (only repos with at least one star). */
  labels: 3,
} as const;

/** Neon tint per GitHub language; anything else reads white. */
export const LANGUAGE_COLORS: Readonly<Record<string, string>> = {
  "Jupyter Notebook": "#fb923c",
  Python: "#60a5fa",
  TypeScript: "#22d3ee",
  JavaScript: "#facc15",
  Markdown: "#a78bfa",
};
export const OTHER_LANGUAGE = "#e4e4e7";

export function languageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? OTHER_LANGUAGE;
}

/** Bar height for `stars` when the most starred repo has `max`: log scale from `minH` (0 stars) to `maxH` (the top repo). */
export function skylineHeight(stars: number, max: number): number {
  if (max <= 0 || stars <= 0) return SKYLINE.minH;
  const k = Math.log1p(Math.min(stars, max)) / Math.log1p(max);
  return SKYLINE.minH + (SKYLINE.maxH - SKYLINE.minH) * k;
}

export interface SkylineBar extends WorkshopRepo {
  /** 0 = most starred (ties keep the content order). */
  rank: number;
  col: number;
  /** 0 = front row (south, nearest the plaza and the rail camera). */
  row: number;
  x: number;
  z: number;
  h: number;
  color: string;
}

/**
 * Column order of one row by rank: the most starred bar stands in the middle, the next two well apart
 * (so their floating labels never overlap), then the rest fill in. A permutation of 0..cols-1.
 */
export function spreadColumns(cols: number): number[] {
  const anchors = [0.5, 0.12, 0.88, 0.32, 0.68, 0, 1, 0.22, 0.78, 0.42, 0.58];
  const order: number[] = [];
  for (const f of anchors) {
    const c = Math.round(f * (cols - 1));
    if (!order.includes(c)) order.push(c);
  }
  for (let c = 0; c < cols; c++) if (!order.includes(c)) order.push(c);
  return order.filter((c) => c < cols);
}

export interface SkylineShape {
  cols: number;
  rows: number;
  /** Plinth size (u): width along x, depth along z. */
  w: number;
  d: number;
}

export function skylineShape(count: number): SkylineShape {
  const cols = Math.max(1, Math.min(SKYLINE.cols, Math.ceil(count / 2)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows, w: cols * SKYLINE.pitch, d: rows * SKYLINE.pitch };
}

/**
 * Lays the repos out: the most starred fill the back row (tallest behind, so every bar shows from the
 * rail camera), the rest the rows in front. Within a row the ranks spread with `spreadColumns`.
 */
export function skylineBars(repos: readonly WorkshopRepo[]): SkylineBar[] {
  const shape = skylineShape(repos.length);
  const max = repos.reduce((m, r) => Math.max(m, r.stars), 0);
  const order = spreadColumns(shape.cols);
  const ranked = repos.map((r, i) => ({ r, i })).sort((a, b) => b.r.stars - a.r.stars || a.i - b.i);
  return ranked.map(({ r }, rank) => {
    const back = Math.floor(rank / shape.cols);
    const row = shape.rows - 1 - back;
    const col = order[rank % shape.cols];
    return {
      ...r,
      rank,
      col,
      row,
      x: (col - (shape.cols - 1) / 2) * SKYLINE.pitch,
      z: -(row + 0.5) * SKYLINE.pitch,
      h: skylineHeight(r.stars, max),
      color: languageColor(r.language),
    };
  });
}

/** The bars that get a floating name label: the `n` most starred with at least one star. */
export function topBars(bars: readonly SkylineBar[], n: number = SKYLINE.labels): SkylineBar[] {
  return bars.filter((b) => b.stars > 0 && b.rank < n);
}

/** Languages in skyline order of first appearance by rank (the legend). */
export function skylineLanguages(bars: readonly SkylineBar[]): { language: string; color: string }[] {
  const seen = new Map<string, string>();
  for (const b of [...bars].sort((a, b) => a.rank - b.rank)) if (!seen.has(b.language)) seen.set(b.language, b.color);
  return [...seen].map(([language, color]) => ({ language, color }));
}
