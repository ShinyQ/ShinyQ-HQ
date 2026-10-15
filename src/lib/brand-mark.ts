/**
 * The ShinyQ HQ brand mark (owner pick 2026-10-15, "Screen Rover"): the mascot rover's head seen from
 * the front, drawn on a 120 x 120 grid. It follows the 3D rover (`src/experience/rover/Rover.tsx`): a
 * head about 1.2 wide by 1.1 tall, a screen covering three quarters of its width, the default `^_^`
 * face, the antenna right of center with its pink tip, and a tread with three wheels on each side.
 *
 * One source for every rendering: `scripts/brand-marks.ts` writes the files in `public/brand/` and the
 * app icons from it, `RoverMark` inlines it in the Classic site header (the boot card shows the tile file), and
 * `tests/unit/brand-mark.test.tsx` keeps the committed files equal to it. Pure, no imports.
 */

export const BRAND_COLORS = {
  cyan: "#22D3EE",
  indigo: "#6366F1",
  lilac: "#A78BFA",
  pink: "#F472B6",
  tile: "#070A16",
  head: "#0F172A",
  screen: "#04121A",
} as const;

export const MARK = {
  size: 120,
  tileRadius: 26,
  head: { x: 22, y: 26, w: 76, h: 70, r: 15, stroke: 6 },
  screen: { x: 32, y: 37, w: 56, h: 45, r: 8 },
  /** `^ ^`: two carets, then the `_` mouth below them. */
  eyes: { d: "M39 60L47 51L55 60M65 60L73 51L81 60", stroke: 7 },
  mouth: { d: "M55 71H65", stroke: 5.5 },
  /** Right of center like the rover's (x 0.35 on a 1.2 wide head). */
  antenna: { x: 82, top: 15, tip: { y: 11, r: 7 }, stroke: 5 },
  treads: [
    { x: 14, y: 100, w: 32, h: 12 },
    { x: 74, y: 100, w: 32, h: 12 },
  ],
  /** Three wheels per tread, like the rover. */
  wheels: { xs: [22, 30, 38, 82, 90, 98], y: 106, r: 2.2 },
} as const;

/** `tile`: the app tile (dark rounded square). `glyph`: the same mark on a transparent background. `mono`: one color (`currentColor`). */
export type MarkVariant = "tile" | "glyph" | "mono";

const f = (n: number) => String(Math.round(n * 100) / 100);

/** A rounded rectangle as path data (clockwise), for even-odd knockouts. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}`,
    `V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}`,
    `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}`,
    `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`,
  ].join("");
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;

/**
 * The mark's SVG children (no `<svg>` wrapper). `id` prefixes the gradient and filter ids, so several
 * inline copies on one page never share (or lose, inside a hidden subtree) a definition.
 */
export function roverMarkBody(variant: MarkVariant, id = "rm", tileRadius: number = MARK.tileRadius): string {
  const { head: h, screen: s, eyes, mouth, antenna: a, treads, wheels } = MARK;
  const C = BRAND_COLORS;
  if (variant === "mono") {
    const half = h.stroke / 2;
    const ring =
      roundedRectPath(h.x - half, h.y - half, h.w + h.stroke, h.h + h.stroke, h.r + half) + roundedRectPath(s.x, s.y, s.w, s.h, s.r);
    const tread =
      treads.map((t) => roundedRectPath(t.x, t.y, t.w, t.h, t.h / 2)).join("") + wheels.xs.map((x) => circlePath(x, wheels.y, wheels.r)).join("");
    return [
      `<g fill="currentColor">`,
      `<path fill-rule="evenodd" d="${ring}"/>`,
      `<path fill-rule="evenodd" d="${tread}"/>`,
      `<circle cx="${a.x}" cy="${a.tip.y}" r="${a.tip.r}"/>`,
      `</g>`,
      `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">`,
      `<path d="M${a.x} ${h.y - half}V${a.top}" stroke-width="${a.stroke}"/>`,
      `<path d="${eyes.d}" stroke-width="${eyes.stroke}"/>`,
      `<path d="${mouth.d}" stroke-width="${mouth.stroke}"/>`,
      `</g>`,
    ].join("");
  }
  const g = `${id}-g`;
  const glowId = `${id}-f`;
  const parts = [
    `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${h.x}" y1="${h.y}" x2="${h.x + h.w}" y2="${h.y + h.h}">`,
    `<stop offset="0" stop-color="${C.cyan}"/><stop offset=".55" stop-color="${C.indigo}"/><stop offset="1" stop-color="${C.lilac}"/></linearGradient>`,
    variant === "tile" ? `<filter id="${glowId}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>` : "",
    `</defs>`,
  ];
  if (variant === "tile") {
    parts.push(`<rect width="${MARK.size}" height="${MARK.size}" rx="${tileRadius}" fill="${C.tile}"/>`);
    parts.push(`<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="${h.r}" fill="url(#${g})" opacity=".45" filter="url(#${glowId})"/>`);
  }
  parts.push(
    `<path d="M${a.x} ${h.y}V${a.top}" stroke="url(#${g})" stroke-width="${a.stroke}" stroke-linecap="round"/>`,
    `<circle cx="${a.x}" cy="${a.tip.y}" r="${a.tip.r}" fill="${C.pink}"/>`,
    ...treads.map((t) => `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.h / 2}" fill="${C.indigo}"/>`),
    ...wheels.xs.map((x) => `<circle cx="${x}" cy="${wheels.y}" r="${wheels.r}" fill="${C.tile}" opacity=".55"/>`),
    `<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="${h.r}" fill="${C.head}" stroke="url(#${g})" stroke-width="${h.stroke}"/>`,
    `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" fill="${C.screen}"/>`,
    `<path d="${eyes.d}" fill="none" stroke="${C.cyan}" stroke-width="${eyes.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${mouth.d}" stroke="${C.cyan}" stroke-width="${mouth.stroke}" stroke-linecap="round"/>`,
  );
  return parts.join("");
}

/** Accessible name of the standalone files (a brand name, the same in both locales). */
export const MARK_LABEL = "ShinyQ HQ rover mark";

/** A standalone SVG file of the mark. */
export function roverMarkSvg(
  variant: MarkVariant,
  { id = "rm", size = MARK.size, tileRadius = MARK.tileRadius }: { id?: string; size?: number; tileRadius?: number } = {},
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${MARK.size} ${MARK.size}" role="img" aria-label="${MARK_LABEL}">` +
    `<title>${MARK_LABEL}</title>${roverMarkBody(variant, id, tileRadius)}</svg>\n`
  );
}

/** The SVG files `scripts/brand-marks.ts` writes from this module (repo-relative path to contents). */
export const MARK_FILES: Readonly<Record<string, () => string>> = {
  "public/brand/rover-mark.svg": () => roverMarkSvg("tile"),
  "public/brand/rover-mark-glyph.svg": () => roverMarkSvg("glyph"),
  "public/brand/rover-mark-mono.svg": () => roverMarkSvg("mono"),
  "src/app/icon.svg": () => roverMarkSvg("tile", { id: "icon" }),
};
