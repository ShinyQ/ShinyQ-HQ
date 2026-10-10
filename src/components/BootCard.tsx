import type { Ref } from "react";
import { splitBootLine } from "@/lib/boot-first";

export interface BootCardProps {
  eyebrow: string;
  monogram: string;
  title: string;
  titleId?: string;
  lines: string[];
  /** Number of lines shown; the rest keep their space so the card never changes height. */
  shown: number;
  /** CSS-staggered line reveal (the SSR cover, which has no JS yet). */
  stagger?: boolean;
  startLabel: string;
  skipLabel: string;
  onStart?: () => void;
  onSkip?: () => void;
  startRef?: Ref<HTMLButtonElement>;
  /** Render the buttons invisible (cover): same layout as the overlay, nothing to click or focus. */
  placeholder?: boolean;
}

/**
 * The boot card shared by the SSR boot cover and the 3D boot overlay, so the handoff from one to
 * the other does not move a pixel. Plain markup (no hooks), usable from server and client components.
 */
export function BootCard({ startRef, ...p }: BootCardProps) {
  return (
    <div className="hq-boot-card">
      <p className="eyebrow">{p.eyebrow}</p>
      <p className="mt-3 font-mono text-sm text-cyan">{p.monogram}</p>
      <p id={p.titleId} className="mt-2 text-2xl font-extrabold text-ink">
        {p.title}
      </p>
      <ol className="hq-boot-log mt-5">
        {p.lines.map((line, i) => {
          const { ok, text } = splitBootLine(line);
          return (
            <li
              key={line}
              data-shown={i < p.shown ? "" : undefined}
              style={p.stagger ? { animationDelay: `${120 + i * 220}ms` } : undefined}
              className={p.stagger ? "hq-boot-line-in" : undefined}
            >
              {ok ? <span className="text-green">[ok]</span> : null} {text}
            </li>
          );
        })}
      </ol>
      <div className="hq-boot-bar" />
      <div className={`mt-6 flex flex-wrap gap-3 ${p.placeholder ? "invisible" : ""}`}>
        <button
          ref={startRef}
          type="button"
          onClick={p.onStart}
          tabIndex={p.placeholder ? -1 : undefined}
          className="inline-flex min-h-11 items-center rounded-xl bg-[#6366f1] px-6 py-3 font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,.55)] transition hover:bg-[#6366f1]/85"
        >
          {p.startLabel}
        </button>
        <button
          type="button"
          onClick={p.onSkip}
          tabIndex={p.placeholder ? -1 : undefined}
          className="inline-flex min-h-11 items-center rounded-xl border border-[#6366f1]/45 px-5 text-ink-2 transition hover:border-[#6366f1] hover:text-ink"
        >
          {p.skipLabel}
        </button>
      </div>
    </div>
  );
}
