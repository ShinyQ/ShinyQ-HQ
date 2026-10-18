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

/** Floor accents from appendix 05 (L1 green, L2 amber, L3 violet, L4 white, RF blue). */
export const FLOOR_ACCENT: Record<FloorId, Accent> = {
  B1: "amber",
  L1: "green",
  L2: "amber",
  L3: "violet",
  L4: "white",
  RF: "blue",
};

/** Product Engineering wing tint cyan, AI Engineering wing tint violet (appendix 05), Data and ML amber (the reactor's Data ring). */
export const WING_ACCENT = { software: "cyan", ai: "violet", data: "amber" } as const satisfies Record<string, Accent>;
