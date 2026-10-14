/**
 * Pure planning helpers for the e2e scripts (no Bun, no Playwright, so Vitest can run them):
 * - specsForChanges: which Playwright specs cover a set of changed paths (`bun run e2e:changed`).
 * - assignShard: a balanced split of the test list for CI shards (`bun run e2e:shard`).
 */

/** Fast specs that cover routes, SEO, deploy rules and the game-first load (about 1 to 2 minutes). */
export const SMOKE_SPECS = ["static-routes", "seo", "deploy", "boot-first", "pageview"] as const;

/** Every spec in the default (non-screenshot) suite. */
export const ALL_SPECS = [
  "ask",
  "boost",
  "boot-first",
  "camera",
  "career",
  "deploy",
  "drawer-solid",
  "experience",
  "fast-return",
  "gallery",
  "gpu",
  "highlights",
  "hud",
  "interact",
  "labs",
  "library-roof",
  "lifecycle",
  "memory",
  "missions",
  "motion",
  "onboarding",
  "pads",
  "pageview",
  "perf-probes",
  "production",
  "reactor",
  "ride",
  "roof",
  "seo",
  "spectacle",
  "static-routes",
  "visit",
  "visits",
  "walk",
  "workshop",
] as const;

export type Spec = (typeof ALL_SPECS)[number];

interface Rule {
  /** Matched against the repo-relative POSIX path. */
  test: RegExp;
  /** Specs to run, `"all"` for the full suite, or `[]` when the path needs no e2e run. */
  specs: Spec[] | "all";
}

/**
 * First matching rule wins, so specific paths come before their parent folders.
 * Keep this in sync with the "Fast verification" section of AGENTS.md.
 */
