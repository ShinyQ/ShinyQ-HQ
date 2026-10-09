import { getTranslations } from "next-intl/server";
import { buildExperienceData } from "@/content/experience";
import type { Locale } from "@/content/schema";
import type { ExperienceData } from "./types";

/** Server helper for pages that mount the ExperienceGate: the 3D payload with localized floor names. */
export async function experienceDataFor(locale: Locale): Promise<ExperienceData> {
  const tf = await getTranslations({ locale, namespace: "floors" });
  return buildExperienceData(locale, { L1: tf("L1"), L2: tf("L2"), L3: tf("L3"), L4: tf("L4"), RF: tf("RF") });
}
