import type { Pod, SkillGroup } from "./schema";
import { normalizeTech } from "./tech";
import { EXTRA_RING, GROUP_RING, LANGUAGE_RING, MISC_TECH, REACTOR_RINGS, TECH_ALIASES, type ReactorRingId } from "./tech-rings";

/**
 * L3 Tech Reactor index (design 2026-10-14, section 2): every tech used by a pod, merged across
 * spellings, on one of the six reactor rings, with the pods that use it. Built at build time from
 * `pods[].stack` and the CV skill groups (`skills`), never edited by hand: the drawer view
 * (`room-views/labs.ts`) and the HUD index (Cmd-K) both read it. `tests/unit/tech-index.test.ts`
 * fails when a pod tech maps to no ring and is not in `MISC_TECH`.
 */
export type { ReactorRingId } from "./tech-rings";

export interface TechEntry {
  /** Stable kebab slug of the canonical key (the `#labs-tech=` deep link). */
  slug: string;
  /** Most used spelling in content (ties keep the first in content order). */
  name: string;
  ring: ReactorRingId;
  /** Pod slugs in site order (`orderPods`). */
  pods: string[];
}

export interface TechIndex {
  /** All six rings in `REACTOR_RINGS` order; techs by project count, then name. */
  rings: { id: ReactorRingId; techs: TechEntry[] }[];
  /** Spellings left out on purpose (`MISC_TECH`). */
  misc: string[];
}

/** Normalized, alias-resolved key: every spelling of one tech gets the same key. */
export function techKey(name: string): string {
  const key = normalizeTech(name);
  return TECH_ALIASES[key] ?? key;
}

export function techSlug(name: string): string {
  return techKey(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Ring of a tech: its CV skill group first, then the explicit map; null when it fits none. */
export function ringOf(name: string, skills: readonly SkillGroup[]): ReactorRingId | null {
  const key = techKey(name);
  for (const group of skills) {
    if (!group.items.some((item) => techKey(item) === key)) continue;
    const ring = group.id === "languages" ? LANGUAGE_RING[key] : GROUP_RING[group.id];
    if (ring) return ring;
  }
  return EXTRA_RING[key] ?? null;
}

/** `pods` in site order (`getPods()`); the order carries into every tech's pod list. */
export function buildTechIndex(pods: readonly Pick<Pod, "slug" | "stack">[], skills: readonly SkillGroup[]): TechIndex {
  const byKey = new Map<string, { ring: ReactorRingId; pods: string[]; spellings: Map<string, number> }>();
  const misc = new Set<string>();
  for (const pod of pods) {
    const seen = new Set<string>();
    for (const name of pod.stack) {
      const key = techKey(name);
      if (MISC_TECH.has(key)) {
        misc.add(name);
        continue;
      }
      const ring = ringOf(name, skills);
      if (!ring) continue;
      let entry = byKey.get(key);
      if (!entry) byKey.set(key, (entry = { ring, pods: [], spellings: new Map() }));
      entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
      if (!seen.has(key)) {
        seen.add(key);
        entry.pods.push(pod.slug);
      }
    }
  }
  const techs: TechEntry[] = [...byKey.entries()].map(([key, e]) => {
    let name = "";
    let best = 0;
    for (const [spelling, n] of e.spellings) if (n > best) [name, best] = [spelling, n];
    return { slug: techSlug(key), name, ring: e.ring, pods: e.pods };
  });
  return {
    rings: REACTOR_RINGS.map((id) => ({
      id,
      techs: techs.filter((t) => t.ring === id).sort((a, b) => b.pods.length - a.pods.length || a.name.localeCompare(b.name, "en")),
    })),
    misc: [...misc],
  };
}
