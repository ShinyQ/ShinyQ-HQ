import type { FloorId, LocalizedText, RoomId } from "@/content/schema";
import type { PaletteFilter } from "@/experience/missions/host";
import type { RoomKind } from "@/experience/missions/rooms";

export type PaletteGroupId = "ask" | "missions" | "recent" | "rooms" | "years" | "actions";

export type PaletteActionId = "view-cv" | "copy-email" | "toggle-language" | "toggle-sound" | "quick-view" | "replay-tutorial" | "toggle-hints";

export type PaletteTarget =
  | { type: "mission"; id: string }
  | { type: "room"; id: RoomId }
  | { type: "year"; year: number; room: RoomId; path: string }
  | { type: "action"; id: PaletteActionId }
  /** Ask the HQ with the typed question (the row exists only while the feature is enabled). */
  | { type: "ask"; q: string };

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
  /** Ask the HQ is enabled: a question-like query gets an "Ask" row (see `looksLikeQuestion`). */
  ask?: boolean;
}
