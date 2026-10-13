import { createHash } from "node:crypto";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { LocalizedText, Mission, SiteContent } from "@/content/schema";
import type { PaletteActionId } from "./palette-types";
import { buildRoomCatalog, buildYears, type RoomInfo, type StructuralLabels, type StructuralRoom, type YearInfo } from "@/experience/missions/rooms";
import { buildTechIndex } from "@/content/tech-index";
import type { ReactorRingId } from "@/content/tech-rings";
import { orderPods } from "@/content/selectors";

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
  };
}

/** Short content hash of the index, appended to its URL so a cached copy never outlives a deploy. */
export function hudIndexVersion(index: HudIndex): string {
  return createHash("sha256").update(JSON.stringify(index)).digest("hex").slice(0, 12);
}
