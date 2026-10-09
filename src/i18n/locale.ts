import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import type { Locale } from "@/content/schema";
import { routing } from "./routing";

/** Narrows a route param to a Locale, or renders the 404 page. */
export function assertLocale(value: string): Locale {
  if (!hasLocale(routing.locales, value)) notFound();
  return value;
}

export const LOCALE_STORAGE_KEY = "hq:locale";
