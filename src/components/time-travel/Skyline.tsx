import { ACCENT_TEXT } from "@/lib/accent";
import { TT_KINDS, type TtStop } from "@/content/time-travel";
import { KIND_TONE, SKY, blockPath, skylineLayout, viewBoxOf } from "./geometry";

/**
 * The journey skyline: one building per stop, one block per item, colors from the accent classes through
 * `currentColor` (no new CSS). Server rendered on "now" (every building lit, the last outlined). Each building is a
 * link to its year's rows, so it works without JS; the island turns the links into stop pickers. The year ticks are an
 * HTML row under the SVG so they keep their size on a narrow viewport.
 */
export function Skyline({ stops, labels, names, title }: { stops: readonly TtStop[]; labels: readonly string[]; names: readonly string[]; title: string }) {
  const layout = skylineLayout(stops);
  const last = stops.length - 1;
  return (
    <div>
      <svg viewBox={viewBoxOf(stops.length)} role="group" aria-label={title} className="block h-auto w-full" preserveAspectRatio="xMidYMax meet">
        {layout.map((b, i) => (
          <a key={stops[i].id} href={`#${stops[i].anchor}`} data-tt-link={i} aria-label={names[i]}>
            <rect x={i * SKY.slot} width={SKY.slot} height={SKY.height} fill="transparent" />
            <g data-tt-stop={i} opacity="1" style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
              {TT_KINDS.map((kind) => {
                const blocks = b.blocks.filter((r) => r.kind === kind);
                return blocks.length === 0 ? null : <path key={kind} className={ACCENT_TEXT[KIND_TONE[kind]]} fill="currentColor" d={blockPath(blocks)} />;
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
          </a>
        ))}
      </svg>
      <div className="mt-2 flex" aria-hidden="true">
        {labels.map((label, i) => (
          <span key={stops[i].id} className="pv-data flex-1 text-center">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
