import raw from "../../content/site-content.json";
import { SiteContentSchema, type Locale, type LocalizedText, type SiteContent } from "./schema";
import { groupEntriesByYear, sortPods, sortTimeline } from "./selectors";

let cached: SiteContent | undefined;

/** Parses and caches the dataset. Invalid content throws, which fails `next build`. */
export function getContent(): SiteContent {
  cached ??= SiteContentSchema.parse(raw);
  return cached;
}

/** Picks the string for a locale from a LocalizedText value. */
export function tr(text: LocalizedText, locale: Locale): string {
  return text[locale];
}

export const getProfile = () => getContent().profile;
export const getStats = () => getContent().stats;
export const getSkills = () => getContent().skills;
export const getCertifications = () => getContent().certifications;
export const getAwards = () => [...getContent().awards].sort((a, b) => b.date.localeCompare(a.date));
export const getContact = () => getContent().floors.roof.contact;
export const getRoof = () => getContent().floors.roof;
export const getLibrary = () => getContent().floors.library;
export const getSideProjects = () => getContent().sideProjects;
export const getPublicRepos = () => [...getContent().publicRepos].sort((a, b) => b.stars - a.stars);
export const getMissions = () => [...getContent().missions].sort((a, b) => a.order - b.order);

export function getPods(wing?: "software" | "ai") {
  const pods = getContent().floors.labs.pods;
  return sortPods(wing ? pods.filter((p) => p.wing === wing) : pods);
}

export function getPod(slug: string) {
  return getContent().floors.labs.pods.find((p) => p.slug === slug);
}

/** Timeline entries, oldest first (the L2 corridor order). */
export function getTimeline() {
  return sortTimeline(getContent().floors.careerArchive.entries);
}

export function getTimelineEntry(slug: string) {
  return getContent().floors.careerArchive.entries.find((e) => e.slug === slug);
}

export function getTimelineEntryById(id: string) {
  return getContent().floors.careerArchive.entries.find((e) => e.id === id);
}

export function getYears() {
  return groupEntriesByYear(getContent().floors.careerArchive.entries);
}

/** Posts newest first. */
export function getPosts() {
  return [...getContent().floors.library.posts].sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string) {
  return getContent().floors.library.posts.find((p) => p.slug === slug);
}
