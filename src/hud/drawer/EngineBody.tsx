"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AccentDot } from "@/components/AccentDot";
import { BuildVisits } from "@/components/build/BuildVisits";
import { DiagramSvg } from "@/components/diagram/DiagramSvg";
import type { RoomEngine } from "@/content/room-views/types";
import type { RoomBodyProps } from "./bodies";
import { MetricTiles, Sections } from "./blocks";

const PR = "inline-flex min-h-6 items-center px-1 font-mono text-[13px] text-ink-2";

/**
 * The site diagram: the wide drawer layout once the figure is as wide as it (a desktop side drawer), the phone
 * layout otherwise. Picked by the figure's own width (no new CSS), measured before paint and on every resize.
 */
function Blueprint({ diagram }: { diagram: NonNullable<RoomEngine["diagram"]> }) {
  const ref = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fits = () => {
      const style = getComputedStyle(el);
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      setWide(el.clientWidth - padding >= diagram.wide.width);
    };
    fits();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fits);
    observer.observe(el);
    return () => observer.disconnect();
  }, [diagram.wide.width]);
  return (
    <figure ref={ref} role="img" aria-label={diagram.label} className="card p-3" data-diagram={wide ? "wide" : "phone"}>
      <DiagramSvg layout={wide ? diagram.wide : diagram.layout} className="mx-auto block h-auto max-w-full" />
    </figure>
  );
}

/**
 * B1 Engine Room station drawer (ships in the B1 chunk): the station's own block (diagram, rounds, gates,
 * numbers or the plan excerpt) around the generic sections. Uses only utility classes the site already
 * ships (CSS budget).
 */
export function EngineBody({ view, locale }: RoomBodyProps) {
  const e = view.engine;
  if (!e) return <Sections sections={view.sections} />;
  const l = e.labels;
  return (
    <div className="space-y-6" data-engine-station={e.station}>
      {e.diagram && <Blueprint diagram={e.diagram} />}
      {e.tiles && (
        <div className="space-y-3">
          <MetricTiles metrics={e.tiles.map(({ value, label }) => ({ value, label }))} fluid />
          <ul className="grid grid-cols-2 gap-3">
            <li className="card flex flex-col gap-2 p-4" data-tile="uptime">
              <p className="text-xl font-semibold text-ink">{l.hourly}</p>
              <p className="text-[13px] text-ink-3">{l.uptime}</p>
            </li>
            <BuildVisits locale={locale} label={l.visits} />
          </ul>
        </div>
      )}
      <Sections sections={view.sections} />
      {e.gates && (
        <ul className="space-y-4">
          {e.gates.map((g) => (
            <li key={g.id} data-gate={g.id}>
              <h3 className="flex items-center gap-2 font-semibold text-ink">
                <AccentDot tone={g.required ? "green" : "muted"} glow={g.required} />
                {g.title}
              </h3>
              <p className="mt-1 text-sm text-ink-2">{g.text}</p>
              <p className="mt-1 text-sm text-ink">
                <span className="label text-ink-3">{l.budget}</span> {g.budget}
              </p>
              <p className="mt-1 text-[13px] text-ink-3">{g.required ? l.blocksMerge : l.reportsOnly}</p>
            </li>
          ))}
        </ul>
      )}
      {e.rounds && (
        <ol className="space-y-6">
          {e.rounds.map((r) => (
            <li key={r.id}>
              <p className="label flex flex-wrap gap-x-3 text-ink-3">
                <span>{r.heading}</span>
                {r.dates && <span>{r.dates}</span>}
                {r.open && <span className="text-cyan">{l.inProgress}</span>}
              </p>
              <h3 className="mt-1 text-base font-semibold text-ink">{r.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{r.summary}</p>
              {r.count && <p className="mt-3 text-[13px] text-ink-3">{r.count}</p>}
              {r.prs.length > 0 && (
                <ul aria-label={r.listLabel} className="mt-1 flex flex-wrap gap-1">
                  {r.prs.map((p) => (
                    <li key={p.n}>
                      {p.href ? (
                        <a href={p.href} target="_blank" rel="noopener noreferrer" className={`${PR} hover:text-cyan`}>{`#${p.n}`}</a>
                      ) : (
                        <span className={PR}>{`#${p.n}`}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {r.shots && (
                <figure className="mt-3 grid grid-cols-2 gap-2">
                  {(["before", "after"] as const).map((key) => (
                    <div key={key}>
                      <p className="label mb-1 text-ink-3">{l[key]}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.shots![key].src} width={r.shots![key].width} height={r.shots![key].height} alt={r.shots![key].alt} loading="lazy" decoding="async" className="h-auto w-full rounded-md border border-line" />
                    </div>
                  ))}
                  <figcaption className="col-span-2 text-[13px] text-ink-3">{r.shots.caption}</figcaption>
                </figure>
              )}
            </li>
          ))}
        </ol>
      )}
      {e.excerpt && (
        <figure>
          <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-ink">{l.excerpt}</span>
            <a href={e.excerpt.href} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-2 hover:text-cyan">
              {l.source}
              <span className="sr-only"> ({l.newTab})</span>
            </a>
          </figcaption>
          <pre className="card p-3 font-mono text-[13px] whitespace-pre-wrap text-ink-2">
            <code>{e.excerpt.text}</code>
          </pre>
        </figure>
      )}
    </div>
  );
}
