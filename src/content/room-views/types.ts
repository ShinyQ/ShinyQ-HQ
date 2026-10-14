import type { VisitsLabels } from "@/lib/visits/labels";
import type { Accent, DrawerTab, FloorId, RoomId } from "@/content/schema";
import type { RoomKind } from "@/experience/missions/rooms";
import type { CareerType } from "@/experience/types";
import type { PaperPreview } from "../citation";
import type { ReactorRingId } from "../tech-rings";
import type { TopicItemKind } from "../topic-index";

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
  /** Paper preview modal data (abstract, citation formats, Scholar link). */
  preview: PaperPreview;
}

/**
 * A card that rides to another room (Highlights Hall: a project on L3, a role on L2). Locale-resolved;
 * `group` is the heading the card is listed under ("Employment", "Freelance").
 */
export interface RoomCard {
  room: RoomId;
  title: string;
  subtitle?: string;
  meta?: string;
  group?: string;
  image?: RoomImage;
  /** Career rooms: the Neon line type icon in its `CAREER_TONE`. */
  type?: CareerType;
  /** Project cards: the public live site (`podLiveLink(pod)?.href`, R4-J), shown as "Visit live site". */
  live?: string;
}

/** One tech on a Tech Reactor ring: its pods (slugs in site order) are the projects that use it. */
export interface RoomReactorTech {
  slug: string;
  name: string;
  logo?: string;
  pods: string[];
}

/** L3 Tech Reactor drawer (`ReactorBody`): six rings of techs from the build-time tech index. */
export interface RoomReactor {
  rings: { id: ReactorRingId; label: string; accent: Accent; techs: RoomReactorTech[] }[];
  /** Every pod a tech lists: title, wing label, and whether it is docked on the floor (listed pods sit on the directory). */
  pods: Record<string, { title: string; wing: string; docked: boolean }>;
}

/** One piece on a topic: its room on L4 (a post station or a desk) and its title. */
export interface RoomTopicItem {
  room: RoomId;
  title: string;
  kind: TopicItemKind;
}

/** L4 Topic Constellation drawer (`TopicsBody`): every topic from the build-time topic index with its pieces. */
export interface RoomTopics {
  topics: { slug: string; label: string; items: RoomTopicItem[] }[];
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
  /** Small badges next to the code (tier, wing, type). `type` draws the career type icon in its neon tone instead of the accent. */
  badges: { label: string; accent: Accent; type?: CareerType }[];
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
  /** External page (posts hosted elsewhere, Workshop projects and repos). */
  external?: string;
  /** Footer label for `external` (locale-resolved); posts keep "Read post". */
  externalLabel?: string;
  /** Pods with a public live site (R4-J): "Visit live site" in the footer, new tab. Already allowlisted. */
  live?: string;
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
  /** Highlights Hall: cards that ride to their room (`HighlightsBody`). */
  cards?: RoomCard[];
  /** L3 Tech Reactor: rings, techs and project counts (`ReactorBody`). */
  reactor?: RoomReactor;
  /** L4 Topic Constellation: topics with their pieces (`TopicsBody`). */
  topics?: RoomTopics;
  /** L1:visits: labels the live stats panel needs (`VisitsBody`); the numbers are fetched on the client. */
  visits?: VisitsLabels;
  /** L3:ops: the observability section (`OpsBody`); live numbers are fetched on the client. */
  ops?: RoomOps;
}

/** L3:ops, the Ops Control Room (`OpsBody`): "How I run AI in production"; tiles ride in `metrics`, case studies in `cards`. */
export interface RoomOps {
  intro: string;
  points: { lead: string; text: string }[];
  outro: string;
  /** Masked Bicep excerpt of one alert rule. */
  excerpt?: { caption: string; code: string };
}

export type RoomViews = Record<RoomId, RoomView>;
