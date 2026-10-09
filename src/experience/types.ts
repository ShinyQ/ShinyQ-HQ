import type { Accent, FloorId, RoomId, Tier, Wing } from "@/content/schema";

export type Vec2 = { x: number; z: number };

/** Axis-aligned rectangle on the floor plane (world units, floor-local). */
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** A room door: entering the square zone centered on `at` opens the room (appendix 03 section 1). */
export interface DoorTrigger {
  room: RoomId;
  /** Center of the trigger zone, just outside the door. Missions drive here. */
  at: Vec2;
  /** Side of the square zone (default 2 u). */
  size?: number;
}

export interface FloorLayout {
  id: FloorId;
  /** Walkable slab footprint. */
  bounds: Rect;
  /** Elevator door on the shaft face. */
  door: Vec2;
  /** Where the rover parks to call the elevator (3 u in front of the door). */
  approach: Vec2;
  obstacles: Rect[];
  spawn: Vec2;
  accent: string;
  /** Door triggers checked by the Director every frame (generic for every floor). */
  doors?: DoorTrigger[];
  /** Rail floors: x positions a horizontal swipe snaps to (L2 year segments and the annex). */
  scrubStops?: number[];
}

export type CareerType = "job" | "freelance" | "education" | "award" | "milestone";

/** What the L2 corridor layout needs: entries per year, oldest first (pre-2019 folded into 2019). */
export interface CareerLayoutInput {
  years: { year: number; entries: { slug: string; type: CareerType }[] }[];
  /** Side projects shown on Workshop annex benches. */
  benches: number;
}

/** One L2 room label (locale-resolved). */
export interface CareerEntryView {
  slug: string;
  type: CareerType;
  role: string;
  org: string;
  period: string;
  /** Started before 2019 and folded into the 2019 gate. */
  prologue: boolean;
}

/** Locale-resolved L2 payload for the 3D chunk (drawer content comes from `room-views/career.ts`). */
export interface CareerData {
  years: { year: number; entries: CareerEntryView[]; awards: number }[];
  sideProjects: { id: string; title: string; year: number | null }[];
  repos: string[];
  models: string[];
}

export type HologramKind = "waveform" | "shield" | "documents" | "graph" | "chart" | "template" | "pipeline";

/** Pod summary for the L3 floor (locale-resolved, serializable). */
export interface LabPod {
  id: string;
  slug: string;
  title: string;
  tier: Tier;
  wing: Wing;
  accent: Accent;
  hologram: HologramKind;
  order: number;
  /** Hero pods with at least 3 architecture nodes open the hologram view. */
  hasHologramView: boolean;
}

/** Optional per-floor inputs for `buildFloorLayouts` (each phase adds its own field). */
export interface LayoutExtras {
  labs?: readonly LabPod[];
  career?: CareerLayoutInput;
}

export type GpuTier = "full" | "lite" | "static";
export type ViewportClass = "desktop" | "tablet" | "mobile";
export type RoverFace = "idle" | "blink" | "driving" | "autopilot" | "thinking" | "arrived" | "blocked" | "up" | "down";

/** Serializable, locale-resolved data the 3D chunk needs (built on the server). */
export interface ExperienceData {
  locale: "en" | "id";
  profile: { name: string; monogram: string; headline: string; role: string; location: string };
  stats: { id: string; value: string; label: string }[];
  skills: { id: string; label: string; items: string[] }[];
  certifications: { id: string; code: string | null; name: string; issuer: string; status: "earned" | "in-progress"; url: string | null }[];
  missions: { id: string; label: string }[];
  floors: Record<FloorId, { name: string; route: string }>;
  years: number[];
  roomCount: number;
  /** L3 Labs: pods in wing order (hero, featured, listed, then `order`) and wing labels. */
  labs: { pods: LabPod[]; wings: Record<Wing, string> };
  /** L2 Career Archive: year rooms, trophy counts and the Workshop annex. */
  career: CareerData;
}
