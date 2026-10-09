import type { LibraryData, RoofData } from "@/experience/types";
import { getLibrary, getPosts, getRoof } from "./load";
import type { Locale } from "./schema";
import { isResearch } from "./selectors";

/** L4 payload for the 3D chunk. Post order matches `buildRoomCatalog` (newest first). */
export function buildLibraryData(locale: Locale): LibraryData {
  const library = getLibrary();
  return {
    posts: getPosts().map((p) => ({
      slug: p.slug,
      title: p.title[locale],
      date: p.date,
      languages: [...p.languages],
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

/** RF payload for the 3D chunk: beacon text and the comms channels. */
export function buildRoofData(locale: Locale): RoofData {
  const { contact, availability } = getRoof();
  const channels = (Object.keys(CHANNEL_LABEL) as (keyof typeof CHANNEL_LABEL)[]).flatMap((id) => {
    const href = contact[id];
    return href ? [{ id, label: CHANNEL_LABEL[id], href }] : [];
  });
  return {
    availability: availability[locale],
    email: contact.email,
    channels,
  };
}
