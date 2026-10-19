import type { Locale } from "@/content/schema";
import type { ExperienceData } from "./types";

/**
 * Client side of the 3D page data. The gated pages no longer serialize `ExperienceData` into their RSC payload
 * (about 9 KB br on every gated page): the build writes it to `/data/experience/{locale}.json` (src/app/data) and
 * ExperienceGate fetches it alongside the 3D chunk, with the content hash from the page (`experienceDataVersion`)
 * so the 1 h `/data/*` cache never outlives a deploy.
 */

/** The static file name under `/data/experience/` (shared by the build route and this loader). */
export const EXPERIENCE_DATA_FILE = (locale: string) => `${locale}.json`;

/** The versioned URL of a locale's 3D page data. */
export const experienceDataUrl = (locale: Locale, version: string) => `/data/experience/${EXPERIENCE_DATA_FILE(locale)}?v=${version}`;

interface Entry {
  version: string;
  data: ExperienceData | null;
  pending: Promise<ExperienceData> | null;
}

const cache = new Map<Locale, Entry>();

/**
 * Fetches a locale's 3D page data once per page load (a client navigation between gated pages reuses it). A failed
 * load rejects and is forgotten, so the next call (the gate's crash recovery or Retry 3D) fetches again.
 */
export function loadExperienceData(locale: Locale, version: string): Promise<ExperienceData> {
  let entry = cache.get(locale);
  if (!entry || entry.version !== version) {
    entry = { version, data: null, pending: null };
    cache.set(locale, entry);
  }
  if (entry.data) return Promise.resolve(entry.data);
  if (!entry.pending) {
    const current = entry;
    const pending = fetch(experienceDataUrl(locale, version))
      .then((res) => {
        if (!res.ok) throw new Error(`3D page data: HTTP ${res.status}`);
        return res.json() as Promise<ExperienceData>;
      })
      .then(
        (data) => {
          current.data = data;
          return data;
        },
        (error: unknown) => {
          current.pending = null;
          throw error;
        },
      );
    current.pending = pending;
    return pending;
  }
  return entry.pending;
}

/** The data when it already loaded for this locale and version (a remount renders at once), else null. */
export function peekExperienceData(locale: Locale, version: string): ExperienceData | null {
  const entry = cache.get(locale);
  return entry && entry.version === version ? entry.data : null;
}

/** Test hook: forgets every loaded or pending file. */
export function resetExperienceData() {
  cache.clear();
}
