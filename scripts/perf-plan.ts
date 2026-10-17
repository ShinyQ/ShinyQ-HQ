/**
 * Pure perf lane selection (no Bun, no Playwright, so Vitest can run it): which 3D perf gates
 * (`e2e/perf/*.spec.ts`) a set of changed 3D files needs, and the Playwright `--grep` that runs them.
 * scripts/ci-plan.ts calls it for pull requests; pushes, dispatches and the nightly run the whole lane.
 */

export const FLOORS = ["L1", "L2", "L3", "L4", "RF"] as const;
export type Floor = (typeof FLOORS)[number];
export type PerfKey = "bytes" | "boot" | "hover" | "boost" | "memory" | `floor:${Floor}` | `ride:${Floor}`;

/** Every key, in canonical (sorted) order. */
export const ALL_PERF_KEYS: readonly PerfKey[] = [
  "boost",
  "boot",
  "bytes",
  ...FLOORS.map((f) => `floor:${f}` as const),
  "hover",
  "memory",
  ...FLOORS.map((f) => `ride:${f}` as const),
];
export const ALL_BUT_MEMORY: readonly PerfKey[] = ALL_PERF_KEYS.filter((k) => k !== "memory");

/** A grep fragment per key, matched against the perf lane test titles. */
function fragment(key: PerfKey): string {
  if (key.startsWith("floor:")) return `${key.slice(6)} (full|lite): settled`;
  if (key.startsWith("ride:")) {
    const f = key.slice(5);
    return `the ride (${f} to \\S+|\\S+ to ${f}) stays`;
  }
  const fixed: Record<string, string> = {
    bytes: "3D JS after the gate",
    boot: "boot and intro stay",
    hover: "hovering a target",
    boost: "boosting stays",
    memory: "round trips leave renderer memory",
  };
  return fixed[key];
}

/** First match per file wins; the keys of all files are unioned. Unmatched files get ALL_BUT_MEMORY. */
const PERF_RULES: [RegExp, readonly PerfKey[]][] = [
  [
    /^src\/experience\/(scene\/(Effects|Scene|memoryProbe|sharedResources|postHandle|quality|QualityController|qualityStore)\.tsx?|fx\/(useDispose|geometry|materials|holoFx)\.ts|floors\/(floorChunks|floorPrefetch|lazyFloors|FloorChunkPrefetch)\.tsx?|floors\/chunks\/|tower\/(FloorLevel|Tower|near)\.tsx?|Experience\.tsx|qualityRemount\.ts|CanvasBoundary\.tsx|recovery\.ts)/,
    ALL_PERF_KEYS,
  ],
  [/^src\/experience\/prototype\//, []],
  [/^src\/experience\/floors\/(lobby\/|Lobby\.tsx$)/, ["bytes", "floor:L1", "boot", "hover"]],
  [/^src\/experience\/floors\/(career\/|CareerArchive\.tsx$)/, ["bytes", "floor:L2", "ride:L2"]],
  [/^src\/experience\/floors\/(labs\/|Labs\.tsx$)/, ["bytes", "floor:L3", "ride:L3"]],
  [/^src\/experience\/floors\/(library\/|Library\.tsx$)/, ["bytes", "floor:L4", "ride:L4"]],
  [/^src\/experience\/floors\/(roof\/|Roof\.tsx$)/, ["bytes", "floor:RF", "ride:RF"]],
  [/^src\/experience\/floors\/(filterHash|filterUrl)\.ts$/, ["bytes", "floor:L3", "floor:L4"]],
  [/^src\/hud\/|^public\/floors\//, ["bytes"]],
  [/^src\/store\/|^src\/experience\/perf\//, ["bytes", "boot"]],
  [/^src\/experience\/interact\//, ["bytes", "hover"]],
  [/^src\/experience\/(rover\/|fx\/(BoostFx|boostConfig|boostTrail|sparks|streaks)\.tsx?$|camera\/boostView\.ts$)/, ["bytes", "boost", "boot"]],
];

/** Keys a set of 3D-relevant files needs, sorted and unique. Files that match no rule get ALL_BUT_MEMORY. */
export function perfKeysFor(files: readonly string[]): PerfKey[] {
  const keys = new Set<PerfKey>();
  for (const file of files) {
    const rule = PERF_RULES.find(([re]) => re.test(file));
    for (const k of rule ? rule[1] : ALL_BUT_MEMORY) keys.add(k);
  }
  return ALL_PERF_KEYS.filter((k) => keys.has(k));
}

/** Playwright `--grep` for the keys; `""` when the keys are every key (run the whole lane). */
export function perfGrep(keys: readonly PerfKey[]): string {
  if (ALL_PERF_KEYS.every((k) => keys.includes(k))) return "";
  return `(${ALL_PERF_KEYS.filter((k) => keys.includes(k)).map(fragment).join("|")})`;
}
