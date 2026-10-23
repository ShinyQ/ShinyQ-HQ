import { ENGINE_BAYS, engineRoom } from "@/experience/floors/engine/layout";
import type { EngineData, LibraryData, RoofData } from "@/experience/types";
import { getBuildStory } from "./build-story";
import { guideViews } from "./guide-views";
import { getLibrary, getPosts, getProfile, getRoof, getTopicIndex } from "./load";
import { messages } from "./room-views/shared";
import { topicRooms } from "./topic-index";
import type { Locale } from "./schema";
import { isResearch } from "./selectors";
import { shapeUrl } from "./shapes";

/** L4 payload for the 3D chunk. Post order matches `buildRoomCatalog` (newest first). */
export function buildLibraryData(locale: Locale): LibraryData {
  const library = getLibrary();
  return {
    posts: getPosts().map((p) => ({
      slug: p.slug,
      title: p.title[locale],
      date: p.date,
      languages: [...p.languages],
      tags: [...p.tags],
      url: p.url ?? null,
    })),
    research: library.publications
      .filter((p): p is typeof p & { kind: "paper" | "thesis" } => isResearch(p.kind))
      .sort((a, b) => (b.date ?? String(b.year)).localeCompare(a.date ?? String(a.year)))
      .map((p) => ({ id: p.id, title: p.title, kind: p.kind, year: p.year, publisher: p.publisher ?? null })),
    researchMetrics: library.researchMetrics ? { ...library.researchMetrics } : null,
    models: library.publications
      .filter((p): p is typeof p & { kind: "model" | "dataset" } => !isResearch(p.kind))
      .sort((a, b) => b.year - a.year)
      .map((p) => ({ id: p.id, title: p.title, kind: p.kind, venue: p.venue ?? null, year: p.year })),
    talks: [...library.talks]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((t) => ({ id: t.id, title: t.title[locale], event: t.event, date: t.date, role: t.role })),
    topics: getTopicIndex().topics.map((t) => ({ slug: t.slug, label: messages(locale).library.topics.names[t.slug], count: t.items.length, rooms: topicRooms(t) })),
    guides: guideViews(locale).map(({ slug, spine, issuer, code }) => ({ slug, spine, issuer, code })),
    shapes: shapeUrl("L4"),
  };
}

const CHANNEL_LABEL = {
  linkedin: "LinkedIn",
  github: "GitHub",
  huggingface: "Hugging Face",
  medium: "Medium",
  googleScholar: "Google Scholar",
  ieeeXplore: "IEEE Xplore",
} as const;

/** RF payload for the 3D chunk: availability, the comms channels and the about card's timezone and intro. */
export function buildRoofData(locale: Locale): RoofData {
  const { contact, availability } = getRoof();
  const profile = getProfile();
  const channels = (Object.keys(CHANNEL_LABEL) as (keyof typeof CHANNEL_LABEL)[]).flatMap((id) => {
    const href = contact[id];
    return href ? [{ id, label: CHANNEL_LABEL[id], href }] : [];
  });
  return {
    availability: availability[locale],
    email: contact.email,
    channels,
    timezone: profile.timezone,
    subheadline: profile.subheadline[locale],
  };
}

/** B1 Engine Room bay titles from the build story, one per station, and the reactor's drawer title. */
export function buildEngineData(locale: Locale): EngineData {
  const story = getBuildStory();
  return { bays: ENGINE_BAYS.map((id) => ({ id, room: engineRoom(id), title: story.stations[id].title[locale] })), reactor: messages(locale).build.reactor.title };
}
