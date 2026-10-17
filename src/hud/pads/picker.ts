import type { FloorId } from "@/content/schema";
import { isPublicFloor } from "@/lib/floors";
import { floorRows } from "../floorRows";
import type { CareerData } from "@/experience/types";

/** One row of a pad picker (pure data, so the lists are unit tested without React). */
export interface PickerOption {
  /** Floor id, or the year as a string. */
  id: string;
  title: string;
  detail: string;
  /** Small line above the title: the floor code, or the prologue note on the first year. */
  eyebrow?: string;
  /** Preview image (floors only). */
  thumb?: string;
  /** Dot in the pad's color (time console: pink years like the teleporters, green Back to elevator like the Return pad). */
  tone?: "pink" | "green";
  current: boolean;
}

/** Committed picker thumbnail of a floor (`bun run floor:thumbs`). */
export const floorThumb = (floor: FloorId) => `/floors/${floor}.webp`;

/** Floors top-down like the elevator panel (RF first), named with the panel's labels; B1 (unlocked) has no thumbnail. */
export function floorOptions(current: FloorId, label: (floor: FloorId) => string, describe: (floor: FloorId) => string, b1Unlocked = false): PickerOption[] {
  return floorRows(b1Unlocked).map(({ id }) => ({ id, eyebrow: id, title: label(id), detail: describe(id), ...(isPublicFloor(id) ? { thumb: floorThumb(id) } : {}), current: id === current }));
}

/** Year plazas oldest first: room count and up to two organizations; the first year notes the folded prologue. */
export function yearOptions(career: CareerData, current: number, rooms: (count: number) => string, prologue: string): PickerOption[] {
  return career.years.map(({ year, entries }) => {
    const orgs = [...new Set(entries.map((e) => e.org))].slice(0, 2);
    const early = entries.find((e) => e.prologue);
    return {
      id: String(year),
      eyebrow: early ? `${prologue} \u00B7 ${early.period}` : undefined,
      title: String(year),
      detail: [rooms(entries.length), ...orgs].join(" \u00B7 "),
      current: year === current,
    };
  });
}

/** The id of the time console's "Back to elevator" row. */
export const BACK_TO_ELEVATOR = "elevator";

/** The L2 time console: "Back to elevator" first, then every year plaza (none is current: the console stands past them). */
export function consoleOptions(career: CareerData, rooms: (count: number) => string, prologue: string, back: { title: string; detail: string }): PickerOption[] {
  return [
    { id: BACK_TO_ELEVATOR, eyebrow: "L2", title: back.title, detail: back.detail, current: false, tone: "green" },
    ...yearOptions(career, Number.NaN, rooms, prologue).map((o) => ({ ...o, tone: "pink" as const })),
  ];
}

/** Roving focus in a picker list: arrows move one step (wrapping), Home and End jump; other keys return null. */
export function nextIndex(index: number, key: string, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
