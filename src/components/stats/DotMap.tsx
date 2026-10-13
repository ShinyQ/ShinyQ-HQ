"use client";

import { useMemo } from "react";
import { countryPoint, dotMapPath, project } from "@/lib/visits/geo";

const W = 960;
const H = 400;
let landPath: string | null = null;

/**
 * Flat world map for the visits stats: every land cell is one zero-length round-capped segment of a
 * single SVG path (Natural Earth, public domain), and each country with visits gets one glowing dot.
 * Dots only: the map never shows a number per country. Decorative next to the data, so the caller gives
 * it a one-sentence label and lists the countries in "View as table".
 */
export function DotMap({ countries, label }: { countries: readonly string[]; label: string }) {
  landPath ??= dotMapPath(W, H);
  const dots = useMemo(
    () =>
      countries.flatMap((code) => {
        const p = countryPoint(code);
        return p ? [{ code, xy: project(p[0], p[1], W, H) }] : [];
      }),
    [countries],
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full" data-testid="visits-map">
      <path d={landPath} fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" className="text-ink-3/45" />
      <g className="text-cyan">
        {dots.map(({ code, xy: [x, y] }) => (
          <g key={code} data-country={code}>
            <circle cx={x} cy={y} r={14} fill="currentColor" opacity={0.18} />
            <circle cx={x} cy={y} r={6} fill="currentColor" />
          </g>
        ))}
      </g>
    </svg>
  );
}
