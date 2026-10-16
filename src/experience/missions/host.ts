import type { DrawerTab, FloorId, LocalizedText, MissionStep, RoomId } from "@/content/schema";

/** Filters the command palette can open with (mission step `{ kind: "palette" }`). */
export type PaletteFilter = Extract<MissionStep, { kind: "palette" }>["filter"];

export type MissionStatus = "idle" | "running" | "done" | "cancelled";

/** World-space point on a floor (x, z), used by `drive` steps that target a spot instead of a room. */
export interface Vec2 {
  x: number;
  z: number;
}

/** Passed to every host call. `signal` aborts when the mission is cancelled (manual input, Esc, new mission). */
export interface StepContext {
  signal: AbortSignal;
  missionId: string;
}

/**
 * Everything the mission runner needs from the world. The static tier implements it with route
 * navigation (`staticHost.ts`); the 3D experience implements it with the store, rover and camera.
 * Every method resolves when the step is visually complete and should stop early when
 * `ctx.signal` aborts (the runner stops awaiting it either way).
 */
export interface MissionHost {
  /** True for the HTML-only tier. */
  readonly isStatic: boolean;
  /** Ride the elevator to a floor (rover drives to the door first when needed). */
  elevator(floor: FloorId, ctx: StepContext): Promise<void>;
  /** Autopilot the rover to a room door or a point on the current floor. */
  driveTo(target: RoomId | Vec2, ctx: StepContext): Promise<void>;
  /** Open a room's drawer (or page) on a tab. */
  openRoom(room: RoomId, tab: DrawerTab | undefined, ctx: StepContext): Promise<void>;
  /** Show text on the rover screen; `ms` is how long it should stay. */
  say(text: LocalizedText, ms: number | undefined, ctx: StepContext): Promise<void>;
  /** Open the command palette, optionally pre-filtered. */
  openPalette(filter: PaletteFilter | undefined, ctx: StepContext): Promise<void>;
  /** Called once when a mission ends, after the last step or on cancel. */
  finish?(status: "done" | "cancelled", missionId: string): void;
}
