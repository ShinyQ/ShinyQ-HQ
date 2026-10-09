import type { Locale } from "@/content/schema";

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", id: "id-ID" };

const PRESENT: Record<Locale, string> = { en: "Present", id: "Sekarang" };
const RANGE_JOIN: Record<Locale, string> = { en: "to", id: "hingga" };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/** "2024-06" -> "Jun 2024" (en) or "Jun 2024" (id); "2026-10" -> "Oct 2026" / "Okt 2026". */
export function formatYearMonth(value: string, locale: Locale): string {
  if (value === "present") return PRESENT[locale];
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(".", "");
}

/** "2024-06".."2025-12" -> "Jun 2024 to Dec 2025"; same month collapses to one value. */
export function formatPeriod(start: string, end: string, locale: Locale): string {
  if (start === end) return formatYearMonth(start, locale);
  return `${formatYearMonth(start, locale)} ${RANGE_JOIN[locale]} ${formatYearMonth(end, locale)}`;
}

/** "2025-06-06" -> "6 Jun 2025" (en: "Jun 6, 2025"). */
export function formatDate(value: string, locale: Locale): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(".", "");
}
