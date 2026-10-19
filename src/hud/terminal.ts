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

/** Rover menu order: the mission catalog by `order` (content/site-content.json), at most 9 options (keys 1 to 9). */
export function orderTerminalMissions(missions: readonly Mission[]): Mission[] {
  return [...missions].sort((a, b) => a.order - b.order).slice(0, 9);
}

export const TERMINAL_SEEN_KEY = "hq:terminal-seen";

/** Records that the Rover menu was opened (it lives here, not in the lazy RoverTerminal chunk, so MissionHud can call it). */
export function markTerminalSeen() {
  try {
    localStorage.setItem(TERMINAL_SEEN_KEY, "1");
  } catch {
    // Storage can be unavailable (private mode); the terminal may auto-open again.
  }
}
