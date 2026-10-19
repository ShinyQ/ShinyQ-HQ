import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { buildExperienceData } from "@/content/experience";
import type { Locale } from "@/content/schema";
import type { ExperienceData } from "./types";

/**
 * Server helper for the 3D page data: the payload with localized floor names. The build writes it to
 * `/data/experience/{locale}.json` (src/app/data); the gated pages pass only `experienceDataVersion(locale)`.
 */
export async function experienceDataFor(locale: Locale): Promise<ExperienceData> {
  const tf = await getTranslations({ locale, namespace: "floors" });
  return buildExperienceData(locale, { L1: tf("L1"), L2: tf("L2"), L3: tf("L3"), L4: tf("L4"), RF: tf("RF") });
}

/** Short content hash of a locale's 3D page data, appended to its URL so a cached copy never outlives a deploy. */
export async function experienceDataVersion(locale: Locale): Promise<string> {
  return createHash("sha256").update(JSON.stringify(await experienceDataFor(locale))).digest("hex").slice(0, 12);
}
