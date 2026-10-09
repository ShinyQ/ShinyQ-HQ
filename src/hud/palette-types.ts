import type { FloorId, LocalizedText, RoomId } from "@/content/schema";
import type { PaletteFilter } from "@/experience/missions/host";
import type { RoomKind } from "@/experience/missions/rooms";

export type PaletteGroupId = "missions" | "recent" | "rooms" | "years" | "actions";

export type PaletteActionId = "download-cv" | "copy-email" | "toggle-language" | "toggle-sound" | "quick-view";

export type PaletteTarget =
  | { type: "mission"; id: string }
  | { type: "room"; id: RoomId }
  | { type: "year"; year: number; room: RoomId; path: string }
  | { type: "action"; id: PaletteActionId };

/** One searchable palette row. Text is bilingual so search matches EN and ID terms in either locale. */
export interface PaletteEntry {
  /** Unique key, e.g. "mission:best-ai", "room:L3:voice-ai-contact-center", "year:2024", "action:copy-email". */
  key: string;
  group: Exclude<PaletteGroupId, "recent">;
  title: LocalizedText;
  subtitle?: LocalizedText;
  floor?: FloorId;
  keywords: string[];
  roomKind?: RoomKind;
  target: PaletteTarget;
}

export interface PaletteGroup {
  id: PaletteGroupId;
  entries: PaletteEntry[];
}

export interface PaletteSearchOptions {
  filter?: PaletteFilter | null;
  /** Most recent first; shown under "Recent" for an empty query (max 3). */
  recent?: readonly RoomId[];
  /** Max rows per group for a non-empty query. Default 8. */
  limitPerGroup?: number;
}
