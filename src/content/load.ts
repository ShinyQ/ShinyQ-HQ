import raw from "../../content/site-content.json";
import factsRaw from "../../content/generated/dynamic-facts.json";
import perspectivesRaw from "../../content/perspectives.json";
import { DynamicFactsSchema, type DynamicFacts } from "./dynamic-facts";
import { publishedPerspectives } from "./perspectives";
import { PerspectivesFileSchema, SiteContentSchema, type Locale, type Perspective, type PerspectivesFile, type LocalizedText, type SiteContent, type Stat } from "./schema";
import { groupEntriesByYear, orderPods, sortTimeline } from "./selectors";
import { buildTechIndex, type TechIndex } from "./tech-index";

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

let cachedFacts: DynamicFacts | undefined;

/** Weekly live facts (`content/generated/dynamic-facts.json`, refreshed by refresh-facts.yml). */
export function getDynamicFacts(): DynamicFacts {
  cachedFacts ??= DynamicFactsSchema.parse(factsRaw);
  return cachedFacts;
}

let cachedPerspectives: PerspectivesFile | undefined;

/** The whole perspectives file, drafts included. For checks and tests only: never render it. */
export function getPerspectivesFile(): PerspectivesFile {
  cachedPerspectives ??= PerspectivesFileSchema.parse(perspectivesRaw);
  return cachedPerspectives;
}

/** Approved perspectives only, in file order. Only the Ask knowledge pack reads this (no page renders them). */
export function getPerspectives(): Perspective[] {
  return publishedPerspectives(getPerspectivesFile());
}

/** Stats whose value comes from the live facts, so the stats ring, Page View and Ask agree. */
export const DYNAMIC_STATS: Record<string, (facts: DynamicFacts) => number | undefined> = {
  "github-contributions-365": (facts) => facts.github?.contributionsLastYear,
};

/** Replaces mapped stat values with live facts (en-US grouping, e.g. "7,350"); other stats stay as written. */
export function overlayStats(stats: readonly Stat[], facts: DynamicFacts): Stat[] {
  return stats.map((stat) => {
    const value = DYNAMIC_STATS[stat.id]?.(facts);
    return value === undefined ? stat : { ...stat, value: value.toLocaleString("en-US") };
  });
}

let cachedStats: Stat[] | undefined;

export const getProfile = () => getContent().profile;
export function getStats(): Stat[] {
  cachedStats ??= overlayStats(getContent().stats, getDynamicFacts());
  return cachedStats;
}
export const getSkills = () => getContent().skills;

let cachedTechIndex: TechIndex | undefined;

/** L3 Tech Reactor index (`buildTechIndex`): every pod tech on its ring with the pods that use it, built at build time. */
export function getTechIndex(): TechIndex {
  cachedTechIndex ??= buildTechIndex(getPods(), getSkills());
  return cachedTechIndex;
}
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
  return orderPods(wing ? pods.filter((p) => p.wing === wing) : pods);
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