export const RULES: Rule[] = [
  // Test infrastructure and dependencies: anything can break.
  { test: /^(package\.json|bun\.lock|next\.config\.ts|playwright\.config\.ts|tsconfig\.json)$/, specs: "all" },
  { test: /^e2e\/(hq|routes|budgets)\.ts$/, specs: "all" },
  { test: /^e2e\/(screenshots|pageview-visual|camera-visual|visual-gate|delivery-visual)\.spec\.ts$|^e2e\/vclock\.ts$/, specs: [] },
  // Perf lane (PERF=1): `bun run e2e:perf` and the CI `3D perf gates` job run it, never the regular suite.
  { test: /^e2e\/perf\//, specs: [] },
  // Not part of the site or the e2e suite.
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-|floor-thumbs|og-stills|og-before-after|visual-gate|perf-|measure-delivery|shot-diff|ci-status)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },

  // Ask the HQ: the Pages Function, its client, the knowledge pack builder and the UI that only it uses.
  // The performance beacon Function is unit tested (tests/unit/rum-endpoint.test.ts); no e2e covers Functions locally.
  { test: /^functions\/(api\/rum|_lib\/rum)\.ts$/, specs: [] },
  // Public visit stats: the Functions and the hq-stats Worker are unit tested (tests/stats/); the client
  // beacon and the opt-out aware Web Analytics guard run on every page.
  { test: /^functions\/(api\/(visit|stats)|_lib\/(visit|stats|askStats))\.ts$|^workers\/|^scripts\/stats-/, specs: [] },
  { test: /^src\/lib\/stats\/|^src\/components\/(VisitBeacon|Analytics)\.tsx$/, specs: ["visit", "pageview"] },
  { test: /^functions\//, specs: ["ask"] },
  { test: /^src\/ask\/|^scripts\/build-knowledge\.ts$/, specs: ["ask"] },
  { test: /^content\/ask\//, specs: ["ask"] },
  { test: /^src\/components\/page\/AskEntry/, specs: ["ask", "pageview"] },
  // The landing's way into the tower: exercised from page view (experience) and on a software renderer (boot-first).
  { test: /^src\/components\/page\/EnterHqButton\.tsx$/, specs: ["boot-first", "experience", "pageview"] },
  // The dock is mounted on every page and over the 3D HUD (top-right pill).
  { test: /^src\/hud\/ask\//, specs: ["ask", "experience", "pageview"] },

  // Dev-only pages and the walkable floors prototype (never in the production export).
  { test: /^src\/app\/\[locale\]\/dev\/|^src\/experience\/prototype\//, specs: [] },

  // Certifications: Page View index and the shared preview card, which the 3D Lobby wall opens too.
  { test: /^src\/components\/certs\/|^src\/content\/cert(s|-views)\.ts$/, specs: ["pageview", "experience", "static-routes"] },

  // Guided walks and the road kit (autopilot follows roads once a floor has one).
  { test: /^src\/experience\/missions\/walks?\.ts$|^src\/hud\/walk\//, specs: ["walk", "missions", "hud", "onboarding"] },
  { test: /^src\/experience\/nav\/navgrid\.ts$/, specs: ["career", "experience", "missions", "walk"] },
  { test: /^src\/experience\/nav\/(road|roadGeometry|space)\.ts$|^src\/experience\/fx\/RoadMarkings\.tsx$/, specs: ["walk", "experience", "pads"] },

  // Fast return (F1): Express Return pads, the 25 u rule and the beam into the car.
  { test: /^src\/experience\/nav\/fastReturn\.ts$|^src\/experience\/fx\/ReturnPadSign\.tsx$/, specs: ["fast-return", "pads", "ride", "experience"] },
  // Floor pads: elevator call pads, L2 year teleporters, the beam, their pickers and thumbnails.
  { test: /^src\/experience\/nav\/(pads|teleport)\.ts$|^src\/experience\/fx\/(PadGlow|TeleportBeam)\.tsx$|^src\/hud\/pads\/|^public\/floors\//, specs: ["pads", "fast-return", "experience", "workshop"] },
  // Point-and-go: the registry, pick logic, the hit layer and its HUD status (pads and career rooms are clicked through it).
  { test: /^src\/experience\/interact\/|^src\/hud\/InteractStatus\.tsx$/, specs: ["interact", "experience", "pads", "career", "fast-return"] },

  // Rover's dialog, the first-session tour, floor lines and the "!" hint bubbles.
  // Motion setting: the preference, its HUD control and the one-time hint.
  { test: /^src\/lib\/(motion|reduced-motion)\.ts$|^src\/hud\/(MotionControl\.tsx|dialog\/MotionHintLayer\.tsx)$/, specs: ["motion", "hud", "ride", "onboarding"] },
  { test: /^src\/hud\/dialog\/|^src\/experience\/hints\//, specs: ["onboarding", "experience", "walk", "camera"] },

  // L1 Highlights Hall: layout, scenery, payload, drawer content and body; its Quick tour runs in the walk spec.
  {
    test: /^src\/experience\/floors\/lobby\/(stations|hallLayout|hallContent|hallGallery|hallSolids|hallStage|gateSweep|HighlightsHall|HallFx|hallInteract)\.tsx?$|^src\/content\/(highlights|room-views\/highlights)\.ts$|^src\/hud\/drawer\/HighlightsBody\.tsx$/,
    specs: ["experience", "highlights", "walk"],
  },

  // Renderer memory: the probe, the disposal hook and floor mounting (round 5, SP8).
  { test: /^src\/experience\/(fx\/useDispose\.ts|scene\/(memoryProbe|sharedResources)\.ts)$/, specs: ["experience", "memory"] },
  // Floor mounting also decides renderer memory; the tower and FloorLevel keep their camera, ride and gpu specs.
  { test: /^src\/experience\/tower\/FloorLevel\.tsx$/, specs: ["camera", "career", "experience", "gpu", "memory", "ride"] },
  { test: /^src\/experience\/tower\/(Tower|near)\.tsx?$/, specs: ["experience", "gpu", "memory", "ride"] },
  // Frame loop, cover pauses, crash recovery and the ride/beam clock (round 5).
  { test: /^src\/experience\/(scene\/(FrameLoop|framePacer|cover|coverWatch)\.tsx?|CanvasBoundary\.tsx|recovery\.ts)$/, specs: ["experience", "lifecycle", "pads"] },
  { test: /^src\/experience\/tower\/rideClock\.ts$/, specs: ["experience", "gpu", "lifecycle", "pads", "ride"] },

  // "How I run AI in production" (2026-10-14): the L3 Ops Control Room, its drawer body and live panel, and the About section.
  {
    test: /^src\/experience\/floors\/labs\/(OpsRoom\.tsx|ops\.ts|opsLive\.ts|opsHash\.ts)$|^src\/hud\/drawer\/OpsBody\.tsx$|^src\/components\/(page\/Production|AlertExcerpt)\.tsx$|^e2e\/production\.spec\.ts$/,
    specs: ["production", "labs", "pageview"],
  },
  // 3D floors. L3 Tech Reactor: its drawer body, the tech index and the reactor's room view (also the Ops Control Room's).
  { test: /^src\/hud\/drawer\/ReactorBody\.tsx$|^src\/content\/(tech-index|tech-rings|room-views\/labs)\.ts$/, specs: ["reactor", "labs", "production"] },
  { test: /^src\/experience\/floors\/labs\//, specs: ["labs", "gallery", "walk", "spectacle", "fast-return", "reactor", "production"] },
  { test: /^src\/experience\/floors\/career\//, specs: ["career", "pads", "spectacle", "fast-return", "workshop"] },
  // L4 Writing: its walk ("Read my writing") reads the layout, so the walk spec runs too.
  { test: /^src\/experience\/floors\/library\/|^src\/experience\/floors\/Library\.tsx$/, specs: ["library-roof", "walk", "spectacle"] },
  // Floating signs and the shared holo shader (spectacle round: floor words, L2 horizon, L3 reactor and waterfalls).
  { test: /^src\/experience\/fx\/(FloatingSign\.tsx|signLayout\.ts|holoFx\.ts)$/, specs: ["spectacle", "career", "labs", "library-roof", "visits"] },
  // Generated geo data (Natural Earth): covered by unit tests and the visits spec through its output.
  { test: /^scripts\/visits-geo\.ts$/, specs: [] },
  // Public visit stats (S2): the shared model, store, panel and placements, the RF observatory and the L1 tile.
  {
    test: /^src\/(lib\/visits\/|components\/stats\/|experience\/visits3d\.ts$|experience\/floors\/roof\/(VisitsStation\.tsx|observatory\.ts|visitsRoom\.ts)$|hud\/drawer\/VisitsBody\.tsx$)|^e2e\/visits\.spec\.ts$/,
    specs: ["visits", "roof", "pageview"],
  },
  // RF roof deck: its walk ("Meet me") reads the layout, and the elevator call pad sits on the deck.
  { test: /^src\/experience\/floors\/roof\/|^src\/experience\/floors\/Roof\.tsx$/, specs: ["library-roof", "pads", "roof", "visits", "walk"] },
  { test: /^src\/content\/room-views\/roof\.ts$/, specs: ["library-roof", "roof", "visits"] },
  { test: /^src\/experience\/floors\/lobby\//, specs: ["experience", "highlights"] },
  { test: /^src\/experience\/floors\//, specs: ["experience", "labs", "career", "library-roof"] },
  { test: /^src\/experience\/missions\//, specs: ["missions", "experience", "library-roof"] },
  // Boost (owner pick: trails, body lean and squat, camera kick, streaks, sparks; the touch toggle).
  {
    test: /^src\/experience\/fx\/(BoostFx\.tsx|boostConfig\.ts|boostTrail\.ts|sparks\.ts|streaks\.ts)$|^src\/experience\/rover\/(boost|bodyDynamics)\.ts$|^src\/experience\/camera\/boostView\.ts$|^src\/hud\/BoostButton\.tsx$/,
    specs: ["boost", "experience", "hud", "gpu"],
  },
  // Signs that turn around when the camera is behind them (L2), the scene probes and the ghost floors above (none in first person).
  { test: /^src\/experience\/fx\/(Readable\.tsx|readableFlip\.ts|probes\.ts|HoloIcon\.tsx)$|^src\/experience\/tower\/FloorLevel\.tsx$/, specs: ["camera", "career", "experience", "ride", "gpu", "spectacle"] },
  { test: /^public\/fonts\/|^src\/assets\/fonts\/troika\/|^src\/experience\/(troika-fonts\.json|text-config\.ts)$|^scripts\/troika-/, specs: ["experience", "highlights", "boot-first", "ride"] },
  // Elevator ride smoothness (R5 P6) and the GPU work around it (R5 P2): the ride clock, floor preparation,
  // content visibility, precompile and troika sync tracking.
  { test: /^src\/experience\/(tower\/|scene\/(Director\.tsx|precompile\.ts|programPins\.ts|warmState\.ts|ProgramWarmup\.tsx)$)/, specs: ["ride", "experience", "gpu", "fast-return", "missions"] },
  { test: /^src\/experience\/camera\//, specs: ["camera", "experience", "career", "ride"] },
  // Round 5 camera work: input, the rover body fade and the view buttons.
  { test: /^src\/experience\/input\/|^src\/experience\/rover\/(Rover\.tsx|fade\.ts|runtime\.ts)$|^src\/hud\/ViewControls\.tsx$/, specs: ["camera", "experience"] },
  // Quiet boot: header and nav links stop prefetching under the boot cover (pageview still covers the header).
  { test: /^src\/components\/(QuietLink|NavLink|SiteHeader)\.tsx$/, specs: ["boot-first", "pageview", "static-routes"] },
  { test: /^src\/experience\/ExperienceGate\.tsx$/, specs: ["boot-first", "experience", "lifecycle", "onboarding"] },
  // Measurement in the 3D view: render counters, the ?perf=1 overlay, timeline marks, the RUM probe.
  { test: /^src\/experience\/perf\/|^src\/lib\/(perf-marks\.ts|rum\/)/, specs: ["perf-probes", "experience"] },
  { test: /^src\/experience\/(ExperienceGate\.tsx|gate-tier\.ts|introContinue\.ts)$|^src\/lib\/(boot-first|gpu-tier|intro-session)\.ts$|^src\/components\/Boot(Cover|Card)\.tsx$|^src\/experience\/boot-signals\.ts$|^src\/components\/(QuietLink|NavLink|SiteHeader)\.tsx$|^src\/hud\/BootOverlay\.tsx$/, specs: ["boot-first", "experience", "onboarding"] },
  // The Page view glyph: the boot card link and the HUD top bar button.
  { test: /^src\/components\/PageViewIcon\.tsx$/, specs: ["boot-first", "hud", "experience"] },
  // Render budget, quality safety net, precompile, content visibility and the tower's mount set.
  { test: /^src\/experience\/(scene|tower)\//, specs: ["experience", "gpu"] },
  { test: /^src\/experience\//, specs: ["experience"] },
  { test: /^src\/store\//, specs: ["experience", "lifecycle", "motion"] },

  // HUD over the canvas.
  { test: /^src\/hud\/drawer\//, specs: ["labs", "gallery", "career", "library-roof", "drawer-solid", "hud", "lifecycle"] },
  { test: /^src\/hud\/(RoverTerminal|MissionHud|CommandPalette)\.tsx$|^src\/hud\/(search|events|palette-types)\.ts$/, specs: ["ask", "experience", "missions", "drawer-solid", "lifecycle"] },
  { test: /^src\/hud\//, specs: ["experience", "missions", "drawer-solid", "hud"] },
  // Shared tokens (.glass, .glass-solid) style both the HUD and the pages.
  { test: /^src\/app\/globals\.css$/, specs: ["drawer-solid", "pageview", "static-routes"] },

  // Static pages, SEO and hosting.
  { test: /^src\/app\/(sitemap|robots)\.ts$|^src\/app\/og\/|^src\/lib\/(site|jsonld|og|og-cards|og-layout|og-assets|og-encode|seo|first-person|routes)\.tsx?$|^scripts\/og-(check|meta)\.ts$|^public\/og-assets\//, specs: ["seo", "static-routes"] },
  { test: /^src\/app\/data\//, specs: ["labs", "library-roof"] },
  { test: /^public\/_(headers|redirects)$|^scripts\/(serve-static|root-redirect)\.ts$/, specs: ["deploy", "static-routes"] },
  { test: /^public\/brand\/|^src\/lib\/brand-photo\.ts$|^src\/components\/page\/Portrait\.tsx$/, specs: ["pageview", "seo", "static-routes", "hud", "highlights"] },
  // Full-screen panels that pause the canvas (data-hq-cover).
  { test: /^src\/components\/(Modal|Lightbox)\.tsx$/, specs: ["gallery", "lifecycle", "pageview"] },
  { test: /^src\/components\/(Gallery|Lightbox|Chip)\.tsx$|^src\/content\/(media|tech)\.ts$|^public\/(media|tech)\//, specs: ["gallery", "pageview"] },
  { test: /^src\/(app|components)\/|^src\/content\/pageview\.ts$/, specs: ["pageview", "static-routes", "gallery"] },
  { test: /^src\/i18n\//, specs: ["static-routes", "experience"] },
  { test: /^src\/lib\/audio\//, specs: ["experience", "pageview"] },
  { test: /^src\/lib\/(url-sync|viewport|reduced-motion)/, specs: ["experience"] },
  { test: /^src\/lib\//, specs: ["static-routes", "pageview"] },
  { test: /^(content|messages)\/|^src\/content\//, specs: ["static-routes", "pageview", "seo"] },
  { test: /^public\//, specs: ["static-routes"] },
];

const SPEC_FILE = /^e2e\/([a-z0-9-]+)\.spec\.ts$/;

export interface ChangePlan {
  /** `"all"`: run the whole suite. Otherwise the spec names (without `.spec.ts`), sorted. */
  specs: Spec[] | "all";
  /** Changed paths no rule covered; they fall back to the smoke specs. */
  unmatched: string[];
}

/** Maps changed paths to the e2e specs that cover them. Unknown paths fall back to SMOKE_SPECS. */
export function specsForChanges(files: readonly string[]): ChangePlan {
  const specs = new Set<Spec>();
  const unmatched: string[] = [];
  for (const raw of files) {
    const file = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    const own = SPEC_FILE.exec(file)?.[1];
    if (own && (ALL_SPECS as readonly string[]).includes(own)) {
      specs.add(own as Spec);
      continue;
    }
    const rule = RULES.find((r) => r.test.test(file));
    if (!rule) {
      unmatched.push(file);
      continue;
    }
    if (rule.specs === "all") return { specs: "all", unmatched: [] };
    for (const s of rule.specs) specs.add(s);
  }
  if (unmatched.length) for (const s of SMOKE_SPECS) specs.add(s);
  return { specs: [...specs].sort(), unmatched };
}

/**
 * Round-robin split of an ordered test list into `total` shards (1-based `index`). Playwright's own
 * `--shard` cuts the list into contiguous blocks, which puts most of the slow 3D specs into one or
 * two shards; interleaving spreads every spec across all shards.
 */
export function assignShard<T>(tests: readonly T[], index: number, total: number): T[] {
  if (!Number.isInteger(total) || total < 1) throw new Error(`invalid shard total ${total}`);
  if (!Number.isInteger(index) || index < 1 || index > total) throw new Error(`invalid shard ${index}/${total}`);
  return tests.filter((_, i) => i % total === index - 1);
}

/** Parses "2/4" into { index: 2, total: 4 }. */
export function parseShard(value: string): { index: number; total: number } {
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (!match) throw new Error(`expected a shard like 2/4, got "${value}"`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  assignShard([], index, total);
  return { index, total };
}
