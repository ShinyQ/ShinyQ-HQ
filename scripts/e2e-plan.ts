/**
 * Pure planning helpers for the e2e scripts (no Bun, no Playwright, so Vitest can run them):
 * - specsForChanges: which Playwright specs cover a set of changed paths (`bun run e2e:changed`).
 * - planShards: a duration-balanced split of the test list for CI shards (`bun run e2e:shard`), from the
 *   per-test seconds in e2e/durations.json; assignShard (round-robin) is the fallback without durations.
 * - listTestIds, parseListReporter, normalizeRunnerSpeed, medianDurations: the test ids of a `playwright test
 *   --list` report and the per-test seconds of CI logs, scaled to a median-speed runner
 *   (`scripts/e2e-durations.ts` refreshes e2e/durations.json).
 */

/** Fast specs that cover routes, SEO, deploy rules and the game-first load (about 1 to 2 minutes). */
export const SMOKE_SPECS = ["static-routes", "seo", "deploy", "boot-first", "pageview"] as const;

/** Every spec in the default (non-screenshot) suite. */
export const ALL_SPECS = [
  "ambience",
  "arrivals",
  "ask",
  "b1-unlock",
  "boost",
  "boot-first",
  "camera",
  "career",
  "csp",
  "daynight",
  "deploy",
  "drawer-solid",
  "engine-room",
  "experience",
  "fast-return",
  "floor-chunks",
  "gallery",
  "gpu",
  "guides",
  "guides-vault",
  "highlights",
  "hud",
  "hud-corners",
  "idle-cadence",
  "interact",
  "labs",
  "labs-data",
  "labs-paths",
  "library-labels",
  "library-roof",
  "library-shelves",
  "lifecycle",
  "memory",
  "missions",
  "motion",
  "not-found",
  "office",
  "office-classic",
  "onboarding",
  "pads",
  "pageview",
  "perf-probes",
  "phone-first",
  "production",
  "reactor",
  "ride",
  "rover-idle",
  "roof",
  "sdf-fallback",
  "seo",
  "shapes",
  "spectacle",
  "static-routes",
  "time-travel",
  "topics",
  "view-links",
  "visit",
  "visit-live",
  "visits",
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
 * First matching rule wins, so specific paths come before their parent folders (`ALSO_RULES` below add specs on top).
 * Keep this in sync with the "Fast verification" section of docs/agents/performance.md.
 */
export const RULES: Rule[] = [
  // Test infrastructure and dependencies: anything can break.
  { test: /^(package\.json|bun\.lock|next\.config\.ts|playwright\.config\.ts|tsconfig\.json)$/, specs: "all" },
  { test: /^e2e\/(hq|routes|budgets)\.ts$/, specs: "all" },
  { test: /^e2e\/(screenshots|pageview-visual|camera-visual|visual-gate|delivery-visual)\.spec\.ts$|^e2e\/vclock\.ts$/, specs: [] },
  // CI shard timings (scripts/e2e-shard.ts): they change which shard runs a test, never what it checks.
  { test: /^e2e\/durations\.json$/, specs: [] },
  // Perf lane (PERF=1): `bun run e2e:perf` and the CI `3D perf gates` job run it, never the regular suite.
  { test: /^e2e\/perf\//, specs: [] },
  // The generated study guide PDF (with its byte-range route) only the guides specs use.
  { test: /^e2e\/fixtures\/guide-pdf\.ts$/, specs: ["guides", "guides-vault"] },
  // Not part of the site or the e2e suite.
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-|build-facts|floor-thumbs|og-stills|visual-gate|perf-|shot-diff|ci-status|merge-gate|rollback|flaky-report)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },
  // Offline tools (captures, Ask evaluation and upkeep, media and PDF renders, deploy and uptime checks, the docs index): never part of the export.
  {
    test: /^scripts\/(arrival-shots|ask-embed|ask-eval|ask-pack|ask-samples|ask-staleness|b1-reactor-shots|b1-shots|brand-marks|brand-wordmark|capture-dev|ci-nightly|content-gap|cv-pages|deploy-smoke|docs-index|intro-shots|media-sizes|office-shots|paper-pages|pdf-pages|provision-ask|purge-ask-logs|readme-hero|refresh-facts|sky-shots|study-guides|subset-fonts|title-case|uptime|check-client-chunks)\./,
    specs: [],
  },
  // Build-time scans of the export: the script policy and the deploy rules.
  { test: /^scripts\/(scan-export|injected-analytics)\.ts$/, specs: ["deploy", "csp"] },

  // Ask the HQ: the Pages Function, its client, the knowledge pack builder and the UI that only it uses.
  // The performance beacon Function is unit tested (tests/unit/rum-endpoint.test.ts); no e2e covers Functions locally.
  { test: /^functions\/(api\/rum|_lib\/rum)\.ts$/, specs: [] },
  // L1 Agent Office (3D, part 3 of the office): the layout and the shell on the main path, the lazy scene and drawer
  // body chunks, the shared client modules (the poller, the model, the protocol the scene and the room views import,
  // the fixtures the e2e snapshots share), the HUD chips host and the e2e fixtures. The spawn is within the office's
  // load radius, so the Lobby specs (point-and-go, the tour, the Corners control counts with the chips) see the office
  // too. Before the backend rule below.
  {
    test: /^src\/experience\/floors\/lobby\/(office\/|office(Layout|Shell)\.ts$)|^src\/lib\/office\/(poll|model|fixtures|protocol)\.ts$|^src\/hud\/OfficeLayer\.tsx$|^e2e\/office-fixtures\.ts$/,
    specs: ["office", "experience", "highlights", "interact", "onboarding", "hud-corners"],
  },
  // The Classic home card (part 4 of the office, `#office` on the home page): the server section, the lazy shell and
  // the panel chunk.
  { test: /^src\/components\/office\//, specs: ["office-classic", "pageview"] },
  // Agent Office backend (part 1): unit tested in tests/office; the 3D office and the Classic card add their specs.
  { test: /^functions\/(api\/office\/|_lib\/office\.ts$)|^src\/lib\/office\//, specs: [] },
  // Local developer tools (tools/office-relay): unit tested in tests/relay; nothing the site ships.
  { test: /^tools\//, specs: [] },
  // Public visit stats: the Functions and the hq-stats Worker are unit tested (tests/stats/); the client
  // beacon and the automation aware Web Analytics guard run on every page. visit-live runs the real visit and
  // stats Functions behind a page (a fresh tab raises the live count).
  { test: /^functions\/(api\/(visit|stats)|_lib\/(visit|stats))\.ts$/, specs: ["visit-live"] },
  { test: /^functions\/_lib\/askStats\.ts$|^workers\/|^scripts\/stats-/, specs: [] },
  // Study guide PDFs from R2: the Function is unit tested (tests/unit/guides-function.test.ts).
  { test: /^functions\/(api\/guides\/\[slug\]|_lib\/guides)\.ts$/, specs: [] },
  // Inline scripts under the per-page script policy (scripts/csp-hashes.ts): the head boot script, the
  // Web Analytics guard and the / language redirect each need their hash.
  { test: /^src\/components\/Analytics\.tsx$/, specs: ["csp", "boot-first", "static-routes", "visit", "pageview"] },
  { test: /^src\/(lib\/boot-first|app\/\(root\)\/page)\.tsx?$/, specs: ["csp", "boot-first", "static-routes", "experience", "onboarding", "view-links"] },
  { test: /^src\/lib\/stats\/|^src\/components\/(VisitBeacon|Analytics)\.tsx$/, specs: ["visit", "visit-live", "pageview"] },
  { test: /^functions\//, specs: ["ask"] },
  { test: /^src\/ask\/|^scripts\/build-knowledge\.ts$/, specs: ["ask"] },
  { test: /^content\/ask\//, specs: ["ask"] },
  { test: /^src\/components\/page\/AskEntry/, specs: ["ask", "pageview"] },
  // The landing's way into the tower: exercised from page view (experience) and on a software renderer (boot-first).
  { test: /^src\/components\/page\/EnterHqButton\.tsx$/, specs: ["boot-first", "experience", "pageview"] },
  // Corners HUD hosts (Round 8 I): the HUD root, the view controls, the shared modal, Rover's toast and its
  // placement, and the Ask dock's teaser under the minimap shape the corner layout, so each keeps its own
  // specs and adds hud-corners (listed before the folder rules below, which would match first).
  // Hud.tsx also shows the "open the floor page" link for unbuilt floors, which the arrivals tour checks on every built floor.
  { test: /^src\/hud\/Hud\.tsx$/, specs: ["experience", "missions", "drawer-solid", "hud", "hud-corners", "arrivals"] },
  { test: /^src\/hud\/ViewControls\.tsx$/, specs: ["camera", "experience", "hud-corners"] },
  { test: /^src\/components\/Modal\.tsx$/, specs: ["gallery", "lifecycle", "pageview", "hud-corners"] },
  // B1 unlock (PR 3): the unlock moment, the locked floor rows and their pickers. The mappings these files had before stay in ALSO_RULES.
  { test: /^src\/hud\/dialog\/(EngineUnlockLayer\.tsx|engineRoomAction\.ts)$|^src\/hud\/(floorRows\.ts|FloorButtons\.tsx)$|^src\/hud\/pads\//, specs: ["b1-unlock", "hud-corners", "hud", "pads"] },
  { test: /^src\/hud\/dialog\/(DialogBox\.tsx|placement\.ts)$/, specs: ["onboarding", "experience", "camera", "hud-corners"] },
  { test: /^src\/hud\/ask\/AskDock\.tsx$/, specs: ["ask", "experience", "pageview", "hud-corners"] },
  // The dock is mounted on every page and over the 3D HUD (top-right pill).
  { test: /^src\/hud\/ask\//, specs: ["ask", "experience", "pageview"] },

  // Dev-only pages and the walkable floors prototype (never in the production export).
  { test: /^src\/app\/\[locale\]\/dev\/|^src\/experience\/prototype\//, specs: [] },

  // Certifications: Page View index and the shared preview card, which the 3D Lobby wall opens too.
  { test: /^src\/components\/certs\/|^src\/content\/cert(s|-views)\.ts$/, specs: ["pageview", "experience", "static-routes"] },

  // The navgrid and the road kit (autopilot follows roads once a floor has one).
  { test: /^src\/experience\/nav\/navgrid\.ts$/, specs: ["career", "experience", "missions"] },
  { test: /^src\/experience\/nav\/(road|roadGeometry|space)\.ts$|^src\/experience\/fx\/RoadMarkings\.tsx$/, specs: ["experience", "pads"] },

  // Fast return (F1): Express Return pads, the 40 u rule and the beam into the car.
  { test: /^src\/experience\/nav\/fastReturn\.ts$|^src\/experience\/fx\/ReturnPadSign\.tsx$/, specs: ["fast-return", "pads", "ride", "experience"] },
  // Floor pads: elevator call pads, L2 year teleporters, the beam, their pickers and thumbnails.
  { test: /^src\/experience\/nav\/(pads|teleport)\.ts$|^src\/experience\/fx\/(PadGlow|TeleportBeam)\.tsx$|^src\/hud\/pads\/|^public\/floors\//, specs: ["pads", "fast-return", "experience", "workshop"] },
  // Point-and-go: the registry, pick logic, the hit layer and its HUD status (pads and career rooms are clicked through it).
  { test: /^src\/experience\/interact\/|^src\/hud\/InteractStatus\.tsx$/, specs: ["interact", "experience", "pads", "career", "fast-return"] },

  // Rover's dialog, the first-session tour, floor lines and the "!" hint bubbles.
  // Motion setting: the preference (default Full) and its HUD control.
  { test: /^src\/lib\/(motion|reduced-motion)\.ts$|^src\/hud\/MotionControl\.tsx$/, specs: ["motion", "hud", "ride", "onboarding"] },
  { test: /^src\/hud\/dialog\/|^src\/experience\/hints\//, specs: ["onboarding", "experience", "camera"] },

  // L1 Highlights Hall: layout, scenery, payload, drawer content and body.
  {
    test: /^src\/experience\/floors\/lobby\/(stations|hallLayout|hallContent|hallGallery|hallSolids|hallStage|gateSweep|HighlightsHall|HallFx|hallInteract)\.tsx?$|^src\/content\/(highlights|room-views\/highlights)\.ts$|^src\/hud\/drawer\/HighlightsBody\.tsx$/,
    specs: ["experience", "highlights"],
  },

  // Renderer memory: the probe, the disposal hook and floor mounting (round 5, SP8).
  { test: /^src\/experience\/(fx\/useDispose\.ts|scene\/(memoryProbe|sharedResources)\.ts)$/, specs: ["experience", "memory"] },
  // Floor mounting also decides renderer memory; the tower and FloorLevel keep their camera, ride and gpu specs.
  { test: /^src\/experience\/tower\/FloorLevel\.tsx$/, specs: ["camera", "career", "experience", "gpu", "memory", "ride"] },
  { test: /^src\/experience\/tower\/(Tower|near)\.tsx?$/, specs: ["experience", "gpu", "memory", "ride"] },
  // Frame loop, cover pauses, crash recovery and the ride/beam clock (round 5).
  { test: /^src\/experience\/(scene\/(FrameLoop|framePacer|cover|coverWatch|idle)\.tsx?|CanvasBoundary\.tsx|recovery\.ts)$/, specs: ["experience", "idle-cadence", "lifecycle", "pads"] },
  { test: /^src\/experience\/tower\/rideClock\.ts$/, specs: ["experience", "gpu", "lifecycle", "pads", "ride"] },

  // "How I run AI in production" (2026-10-14): the L3 Ops Control Room, its drawer body and live panel, and the About section.
  {
    test: /^src\/experience\/floors\/labs\/(OpsRoom\.tsx|ops\.ts|opsLive\.ts|opsHash\.ts)$|^src\/hud\/drawer\/OpsBody\.tsx$|^src\/components\/(page\/Production|AlertExcerpt)\.tsx$|^e2e\/production\.spec\.ts$/,
    specs: ["production", "labs", "pageview"],
  },
  // L2 Workshop rooms (benches, skyline bars, retired benches that moved to L3 pods) and the career room views.
  { test: /^src\/content\/(workshop|room-views\/career)\.ts$/, specs: ["workshop", "career", "missions", "pageview"] },
  // 3D floors. L3 Tech Reactor: its drawer body, the tech index and the reactor's room view (also the Ops Control Room's).
  { test: /^src\/hud\/drawer\/ReactorBody\.tsx$|^src\/content\/(tech-index|tech-rings|room-views\/labs)\.ts$/, specs: ["reactor", "labs", "labs-data", "production"] },
  // B1 Engine Room (PR 2): the floor, its layout, chunk, drawers, unlock flag and rows.
  { test: /^src\/experience\/floors\/engine\/layout\.ts$/, specs: ["engine-room", "arrivals", "memory"] },
  { test: /^src\/experience\/floors\/(engine\/|EngineRoom\.tsx$|chunks\/engine\.ts$)|^src\/hud\/drawer\/EngineBody\.tsx$|^src\/content\/room-views\/engine\.ts$|^src\/experience\/b1\.ts$|^src\/hud\/floorRows\.ts$|^e2e\/b1\.ts$/, specs: ["engine-room", "b1-unlock", "floor-chunks", "memory"] },
  // The B1 Stack Halo's atlas (scripts/engine-atlas.ts writes public/atlas/engine.*.webp and engine/engine-atlas.ts).
  { test: /^scripts\/engine-atlas\.(ts|lock\.json)$/, specs: ["engine-room"] },
  // On-demand floor chunks (Round 7 B): loader, lazy wrappers, prefetch and the chunk entries.
  { test: /^src\/experience\/floors\/(floorChunks|floorPrefetch|lazyFloors|FloorChunkPrefetch)\.tsx?$|^src\/experience\/floors\/chunks\//, specs: ["floor-chunks", "ride", "experience", "labs", "library-roof"] },
  // Arrival points and zones (Round 8 J): each floor's layout and the shared config select the arrivals spec too.
  { test: /^src\/experience\/floors\/labs\/layout\.ts$/, specs: ["labs", "labs-data", "labs-paths", "gallery", "spectacle", "fast-return", "reactor", "production", "arrivals"] },
  { test: /^src\/experience\/floors\/labs\//, specs: ["labs", "labs-data", "labs-paths", "gallery", "spectacle", "fast-return", "reactor", "production"] },
  { test: /^src\/experience\/floors\/career\//, specs: ["career", "pads", "spectacle", "fast-return", "workshop", "arrivals"] },
  // L4 Topic Constellation: its drawer body, the topic index, the Classic filter and the library room views.
  { test: /^src\/hud\/drawer\/(TopicsBody|filterParts)\.tsx$|^src\/content\/(topic-index|topic-map|room-views\/library)\.ts$|^src\/components\/page\/TopicFilter\.tsx$/, specs: ["topics", "library-roof", "reactor"] },
  { test: /^src\/experience\/floors\/(filterHash|filterUrl)\.ts$|^src\/experience\/fx\/FilterHighlights\.tsx$/, specs: ["topics", "reactor"] },
  { test: /^src\/experience\/floors\/library\/|^src\/experience\/floors\/Library\.tsx$/, specs: ["library-labels", "library-roof", "library-shelves", "spectacle", "topics", "fast-return", "arrivals"] },
  // Floating signs and the shared holo shader (spectacle round: floor words, L2 horizon, L3 reactor and waterfalls).
  { test: /^src\/experience\/fx\/(FloatingSign\.tsx|signLayout\.ts)$/, specs: ["spectacle", "career", "labs", "library-labels", "library-roof", "visits"] },
  // The shared holo shader also draws the sky dome and the sun and moon (day and night).
  { test: /^src\/experience\/fx\/holoFx\.ts$/, specs: ["spectacle", "career", "labs", "library-labels", "library-roof", "visits", "daynight"] },
  // Day and night: the sky controller, its dome and orbs, and the visitor's choice.
  { test: /^src\/experience\/sky\/|^src\/lib\/day-night\.ts$/, specs: ["daynight", "experience"] },
  // Screen placement of floating labels (L4 timeline and end plaza): the label overlap gates.
  { test: /^src\/experience\/fx\/(labelPlacement|plateProjection)\.ts$/, specs: ["library-labels", "topics"] },
  // Generated geo data (Natural Earth): covered by unit tests and the visits spec through its output.
  { test: /^scripts\/visits-geo\.ts$/, specs: [] },
  // Public visit stats (S2): the shared model, store, panel and placements, the RF observatory and the L1 tile.
  // The observatory layout's view zones (the observatory door, the kiosk spawn) share the Lobby with its arrival view.
  { test: /^src\/experience\/floors\/lobby\/observatoryLayout\.ts$/, specs: ["visits", "experience", "highlights", "pageview", "arrivals"] },
  {
    test: /^src\/(lib\/visits\/|components\/stats\/|experience\/visits3d\.ts$|experience\/floors\/lobby\/(VisitsStation\.tsx|observatory\.ts|visitsRoom\.ts)$|experience\/missions\/roomAliases\.ts$|hud\/drawer\/VisitsBody\.tsx$)|^e2e\/visits\.spec\.ts$/,
    specs: ["visits", "experience", "highlights", "pageview"],
  },
  // RF roof deck: the layout, and the elevator call pad that sits on the deck.
  { test: /^src\/experience\/floors\/roof\/layout\.ts$/, specs: ["library-roof", "pads", "roof", "arrivals"] },
  { test: /^src\/experience\/floors\/roof\/|^src\/experience\/floors\/Roof\.tsx$/, specs: ["library-roof", "pads", "roof"] },
  { test: /^src\/content\/room-views\/roof\.ts$/, specs: ["library-roof", "roof"] },
  // The kiosk, its spoke and the session spawn in front of it (owner 2026-10-14): the first frame, the tour and point-and-go.
  { test: /^src\/experience\/floors\/lobby\/(kiosk\.ts|MissionKiosk\.tsx|Lanes\.tsx)$/, specs: ["experience", "highlights", "onboarding", "interact", "camera", "visits"] },
  // The Lobby spawn and the kiosk axis (out of config.ts): the kiosk's specs plus the arrivals tour.
  { test: /^src\/experience\/floors\/lobby\/spawn\.ts$/, specs: ["experience", "highlights", "onboarding", "interact", "camera", "visits", "arrivals"] },
  // The prebuilt L1 wall logo atlas (scripts/logo-atlas.ts) draws on the Lobby walls only.
  { test: /^src\/experience\/floors\/lobby\/|^public\/atlas\/|^src\/experience\/logo-atlas\.ts$|^scripts\/logo-atlas\.(ts|lock\.json)$/, specs: ["experience", "highlights"] },
  { test: /^src\/experience\/floors\//, specs: ["experience", "labs", "career", "library-roof"] },
  // Missions: the runner, the 3D host and the reworked missions (highlights drives to the hall, journey rides to L2).
  { test: /^src\/experience\/missions\//, specs: ["missions", "experience", "library-roof", "highlights", "career"] },
  // Boost (owner pick: trails, body lean and squat, camera kick, streaks, sparks; the touch toggle).
  {
    test: /^src\/experience\/fx\/(BoostFx\.tsx|boostConfig\.ts|boostTrail\.ts|sparks\.ts|streaks\.ts)$|^src\/experience\/rover\/(boost|bodyDynamics)\.ts$|^src\/experience\/camera\/boostView\.ts$/,
    specs: ["boost", "experience", "hud", "gpu"],
  },
  // Signs that turn around when the camera is behind them (L2), the scene probes and the ghost floors above (none in first person).
  // Unique floating holograms: the build step, the converter, the recipes, the vendored icons and the client loader.
  {
    test: /^src\/experience\/fx\/shapes\.ts$|^src\/content\/(shapes|sculptures)\.ts$|^src\/lib\/svg-strokes\.ts$|^scripts\/build-shapes\.ts$|^content\/sculptures\.json$|^assets\/icons\//,
    specs: ["shapes", "career", "labs", "library-roof"],
  },
  { test: /^src\/experience\/fx\/(Readable\.tsx|readableFlip\.ts|probes\.ts|HoloIcon\.tsx)$|^src\/experience\/tower\/FloorLevel\.tsx$/, specs: ["camera", "career", "experience", "ride", "gpu", "spectacle"] },
  { test: /^public\/fonts\/|^src\/assets\/fonts\/troika\/|^src\/experience\/(troika-fonts\.json|text-config\.ts)$|^scripts\/troika-/, specs: ["experience", "highlights", "boot-first", "ride", "sdf-fallback"] },
  // Elevator ride smoothness (R5 P6) and the GPU work around it (R5 P2): the ride clock, floor preparation,
  // content visibility, precompile and troika sync tracking.
  { test: /^src\/experience\/(tower\/|scene\/(Director\.tsx|precompile\.ts|programPins\.ts|warmState\.ts|ProgramWarmup\.tsx)$)/, specs: ["ride", "experience", "gpu", "fast-return", "missions", "arrivals", "memory"] },
  // View zones (travel direction, class views): the L3 three paths arrival and road entrances read them too.
  { test: /^src\/experience\/camera\/orbit\.ts$/, specs: ["camera", "experience", "career", "ride", "labs-paths", "arrivals"] },
  { test: /^src\/experience\/camera\//, specs: ["camera", "experience", "career", "ride", "arrivals"] },
  // Shared 3D config: floor heights, the shaft, the Lobby layout and its arrival point and zone (the floor order and the Lobby spawn live apart).
  { test: /^src\/experience\/(config|floorOrder)\.ts$/, specs: ["experience", "arrivals"] },
  // Rover idle behaviour (the state machine, the activity counter) and the rover mesh that draws it.
  { test: /^src\/experience\/rover\/idle\.ts$/, specs: ["rover-idle", "idle-cadence"] },
  { test: /^src\/experience\/rover\/activity\.ts$/, specs: ["rover-idle"] },
  { test: /^src\/experience\/rover\/(Rover\.tsx|runtime\.ts)$/, specs: ["rover-idle", "idle-cadence", "camera", "experience", "gpu"] },
  // Round 5 camera work: input, the rover body fade and the view buttons.
  { test: /^src\/experience\/input\/|^src\/experience\/rover\/fade\.ts$|^src\/hud\/ViewControls\.tsx$/, specs: ["camera", "experience"] },
  // Quiet boot: header and nav links stop prefetching under the boot cover (pageview still covers the header).
  { test: /^src\/components\/(QuietLink|NavLink|SiteHeader)\.tsx$/, specs: ["boot-first", "pageview", "static-routes"] },
  // The gate and the 3D page data it fetches with the 3D chunk (data-client.ts, served by src/app/data).
  { test: /^src\/experience\/(ExperienceGate\.tsx|data-client\.ts)$/, specs: ["boot-first", "experience", "lifecycle", "onboarding", "view-links"] },
  // Measurement in the 3D view: render counters, the ?perf=1 overlay, timeline marks, the RUM probe.
  { test: /^src\/experience\/perf\/|^src\/lib\/(perf-marks\.ts|rum\/)/, specs: ["perf-probes", "experience"] },
  { test: /^src\/experience\/(ExperienceGate\.tsx|gate-tier\.ts|introContinue\.ts)$|^src\/lib\/(boot-first|gpu-tier|intro-session)\.ts$|^src\/components\/Boot(Cover|Card)\.tsx$|^src\/experience\/boot-signals\.ts$|^src\/components\/(QuietLink|NavLink|SiteHeader)\.tsx$|^src\/hud\/BootOverlay\.tsx$/, specs: ["boot-first", "experience", "onboarding"] },
  // Shareable Classic and 3D links: the view decision, its storage, the link rewriting and the copy buttons.
  { test: /^src\/lib\/view-[a-z-]+\.ts$|^src\/components\/(ViewParamSync|ShareLinks)\.tsx$/, specs: ["view-links", "boot-first", "pageview", "experience"] },
  // The Page view glyph: the boot card link and the HUD top bar button.
  { test: /^src\/components\/PageViewIcon\.tsx$/, specs: ["boot-first", "hud", "experience"] },
  // The 3D root writes each built floor's route on arrival (the arrivals tour checks every floor).
  { test: /^src\/experience\/Experience\.tsx$/, specs: ["experience", "arrivals"] },
  // Render budget, quality safety net, precompile, content visibility and the tower's mount set.
  { test: /^src\/experience\/(scene|tower)\//, specs: ["experience", "gpu"] },
  { test: /^src\/experience\//, specs: ["experience"] },
  { test: /^src\/store\//, specs: ["experience", "lifecycle", "motion"] },

  // Corners HUD (Round 8 I): the menu and settings sheets, the minimap and overview, the floor chip and sheet, the
  // layout switch, the joystick's double-tap boost and the persisted preferences behind the settings.
  { test: /^src\/hud\/(Joystick\.tsx|boost\.ts)$/, specs: ["hud-corners", "hud", "onboarding", "boost"] },
  { test: /^src\/hud\/(menu|minimap|settings)\/|^src\/hud\/(FloorChip|ChunkFailed)\.tsx$|^src\/hud\/layout\.ts$|^src\/lib\/(local-pref|quality-pref)\.ts$/, specs: ["hud-corners", "hud", "onboarding"] },
  // FloorButtons also renders the desktop elevator rail: e2e/experience.spec.ts checks its labels and keys, and the
  // e2e/arrivals.spec.ts tour rides it to every floor.
  { test: /^src\/hud\/FloorButtons\.tsx$/, specs: ["hud-corners", "hud", "onboarding", "experience", "arrivals"] },
  // The shared joystick double-tap helper (the boost toggle test).
  { test: /^e2e\/touch\.ts$/, specs: ["boost"] },
  // HUD over the canvas.
  { test: /^src\/hud\/drawer\//, specs: ["labs", "gallery", "career", "library-roof", "drawer-solid", "hud", "lifecycle", "view-links"] },
  { test: /^src\/hud\/(RoverTerminal|MissionHud|CommandPalette)\.tsx$|^src\/hud\/(search|events|palette-types)\.ts$/, specs: ["ask", "experience", "missions", "drawer-solid", "lifecycle"] },
  { test: /^src\/hud\//, specs: ["experience", "missions", "drawer-solid", "hud"] },
  // Shared tokens (.glass, .glass-solid) style both the HUD and the pages.
  { test: /^src\/app\/globals\.css$/, specs: ["drawer-solid", "pageview", "static-routes"] },

  // Static pages, SEO and hosting.
  { test: /^src\/app\/(sitemap|robots)\.ts$|^src\/app\/og\/|^src\/lib\/(site|jsonld|og|og-cards|og-layout|og-assets|og-encode|seo|first-person|routes)\.tsx?$|^scripts\/og-(check|meta)\.ts$|^public\/og-assets\//, specs: ["seo", "static-routes"] },
  { test: /^src\/app\/(global-not-found\.tsx|not-found\.module\.css)$|^src\/components\/DidYouMean\.tsx$|^src\/lib\/did-you-mean\.ts$/, specs: ["not-found", "static-routes"] },
  { test: /^src\/app\/data\//, specs: ["labs", "library-roof", "boot-first", "experience"] },
  { test: /^scripts\/(csp-hashes|csp-policy|defer-scripts)\.ts$/, specs: ["csp", "deploy", "static-routes", "boot-first", "sdf-fallback"] },
  { test: /^public\/_headers$|^scripts\/root-redirect\.ts$/, specs: ["csp", "deploy", "static-routes", "sdf-fallback"] },
  { test: /^public\/_redirects$|^scripts\/serve-static\.ts$/, specs: ["deploy", "static-routes"] },
  { test: /^public\/brand\/|^src\/lib\/brand-photo\.ts$|^src\/components\/page\/Portrait\.tsx$/, specs: ["pageview", "seo", "static-routes", "hud", "highlights"] },
  // Full-screen panels that pause the canvas (data-hq-cover).
  { test: /^src\/components\/(Modal|Lightbox)\.tsx$/, specs: ["gallery", "lifecycle", "pageview"] },
  { test: /^src\/components\/(Gallery|Lightbox|Chip)\.tsx$|^src\/content\/(media|tech)\.ts$|^public\/(media|tech)\//, specs: ["gallery", "pageview"] },
  { test: /^src\/(app|components)\/|^src\/content\/pageview\.ts$/, specs: ["pageview", "static-routes", "gallery"] },
  { test: /^src\/i18n\//, specs: ["static-routes", "experience"] },
  // Ambient type declarations: a broken one fails the build, which every route needs.
  { test: /^src\/types\//, specs: ["static-routes"] },
  // Self-hosted fonts and other assets the 3D text and the boot card load.
  { test: /^src\/assets\//, specs: ["experience", "highlights", "boot-first", "ride"] },
  // Pages bindings: the Ask and visit Functions read them.
  { test: /^wrangler\.toml$/, specs: ["ask", "visit", "visit-live"] },
  // The client JSON cache behind the Glass Drawer room files and the hologram shapes.
  { test: /^src\/lib\/json-cache\.ts$/, specs: ["shapes", "drawer-solid", "hud", "labs", "library-roof", "career"] },
  { test: /^src\/lib\/audio\//, specs: ["ambience", "experience", "pageview"] },
  { test: /^src\/lib\/(url-sync|viewport|reduced-motion)/, specs: ["experience"] },
  { test: /^src\/lib\//, specs: ["static-routes", "pageview"] },
  { test: /^(content|messages)\/|^src\/content\//, specs: ["static-routes", "pageview", "seo"] },
  { test: /^public\//, specs: ["static-routes"] },
];

/**
 * Smoke tests every selective pull request run adds when 3D or page code changed (scripts/ci-plan.ts):
 * whole specs, or one test of a spec by its exact title (run as a `file:line` filter).
 */
export const PR_SMOKE: readonly { spec: Spec; title?: string }[] = [
  { spec: "static-routes" },
  { spec: "boot-first" },
  { spec: "deploy" },
  { spec: "ride", title: "the car waits for the new floor with the doors closed, then compiles nothing while it moves" },
  { spec: "experience", title: "the 3D HUD has no serious accessibility violations" },
];

/** 1-based line of the first `test(` call whose title string equals `title`, or null. */
export function locateTest(source: string, title: string): number | null {
  for (const m of source.matchAll(/\btest\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    if (m[2] === title) return source.slice(0, m.index).split("\n").length;
  }
  return null;
}

/**
 * Tests whose title carries this tag run only in the nightly run (and on a dispatch with the `nightly` input): pull
 * requests and pushes to main pass `--grep-invert @nightly` (ci.yml, `scripts/e2e-changed.ts`). Owner decision
 * 2026-10-18; the list and the reasons are in docs/agents/performance.md.
 */
export const NIGHTLY_TAG = "@nightly";

/** True for a test that runs only in the nightly run. */
export const isNightlyTest = (id: string): boolean => id.includes(NIGHTLY_TAG);

/** Seconds assumed for a spec with no measured test, and for a test with no measured duration. */
export const UNKNOWN_SPEC_SECONDS = 150;
export const UNKNOWN_TEST_SECONDS = 30;

/**
 * Estimated worker-seconds of a spec (sum of its durations), or of one test when `title` is given. Planned runs are
 * pull requests and pushes to main, which skip the nightly-only tests, so their durations do not count.
 */
export function specSeconds(durations: Durations | null | undefined, spec: string, title?: string): number {
  const prefix = `${spec}.spec.ts › `;
  const measured = Object.keys(durations ?? {}).filter((k) => k.startsWith(prefix));
  const keys = measured.filter((k) => !isNightlyTest(k));
  if (title !== undefined) {
    const key = keys.find((k) => k.endsWith(` › ${title}`));
    return key ? durations![key] : UNKNOWN_TEST_SECONDS;
  }
  // A measured spec whose tests are all nightly-only costs nothing here; an unmeasured one gets the default.
  return keys.length ? keys.reduce((sum, k) => sum + durations![k], 0) : measured.length ? 0 : UNKNOWN_SPEC_SECONDS;
}

export const MAX_E2E_SHARDS = 8;
/** Worker-seconds one e2e shard should take: 2 workers for about 4 minutes. */
export const E2E_SHARD_SECONDS = 2 * 240;

/** Shards for a planned e2e run of `seconds` worker-seconds: ceil(seconds / 480), 1 to 8. */
export function e2eShardsFor(seconds: number): number {
  return seconds <= 0 ? 1 : Math.min(MAX_E2E_SHARDS, Math.max(1, Math.ceil(seconds / E2E_SHARD_SECONDS)));
}

/**
 * Extra specs added on top of the first matching rule (never instead of it). Shared files that the B1 Engine Room
 * changed (rows, drawers, audio, the sky, the tower, chunk loading, the data route) keep their own specs and add `engine-room`.
 */
const ALSO_RULES: Rule[] = [
  // The phone-first 3D design (e2e/phone-first.spec.ts): the bottom boot card, the docked Rover line and the band stepping aside, the phone tour, the L1 landing view and the camera it primes.
  {
    test: /^src\/components\/Boot(Card|Cover)\.tsx$|^src\/hud\/(BootOverlay|Hud|Joystick)\.tsx$|^src\/hud\/dialog\/(?!store\.ts)|^src\/experience\/floors\/lobby\/observatoryLayout\.ts$|^src\/experience\/camera\/orbit\.ts$|^src\/app\/(globals|hud-shared)\.css$/,
    specs: ["phone-first"],
  },
  // Time Travel on /journey: the section, its selector and island, the page that mounts it, the captions it reads, the Motion setting it follows and its UI strings.
  {
    test: /^src\/components\/time-travel\/|^src\/content\/time-travel\.ts$|^src\/app\/\[locale\]\/journey\/page\.tsx$|^content\/site-content\.json$|^src\/lib\/(motion|reduced-motion)\.ts$|^messages\//,
    specs: ["time-travel"],
  },
  // The hosts of the unique floating holograms (e2e/shapes.spec.ts) and HoloIcon, which every pad and the Roof draw.
  {
    test: /^src\/experience\/floors\/(career\/(CareerRooms|icons)|CareerArchive|labs\/(Pods|hologramParts)|Labs|library\/(decor\/(common|NewsroomDecor)|icons))\.tsx?$|^src\/experience\/fx\/HoloIcon\.tsx$|^src\/content\/(experience|experience-floors)\.ts$/,
    specs: ["shapes"],
  },
  { test: /^src\/experience\/fx\/HoloIcon\.tsx$/, specs: ["pads", "roof"] },
  // Study guides: the shelf, the reader (the shared PDF reader), its data and views, and the dialogs that open it (e2e/guides.spec.ts).
  {
    test: /^src\/components\/(guides|pdf-reader)\/|^src\/content\/guide[\w-]*\.ts$|^content\/study-guides\.json$|^src\/components\/(certs\/CertDialog|DialogHost)\.tsx$|^src\/components\/dialog-loaders\.ts$|^src\/app\/\[locale\]\/library\/page\.tsx$|^src\/app\/data\/\[\.\.\.path\]\/route\.ts$/,
    specs: ["guides", "guides-vault"],
  },
  // The other PDF readers on the shared reader: the CV (pageview, csp, the RF kiosk in library-roof) and the paper reader (library-roof).
  { test: /^src\/components\/(pdf-reader|cv|paper)\/|^src\/lib\/page-images\.ts$|^src\/app\/\[locale\]\/cv\/page\.tsx$/, specs: ["pageview", "csp", "library-roof"] },
  // The L4 Study Vault (e2e/guides-vault.spec.ts): its layout and scene, the book targets and the hq:hud command they send.
  {
    test: /^src\/experience\/floors\/library\/(decor\/(StudyVault\.tsx|vault\.ts)|layout\.ts|model\.ts|concepts\/newsroom\.ts)$|^src\/experience\/floors\/Library\.tsx$|^src\/experience\/interact\/(registry|pick)\.ts$|^src\/hud\/events\.ts$/,
    specs: ["guides-vault"],
  },
  // The L4 reader track shelves (e2e/library-shelves.spec.ts): the spine and bay targets, the track index and the track drawer.
  { test: /^src\/experience\/interact\/(registry|pick)\.ts$|^src\/content\/(track-index|room-views\/library)\.ts$/, specs: ["library-shelves"] },
  // The B1 unlock files (PR 3) keep the specs of the rules they used to match.
  { test: /^src\/hud\/dialog\/(EngineUnlockLayer\.tsx|engineRoomAction\.ts)$/, specs: ["onboarding", "experience", "camera"] },
  { test: /^src\/hud\/FloorButtons\.tsx$/, specs: ["onboarding", "experience", "arrivals"] },
  { test: /^src\/hud\/pads\//, specs: ["fast-return", "experience", "workshop"] },
  { test: /^src\/hud\/floorRows\.ts$/, specs: ["engine-room", "floor-chunks", "memory"] },
  // The unlock's producers: the store (floorsSeen, b1Unlocked, merge), the session start and gate (deep links), the chime.
  { test: /^src\/store\/|^src\/experience\/(Experience|ExperienceGate)\.tsx$|^src\/lib\/audio\/engine\.ts$/, specs: ["b1-unlock"] },
  // Cmd-K's gated action (the unlock moment's host files keep their own specs).
  { test: /^src\/hud\/(hudActions|search|palette-types|MissionHud)\.tsx?$/, specs: ["b1-unlock"] },
  // The Classic office card (e2e/office-classic.spec.ts) reads the shared office modules, and the home page mounts it.
  { test: /^src\/lib\/office\/|^src\/app\/\[locale\]\/page\.tsx$/, specs: ["office-classic"] },
  // The office chips host keeps the specs of the HUD folder rule it matched before the office rule.
  { test: /^src\/hud\/OfficeLayer\.tsx$/, specs: ["experience", "missions", "drawer-solid", "hud"] },
  {
    test: /^src\/lib\/(floors\.ts|audio\/ambience\.ts)$|^src\/hud\/drawer\/(data|data-path)\.ts$|^src\/hud\/drawer\/(bodies|DrawerHost)\.tsx$|^src\/experience\/tower\/(ElevatorShaft|Tower)\.tsx$|^src\/experience\/sky\/SkyController\.tsx$|^src\/experience\/floors\/(floorChunks|floorPrefetch)\.ts$|^src\/experience\/floors\/(FloorChunkPrefetch|lazyFloors)\.tsx$|^src\/hud\/(FloorButtons|CommandPalette)\.tsx$|^src\/hud\/pads\/(picker\.ts|PadPicker\.tsx)$|^src\/app\/data\/\[\.\.\.path\]\/route\.ts$/,
    specs: ["engine-room"],
  },
  // Glass Drawer data per floor (loader, file names and versions, the drawer host prefetch, the data route): every floor's deep links and the per-floor fetches.
  {
    test: /^src\/hud\/drawer\/(data|data-path)\.ts$|^src\/hud\/drawer\/DrawerHost\.tsx$|^src\/content\/room-views\/index\.ts$|^src\/app\/data\/\[\.\.\.path\]\/route\.ts$/,
    specs: ["floor-chunks", "labs", "highlights", "visits", "production", "reactor", "topics", "career", "library-roof"],
  },
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
    for (const also of ALSO_RULES) if (also.test.test(file) && also.specs !== "all") for (const s of also.specs) specs.add(s);
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

/** Test lanes with their own shard plan: the default suite (`e2e/`) and the perf lane (`e2e/perf/`, PERF=1). */
export type Lane = "e2e" | "perf";

/** Seconds per test, keyed by `durationKey` (file relative to the lane's test dir, then the title path). */
export type Durations = Readonly<Record<string, number>>;

/** The committed e2e/durations.json: one map per lane plus where the numbers came from. */
export interface DurationsFile {
  source?: string;
  runs?: number[];
  e2e?: Durations;
  perf?: Durations;
}

/** A test id is `[project] › file › describe › title`; the duration key drops the project. */
export function durationKey(testId: string): string {
  return testId.replace(/^\[[^\]]*\] › /, "");
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Playwright workers per CI shard: `workers` is unset in CI, so Playwright uses half the runner's 4 vCPUs. */
export const CI_WORKERS_PER_SHARD = 2;

/**
 * How a test missing from e2e/durations.json is estimated: `median`, the median of the known tests (the e2e lane),
 * or `max`, the longest known test of the lane (the perf lane, where a new test is more likely a long pole than a
 * short one: the Agent Office tests were planned at the median, 84 s, and ran 4 to 16 minutes).
 */
export type UnknownEstimate = "median" | "max";

/** The estimate for every listed test missing from `durations`. */
export function unknownSeconds(tests: readonly string[], durations: Durations, unknown: UnknownEstimate = "median"): number {
  if (unknown === "max") return Math.max(0, ...Object.values(durations));
  return median(tests.map((t) => durations[durationKey(t)]).filter((d): d is number => typeof d === "number"));
}

/** The listed tests without a measured duration (an empty list without durations: the plan is round-robin then). */
export function missingTests<T extends string>(tests: readonly T[], durations: Durations | null | undefined): T[] {
  if (!durations || Object.keys(durations).length === 0) return [];
  return tests.filter((t) => durations[durationKey(t)] === undefined);
}

function testSeconds(tests: readonly string[], durations: Durations, unknown: UnknownEstimate): number[] {
  const fallback = unknownSeconds(tests, durations, unknown);
  return tests.map((t) => durations[durationKey(t)] ?? fallback);
}

/**
 * Splits an ordered test list into `total` shards, balanced by duration: longest first onto the least
 * loaded worker (LPT), where each shard has `workers` Playwright workers, so a long test fills one worker
 * of its shard while the shard's other workers take the shorter tests (with 1 worker per shard this is
 * LPT on the shard sums). Tests missing from `durations` count as the median of the known ones, or as the
 * longest known test with `unknown: "max"` (the perf lane); without durations it falls back to round-robin
 * (`assignShard`). Deterministic for the same inputs (every shard must compute the same plan, so `workers` is
 * a constant, not the runner's core count), and every test lands in exactly one shard, in its original order
 * within the shard.
 */
export function planShards<T extends string>(tests: readonly T[], total: number, durations?: Durations | null, workers = 1, unknown: UnknownEstimate = "median"): T[][] {
  assignShard([], 1, total);
  if (!Number.isInteger(workers) || workers < 1) throw new Error(`invalid workers per shard ${workers}`);
  if (!durations || Object.keys(durations).length === 0) {
    return Array.from({ length: total }, (_, i) => assignShard(tests, i + 1, total));
  }
  const seconds = testSeconds(tests, durations, unknown);
  const order = tests.map((_, i) => i).sort((a, b) => seconds[b] - seconds[a] || a - b);
  // Worker k * workers + w is worker w of shard k.
  const loads = new Array<number>(total * workers).fill(0);
  const picked: number[][] = Array.from({ length: total }, () => []);
  for (const i of order) {
    let best = 0;
    if (seconds[i] === 0) {
      // Zero-second tests (skipped in CI) go to the shard with the fewest tests, so no shard collects them all.
      for (let k = 1; k < total; k++) if (picked[k].length < picked[best].length) best = k;
      picked[best].push(i);
      continue;
    }
    for (let w = 1; w < loads.length; w++) if (loads[w] < loads[best]) best = w;
    loads[best] += seconds[i];
    picked[Math.floor(best / workers)].push(i);
  }
  return picked.map((idx) => idx.sort((a, b) => a - b).map((i) => tests[i]));
}

/** The estimate of an unknown test in a shard's sums: the median of the whole lane, or its longest test. */
function laneFallback(durations: Durations, unknown: UnknownEstimate): number {
  const known = Object.values(durations);
  return unknown === "max" ? Math.max(0, ...known) : median(known);
}

/** Estimated seconds of a shard (the sum of its tests' durations, unknown ones at the lane's median or max). */
export function shardSeconds(tests: readonly string[], durations?: Durations | null, unknown: UnknownEstimate = "median"): number {
  if (!durations) return 0;
  const fallback = laneFallback(durations, unknown);
  return tests.reduce((sum, t) => sum + (durations[durationKey(t)] ?? fallback), 0);
}

/** Estimated wall seconds of a shard on `workers` workers: its tests longest first onto the least loaded worker. */
export function shardWallSeconds(tests: readonly string[], durations: Durations | null | undefined, workers: number, unknown: UnknownEstimate = "median"): number {
  if (!durations) return 0;
  const fallback = laneFallback(durations, unknown);
  const loads = new Array<number>(Math.max(1, workers)).fill(0);
  const seconds = tests.map((t) => durations[durationKey(t)] ?? fallback).sort((a, b) => b - a);
  for (const s of seconds) loads[loads.indexOf(Math.min(...loads))] += s;
  return Math.max(...loads);
}

/** One suite of Playwright's JSON report (`playwright test --list --reporter=json`). */
export interface ListSuite {
  title: string;
  file: string;
  specs?: { title: string; file: string; tests: { projectName: string }[] }[];
  suites?: ListSuite[];
}

function collect(suite: ListSuite, titles: string[], out: string[]) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) out.push(`[${t.projectName}] › ${spec.file} › ${[...titles, spec.title].join(" › ")}`);
  }
  for (const child of suite.suites ?? []) collect(child, [...titles, child.title], out);
}

/** The `--test-list` ids of a JSON list report, in Playwright's order. */
export function listTestIds(report: { suites: ListSuite[] }): string[] {
  const tests: string[] = [];
  // Top-level suites are files; their title is the file name, not a describe block.
  for (const file of report.suites) collect(file, [], tests);
  return tests;
}

/** One test result line of the `list` reporter in a CI log; `seconds` is null for a skipped test. */
export interface DurationSample {
  lane: Lane;
  key: string;
  seconds: number | null;
}

const LIST_LINE = /(✓|✘|-)\s+\d+ \[[^\]]+\] › e2e\/(perf\/)?(\S+?):\d+:\d+ › (.+?)(?: \(retry #\d+\))?(?: \((\d+(?:\.\d+)?)(ms|s|m)\))?\s*$/;
const UNIT: Record<string, number> = { ms: 0.001, s: 1, m: 60 };

/**
 * Passed and skipped tests from `list` reporter output (CI job logs, timestamps allowed). Failed
 * attempts are left out; a pass on retry counts with the retry's time.
 */
export function parseListReporter(log: string): DurationSample[] {
  const out: DurationSample[] = [];
  for (const line of log.split(/\r?\n/)) {
    const m = LIST_LINE.exec(line);
    if (!m) continue;
    const [, mark, perf, file, title, value, unit] = m;
    if (mark === "✘") continue;
    if (mark === "✓" && !value) continue;
    const lane: Lane = perf ? "perf" : "e2e";
    out.push({ lane, key: `${file} › ${title}`, seconds: mark === "-" ? null : Math.round(Number(value) * UNIT[unit] * 1000) / 1000 });
  }
  return out;
}

/** Timed samples below this many seconds do not vote on a runner's speed (fixed costs dominate them). */
const SPEED_MIN_SECONDS = 5;
/** A job needs this many voting samples for a speed factor; fewer keep the factor at 1. */
const SPEED_MIN_SAMPLES = 5;

/**
 * Runner speed per CI job: the median, over the job's samples of at least 5 s, of the sample divided by
 * that test's median across all jobs. GitHub runners differ in CPU speed and SwiftShader is CPU-bound, so
 * every test of one shard runs at about the same factor (0.65 to 1.21 across the shards of 7 runs on
 * 2026-10-18). 1 when a job has fewer than 5 such samples.
 */
export function runnerSpeedFactors(jobs: readonly (readonly DurationSample[])[]): number[] {
  const byTest = new Map<string, number[]>();
  for (const s of jobs.flat()) {
    if (s.seconds === null) continue;
    const id = `${s.lane}|${s.key}`;
    byTest.set(id, [...(byTest.get(id) ?? []), s.seconds]);
  }
  const medians = new Map([...byTest].map(([id, values]) => [id, median(values)]));
  return jobs.map((job) => {
    const ratios = job
      .filter((s) => s.seconds !== null && s.seconds >= SPEED_MIN_SECONDS)
      .map((s) => (s.seconds as number) / (medians.get(`${s.lane}|${s.key}`) ?? 0))
      .filter((r) => Number.isFinite(r) && r > 0);
    return ratios.length >= SPEED_MIN_SAMPLES ? Math.round(median(ratios) * 1000) / 1000 : 1;
  });
}

/** Every job's samples divided by its runner speed factor, so fast and slow runners do not pull the medians. */
export function normalizeRunnerSpeed(jobs: readonly (readonly DurationSample[])[]): { samples: DurationSample[]; factors: number[] } {
  const factors = runnerSpeedFactors(jobs);
  const samples = jobs.flatMap((job, j) => job.map((s) => (s.seconds === null ? s : { ...s, seconds: Math.round((s.seconds / factors[j]) * 1000) / 1000 })));
  return { samples, factors };
}

const RUNNER_LINE = /\brunner: (\d+ x .+)$/m;

/** The runner fingerprint `scripts/e2e-shard.ts` logs (`runner: 4 x <CPU model>, sha256 <n> MB/s`), or null. */
export function parseRunnerLine(log: string): string | null {
  return RUNNER_LINE.exec(log)?.[1].trim() ?? null;
}

/** Median seconds per test and lane (skipped-only tests count as 0), rounded to 0.1 s, keys sorted. */
export function medianDurations(samples: readonly DurationSample[]): Record<Lane, Record<string, number>> {
  const byLane: Record<Lane, Map<string, number[]>> = { e2e: new Map(), perf: new Map() };
  for (const s of samples) {
    const list = byLane[s.lane].get(s.key) ?? [];
    if (s.seconds !== null) list.push(s.seconds);
    byLane[s.lane].set(s.key, list);
  }
  const result = { e2e: {}, perf: {} } as Record<Lane, Record<string, number>>;
  for (const lane of ["e2e", "perf"] as const) {
    for (const key of [...byLane[lane].keys()].sort()) {
      result[lane][key] = Math.round(median(byLane[lane].get(key) ?? []) * 10) / 10;
    }
  }
  return result;
}

