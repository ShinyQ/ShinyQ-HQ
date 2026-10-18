import type { DiagramKind, DrawnDiagram, LaidEdge, Point } from "./layout";
import { LINE_GAP, PAD, lineHeight } from "./metrics";

/** Site tokens (globals.css), written as SVG attributes so the figure adds no CSS. */
const INK = "#f4f4f5";
const INK_2 = "#a1a1aa";
const EDGE = "#8b8b94";
/** `--color-surface` over `--color-void`: the card behind the diagram, so edge labels can cut their line. */
const CARD = "#0b0b12";
const KIND: Record<DiagramKind, { color: string; border: string; opacity: number }> = {
  client: { color: "#22d3ee", border: "#22d3ee", opacity: 0.5 },
  service: { color: "#60a5fa", border: "#ffffff", opacity: 0.16 },
  ai: { color: "#a78bfa", border: "#a78bfa", opacity: 0.5 },
  data: { color: "#34d399", border: "#34d399", opacity: 0.45 },
  human: { color: "#fbbf24", border: "#fbbf24", opacity: 0.45 },
  external: { color: "#e5e7eb", border: "#ffffff", opacity: 0.16 },
};
const ASYNC = "#a78bfa";
const HEAD = 7;
const RADIUS = 6;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Orthogonal polyline with rounded corners, stopping `HEAD` short of the end for the arrowhead. */
export function edgePath(points: readonly Point[], head: Point): string {
  const pts = points.map((p) => [...p] as [number, number]);
  const last = pts[pts.length - 1];
  pts[pts.length - 1] = [last[0] - head[0] * (HEAD - 1), last[1] - head[1] * (HEAD - 1)];
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const r = Math.min(RADIUS, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += `L${r1(x)} ${r1(y)}`;
      continue;
    }
    const ax = x - ((x - px) / inLen) * r;
    const ay = y - ((y - py) / inLen) * r;
    const bx = x + ((nx - x) / outLen) * r;
    const by = y + ((ny - y) / outLen) * r;
    d += `L${r1(ax)} ${r1(ay)}Q${r1(x)} ${r1(y)} ${r1(bx)} ${r1(by)}`;
  }
  const end = pts[pts.length - 1];
  return `${d}L${r1(end[0])} ${r1(end[1])}`;
}

export function arrowHead(tip: Point, dir: Point): string {
  const [x, y] = tip;
  const [dx, dy] = dir;
  const bx = x - dx * HEAD;
  const by = y - dy * HEAD;
  const w = HEAD * 0.6;
  return `M${r1(x)} ${r1(y)}L${r1(bx - dy * w)} ${r1(by + dx * w)}L${r1(bx + dy * w)} ${r1(by - dx * w)}Z`;
}

function Edge({ edge, size }: { edge: LaidEdge; size: number }) {
  const color = edge.async ? ASYNC : EDGE;
  const tip = edge.points[edge.points.length - 1];
  const l = edge.label;
  return (
    <g>
      <path d={edgePath(edge.points, edge.head)} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={edge.async ? "5 4" : undefined} />
      <path d={arrowHead(tip, edge.head)} fill={color} />
      {l && (
        <g>
          <rect x={r1(l.x)} y={r1(l.y)} width={r1(l.w)} height={r1(l.h)} rx={4} fill={CARD} />
          <text fill={INK_2} fontSize={size} textAnchor="middle">
            {l.lines.map((line, i) => (
              <tspan key={i} x={r1(l.x + l.w / 2)} y={r1(l.y + 1 + size * 0.95 + i * lineHeight(size))}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}
    </g>
  );
}

/** One laid-out diagram as inline SVG (decorative to assistive tech: the figure carries the summary). */
export function DiagramSvg({ layout, className }: { layout: DrawnDiagram; className?: string }) {
  const p = layout.preset;
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      className={`mx-auto h-auto max-w-full ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      {layout.groups.map((g) => (
        <g key={g.label}>
          <rect x={r1(g.x)} y={r1(g.y)} width={r1(g.w)} height={r1(g.h)} rx={14} fill="none" stroke="#ffffff" strokeOpacity={0.16} strokeDasharray="2 4" />
          <text x={r1(g.labelX)} y={r1(g.y - 6)} fill={INK_2} fontSize={p.kindSize} className="font-mono" letterSpacing="0.06em">
            {g.label.toUpperCase()}
          </text>
        </g>
      ))}
      {layout.nodes.map((n) => {
        const k = KIND[n.kind];
        let y = n.y + PAD + p.kindSize * 0.85;
        const kindY = y;
        y += 6 + p.labelSize * 0.95;
        const labelY = y;
        y += (n.label.length - 1) * lineHeight(p.labelSize) + LINE_GAP + 4 + p.subSize * 0.95;
        const subY = y;
        return (
          <g key={n.id}>
            <rect x={r1(n.x)} y={r1(n.y)} width={r1(n.w)} height={r1(n.h)} rx={8} fill="#ffffff" fillOpacity={0.05} stroke={k.border} strokeOpacity={k.opacity} />
            <text x={r1(n.x + PAD)} y={r1(kindY)} fill={k.color} fontSize={p.kindSize} className="font-mono" letterSpacing="0.06em">
              {n.kindLabel}
            </text>
            <text fill={INK} fontSize={p.labelSize} fontWeight={600}>
              {n.label.map((line, i) => (
                <tspan key={i} x={r1(n.x + PAD)} y={r1(labelY + i * lineHeight(p.labelSize))}>
                  {line}
                </tspan>
              ))}
            </text>
            {n.sublabel.length > 0 && (
              <text fill={INK_2} fontSize={p.subSize}>
                {n.sublabel.map((line, i) => (
                  <tspan key={i} x={r1(n.x + PAD)} y={r1(subY + i * lineHeight(p.subSize))}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
      {layout.edges.map((e, i) => (
        <Edge key={i} edge={e} size={p.edgeSize} />
      ))}
    </svg>
  );
}
