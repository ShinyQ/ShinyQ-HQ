import { createLocalPref } from "./local-pref";

/** Graphics quality (Settings panel): Auto follows the device probe; Full and Lite override it. Lite saves battery. */
export const QUALITY_PREFS = ["auto", "full", "lite"] as const;
export type QualityPref = (typeof QUALITY_PREFS)[number];
export const isQualityPref = (v: unknown): v is QualityPref => typeof v === "string" && (QUALITY_PREFS as readonly string[]).includes(v);
export const qualityPref = createLocalPref<QualityPref>("hq:quality", "auto", isQualityPref);
