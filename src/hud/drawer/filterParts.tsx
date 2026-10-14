"use client";

import type { ReactNode } from "react";
import type { Accent } from "@/content/schema";
import { AccentDot } from "@/components/AccentDot";

/**
 * Shared pieces of the floor filter drawers (the L3 Tech Reactor and the L4 Topic Constellation): a
 * toggle option with its count, a piece that rides to its room, and the action button style.
 */
export const FILTER_ACTION = "glass glass-solid hq-glow inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold text-ink";

type DataAttrs = { [key: `data-${string}`]: string | undefined };

/** One option: pressed while picked (a glowing dot in `accent`), its count on the right. */
export function FilterOption({
  on,
  accent,
  label,
  count,
  icon,
  onClick,
  data,
}: {
  on: boolean;
  accent: Accent;
  label: string;
  count: string;
  /** Replaces the dot (the Tech Reactor's tech logos). */
  icon?: ReactNode;
  onClick: () => void;
  data?: DataAttrs;
}) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="glass glass-solid hq-glow flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ink" {...data}>
      {icon ?? <AccentDot tone={on ? accent : "line"} glow={on} className="mx-1.5" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="label shrink-0 text-ink-3">{count}</span>
    </button>
  );
}

/** A piece of the selection (a project, a post, a desk): its title and a meta line; a click rides there. */
export function FilterPiece({ title, meta, onClick, data }: { title: string; meta: string; onClick: () => void; data?: DataAttrs }) {
  return (
    <button type="button" onClick={onClick} className="glass glass-solid hq-glow flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left" {...data}>
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="label text-ink-3">{meta}</span>
    </button>
  );
}
