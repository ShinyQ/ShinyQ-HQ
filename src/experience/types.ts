import type { FloorId } from "@/content/schema";

export type Vec2 = { x: number; z: number };

/** Axis-aligned rectangle on the floor plane (world units, floor-local). */
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

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
}
