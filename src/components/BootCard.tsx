import type { Ref } from "react";
import { splitBootLine } from "@/lib/boot-first";
import { HEADLINE_TIMING_ID } from "@/lib/perf-marks";
import { PageViewIcon } from "./PageViewIcon";

/** Who the owner is, shown on the boot card at first paint (owner decision, round 5). */
export interface BootWho {
  name: string;
  headline: string;
  motto?: string;
  role: string;
}

/** The small "Classic site" link: a real `?view=page` link (works before hydration; the head script normalizes it to `?view=classic`). */
export interface BootPageLink {
  href: string;
  label: string;
  hint: string;
}

export interface BootCardProps {
  eyebrow: string;
  title: string;
  titleId?: string;
  lines: string[];
  /** Number of lines shown; the rest keep their space so the card never changes height. */
  shown: number;
  /** CSS-staggered line reveal (the SSR cover, which has no JS yet). */
  stagger?: boolean;
  startLabel: string;
  onStart?: () => void;
  /** The log is still typing: Boot rover stays focusable but does nothing yet (the boot is never skipped). */
  startDisabled?: boolean;
  startRef?: Ref<HTMLButtonElement>;
  /** Render the button invisible (cover): same layout as the overlay, nothing to click or focus. */
  placeholder?: boolean;
  who?: BootWho;
  pageView?: BootPageLink;
}

/**
 * The boot card shared by the SSR boot cover and the 3D boot overlay, so the handoff from one to
 * the other does not move a pixel. Plain markup (no hooks), usable from server and client components.
 * There is no skip: the boot and the intro always play in full (owner decision). "Classic site" leaves
 * the 3D view (it is not a skip); ExperienceGate handles it without a reload once hydrated.
 */
// Element Timing for the nightly game-first timeline (not in React's attribute types, so spread).
const HEADLINE_TIMING: Record<string, string> = { elementtiming: HEADLINE_TIMING_ID };

/** The rover brand mark tile (public/brand, written by scripts/brand-marks.ts). */
export const BOOT_MARK_SRC = "/brand/rover-mark.svg";

export function BootCard({ startRef, ...p }: BootCardProps) {
  // On the cover only the owner block and the Classic site link are for assistive tech; the log is decoration.
  const deco = p.placeholder ? true : undefined;
  return (
    <div className="hq-boot-card">
      <p className="eyebrow" aria-hidden={deco}>
        {p.eyebrow}
      </p>
      {/* The brand mark file, not the inline RoverMark: keeps the mark module out of the 3D chunk (the overlay
          reuses this card). Lazy, so the hidden cover on Classic site visits never fetches it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BOOT_MARK_SRC} alt="" width={44} height={44} loading="lazy" decoding="async" className="mt-3 block" />
      <p id={p.titleId} className="mt-2 text-2xl font-extrabold text-ink" aria-hidden={deco} {...HEADLINE_TIMING}>
        {p.title}
      </p>
      {p.who && (
        <div className="hq-boot-who" data-testid="boot-who">
          <p className="text-lg leading-6 font-bold text-ink">{p.who.name}</p>
          <p className="text-sm font-semibold text-cyan">{p.who.headline}</p>
          {p.who.motto && <p className="mt-1 text-sm leading-5 text-ink-2">{p.who.motto}</p>}
          <p className="mt-1 font-mono text-xs leading-5 text-ink-3">{p.who.role}</p>
        </div>
      )}
      <ol className="hq-boot-log mt-5" aria-hidden={deco}>
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
      <div className="hq-boot-bar" aria-hidden="true" />
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          ref={startRef}
          type="button"
          onClick={p.onStart}
          aria-disabled={p.startDisabled || undefined}
          tabIndex={p.placeholder ? -1 : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl bg-[#6366f1] px-6 py-3 font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,.55)] transition hover:bg-[#6366f1]/85 ${
            p.startDisabled ? "cursor-wait opacity-70" : ""
          } ${p.placeholder ? "invisible" : ""}`}
        >
          {p.startLabel}
        </button>
        {p.pageView && (
          <a href={p.pageView.href} title={p.pageView.hint} data-hq-page-link="" className="hq-boot-page">
            <PageViewIcon size={16} />
            {p.pageView.label}
          </a>
        )}
      </div>
    </div>
  );
}
