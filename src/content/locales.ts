/**
 * Site locales. Import-free on purpose: client modules read these values, and importing them from
 * `schema.ts` would bundle zod and every content schema into every page (REPORT SP1).
 */
export const LOCALES = ["en", "id"] as const;
export const DEFAULT_LOCALE = "en";
export type Locale = (typeof LOCALES)[number];
