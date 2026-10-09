import type { ExperienceData } from "@/experience/types";
import { FLOOR_ROUTE } from "@/lib/url-sync";
import {
  getCertifications,
  getContent,
  getMissions,
  getPods,
  getPosts,
  getProfile,
  getSkills,
  getStats,
  getTimeline,
  getYears,
} from "./load";
import type { FloorId, Locale } from "./schema";

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
  };
}
