import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { CareerData, ExperienceData, LabPod } from "@/experience/types";
import { formatPeriod } from "@/lib/format";
import { FLOOR_ROUTE } from "@/lib/url-sync";
import { buildLibraryData, buildRoofData } from "./experience-floors";
import {
  getAwards,
  getCertifications,
  getContent,
  getLibrary,
  getMissions,
  getPods,
  getPosts,
  getProfile,
  getPublicRepos,
  getSideProjects,
  getSkills,
  getStats,
  getTimeline,
  getYears,
} from "./load";
import type { FloorId, Locale } from "./schema";
import { FIRST_CORRIDOR_YEAR } from "./selectors";

/** L3 pods in wing order with only what the 3D floor draws (the drawer loads full content separately). */
export function labPods(locale: Locale): LabPod[] {
  return getPods().map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title[locale],
    tier: p.tier,
    wing: p.wing,
    accent: p.accent,
    hologram: p.hologram,
    order: p.order,
    hasHologramView: p.tier === "hero" && (p.architecture?.nodes.length ?? 0) >= 3,
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
    repos: getPublicRepos().map((r) => r.name),
    models: getLibrary()
      .publications.filter((p) => p.kind === "model")
      .map((p) => p.title),
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
export function buildExperienceData(locale: Locale, floorNames: Record<FloorId, string>): ExperienceData {
  getContent();
  const profile = getProfile();
  return {
    locale,
    profile: {
      name: profile.name,
      monogram: profile.monogram,
      headline: profile.headline[locale],
      role: `${profile.currentRole.title[locale]} · ${profile.currentRole.org}`,
      location: profile.location[locale],
    },
    stats: getStats().map((s) => ({ id: s.id, value: s.value, label: s.label[locale] })),
    skills: getSkills().map((g) => ({ id: g.id, label: g.label[locale], items: [...g.items] })),
    certifications: getCertifications().map((c) => ({
      id: c.id,
      code: c.code ?? null,
      name: c.name,
      issuer: c.issuer,
      status: c.status,
      url: c.credentialUrl ?? null,
    })),
    missions: getMissions().map((m) => ({ id: m.id, label: m.label[locale] })),
    floors: Object.fromEntries(
      (Object.keys(FLOOR_ROUTE) as FloorId[]).map((f) => [f, { name: floorNames[f], route: FLOOR_ROUTE[f] }]),
    ) as ExperienceData["floors"],
    years: getYears().map((y) => y.year),
    roomCount: countRooms(),
    labs: { pods: labPods(locale), wings: (locale === "en" ? en : id).common.wing },
    career: buildCareerData(locale),
    library: buildLibraryData(locale),
    roof: buildRoofData(locale),
  };
}
