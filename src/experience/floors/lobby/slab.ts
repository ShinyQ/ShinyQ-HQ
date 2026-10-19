/**
 * The L1 slab (owner decision 2026-10-19, "more room"): the Lobby and the Highlights Hall share one slab,
 * centered on the elevator axis (z = 0), `halfZ` deep on each side. The Lobby plaza runs from the west edge
 * to `hallX`, where the Highlights Hall begins; hallLayout.ts places the hall relative to it and config.ts
 * the Lobby. Pure and import-free (config.ts and hallLayout.ts both read it).
 */
export const LOBBY_SLAB = {
  minX: -24,
  halfZ: 27,
  /** West edge of the Highlights Hall (the old Lobby plaza ended at x = 28; the hall moved 5 u east). */
  hallX: 33,
} as const;
