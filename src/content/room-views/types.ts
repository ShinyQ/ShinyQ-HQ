import type { Accent, Confidence, DrawerTab, FloorId, RoomId } from "@/content/schema";
import type { RoomKind } from "@/experience/missions/rooms";

/**
 * Glass Drawer content contract. One `RoomView` per room, locale-resolved and serializable, built on
 * the server by the per-floor builders in this folder and shipped as `/data/rooms/{locale}.json`.
 * Types only: the client imports this file without pulling in zod or the dataset.
 */

export interface RoomMetric {
  value: string;
  label: string;
  /** How the number was measured, e.g. "controlled A/B, n=4". */
  context?: string;
  confidence?: Confidence;
}

export interface RoomLinkItem {
  title: string;
  /** Logo path under public/ shown before the title (contact channels, model hubs). */
  logo?: string;
  meta?: string;
  /** Locale-less internal route ("/labs/x") or an absolute https URL. */
  href?: string;
  external?: boolean;
}

/** A block of the Overview tab or of the single-pane variant. */
export interface RoomSection {
  title?: string;
  body?: string;
  bullets?: string[];
  items?: RoomLinkItem[];
  chips?: string[];
  /** Logo per chip (same order as `chips`), null when the chip is text-only. */
  chipLogos?: (string | null)[];
}

export type ArchitectureNodeKind = "client" | "service" | "ai" | "data" | "human" | "external";

export interface RoomArchitecture {
  nodes: { id: string; label: string; sublabel?: string; layer: number; row: number; kind: ArchitectureNodeKind }[];
  edges: { from: string; to: string; label?: string; async?: boolean }[];
}

export interface RoomStackItem {
  name: string;
  /** Logo path under public/ when one exists; the drawer falls back to a text chip. */
  logo?: string;
}

/** Same shape as `GalleryImage` (`@/content/media`) so the drawer can reuse `Gallery`. */
export interface RoomImage {
  src: string;
  /** 480 px thumbnail next to `src`. */
  thumb: string;
  alt: string;
  width: number;
  height: number;
}

/** One paper or thesis on the Research shelf (Phase 5a). */
export interface RoomResearchItem {
  id: string;
  title: string;
  /** Localized kind label ("Paper", "Thesis"). */
  kind: string;
  authors: string[];
  venue?: string;
  /** Localized date or year. */
  date: string;
  doi?: string;
  /** Primary link (DOI resolver or repository). */
  href?: string;
  pdf?: string;
  code?: string;
  /** Localized citation line with its source and date. */
  citations?: string;
  summary?: string;
}

export interface RoomView {
  id: RoomId;
  floor: FloorId;
  kind: RoomKind;
  /** Mono room code in the header, e.g. "L3:voice-ai-contact-center". */
  code: string;
  title: string;
  subtitle?: string;
  /** Organization logo shown next to the subtitle (career rooms). */
  logo?: { src: string; alt: string };
  /** Header metadata line items (role, period, client, org). */
  meta: string[];
  /** Small badges next to the code (tier, wing, type). */
  badges: { label: string; accent: Accent }[];
  accent: Accent;
  /** "tabs" for pods (Overview, Architecture, Results, Stack); "single" for every other room. */
  variant: "tabs" | "single";
  /** Overview tab (tabs) or the whole pane (single). */
  sections: RoomSection[];
  /** Up to 4; the Overview shows the first 3. */
  metrics: RoomMetric[];
  architecture?: RoomArchitecture;
  stack: RoomStackItem[];
  gallery: RoomImage[];
  /** Locale-less route of the full page ("Full case study"). */
  page?: string;
  /** External page (posts hosted elsewhere). */
  external?: string;
  /** Related room on another floor ("See the case study on L3", "See it on L2"). */
  link?: { room: RoomId; label: string };
  /** Hero pods with at least 3 architecture nodes: "View architecture" opens the hologram. */
  hologram: boolean;
  prev?: RoomId;
  next?: RoomId;
  /** Tabs this room supports (tabs variant). */
  tabs: DrawerTab[];
  /** Research shelf: papers with authors, venue and DOI; `self` is the owner's name to highlight. */
  research?: { items: RoomResearchItem[]; self: string; profiles: RoomLinkItem[]; metrics?: string };
}

export type RoomViews = Record<RoomId, RoomView>;
