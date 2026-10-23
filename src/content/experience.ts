import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { OpsData } from "@/experience/floors/labs/ops";
import type { CareerData, ExperienceData, LabPod } from "@/experience/types";
import { formatPeriod } from "@/lib/format";
import type { PublicFloor } from "@/lib/floors";
import { FLOOR_ROUTE } from "@/lib/url-sync";
import { certViews } from "./cert-views";
import { buildEngineData, buildLibraryData, buildRoofData } from "./experience-floors";
import { buildHighlightsData } from "./highlights";
import {
  getAwards,
  getContent,
  getMissions,
  getPods,
  getPosts,
  getProduction,
  getProfile,
  getPublicRepos,
  getSideProjects,
  getSkills,
  getStats,
  getTimeline,
  getYears,
} from "./load";
import type { FloorId, Locale } from "./schema";
import { roomDataVersions } from "./room-views";
import { shapeUrl } from "./shapes";
import { FIRST_CORRIDOR_YEAR, podHasGallery, podLiveLink, roleLine, wallSkillGroups } from "./selectors";
import { getTechLogo } from "./tech";
import { repoSlug } from "./workshop";

/** L3 Ops Control Room texts ("How I run AI in production"): proof tiles on their screens, alert rule families, live panel labels. */
export function buildOpsData(locale: Locale): OpsData {
  const m = locale === "en" ? en : id;
  const production = getProduction();
  return {
    sign: m.hud.rooms.ops,
    screens: m.production.screens,
    tiles: production.tiles.map((t) => ({ panel: t.panel, value: t.value[locale], label: t.label[locale] })),
    alerts: production.alerts.map((a) => a[locale]),
    live: { ...m.production.live, buckets: m.production.explore },
  };
}

/** L3 pods in site order (`orderPods`) with only what the 3D floor draws (the drawer loads full content separately). */
export function labPods(locale: Locale): LabPod[] {
  return getPods().map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title[locale],
    ...(p.shortTitle ? { shortTitle: p.shortTitle[locale] } : {}),
    tier: p.tier,
    wing: p.wing,
    accent: p.accent,
    hologram: p.hologram,
    order: p.order,
    hasHologramView: p.tier === "hero" && (p.architecture?.nodes.length ?? 0) >= 3,
    hasGallery: podHasGallery(p),
    ...(podLiveLink(p) ? { liveUrl: p.liveUrl } : {}),
  }));
}

/** L2 Career Archive labels for the 3D floor: year rooms, trophy counts and the Workshop annex (appendix 07 section 3). */
export function buildCareerData(locale: Locale): CareerData {
  const awards = new Map<number, number>();
  for (const award of getAwards()) {
    const year = Math.max(FIRST_CORRIDOR_YEAR, Number(award.date.slice(0, 4)));
    awards.set(year, (awards.get(year) ?? 0) + 1);
  }
  return {
    years: getYears().map(({ year, entries }) => ({
      year,
      entries: entries.map((e) => ({
        slug: e.slug,
        type: e.type,
        role: e.role[locale],
        org: e.org,
        period: formatPeriod(e.start, e.end, locale),
        prologue: Number(e.start.slice(0, 4)) < year,
      })),
      awards: awards.get(year) ?? 0,
    })),
    sideProjects: getSideProjects().map((p) => ({ id: p.id, title: p.title, year: p.year ?? null })),
    repos: getPublicRepos().map((r) => ({ slug: repoSlug(r.name), name: r.name, language: r.language, stars: r.stars })),
    shapes: shapeUrl("L2"),
  };
}

/** Rooms the tower will contain once every floor is built (used for the visited n/N counter). */
export function countRooms(): number {
  const pods = getPods().filter((p) => p.tier !== "listed").length;
  const roofRooms = 2; // contact terminals and the CV kiosk
  return getTimeline().length + pods + getPosts().length + roofRooms;
}

/**
 * Builds the small, locale-resolved, serializable payload that the 3D chunk
 * needs, so the client bundle never ships the full dataset or zod.
 */
export function buildExperienceData(locale: Locale, floorNames: Record<PublicFloor, string>): ExperienceData {
  getContent();
  const profile = getProfile();
  const names: Record<FloorId, string> = { ...floorNames, B1: (locale === "en" ? en : id).engine.floor };
  return {
    locale,
    profile: {
      name: profile.name,
      headline: profile.headline[locale],
      role: roleLine(profile.currentRole, locale),
      motto: profile.subheadline[locale],
      location: profile.location[locale],
    },
    stats: getStats().map((s) => ({ id: s.id, value: s.value, label: s.label[locale] })),
    skills: wallSkillGroups(getSkills()).map((g) => ({ id: g.id, label: g.label[locale], items: [...g.items], logos: g.items.map((name) => getTechLogo(name)?.src ?? null) })),
    certifications: certViews(locale),
    missions: getMissions().map((m) => ({ id: m.id, label: m.label[locale] })),
    floors: Object.fromEntries(
      (Object.keys(FLOOR_ROUTE) as FloorId[]).map((f) => [f, { name: names[f], route: FLOOR_ROUTE[f] }]),
    ) as ExperienceData["floors"],
    years: getYears().map((y) => y.year),
    roomCount: countRooms(),
    roomData: roomDataVersions(locale),
    labs: { pods: labPods(locale), wings: (locale === "en" ? en : id).common.wing, ops: buildOpsData(locale), shapes: shapeUrl("L3") },
    career: buildCareerData(locale),
    library: buildLibraryData(locale),
    roof: buildRoofData(locale),
    highlights: buildHighlightsData(locale),
    engine: buildEngineData(locale),
  };
}
