/**
 * Runtime twin of `tests/helpers/edge-accents.ts` (R5 P10). Pass to `page.evaluate(findEdgeAccents, selector)`:
 * lists every visible colored edge stripe under `selector` (the element itself included):
 * - a left or top border in a saturated color that is not part of an even full outline,
 * - an absolutely positioned bar at most 4 px thick, flush with its container's left, right or top edge,
 * - the same bar drawn by `::before` / `::after`,
 * - an inset box-shadow offset to one edge in a saturated color.
 * Neutral rules (`--color-line`, `--color-line-2`, `--color-glass-border`, white highlights) are gray and pass.
 * Self-contained: Playwright serializes the function source into the page.
 */
export function findEdgeAccents(selector: string): string[] {
  const root = document.querySelector(selector);
  if (!root) return [`missing ${selector}`];
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (color: string): [number, number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const colored = (color: string) => {
    const [r, g, b, a] = rgba(color);
    return a >= 0.25 && Math.max(r, g, b) - Math.min(r, g, b) >= 40;
  };
  const name = (el: Element) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 5).join(".") : "";
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""} "${text}"`;
  };
  const SIDES = ["Top", "Right", "Bottom", "Left"] as const;
  type Side = (typeof SIDES)[number];
  const border = (cs: CSSStyleDeclaration, side: Side) => ({
    width: cs.getPropertyValue(`border-${side.toLowerCase()}-width`),
    style: cs.getPropertyValue(`border-${side.toLowerCase()}-style`),
    color: cs.getPropertyValue(`border-${side.toLowerCase()}-color`),
  });
  const out: string[] = [];
  const checkBorders = (cs: CSSStyleDeclaration, label: string) => {
    for (const side of ["Left", "Top"] as const) {
      const b = border(cs, side);
      if (Number.parseFloat(b.width) < 1 || b.style === "none" || b.style === "hidden" || !colored(b.color)) continue;
      const even = SIDES.every((s) => {
        const o = border(cs, s);
        return o.width === b.width && o.style === b.style && o.color === b.color;
      });
      if (!even) out.push(`${label} border-${side.toLowerCase()} ${b.width} ${b.color}`);
    }
  };
  const checkShadow = (cs: CSSStyleDeclaration, label: string) => {
    if (cs.boxShadow === "none") return;
    for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
      if (!/\binset\b/.test(part)) continue;
      const color = /(?:rgba?|oklab|oklch|color|hsla?)\([^)]*\)|#[0-9a-f]{3,8}/i.exec(part)?.[0] ?? "";
      const [x = 0, y = 0, blur = 0] = (part.replace(color, "").match(/-?[\d.]+px/g) ?? []).map(Number.parseFloat);
      if ((x !== 0 || y !== 0) && blur <= 2 && colored(color)) out.push(`${label} inset shadow ${part.trim()}`);
    }
  };
  const thinBar = (r: { left: number; top: number; right: number; width: number; height: number }, host: DOMRect) =>
    (r.width <= 4 && r.height >= 12 && (Math.abs(r.left - host.left) <= 2 || Math.abs(r.right - host.right) <= 2)) ||
    (r.height <= 4 && r.width >= 24 && Math.abs(r.top - host.top) <= 2);

  for (const el of [root, ...root.querySelectorAll("*")]) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || Number.parseFloat(cs.opacity) === 0) continue;
    const label = name(el);
    checkBorders(cs, label);
    checkShadow(cs, label);
    if (cs.position === "absolute" && colored(cs.backgroundColor)) {
      const host = (el instanceof HTMLElement ? el.offsetParent : el.parentElement) ?? document.body;
      if (thinBar(rect, host.getBoundingClientRect())) out.push(`${label} edge bar ${Math.round(rect.width)}x${Math.round(rect.height)} ${cs.backgroundColor}`);
    }
    for (const pseudo of ["::before", "::after"] as const) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === "none" || ps.content === "normal" || ps.display === "none") continue;
      checkBorders(ps, `${label}${pseudo}`);
      checkShadow(ps, `${label}${pseudo}`);
      if (ps.position !== "absolute" || !colored(ps.backgroundColor)) continue;
      const width = Number.parseFloat(ps.width);
      const height = Number.parseFloat(ps.height);
      const left = rect.left + Number.parseFloat(ps.left);
      const top = rect.top + Number.parseFloat(ps.top);
      if (thinBar({ left, top, right: left + width, width, height }, rect)) out.push(`${label}${pseudo} edge bar ${width}x${height} ${ps.backgroundColor}`);
    }
  }
  return out;
}
