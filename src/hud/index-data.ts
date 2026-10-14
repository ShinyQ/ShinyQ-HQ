import { createHash } from "node:crypto";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { LocalizedText, Mission, RoomId, SiteContent, Wing } from "@/content/schema";
import type { PaletteActionId } from "./palette-types";
import { buildRoomCatalog, buildYears, type RoomInfo, type StructuralLabels, type StructuralRoom, type YearInfo } from "@/experience/missions/rooms";
import { buildTechIndex } from "@/content/tech-index";
import type { ReactorRingId } from "@/content/tech-rings";
import { orderPods, podHasGallery } from "@/content/selectors";
import { buildLabsLayout, LABS_WINGS } from "@/experience/floors/labs/layout";
import { buildTopicIndex, topicRooms } from "@/content/topic-index";

/** A Cmd-K "Show projects using X" row: the Tech Reactor pick it makes. */
export interface HudTech {
  slug: string;
  name: string;
  ring: ReactorRingId;
  /** Pod slugs in site order. */
  pods: string[];
  /** "Show projects using X" in both languages. */
  title: LocalizedText;
}

/** A Cmd-K "<wing> projects" row: the wing's directory panel in 3D, `/labs?wing=` on the Classic site. */
export interface HudWing {
  wing: Wing;
  /** "Data and ML projects" in both languages. */
  title: LocalizedText;
  keywords: string[];
  /** The wing's directory panel stop on L3 (null when the floor has no panel for it). */
  stop: { x: number; z: number } | null;
}

/** Search words per wing, besides its names (owner request 2026-10-14 for Data and ML). */
const WING_KEYWORDS: Record<Wing, string[]> = {
  software: ["software", "product", "backend", "full stack", "web"],
  ai: ["ai", "llm", "genai", "agents", "azure"],
  data: ["data", "ml", "machine learning", "data science", "nlp", "forecasting", "sentiment", "analytics", "sains data"],
};

/** A Cmd-K "Show writing about X" row: the Topic Constellation pick it makes. */
export interface HudTopic {
  slug: string;
  label: LocalizedText;
  count: number;
  /** L4 rooms the topic lights. */
  rooms: RoomId[];
  /** "Show writing about X" in both languages. */
  title: LocalizedText;
}

/**
 * Serializable data the client HUD needs. Built on the server so zod and the full dataset stay out of the
 * client bundle, and served as a static file (`/data/hud/index.json`, see src/hud/index-client.ts) so it
 * stays out of every page's HTML too.
 */
export interface HudIndex {
  missions: Mission[];
  rooms: RoomInfo[];
  years: YearInfo[];
  email: string;
  cvFileName: string;
  /** Palette action labels in both languages (the client only loads the current locale's messages). */
  actionLabels: Record<PaletteActionId, LocalizedText>;
  /** L3 Tech Reactor techs (build-time tech index), for the Cmd-K "Show projects using X" rows. */
  techs: HudTech[];
  /** L3 wings with pods, for the Cmd-K "<wing> projects" rows. */
  wings: HudWing[];
  /** L4 Topic Constellation topics (build-time topic index), for the Cmd-K "Show writing about X" rows. */
  topics: HudTopic[];
}

const ACTION_KEYS: Record<PaletteActionId, keyof typeof en.hud.actions> = {
  "view-cv": "viewCv",
  "copy-email": "copyEmail",
  "toggle-language": "toggleLanguage",
  "toggle-sound": "toggleSound",
  "quick-view": "quickView",
  "replay-tutorial": "replayTutorial",
  "toggle-hints": "toggleHints",
  "motion-system": "motionSystem",
  "motion-full": "motionFull",
  "motion-reduced": "motionReduced",
};

export function structuralLabels(): StructuralLabels {
  const keys = Object.keys(en.hud.rooms) as StructuralRoom[];
  return Object.fromEntries(keys.map((key) => [key, { en: en.hud.rooms[key], id: id.hud.rooms[key] }])) as StructuralLabels;
}

export function buildHudIndex(content: SiteContent): HudIndex {
  const techs = buildTechIndex(orderPods(content.floors.labs.pods), content.skills).rings.flatMap((ring) =>
    ring.techs.map((t) => ({
      slug: t.slug,
      name: t.name,
      ring: ring.id,
      pods: t.pods,
      title: { en: en.labs.reactor.show.replace("{tech}", t.name), id: id.labs.reactor.show.replace("{tech}", t.name) },
    })),
  );
  const labs = buildLabsLayout(
    orderPods(content.floors.labs.pods).map((p) => ({ id: p.id, slug: p.slug, title: p.title.en, tier: p.tier, wing: p.wing, accent: p.accent, hologram: p.hologram, order: p.order, hasHologramView: false, hasGallery: podHasGallery(p) })),
  );
  const wings: HudWing[] = LABS_WINGS.filter((wing) => content.floors.labs.pods.some((p) => p.wing === wing)).map((wing) => ({
    wing,
    title: { en: en.labs.wingProjects.replace("{wing}", en.common.wing[wing]), id: id.labs.wingProjects.replace("{wing}", id.common.wing[wing]) },
    keywords: [en.common.wing[wing], id.common.wing[wing], ...WING_KEYWORDS[wing]],
    stop: labs.boards[wing]?.stop ?? null,
  }));
  return {
    missions: [...content.missions].sort((a, b) => a.order - b.order),
    rooms: buildRoomCatalog(content, structuralLabels()),
    years: buildYears(content),
    email: content.floors.roof.contact.email,
    cvFileName: content.floors.roof.cv.fileName,
    actionLabels: Object.fromEntries(
      Object.entries(ACTION_KEYS).map(([action, key]) => [action, { en: en.hud.actions[key], id: id.hud.actions[key] }]),
    ) as Record<PaletteActionId, LocalizedText>,
    techs,
    wings,
    topics: buildTopicIndex(content.floors.library).topics.map((t) => {
      const label = { en: en.library.topics.names[t.slug], id: id.library.topics.names[t.slug] };
      return {
        slug: t.slug,
        label,
        count: t.items.length,
        rooms: topicRooms(t),
        title: { en: en.library.topics.show.replace("{topic}", label.en), id: id.library.topics.show.replace("{topic}", label.id) },
      };
    }),
  };
}

/** Short content hash of the index, appended to its URL so a cached copy never outlives a deploy. */
export function hudIndexVersion(index: HudIndex): string {
  return createHash("sha256").update(JSON.stringify(index)).digest("hex").slice(0, 12);
}
