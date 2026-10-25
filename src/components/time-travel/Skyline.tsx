import { ACCENT_TEXT } from "@/lib/accent";
import { TT_KINDS, type TtStop } from "@/content/time-travel";
import { KIND_TONE, SKY, skylineLayout, viewBoxOf } from "./geometry";

/** Ghost opacity of buildings after the selected stop (the island writes the same values). */
export const GHOST_OPACITY = "0.15";

/**
 * The journey skyline: one building per stop, one block per item, colors from the accent classes through
 * `currentColor` (no new CSS). Server rendered on "now" (every building lit, the last outlined). Each building is a
 * link to its year's rows, so it works without JS; the island turns the links into stop pickers.
 */
export function Skyline({ stops, labels, names, title }: { stops: readonly TtStop[]; labels: readonly string[]; names: readonly string[]; title: string }) {
  const layout = skylineLayout(stops);
  const last = stops.length - 1;
  return (
    <svg viewBox={viewBoxOf(stops.length)} role="group" aria-label={title} className="block h-auto w-full" preserveAspectRatio="xMidYMax meet">
      {layout.map((b, i) => (
        <a key={stops[i].id} href={`#${stops[i].anchor}`} data-tt-link={i} aria-label={names[i]}>
          <rect x={i * SKY.slot} y={0} width={SKY.slot} height={SKY.height} fill="transparent" />
          <g data-tt-stop={i} opacity="1" style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
            {TT_KINDS.map((kind) => {
              const blocks = b.blocks.filter((r) => r.kind === kind);
              if (blocks.length === 0) return null;
              return (
                <g key={kind} className={ACCENT_TEXT[KIND_TONE[kind]]} fill="currentColor">
                  {blocks.map((r) => (
                    <rect key={`${r.y}`} x={r.x} y={r.y} width={r.width} height={r.height} rx={0.5} />
                  ))}
                </g>
              );
            })}
          </g>
          <rect
            data-tt-outline={i}
            x={b.x - SKY.outline}
            y={b.top - SKY.outline}
            width={SKY.building + SKY.outline * 2}
            height={b.height + SKY.outline}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-ink"
            visibility={i === last ? "visible" : "hidden"}
          />
          <text x={b.centerX} y={SKY.base + 22} textAnchor="middle" fill="currentColor" className="pv-data" aria-hidden="true">
            {labels[i]}
          </text>
        </a>
      ))}
    </svg>
  );
}
