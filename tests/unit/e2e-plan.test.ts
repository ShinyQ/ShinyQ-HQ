import { describe, expect, it } from "vitest";
import {
  ALL_SPECS,
  assignShard,
  durationKey,
  listTestIds,
  medianDurations,
  parseListReporter,
  parseShard,
  planShards,
  shardSeconds,
  SMOKE_SPECS,
  specsForChanges,
  type DurationsFile,
  type ListSuite,
} from "../../scripts/e2e-plan";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("specsForChanges", () => {
  it("maps the elevator ride code to the ride spec", () => {
    expect(specsForChanges(["src/experience/tower/elevator.ts"]).specs).toEqual(["arrivals", "experience", "fast-return", "gpu", "memory", "missions", "ride"]);
    expect(specsForChanges(["src/experience/scene/Director.tsx"]).specs).toEqual(["arrivals", "experience", "fast-return", "gpu", "memory", "missions", "ride"]);
    expect(specsForChanges(["src/experience/text-config.ts"]).specs).toEqual(["boot-first", "experience", "highlights", "ride"]);
    expect(specsForChanges(["src/experience/camera/CameraDirector.tsx"]).specs).toEqual(["arrivals", "camera", "career", "experience", "ride"]);
    expect(specsForChanges(["e2e/ride.spec.ts"]).specs).toEqual(["ride"]);
  });

  it("maps the mission code to the specs that run the missions (highlights and journey included)", () => {
    expect(specsForChanges(["src/experience/missions/host3d.ts"]).specs).toEqual(["career", "experience", "highlights", "library-roof", "missions"]);
    expect(specsForChanges(["src/experience/missions/runner.ts"]).specs).toEqual(["career", "experience", "highlights", "library-roof", "missions"]);
  });

  it("maps the floor chunk loader to its spec and the ride", () => {
    expect(specsForChanges(["src/experience/floors/floorChunks.ts"]).specs).toEqual(expect.arrayContaining(["floor-chunks", "ride", "experience"]));
  });

  it("keeps the perf lane out of the regular suite and treats the budgets as shared infrastructure", () => {
    expect(specsForChanges(["e2e/perf/look.spec.ts"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/perf/baseline.json"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/budgets.ts"]).specs).toBe("all");
    expect(specsForChanges(["scripts/perf-summary.ts", "scripts/perf-base.sh", "scripts/ci-status.ts"]).specs).toEqual([]);
  });

  it("maps measurement code to the perf probes spec and the 3D experience", () => {
    expect(specsForChanges(["src/experience/perf/PerfOverlay.tsx"]).specs).toEqual(["experience", "perf-probes"]);
    expect(specsForChanges(["src/lib/perf-marks.ts"]).specs).toEqual(["experience", "perf-probes"]);
    expect(specsForChanges(["e2e/perf-probes.spec.ts"]).specs).toEqual(["perf-probes"]);
  });

  it("maps the Rover dialog, the onboarding and the hint bubbles to the onboarding spec", () => {
    expect(specsForChanges(["src/hud/dialog/engine.ts"]).specs).toEqual(["camera", "experience", "onboarding"]);
    expect(specsForChanges(["src/experience/hints/HintProbe.tsx"]).specs).toEqual(["camera", "experience", "onboarding"]);
    expect(specsForChanges(["src/hud/dialog/FloorIntroLayer.tsx"]).specs).toEqual(["camera", "experience", "onboarding"]);
    expect(specsForChanges(["src/experience/introContinue.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
  });
  it("maps point-and-go code to the interact spec and the specs that click targets", () => {
    expect(specsForChanges(["src/experience/interact/registry.ts"]).specs).toEqual(["career", "experience", "fast-return", "interact", "pads"]);
    expect(specsForChanges(["src/hud/InteractStatus.tsx"]).specs).toEqual(["career", "experience", "fast-return", "interact", "pads"]);
    expect(specsForChanges(["e2e/interact.spec.ts"]).specs).toEqual(["interact"]);
  });
  it("maps the 3D gate, its tier probe and the landing's Enter button to the gate specs", () => {
    expect(specsForChanges(["src/experience/gate-tier.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/components/page/EnterHqButton.tsx"]).specs).toEqual(["boot-first", "experience", "pageview"]);
  });

  it("maps the Highlights Hall to its spec and the 3D experience", () => {
    expect(specsForChanges(["src/experience/floors/lobby/hallLayout.ts"]).specs).toEqual(["experience", "highlights"]);
    expect(specsForChanges(["src/experience/floors/lobby/HighlightsHall.tsx"]).specs).toEqual(["experience", "highlights"]);
    expect(specsForChanges(["src/content/room-views/highlights.ts"]).specs).toEqual(["experience", "highlights"]);
    expect(specsForChanges(["src/hud/drawer/HighlightsBody.tsx"]).specs).toEqual(["experience", "highlights"]);
    expect(specsForChanges(["src/experience/floors/lobby/CertWall.tsx"]).specs).toEqual(["experience", "highlights"]);
  });

  it("maps floor code to its spec", () => {
    expect(specsForChanges(["src/experience/floors/labs/Pods.tsx"]).specs).toEqual(["fast-return", "gallery", "labs", "labs-data", "labs-paths", "production", "reactor", "spectacle"]);
    expect(specsForChanges(["src/hud/drawer/ReactorBody.tsx"]).specs).toEqual(["labs", "labs-data", "production", "reactor"]);
    expect(specsForChanges(["src/experience/floors/labs/OpsRoom.tsx"]).specs).toEqual(["labs", "pageview", "production"]);
    expect(specsForChanges(["src/components/page/Production.tsx"]).specs).toEqual(["labs", "pageview", "production"]);
    expect(specsForChanges(["src/experience/floors/career/layout.ts"]).specs).toEqual(["career", "fast-return", "pads", "spectacle", "workshop"]);
    expect(specsForChanges(["src/content/workshop.ts"]).specs).toEqual(["career", "missions", "pageview", "workshop"]);
    expect(specsForChanges(["src/experience/fx/FloatingSign.tsx"]).specs).toEqual(["career", "labs", "library-labels", "library-roof", "spectacle", "visits"]);
    expect(specsForChanges(["src/experience/fx/holoFx.ts"]).specs).toEqual(["career", "daynight", "labs", "library-labels", "library-roof", "spectacle", "visits"]);
    expect(specsForChanges(["src/experience/sky/SkyController.tsx"]).specs).toEqual(["daynight", "experience"]);
    expect(specsForChanges(["src/lib/day-night.ts"]).specs).toEqual(["daynight", "experience"]);
    expect(specsForChanges(["src/experience/floors/library/layout.ts"]).specs).toEqual(["fast-return", "library-labels", "library-roof", "spectacle", "topics"]);
    expect(specsForChanges(["src/experience/fx/labelPlacement.ts"]).specs).toEqual(["library-labels", "topics"]);
    expect(specsForChanges(["src/experience/fx/plateProjection.ts"]).specs).toEqual(["library-labels", "topics"]);
    expect(specsForChanges(["src/content/topic-index.ts"]).specs).toEqual(["library-roof", "reactor", "topics"]);
    expect(specsForChanges(["src/experience/fx/FilterHighlights.tsx"]).specs).toEqual(["reactor", "topics"]);
    expect(specsForChanges(["src/lib/intro-session.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/components/BootCard.tsx"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    // The per-page script policy: its build step, the headers it derives from and every inline script source.
    expect(specsForChanges(["scripts/csp-hashes.ts"]).specs).toEqual(["boot-first", "csp", "deploy", "static-routes"]);
    expect(specsForChanges(["public/_headers"]).specs).toEqual(["csp", "deploy", "static-routes"]);
    expect(specsForChanges(["src/lib/boot-first.ts"]).specs).toEqual(["boot-first", "csp", "experience", "onboarding", "static-routes", "view-links"]);
    expect(specsForChanges(["src/app/(root)/page.tsx"]).specs).toEqual(["boot-first", "csp", "experience", "onboarding", "static-routes", "view-links"]);
    // Shareable Classic and 3D links.
    for (const file of ["src/lib/view-param.ts", "src/lib/view-pref.ts", "src/components/ViewParamSync.tsx", "src/components/ShareLinks.tsx"]) {
      expect(specsForChanges([file]).specs).toEqual(["boot-first", "experience", "pageview", "view-links"]);
    }
    expect(specsForChanges(["src/components/Analytics.tsx"]).specs).toEqual(["boot-first", "csp", "pageview", "static-routes", "visit"]);
    expect(specsForChanges(["src/experience/introContinue.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/hud/Controls.tsx"]).specs).toEqual(["drawer-solid", "experience", "hud", "missions"]);
    expect(specsForChanges(["src/experience/floors/roof/layout.ts"]).specs).toEqual(["library-roof", "pads", "roof"]);
    expect(specsForChanges(["src/experience/floors/Roof.tsx"]).specs).toEqual(["library-roof", "pads", "roof"]);
    expect(specsForChanges(["src/content/room-views/roof.ts"]).specs).toEqual(["library-roof", "roof"]);
    // The Visitor Observatory lives in the Lobby (owner decision 2026-10-14).
    expect(specsForChanges(["src/experience/floors/lobby/VisitsStation.tsx"]).specs).toEqual(["experience", "highlights", "pageview", "visits"]);
    expect(specsForChanges(["src/experience/floors/lobby/kiosk.ts"]).specs).toEqual(["camera", "experience", "highlights", "interact", "onboarding", "visits"]);
  });

  it("maps static pages and content", () => {
    expect(specsForChanges(["src/app/[locale]/labs/page.tsx"]).specs).toEqual(["gallery", "pageview", "static-routes"]);
    expect(specsForChanges(["content/site-content.json"]).specs).toEqual(["pageview", "seo", "static-routes"]);
  });

  it("maps Ask the HQ code, the Function and the panel to the ask spec", () => {
    expect(specsForChanges(["functions/api/ask.ts"]).specs).toEqual(["ask"]);
    expect(specsForChanges(["functions/_lib/rate-limit.ts", "src/ask/client.ts"]).specs).toEqual(["ask"]);
    expect(specsForChanges(["src/components/page/AskEntry.tsx"]).specs).toEqual(["ask", "pageview"]);
    expect(specsForChanges(["src/hud/ask/AskChat.tsx"]).specs).toEqual(["ask", "experience", "pageview"]);
    expect(specsForChanges(["content/ask/suggestions.json"]).specs).toEqual(["ask"]);
    expect(specsForChanges(["src/hud/CommandPalette.tsx"]).specs).toEqual(["ask", "drawer-solid", "experience", "lifecycle", "missions"]);
  });

  it("runs no e2e for the RUM Function", () => {
    expect(specsForChanges(["functions/api/rum.ts", "functions/_lib/rum.ts"]).specs).toEqual([]);
    expect(specsForChanges(["functions/_lib/handler.ts"]).specs).toEqual(["ask"]);
  });

  it("runs a changed spec itself and skips docs and unit tests", () => {
    expect(specsForChanges(["e2e/career.spec.ts", "docs/deploy.md", "tests/unit/rover.test.ts"]).specs).toEqual(["career"]);
    expect(specsForChanges(["AGENTS.md"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/screenshots.spec.ts"]).specs).toEqual([]);
  });

  it("runs everything when test infrastructure or dependencies change", () => {
    expect(specsForChanges(["src/hud/Hud.tsx", "e2e/hq.ts"]).specs).toBe("all");
    expect(specsForChanges(["package.json"]).specs).toBe("all");
    expect(specsForChanges(["playwright.config.ts"]).specs).toBe("all");
  });

  it("falls back to the smoke specs for unmapped paths", () => {
    const plan = specsForChanges(["src/unknown/thing.ts"]);
    expect(plan.unmatched).toEqual(["src/unknown/thing.ts"]);
    expect(plan.specs).toEqual([...SMOKE_SPECS].sort());
  });

  it("knows every spec in e2e/", () => {
    const onDisk = readdirSync("e2e")
      .filter((f) => f.endsWith(".spec.ts") && !["screenshots.spec.ts", "pageview-visual.spec.ts", "camera-visual.spec.ts", "visual-gate.spec.ts", "delivery-visual.spec.ts"].includes(f))
      .map((f) => f.replace(/\.spec\.ts$/, ""))
      .sort();
    expect(onDisk).toEqual([...ALL_SPECS].sort());
  });

  it("never runs the opt-in camera look gate from e2e:changed", () => {
    expect(specsForChanges(["e2e/camera-visual.spec.ts"]).specs).toEqual([]);
  });

  it("maps the camera, its input, the rover fade and the view buttons to the camera spec", () => {
    expect(specsForChanges(["src/experience/camera/orbit.ts"]).specs).toEqual(["arrivals", "camera", "career", "experience", "labs-paths", "ride"]);
    expect(specsForChanges(["src/experience/input/useInputSources.ts"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["src/experience/rover/fade.ts"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["src/hud/ViewControls.tsx"]).specs).toEqual(["camera", "experience", "hud-corners"]);
    expect(specsForChanges(["e2e/camera.spec.ts"]).specs).toEqual(["camera"]);
    expect(specsForChanges(["src/experience/fx/Readable.tsx"]).specs).toEqual(["camera", "career", "experience", "gpu", "ride", "spectacle"]);
  });

  it("maps the Corners HUD (menu, settings, minimap, floor chip, layout, joystick boost, preferences) to hud-corners", () => {
    const corners = ["hud", "hud-corners", "onboarding"];
    for (const file of [
      "src/hud/menu/HudMenu.tsx",
      "src/hud/minimap/Minimap.tsx",
      "src/hud/settings/defs/motion.ts",
      "src/hud/FloorChip.tsx",
      "src/hud/layout.ts",
      "src/lib/local-pref.ts",
      "src/lib/quality-pref.ts",
    ]) {
      expect(specsForChanges([file]).specs, file).toEqual(corners);
    }
    expect(specsForChanges(["src/hud/FloorButtons.tsx"]).specs).toEqual(["experience", "hud", "hud-corners", "onboarding"]);
    expect(specsForChanges(["e2e/touch.ts"]).specs).toEqual(["boost", "hud-corners"]);
    expect(specsForChanges(["src/hud/Joystick.tsx"]).specs).toEqual(["boost", "hud", "hud-corners", "onboarding"]);
    expect(specsForChanges(["src/hud/boost.ts"]).specs).toEqual(["boost", "hud", "hud-corners", "onboarding"]);
    expect(specsForChanges(["e2e/hud-corners.spec.ts"]).specs).toEqual(["hud-corners"]);
    expect(specsForChanges(["src/hud/ChunkFailed.tsx"]).specs).toEqual(corners);
  });

  it("adds hud-corners to the HUD hosts that shape the corner layout, keeping their own specs", () => {
    expect(specsForChanges(["src/hud/Hud.tsx"]).specs).toEqual(["drawer-solid", "experience", "hud", "hud-corners", "missions"]);
    expect(specsForChanges(["src/hud/ViewControls.tsx"]).specs).toEqual(["camera", "experience", "hud-corners"]);
    expect(specsForChanges(["src/components/Modal.tsx"]).specs).toEqual(["gallery", "hud-corners", "lifecycle", "pageview"]);
    expect(specsForChanges(["src/hud/dialog/DialogBox.tsx"]).specs).toEqual(["camera", "experience", "hud-corners", "onboarding"]);
    expect(specsForChanges(["src/hud/dialog/placement.ts"]).specs).toEqual(["camera", "experience", "hud-corners", "onboarding"]);
    expect(specsForChanges(["src/hud/dialog/store.ts"]).specs).toEqual(["camera", "experience", "onboarding"]);
    expect(specsForChanges(["src/hud/ask/AskDock.tsx"]).specs).toEqual(["ask", "experience", "hud-corners", "pageview"]);
    expect(specsForChanges(["src/hud/ask/AskChat.tsx"]).specs).toEqual(["ask", "experience", "pageview"]);
  });

  it("never runs the visual gate or the perf scripts as part of e2e:changed", () => {
    expect(specsForChanges(["e2e/visual-gate.spec.ts"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/vclock.ts"]).specs).toEqual([]);
    expect(specsForChanges(["scripts/visual-gate.ts"]).specs).toEqual([]);
    expect(specsForChanges(["scripts/perf-gpu.ts"]).specs).toEqual([]);
  });

  it("maps floor pads, their pickers and thumbnails to the pads spec", () => {
    expect(specsForChanges(["src/experience/nav/pads.ts"]).specs).toEqual(["experience", "fast-return", "pads", "workshop"]);
    expect(specsForChanges(["src/experience/fx/PadGlow.tsx"]).specs).toEqual(["experience", "fast-return", "pads", "workshop"]);
    expect(specsForChanges(["src/experience/nav/fastReturn.ts"]).specs).toEqual(["experience", "fast-return", "pads", "ride"]);
    expect(specsForChanges(["src/experience/fx/ReturnPadSign.tsx"]).specs).toEqual(["experience", "fast-return", "pads", "ride"]);
    expect(specsForChanges(["src/hud/pads/PadPicker.tsx"]).specs).toEqual(["experience", "fast-return", "pads", "workshop"]);
    expect(specsForChanges(["public/floors/L2.webp"]).specs).toEqual(["experience", "fast-return", "pads", "workshop"]);
    expect(specsForChanges(["src/experience/nav/space.ts"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["scripts/floor-thumbs.ts"]).specs).toEqual([]);
  });

  it("maps share cards and search metadata to the SEO specs (R5 P9)", () => {
    expect(specsForChanges(["src/lib/seo.ts"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["src/lib/og-layout.ts"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["public/og-assets/floor-L1.jpg"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["scripts/og-check.ts"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["scripts/og-stills.ts"]).specs).toEqual([]);
  });

  it("maps the render pipeline and the tower to the gpu spec", () => {
    expect(specsForChanges(["src/experience/scene/settings.ts"]).specs).toEqual(["experience", "gpu"]);
    expect(specsForChanges(["src/experience/tower/FloorLevel.tsx"]).specs).toEqual(["camera", "career", "experience", "gpu", "memory", "ride"]);
  });
});

describe("assignShard", () => {
  const tests = Array.from({ length: 10 }, (_, i) => i);

  it("interleaves so every shard gets part of every spec", () => {
    expect(assignShard(tests, 1, 4)).toEqual([0, 4, 8]);
    expect(assignShard(tests, 4, 4)).toEqual([3, 7]);
  });

  it("covers every test exactly once", () => {
    const all = [1, 2, 3].flatMap((i) => assignShard(tests, i, 3)).sort((a, b) => a - b);
    expect(all).toEqual(tests);
  });

  it("parses and validates shard arguments", () => {
    expect(parseShard("2/4")).toEqual({ index: 2, total: 4 });
    expect(() => parseShard("5/4")).toThrow();
    expect(() => parseShard("x")).toThrow();
  });
});

describe("planShards", () => {
  const ids = ["a", "b", "c", "d", "e", "f"].map((t) => `[chromium] › x.spec.ts › ${t}`);
  const durations = { "x.spec.ts › a": 10, "x.spec.ts › b": 60, "x.spec.ts › c": 20, "x.spec.ts › d": 30, "x.spec.ts › e": 40 };

  it("puts the longest tests first onto the least-loaded shard, keeping the list order inside a shard", () => {
    // f is unknown and counts as the median (30). LPT: b 60 -> 1, e 40 -> 2, d 30 -> 2, f 30 -> 1, c 20 -> 2, a 10 -> 1.
    const shards = planShards(ids, 2, durations);
    expect(shards.map((s) => s.map((t) => t.slice(-1)))).toEqual([["a", "b", "f"], ["c", "d", "e"]]);
    expect(shards.map((s) => shardSeconds(s, durations))).toEqual([100, 90]);
  });

  it("is deterministic and covers every test exactly once for any total", () => {
    for (const total of [1, 2, 3, 4, 6, 8]) {
      const shards = planShards(ids, total, durations);
      expect(shards).toHaveLength(total);
      expect(shards.flat().sort()).toEqual([...ids].sort());
      expect(planShards(ids, total, durations)).toEqual(shards);
    }
  });

  it("spreads zero-second (skipped) tests by count", () => {
    const zeros = Array.from({ length: 8 }, (_, i) => `[chromium] › z.spec.ts › ${i}`);
    const shards = planShards([...ids, ...zeros], 2, { ...durations, ...Object.fromEntries(zeros.map((z) => [durationKey(z), 0])) });
    expect(shards.map((s) => s.length)).toEqual([7, 7]);
  });

  it("falls back to round-robin without durations", () => {
    expect(planShards(ids, 4, null)).toEqual([1, 2, 3, 4].map((i) => assignShard(ids, i, 4)));
    expect(planShards(ids, 4, {})).toEqual([1, 2, 3, 4].map((i) => assignShard(ids, i, 4)));
    expect(() => planShards(ids, 0, durations)).toThrow();
  });
});

describe("CI timings", () => {
  const log = [
    "2026-10-14T12:37:22.6Z   ✓   1 [chromium] › e2e/perf/bytes-3d.spec.ts:54:7 › 3D JS after the gate stays under 450 KB gzip (lite) (19.0s)",
    "2026-10-14T12:37:44.8Z   ✓    1 [chromium] › e2e/ask.spec.ts:83:5 › no POST before interaction (2.7s)",
    "2026-10-14T12:38:12.8Z   ✘   15 [chromium] › e2e/camera.spec.ts:288:7 › wheel zoom and first person › the ! hints show (35.4s)",
    "2026-10-14T12:38:36.1Z   ✓   17 [chromium] › e2e/camera.spec.ts:288:7 › wheel zoom and first person › the ! hints show (retry #1) (22.3s)",
    "2026-10-14T12:38:20.1Z   -   10 [chromium] › e2e/camera-visual.spec.ts:136:9 › third-person poses on L3 at 1440x900 (full)",
    "2026-10-14T12:39:00.0Z   ✓   18 [chromium] › e2e/gpu.spec.ts:59:5 › intro and ride draw-call peaks (full tier) (4.1m)",
    "2026-10-14T12:39:00.0Z   ✓   19 [chromium] › e2e/hud.spec.ts:10:5 › fast (850ms)",
    "2026-10-14T12:37:32.2Z - site (ID: 11895400150, Size: 55060380)",
  ].join("\n");

  it("parses passes, retries and skips from the list reporter, by lane", () => {
    expect(parseListReporter(log)).toEqual([
      { lane: "perf", key: "bytes-3d.spec.ts › 3D JS after the gate stays under 450 KB gzip (lite)", seconds: 19 },
      { lane: "e2e", key: "ask.spec.ts › no POST before interaction", seconds: 2.7 },
      { lane: "e2e", key: "camera.spec.ts › wheel zoom and first person › the ! hints show", seconds: 22.3 },
      { lane: "e2e", key: "camera-visual.spec.ts › third-person poses on L3 at 1440x900 (full)", seconds: null },
      { lane: "e2e", key: "gpu.spec.ts › intro and ride draw-call peaks (full tier)", seconds: 246 },
      { lane: "e2e", key: "hud.spec.ts › fast", seconds: 0.85 },
    ]);
  });

  it("keeps the median per test, skipped tests at 0", () => {
    const m = medianDurations([
      { lane: "e2e", key: "k", seconds: 3 },
      { lane: "e2e", key: "k", seconds: 9 },
      { lane: "e2e", key: "k", seconds: 4 },
      { lane: "e2e", key: "s", seconds: null },
      { lane: "perf", key: "p", seconds: 1.04 },
      { lane: "perf", key: "p", seconds: 2 },
    ]);
    expect(m).toEqual({ e2e: { k: 4, s: 0 }, perf: { p: 1.5 } });
  });

  it("matches the duration keys to the test list ids", () => {
    expect(durationKey("[chromium] › camera.spec.ts › wheel zoom and first person › the ! hints show")).toBe(
      "camera.spec.ts › wheel zoom and first person › the ! hints show",
    );
  });
});

/**
 * The real lists of both lanes with the committed e2e/durations.json: the union of all shards equals
 * `playwright test --list` exactly, with no test lost or duplicated, for the CI shard counts and more.
 */
describe("shard plan against the real Playwright list", () => {
  const root = path.resolve(__dirname, "../..");
  const durations = JSON.parse(readFileSync(path.join(root, "e2e/durations.json"), "utf8")) as DurationsFile;
  const list = (perf: boolean, args: string[] = []) => {
    const env = { ...process.env, PERF: perf ? "1" : "", E2E_SHARD: "", SCREENSHOTS: "", CI: "" };
    const out = execFileSync(path.join(root, "node_modules/.bin/playwright"), ["test", "--list", "--reporter=json", ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return listTestIds(JSON.parse(out) as { suites: ListSuite[] });
  };

  it.each([
    { lane: "e2e" as const, perf: false, args: [], totals: [4, 5, 6] },
    { lane: "perf" as const, perf: true, args: ["--grep-invert", "@nightly|@look"], totals: [2, 3] },
  ])("$lane: every listed test lands in exactly one shard", ({ lane, perf, args, totals }) => {
    const all = list(perf, args);
    expect(all.length).toBeGreaterThan(perf ? 10 : 100);
    expect(new Set(all).size).toBe(all.length);
    for (const total of totals) {
      const planned = planShards(all, total, durations[lane]).flat();
      expect(planned).toHaveLength(all.length);
      expect([...planned].sort()).toEqual([...all].sort());
    }
    // Most listed tests have a measured duration; a big gap means e2e/durations.json needs a refresh.
    const known = all.filter((t) => durations[lane]?.[durationKey(t)] !== undefined).length;
    expect(known / all.length).toBeGreaterThan(0.8);
  }, 120_000);
});
