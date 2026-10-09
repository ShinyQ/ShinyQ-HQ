import type { LibraryData, RoofData } from "@/experience/types";
import { getLibrary, getPosts, getRoof } from "./load";
import type { Locale } from "./schema";

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
    publications: [...library.publications]
      .sort((a, b) => b.year - a.year)
      .map((p) => ({ id: p.id, title: p.title, kind: p.kind, venue: p.venue ?? null, year: p.year, url: p.url ?? null })),
    talks: [...library.talks]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((t) => ({ id: t.id, title: t.title[locale], event: t.event, date: t.date, role: t.role })),
  };
}

const CHANNEL_LABEL = { linkedin: "LinkedIn", github: "GitHub", huggingface: "Hugging Face", medium: "Medium" } as const;

/** RF payload for the 3D chunk: beacon text and the comms channels. */
export function buildRoofData(locale: Locale): RoofData {
  const { contact, availability } = getRoof();
  const channels = (["linkedin", "github", "huggingface", "medium"] as const).flatMap((id) => {
    const href = contact[id];
    return href ? [{ id, label: CHANNEL_LABEL[id], href }] : [];
  });
  return {
    availability: availability[locale],
    email: contact.email,
    channels,
  };
}
