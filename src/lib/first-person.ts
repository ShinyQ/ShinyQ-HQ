import type { Locale } from "@/content/schema";

/** Owner rule (2026-10-13): mottos, taglines and titles never speak in the first person singular. */
const FIRST_PERSON: Record<Locale, RegExp> = {
  en: /\bI\b|\bI'(?:m|ve|d|ll)\b|\b[Mm]y\b|\bme\b/,
  id: /\b(?:saya|aku)\b/i,
};

export function hasFirstPerson(text: string, locale: Locale): boolean {
  return FIRST_PERSON[locale].test(text);
}
