import type { CertView } from "@/content/certs";
import type { EngineBayId } from "./floors/engine/layout";
import type { OpsData } from "./floors/labs/ops";
import type { Accent, FloorId, RoomId, Tier, Wing } from "@/content/schema";
import type { LibraryLayoutInput } from "./floors/library/model";
import type { RoadNetwork } from "./nav/road";
import type { WorkshopRepo } from "./floors/career/skyline";
import type { ViewZone } from "./camera/orbit";

export type Vec2 = { x: number; z: number };

/** Axis-aligned rectangle on the floor plane (world units, floor-local). */
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** A room door: entering the square zone centered on `at` opens the room (appendix 03 section 1). */
export interface DoorTrigger {
  room: RoomId;
  /** Center of the trigger zone, just outside the door. Missions drive here. */
  at: Vec2;
  /** Side of the square zone (default DOOR_SIZE, 1.6 u). */
  size?: number;
  /** Unit direction from the pad into the room: a rover moving this way opens it at once. */
  facing?: Vec2;
}

/** Floor pad kinds: the elevator call pad (every floor), the L2 year teleporter and the Express Return pad (`FloorLayout.returnPad`). */
export type PadKind = "elevator" | "teleport" | "return";

/** A glowing floor pad the rover parks on (or the visitor clicks) to open a picker. Not an obstacle. */
export interface PadTrigger {
  /** `elevator:<FloorId>`, `teleport:<year>` or `return:<FloorId>`, unique per floor. */
  id: string;
  kind: PadKind;
  /** Center of the pad (floor-local). */
  at: Vec2;
  /** Trigger and glow radius (default PAD.radius). */
  radius?: number;
  /** Teleporters: the year whose plaza the pad stands on. */
  year?: number;
  /** Yaw of the floating icon (forward is (sin, cos)), toward the floor's camera. */
  face: number;
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
  /** Columns taller than the camera clearance (the L3 directory wall and reactor core): they block a low camera up to their own height (`h`). */
  tall?: (Rect & { h: number })[];
  spawn: Vec2;
  accent: string;
  /** Door triggers checked by the Director every frame (generic for every floor). */
  doors?: DoorTrigger[];
  /** Floor pads (elevator call pad on every floor, L2 year teleporters, the Return pad), checked by the Director every frame. */
  pads?: PadTrigger[];
  /**
   * Express Return pad (fast return, `nav/fastReturn.ts`): `buildFloorLayouts` adds a `return:<floor>`
   * pad here that beams the rover to the elevator call pad. Set by floors with a far end (L2, L3).
   */
  returnPad?: Vec2;
  /** Rail floors: x positions a horizontal swipe snaps to (L2 year segments and the annex). */
  scrubStops?: number[];
  /** Walkable floors: roads, plazas and spurs. Autopilot (missions, point-and-go, rides) follows them (`roadRoute`). */
  road?: RoadNetwork;
  /**
   * Limits `road` to drives that start or end inside this rect (L1: the Highlights Hall east of the
   * certification wall); other drives on the floor use the navgrid. Unset: every drive follows the road.
   */
  roadZone?: Rect;
  /** After an elevator ride the rover rolls on to this point (along the road); a mission or input takes over at once. */
  arrival?: Vec2;
  /** Data-driven camera view zones (added to the static `VIEW_ZONES` in camera/orbit.ts). */
  viewZones?: ViewZone[];
  /** Where `drive` stops for a room on this floor without a door (L4: posts on the archive board). */
  listStop?: Vec2;
  /** Rooms without a door that have their own stop (L3: the Tech Reactor; L2: the Workshop gateway, benches and skyline bars); checked before `listStop`. */
  stops?: Partial<Record<RoomId, Vec2>>;
  /** L3: where `drive` stops for each wing's directory panel (listed pods and the directory boards). */
  directoryStops?: Partial<Record<Wing, Vec2>>;
}

/** Every floor's layout, as built by `buildFloorLayouts`. */
export type FloorLayouts = Record<FloorId, FloorLayout>;

export type CareerType = "job" | "freelance" | "education" | "award" | "milestone";

/** What the L2 corridor layout needs: entries per year, oldest first (pre-2019 folded into 2019). */
export interface CareerLayoutInput {
  years: { year: number; entries: { slug: string; type: CareerType }[] }[];
  /** Side project ids, one Workshop bench each (content order). */
  sideProjects: string[];
  /** Public repos for the Workshop skyline. */
  repos: WorkshopRepo[];
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
  repos: WorkshopRepo[];
}

export type HologramKind = "waveform" | "shield" | "documents" | "graph" | "chart" | "template" | "pipeline";

/** Pod summary for the L3 floor (locale-resolved, serializable). */
export interface LabPod {
  id: string;
  slug: string;
  title: string;
  /** One-line L3 directory board title, only on pods that set `Pod.shortTitle`; boards read `shortTitle ?? title`. */
  shortTitle?: string;
  tier: Tier;
  wing: Wing;
  accent: Accent;
  hologram: HologramKind;
  order: number;
  /** Hero pods with at least 3 architecture nodes open the hologram view. */
  hasHologramView: boolean;
  /** At least one gallery image: gallery pods come first in every project list (`comparePods`). */
  hasGallery: boolean;
  /** Public live site (R4-J), only on pods that have one; read it with `podLiveLink`. */
  liveUrl?: string;
}

