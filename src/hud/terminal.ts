import type { Locale, Mission } from "@/content/schema";

export type GreetingKey = "morning" | "afternoon" | "evening" | "night";

/** Time-of-day greeting in the visitor's locale (appendix 02 section 4). ID follows pagi, siang, sore, malam. */
export function greetingKey(hour: number, locale: Locale): GreetingKey {
  if (locale === "id") {
    if (hour >= 4 && hour < 11) return "morning";
    if (hour >= 11 && hour < 15) return "afternoon";
    if (hour >= 15 && hour < 18) return "evening";
    return "night";
  }
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const EQUAL_BILLING = ["best-swe", "best-ai"] as const;

/**
 * Terminal order: `best-swe` and `best-ai` always lead, alternating which comes first per visit
 * (equal billing), then the rest in catalog order. At most 8 options (keys 1 to 8).
 */
export function orderTerminalMissions(missions: readonly Mission[], visit: number): Mission[] {
  const sorted = [...missions].sort((a, b) => a.order - b.order);
  const lead = EQUAL_BILLING.map((id) => sorted.find((m) => m.id === id)).filter((m): m is Mission => Boolean(m));
  if (visit % 2 === 1) lead.reverse();
  const rest = sorted.filter((m) => !lead.includes(m));
  return [...lead, ...rest].slice(0, 8);
}
