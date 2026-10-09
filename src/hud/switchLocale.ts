import type { FloorId, Locale } from "@/content/schema";
import { READY_FLOORS } from "@/experience/config";
import { LOCALE_STORAGE_KEY } from "@/i18n/locale";
import { serializeHQUrl } from "@/lib/url-sync";
import { getHQStore } from "@/store/useHQStore";

export const RESUME_KEY = "hq:resume";
const RESUME_TTL_MS = 60_000;

export interface Resume {
  floor: FloorId;
  x: number;
  z: number;
  at: number;
}

/** Reloads the page in the other language and resumes on the same floor without boot or intro. */
export function switchLocale(target: Locale) {
  const s = getHQStore().getState();
  try {
    const resume: Resume = { floor: s.floor, x: s.rover.x, z: s.rover.z, at: Date.now() };
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(resume));
    localStorage.setItem(LOCALE_STORAGE_KEY, target);
  } catch {
    // Storage can be unavailable; the switch still navigates.
  }
  s.setLocale(target);
  const floor = READY_FLOORS.includes(s.floor) ? s.floor : "L1";
  // A full load re-initializes next-intl with the other locale's messages; the resume record skips boot and intro.
  // The open room (if it has its own page on this floor) survives the switch; its route reopens it.
  const room = s.activeRoom && s.activeRoom.startsWith(`${floor}:`) ? s.activeRoom : null;
  const path = `${serializeHQUrl({ locale: target, floor, activeRoom: room, view: null })}${window.location.search}`;
  window.location.assign(new URL(path, window.location.origin).href);
}

/** Reads and clears a fresh resume record. */
export function takeResume(): Resume | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    if (!raw) return null;
    const resume = JSON.parse(raw) as Resume;
    return Date.now() - resume.at < RESUME_TTL_MS ? resume : null;
  } catch {
    return null;
  }
}