/** Optional per-floor inputs for `buildFloorLayouts` (each phase adds its own field). */
export interface LayoutExtras {
  labs?: readonly LabPod[];
  career?: CareerLayoutInput;
  library?: LibraryLayoutInput;
}

export type GpuTier = "full" | "lite" | "static";
export type ViewportClass = "desktop" | "tablet" | "mobile";
export type RoverFace = "idle" | "blink" | "driving" | "autopilot" | "thinking" | "arrived" | "blocked" | "up" | "down" | "off" | "boot";

/** Serializable, locale-resolved data the 3D chunk needs (built on the server). */
export interface ExperienceData {
  locale: "en" | "id";
  profile: { name: string; headline: string; role: string; location: string; motto?: string };
  stats: { id: string; value: string; label: string }[];
  /** `logos[i]` is the tech logo path for `items[i]` (null renders text only). */
  skills: { id: string; label: string; items: string[]; logos: (string | null)[] }[];
  /** `certViews(locale)`: sorted (earned newest first, then in progress, then expired), also the preview card's data. */
  certifications: CertView[];
  missions: { id: string; label: string }[];
  floors: Record<FloorId, { name: string; route: string }>;
  years: number[];
  roomCount: number;
  /** L3 Labs: pods in site order (`orderPods`: gallery first, then hero, featured, listed, then `order`) and wing labels. */
  labs: { pods: LabPod[]; wings: Record<Wing, string>; ops: OpsData };
  /** L2 Career Archive: year rooms, trophy counts and the Workshop annex. */
  career: CareerData;
  library: LibraryData;
  roof: RoofData;
  /** L1 Highlights Hall: the landing's featured projects with their cover thumbnails. */
  highlights: HighlightsData;
  /** B1 Engine Room: bay titles for the floor's signs and the point-and-go labels (drawer content: room-views/engine.ts). */
  engine: EngineData;
}

/** L4 payload for the 3D floor (locale-resolved; the drawer content comes from `room-views/library.ts`). Posts keep `getPosts()` order (newest first), like the room catalog. */
export interface LibraryData {
  posts: {
    slug: string;
    title: string;
    date: string;
    languages: ("en" | "id")[];
    /** Content tags (the constellation links posts that share one). */
    tags: string[];
    /** External (Medium) posts have no `/blog` page. */
    url: string | null;
  }[];
  /** Papers and the thesis (newest first). */
  research: { id: string; title: string; kind: "paper" | "thesis"; year: number; publisher: string | null }[];
  /** Google Scholar style profile metrics with their date, if published. */
  researchMetrics: { source: string; citations: number; hIndex: number; asOf: string } | null;
  /** Models and datasets (the models shelf, room `L4:publications`). */
  models: { id: string; title: string; kind: "model" | "dataset"; venue: string | null; year: number }[];
  talks: { id: string; title: string; event: string; date: string; role: "speaker" | "author" | "trainer" }[];
  /** Topic Constellation (build-time topic index, `TOPICS` order): label for this locale, item count and the L4 rooms it lights. */
  topics: LibraryTopic[];
  /** Certification study guides (`content/study-guides.json`, file order): the books of the end plaza's Study Vault. */
  guides: { slug: string; spine: string; issuer: string; code: string | null }[];
}

/** One topic of the L4 Topic Constellation. */
export interface LibraryTopic {
  slug: string;
  label: string;
  /** Posts, papers, models and talks on the topic. */
  count: number;
  /** Rooms the topic lights: post stations and the Research, Models and Talks desks (distinct, item order). */
  rooms: RoomId[];
}

/** RF payload for the 3D floor (locale-resolved; the drawer content comes from `room-views/roof.ts`). */
export interface RoofData {
  availability: string;
  email: string;
  channels: { id: "linkedin" | "github" | "huggingface" | "medium" | "googleScholar" | "ieeeXplore"; label: string; href: string }[];
  /** Profile timezone (for example "GMT+7"), shown next to the location on the about card. */
  timezone: string;
  /** One-line intro for the about card (`profile.subheadline`). */
  subheadline: string;
}

/** B1 Engine Room payload (locale-resolved): one entry per bay in `ENGINE_BAYS` order; `room` is null for the dark bays. */
export interface EngineData {
  bays: { id: EngineBayId; room: RoomId | null; title: string }[];
}

/** L1 Highlights Hall payload (locale-resolved; drawer content comes from `room-views/highlights.ts`). */
export interface HighlightsData {
  /** The Page View landing's featured projects (`pickFeaturedPods` over site order), each with its 480 px cover thumbnail. */
  projects: { slug: string; title: string; wing: Wing; thumb: string }[];
}
