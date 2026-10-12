import type { Accent } from "@/content/schema";
import { ACCENT_TEXT } from "@/lib/accent";

/** Accent colors plus two neutral tones: `muted` (ink-3) and `line` (an idle marker in line-2). */
export type DotTone = Accent | "muted" | "line";

const TONE_TEXT: Record<DotTone, string> = { ...ACCENT_TEXT, muted: "text-ink-3", line: "text-line-2" };

export interface AccentDotProps {
  tone: DotTone;
  /** `sm` 6 px (rows, lists), `md` 8 px (panel bars). */
  size?: "sm" | "md";
  /** A soft halo in the same color, for the selected or current item. */
  glow?: boolean;
  className?: string;
}

/**
 * The colored marker next to a label (R5 P10, owner decision 2026-10-13): state and category are never
 * drawn as a colored left or top edge. Decorative; the label next to it carries the meaning.
 */
export function AccentDot({ tone, size = "sm", glow = false, className = "" }: AccentDotProps) {
  const classes = ["hq-dot", size === "md" && "hq-dot-md", glow && "hq-dot-glow", TONE_TEXT[tone], className].filter(Boolean).join(" ");
  return <span aria-hidden="true" data-accent-dot={tone} className={classes} />;
}
