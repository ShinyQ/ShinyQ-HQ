import type { Accent, FloorId } from "@/content/schema";

/** Static class maps so Tailwind can see every class at build time. */
export const ACCENT_TEXT: Record<Accent, string> = {
  violet: "text-violet",
  pink: "text-pink",
  green: "text-green",
  amber: "text-amber",
  cyan: "text-cyan",
  blue: "text-blue",
  white: "text-white",
};

export const ACCENT_BORDER: Record<Accent, string> = {
  violet: "border-violet/40 hover:border-violet",
  pink: "border-pink/40 hover:border-pink",
  green: "border-green/40 hover:border-green",
  amber: "border-amber/40 hover:border-amber",
  cyan: "border-cyan/40 hover:border-cyan",
  blue: "border-blue/40 hover:border-blue",
  white: "border-white/40 hover:border-white",
};

export const ACCENT_GLOW: Record<Accent, string> = {
  violet: "hover:shadow-[0_0_32px_-8px_var(--color-violet)]",
  pink: "hover:shadow-[0_0_32px_-8px_var(--color-pink)]",
  green: "hover:shadow-[0_0_32px_-8px_var(--color-green)]",
  amber: "hover:shadow-[0_0_32px_-8px_var(--color-amber)]",
  cyan: "hover:shadow-[0_0_32px_-8px_var(--color-cyan)]",
  blue: "hover:shadow-[0_0_32px_-8px_var(--color-blue)]",
  white: "hover:shadow-[0_0_32px_-8px_var(--color-white)]",
};

export const ACCENT_DOT: Record<Accent, string> = {
  violet: "bg-violet",
  pink: "bg-pink",
  green: "bg-green",
  amber: "bg-amber",
  cyan: "bg-cyan",
  blue: "bg-blue",
  white: "bg-white",
};

/** Floor accents from appendix 05 (L1 green, L2 amber, L3 violet, L4 white, RF blue). */
export const FLOOR_ACCENT: Record<FloorId, Accent> = {
  L1: "green",
  L2: "amber",
  L3: "violet",
  L4: "white",
  RF: "blue",
};

/** Software Wing tint cyan, AI Wing tint violet (appendix 05). */
export const WING_ACCENT = { software: "cyan", ai: "violet" } as const satisfies Record<string, Accent>;
