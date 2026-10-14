import { SUGGESTIONS } from "@/ask/suggestions";
import type { Locale } from "@/content/locales";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import type { StatsFloor } from "./contract";

/**
 * Build-time labels the visits panel needs beyond its `stats` messages: the curated chip questions
 * (`content/ask/suggestions.json`) and the floor names (`hud.floorLabel`). Built on the server and
 * passed down (Contact page props, the L1:visits room view), so the question bank never ships to the client.
 */
export interface VisitsLabels {
  chipLabels: Record<string, string>;
  floorLabels: Record<StatsFloor, string>;
}

export function visitsLabels(locale: Locale): VisitsLabels {
  const m = locale === "en" ? en : id;
  return {
    chipLabels: Object.fromEntries(SUGGESTIONS.map((s) => [s.id, s.q[locale]])),
    floorLabels: { ...m.hud.floorLabel },
  };
}
