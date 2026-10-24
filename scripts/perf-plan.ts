/**
 * Pure perf lane selection (no Bun, no Playwright, so Vitest can run it): which 3D perf gates
 * (`e2e/perf/*.spec.ts`) a set of changed 3D files needs, and the Playwright `--grep` that runs them.
 * scripts/ci-plan.ts calls it for pull requests; pushes, dispatches and the nightly run the whole lane.
 */

export const FLOORS = ["L1", "L2", "L3", "L4", "RF", "B1"] as const;
export type Floor = (typeof FLOORS)[number];
export type PerfKey = "bytes" | "boot" | "hover" | "boost" | "memory" | "guides" | `floor:${Floor}` | `ride:${Floor}`;

/** Every key, in canonical (sorted) order. */
export const ALL_PERF_KEYS: readonly PerfKey[] = [
  "boost",
  "boot",
  "bytes",
  ...FLOORS.map((f) => `floor:${f}` as const),
  "guides",
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
    guides: "the study guide reader stays",
  };
  return fixed[key];
}

/** First match per file wins; the keys of all files are unioned. Unmatched files get ALL_BUT_MEMORY. */
const PERF_RULES: [RegExp, readonly PerfKey[]][] = [
  // On the main 3D path (config, interact registry, Experience, store): the full lane, which already holds the B1 keys.
  [/^src\/experience\/(floors\/engine\/layout|b1)\.ts$/, ALL_BUT_MEMORY],
  [/^src\/experience\/(floors\/(engine\/|EngineRoom\.tsx$|chunks\/engine\.ts$)|b1\.ts$)|^src\/hud\/drawer\/EngineBody\.tsx$|^src\/content\/room-views\/engine\.ts$/, ["bytes", "floor:B1", "ride:B1"]],
  [
    /^src\/experience\/(scene\/(Effects|postComposer|Scene|memoryProbe|sharedResources|postHandle|quality|QualityController|qualityStore)\.tsx?|fx\/(useDispose|geometry|materials|holoFx)\.ts|floors\/(floorChunks|floorPrefetch|lazyFloors|FloorChunkPrefetch)\.tsx?|floors\/chunks\/|tower\/(FloorLevel|Tower|near)\.tsx?|Experience\.tsx|qualityRemount\.ts|CanvasBoundary\.tsx|recovery\.ts)/,
    ALL_PERF_KEYS,
  ],
  [/^src\/experience\/prototype\//, []],
  // The office's shared client modules (the 3D office chunk and, later, the Classic card; the protocol also reaches
  // the main path through the Lobby room views): the bytes gate, L1 and B1 (its gate loads the office before the ride).
  // src/lib/office/fixtures.ts ships no client code (tests and e2e only), so it moves no gate.
  [/^src\/lib\/office\/(poll|model|protocol)\.ts$/, ["bytes", "floor:L1", "floor:B1"]],
  // The office scene, its drawer body and its main path layout and shell: the Lobby keys plus B1.
  [/^src\/experience\/floors\/lobby\/(office\/|office(Layout|Shell)\.ts$)/, ["boot", "bytes", "floor:L1", "floor:B1", "hover"]],
  [/^src\/experience\/floors\/(lobby\/|Lobby\.tsx$)|^public\/atlas\/|^src\/experience\/logo-atlas\.ts$/, ["bytes", "floor:L1", "boot", "hover"]],
  // The unique hologram loader (L2, L3 and L4 fetch their shapes after the first frame).
  [/^src\/experience\/fx\/shapes\.ts$/, ["bytes", "floor:L2", "floor:L3", "floor:L4"]],
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

/**
 * The server helper that builds the serialized 3D payload (`experienceDataFor`). It ships no client code: a module
 * it reaches moves the perf gates only through the payload fields the floors render, so it is not a 3D importer.
 */
export const PAYLOAD_BUILDER = "src/experience/gate-data.ts";

const LOBBY: readonly PerfKey[] = ["boot", "bytes", "floor:L1", "hover"];

/**
 * The module to gate map for shared (non-3D) modules, first match wins (scripts/ci-plan.ts `sharedPerfKeys`).
 * A rule gives the keys a module moves on its own, in the payload included; the keys of the 3D files that import
 * it are added on top. A module without a rule that reaches the payload builder gets ALL_BUT_MEMORY.
 */
const SHARED_PERF_RULES: [RegExp, readonly PerfKey[]][] = [
  // Ask client, protocol and thread state: the HUD Ask dock, mounted on the boot path; no floor renders them
  // (perspectives.ts only validates citations with src/ask/protocol.ts).
  [/^src\/ask\//, ["boot", "bytes"]],
  // Certifications reach the payload only as `certifications` (cert-views.ts), which the Lobby cert wall renders.
  [/^src\/content\/(certs|cert-views)\.ts$/, LOBBY],
  // `highlights`: the Lobby Highlights Hall and the HUD onboarding.
  [/^src\/content\/highlights\.ts$/, LOBBY],
  // Hologram shapes: build-time only; they reach the payload as the three shapes URLs, read by L2, L3 and L4.
  [/^src\/content\/(shapes|sculptures)\.ts$|^src\/lib\/svg-strokes\.ts$/, ["floor:L2", "floor:L3", "floor:L4"]],
];

/** The keys of the first SHARED_PERF_RULES or PERF_RULES rule that names a shared module, or null when none does. */
export function sharedRuleKeys(file: string): readonly PerfKey[] | null {
  return (SHARED_PERF_RULES.find(([re]) => re.test(file)) ?? PERF_RULES.find(([re]) => re.test(file)))?.[1] ?? null;
}

/**
 * Page code behind the study guide reader gate (`e2e/perf/guide-reader.spec.ts`, key `guides`): the shared PDF reader
 * (`src/components/pdf-reader/`), pdf.js loading and the dialogs and page that open it. Not 3D code, so scripts/ci-plan.ts adds the key on its own.
 */
const GUIDE_READER_FILES = /^src\/components\/(guides|pdf-reader)\/|^src\/content\/guides\.ts$|^src\/components\/(DialogHost\.tsx|dialog-loaders\.ts)$|^src\/app\/\[locale\]\/library\/page\.tsx$/;

/** The non-3D perf keys a page file moves (`guides` for the study guide reader), [] for any other file. */
export function pagePerfKeys(file: string): PerfKey[] {
  return GUIDE_READER_FILES.test(file) ? ["guides"] : [];
}

/** Playwright `--grep` for the keys; `""` when the keys are every key (run the whole lane). Throws on no keys. */
export function perfGrep(keys: readonly PerfKey[]): string {
  if (keys.length === 0) throw new Error("perfGrep: no perf keys (plan perf: false instead)");
  if (ALL_PERF_KEYS.every((k) => keys.includes(k))) return "";
  return `(${ALL_PERF_KEYS.filter((k) => keys.includes(k)).map(fragment).join("|")})`;
}
