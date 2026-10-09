import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { LocalizedText, Mission, SiteContent } from "@/content/schema";
import type { PaletteActionId } from "./palette-types";
import { buildRoomCatalog, buildYears, type RoomInfo, type StructuralLabels, type StructuralRoom, type YearInfo } from "@/experience/missions/rooms";

/** Serializable data the client HUD needs. Built on the server so zod and the full dataset stay out of the client bundle. */
export interface HudIndex {
  missions: Mission[];
  rooms: RoomInfo[];
  years: YearInfo[];
  email: string;
  cvFileName: string;
  /** Palette action labels in both languages (the client only loads the current locale's messages). */
  actionLabels: Record<PaletteActionId, LocalizedText>;
}

const ACTION_KEYS: Record<PaletteActionId, keyof typeof en.hud.actions> = {
  "download-cv": "downloadCv",
  "copy-email": "copyEmail",
  "toggle-language": "toggleLanguage",
  "toggle-sound": "toggleSound",
  "quick-view": "quickView",
};

export function structuralLabels(): StructuralLabels {
  const keys = Object.keys(en.hud.rooms) as StructuralRoom[];
  return Object.fromEntries(keys.map((key) => [key, { en: en.hud.rooms[key], id: id.hud.rooms[key] }])) as StructuralLabels;
}

export function buildHudIndex(content: SiteContent): HudIndex {
  return {
    missions: [...content.missions].sort((a, b) => a.order - b.order),
    rooms: buildRoomCatalog(content, structuralLabels()),
    years: buildYears(content),
    email: content.floors.roof.contact.email,
    cvFileName: content.floors.roof.cv.fileName,
    actionLabels: Object.fromEntries(
      Object.entries(ACTION_KEYS).map(([action, key]) => [action, { en: en.hud.actions[key], id: id.hud.actions[key] }]),
    ) as Record<PaletteActionId, LocalizedText>,
  };
}
