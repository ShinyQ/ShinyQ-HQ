import { describe, expect, it } from "vitest";
import {
  ALL_SPECS,
  assignShard,
  CI_WORKERS_PER_SHARD,
  durationKey,
  e2eShardsFor,
  isNightlyTest,
  listTestIds,
  locateTest,
  medianDurations,
  missingTests,
  normalizeRunnerSpeed,
  parseListReporter,
  parseRunnerLine,
  parseShard,
  planShards,
  PR_SMOKE,
  runnerSpeedFactors,
  shardSeconds,
  shardWallSeconds,
  SMOKE_SPECS,
  specSeconds,
  specsForChanges,
  UNKNOWN_SPEC_SECONDS,
  UNKNOWN_TEST_SECONDS,
  unknownSeconds,
  type DurationsFile,
  type ListSuite,
} from "../../scripts/e2e-plan";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { classify } from "../../scripts/ci-plan";

describe("e2eShardsFor", () => {
  it("sizes ceil(seconds / 480), 1 to 8", () => {
    expect(e2eShardsFor(0)).toBe(1);
    expect(e2eShardsFor(480)).toBe(1);
    expect(e2eShardsFor(481)).toBe(2);
    expect(e2eShardsFor(9515)).toBe(8);
  });
});

describe("specsForChanges", () => {
  it("maps the elevator ride code to the ride spec", () => {
    expect(specsForChanges(["src/experience/tower/elevator.ts"]).specs).toEqual(["arrivals", "experience", "fast-return", "gpu", "memory", "missions", "ride"]);
    expect(specsForChanges(["src/experience/scene/Director.tsx"]).specs).toEqual(["arrivals", "experience", "fast-return", "gpu", "memory", "missions", "ride"]);
    expect(specsForChanges(["src/experience/text-config.ts"]).specs).toEqual(["boot-first", "experience", "highlights", "ride", "sdf-fallback"]);
    expect(specsForChanges(["src/experience/camera/CameraDirector.tsx"]).specs).toEqual(["arrivals", "camera", "career", "experience", "ride"]);
    expect(specsForChanges(["e2e/ride.spec.ts"]).specs).toEqual(["ride"]);
  });

  it("maps the shared PDF reader, the CV and the paper reader to every spec that opens one", () => {
    for (const file of ["src/components/pdf-reader/PdfReader.tsx", "src/components/pdf-reader/ReaderDialog.tsx"]) {
      expect(specsForChanges([file]).specs, file).toEqual(expect.arrayContaining(["guides", "guides-vault", "pageview", "csp", "library-roof"]));
    }
    for (const file of ["src/components/cv/CvDialog.tsx", "src/components/cv/CvCover.tsx", "src/app/[locale]/cv/page.tsx", "src/components/paper/PaperDialog.tsx", "src/lib/page-images.ts"]) {
      const plan = specsForChanges([file]);
      expect(plan.unmatched, file).toEqual([]);
      expect(plan.specs, file).toEqual(expect.arrayContaining(["pageview", "csp", "library-roof"]));
    }
  });

  it("maps the study guide shelf, reader, data and the dialogs that open it to the guides spec, on top of their own specs", () => {
    for (const file of [
      "src/components/pdf-reader/PdfReader.tsx",
      "src/components/guides/GuideShelf.tsx",
      "src/content/guides.ts",
      "src/content/guide-views.ts",
      "content/study-guides.json",
      "src/components/certs/CertDialog.tsx",
      "src/components/DialogHost.tsx",
      "src/components/dialog-loaders.ts",
      "src/app/[locale]/library/page.tsx",
      "src/app/data/[...path]/route.ts",
      "e2e/fixtures/guide-pdf.ts",
      "e2e/guides.spec.ts",
    ]) {
      const plan = specsForChanges([file]);
      expect(plan.unmatched, file).toEqual([]);
      expect(plan.specs, file).toContain("guides");
    }
    expect(specsForChanges(["src/components/certs/CertDialog.tsx"]).specs).toEqual(["experience", "guides", "guides-vault", "pageview", "static-routes"]);
    expect(specsForChanges(["content/study-guides.json"]).specs).toEqual(["guides", "guides-vault", "pageview", "seo", "static-routes"]);
    expect(specsForChanges(["src/components/certs/Certifications.tsx"]).specs).not.toContain("guides");
    // The Function is unit tested; the specs answer /api/guides/* with a fixture PDF.
    expect(specsForChanges(["functions/_lib/guides.ts"]).specs).toEqual([]);
  });

  it("maps the L4 Study Vault, its book targets and the reader to the guides-vault spec, on top of their own specs", () => {
    for (const file of [
      "src/experience/floors/library/decor/StudyVault.tsx",
      "src/experience/floors/library/decor/vault.ts",
      "src/experience/floors/library/layout.ts",
      "src/experience/floors/library/model.ts",
      "src/experience/floors/library/concepts/newsroom.ts",
      "src/experience/floors/Library.tsx",
      "src/experience/interact/registry.ts",
      "src/experience/interact/pick.ts",
      "src/hud/events.ts",
      "src/components/pdf-reader/PdfReader.tsx",
      "src/components/guides/GuideDialog.tsx",
      "src/components/DialogHost.tsx",
      "e2e/fixtures/guide-pdf.ts",
      "e2e/guides-vault.spec.ts",
    ]) {
      const plan = specsForChanges([file]);
      expect(plan.unmatched, file).toEqual([]);
      expect(plan.specs, file).toContain("guides-vault");
    }
    expect(specsForChanges(["src/experience/floors/library/decor/vault.ts"]).specs).toEqual(["arrivals", "fast-return", "guides-vault", "library-labels", "library-roof", "spectacle", "topics"]);
    expect(specsForChanges(["e2e/guides-vault.spec.ts"]).specs).toEqual(["guides-vault"]);
    expect(specsForChanges(["e2e/fixtures/guide-pdf.ts"]).specs).toEqual(["guides", "guides-vault"]);
    // Library code the vault does not touch keeps its own specs only.
    expect(specsForChanges(["src/experience/floors/library/topics.ts"]).specs).not.toContain("guides-vault");
  });

  it("maps the rover idle code to the rover-idle spec", () => {
    expect(specsForChanges(["src/experience/rover/idle.ts"]).specs).toEqual(["idle-cadence", "rover-idle"]);
    expect(specsForChanges(["src/experience/rover/activity.ts"]).specs).toEqual(["rover-idle"]);
    expect(specsForChanges(["src/experience/rover/Rover.tsx"]).specs).toEqual(["camera", "experience", "idle-cadence", "rover-idle"]);
    expect(specsForChanges(["e2e/rover-idle.spec.ts"]).specs).toEqual(["rover-idle"]);
  });

  it("maps the frame loop and the idle detector to the idle cadence spec", () => {
    expect(specsForChanges(["src/experience/scene/idle.ts"]).specs).toEqual(["experience", "idle-cadence", "lifecycle", "pads"]);
    expect(specsForChanges(["e2e/idle-cadence.spec.ts"]).specs).toEqual(["idle-cadence"]);
  });

  it("maps the mission code to the specs that run the missions (highlights and journey included)", () => {
    expect(specsForChanges(["src/experience/missions/host3d.ts"]).specs).toEqual(["career", "experience", "highlights", "library-roof", "missions"]);
    expect(specsForChanges(["src/experience/missions/runner.ts"]).specs).toEqual(["career", "experience", "highlights", "library-roof", "missions"]);
  });

  it("maps the floor chunk loader to its spec and the ride", () => {
    expect(specsForChanges(["src/experience/floors/floorChunks.ts"]).specs).toEqual(expect.arrayContaining(["floor-chunks", "ride", "experience"]));
  });

  it("maps the B1 unlock files to the unlock spec and keeps their earlier mappings", () => {
    expect(specsForChanges(["src/hud/dialog/EngineUnlockLayer.tsx"]).specs).toEqual(["b1-unlock", "camera", "experience", "hud", "hud-corners", "onboarding", "pads"]);
    expect(specsForChanges(["src/hud/floorRows.ts"]).specs).toEqual(expect.arrayContaining(["b1-unlock", "engine-room", "floor-chunks", "memory"]));
    expect(specsForChanges(["src/hud/hudActions.ts"]).specs).toContain("b1-unlock");
    expect(specsForChanges(["e2e/b1-unlock.spec.ts"]).specs).toEqual(["b1-unlock"]);
    for (const file of ["src/store/useHQStore.ts", "src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx", "src/lib/audio/engine.ts"]) {
      expect(specsForChanges([file]).specs, file).toContain("b1-unlock");
    }
  });

  it("maps the B1 Engine Room files to its spec", () => {
    expect(specsForChanges(["src/experience/floors/engine/scenery.ts"]).specs).toEqual(expect.arrayContaining(["engine-room", "floor-chunks"]));
    expect(specsForChanges(["src/experience/floors/engine/layout.ts"]).specs).toEqual(expect.arrayContaining(["engine-room", "arrivals"]));
    for (const file of [
      "src/experience/floors/EngineRoom.tsx",
      "src/experience/floors/chunks/engine.ts",
      "src/hud/drawer/EngineBody.tsx",
      "src/content/room-views/engine.ts",
      "src/experience/b1.ts",
      "src/hud/floorRows.ts",
      "e2e/b1.ts",
    ]) {
      expect(specsForChanges([file]).specs, file).toEqual(expect.arrayContaining(["engine-room", "memory"]));
    }
    for (const file of [
      "src/lib/floors.ts",
      "src/hud/drawer/data.ts",
      "src/hud/drawer/data-path.ts",
      "src/hud/drawer/bodies.tsx",
      "src/hud/drawer/DrawerHost.tsx",
      "src/lib/audio/ambience.ts",
      "src/experience/tower/ElevatorShaft.tsx",
      "src/experience/tower/Tower.tsx",
      "src/experience/sky/SkyController.tsx",
      "src/experience/floors/floorChunks.ts",
      "src/experience/floors/floorPrefetch.ts",
      "src/experience/floors/FloorChunkPrefetch.tsx",
      "src/experience/floors/lazyFloors.tsx",
      "src/hud/FloorButtons.tsx",
      "src/hud/CommandPalette.tsx",
      "src/hud/pads/picker.ts",
      "src/hud/pads/PadPicker.tsx",
      "src/app/data/[...path]/route.ts",
    ]) {
      expect(specsForChanges([file]).specs, file).toContain("engine-room");
    }
    // Glass Drawer data per floor: the per-floor fetches and every floor's deep links.
    for (const file of ["src/hud/drawer/data.ts", "src/hud/drawer/data-path.ts", "src/hud/drawer/DrawerHost.tsx", "src/content/room-views/index.ts", "src/app/data/[...path]/route.ts"]) {
      expect(specsForChanges([file]).specs, file).toEqual(expect.arrayContaining(["floor-chunks", "labs", "highlights", "visits", "production", "reactor", "topics"]));
    }
    // On top of their first matching rule, never instead of it.
    expect(specsForChanges(["src/hud/drawer/data.ts"]).specs).toEqual(expect.arrayContaining(["drawer-solid", "gallery", "view-links"]));
    expect(specsForChanges(["src/content/room-views/index.ts"]).specs).toEqual(expect.arrayContaining(["pageview", "static-routes"]));
    // The extra spec is added on top of the existing mapping, never instead of it.
    expect(specsForChanges(["src/hud/FloorButtons.tsx"]).specs).toEqual(expect.arrayContaining(["hud-corners", "experience"]));
    expect(specsForChanges(["src/experience/floors/floorChunks.ts"]).specs).toEqual(expect.arrayContaining(["floor-chunks", "ride"]));
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

  it("maps the audio engine and the floor ambience spec", () => {
    expect(specsForChanges(["src/lib/audio/ambience.ts"]).specs).toEqual(["ambience", "engine-room", "experience", "pageview"]);
    expect(specsForChanges(["e2e/ambience.spec.ts"]).specs).toEqual(["ambience"]);
  });

  it("maps the Rover dialog, the onboarding and the hint bubbles to the onboarding spec", () => {
    expect(specsForChanges(["src/hud/dialog/engine.ts"]).specs).toEqual(["camera", "experience", "onboarding"]);
    expect(specsForChanges(["src/experience/hints/HintProbe.tsx"]).specs).toEqual(["camera", "experience", "onboarding"]);
    expect(specsForChanges(["src/hud/dialog/FloorIntroLayer.tsx"]).specs).toEqual(["camera", "experience", "onboarding"]);
    expect(specsForChanges(["src/experience/introContinue.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
  });
  it("maps point-and-go code to the interact spec and the specs that click targets", () => {
    expect(specsForChanges(["src/experience/interact/registry.ts"]).specs).toEqual(["career", "experience", "fast-return", "guides-vault", "interact", "pads"]);
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
    expect(specsForChanges(["src/experience/floors/labs/Pods.tsx"]).specs).toEqual(["fast-return", "gallery", "labs", "labs-data", "labs-paths", "production", "reactor", "shapes", "spectacle"]);
    // The unique floating holograms: their pipeline and every floor that draws them.
    expect(specsForChanges(["scripts/build-shapes.ts"]).specs).toEqual(["career", "labs", "library-roof", "shapes"]);
    expect(specsForChanges(["assets/icons/lucide/mic.svg"]).specs).toEqual(["career", "labs", "library-roof", "shapes"]);
    expect(specsForChanges(["src/experience/fx/HoloIcon.tsx"]).specs).toEqual(["camera", "career", "experience", "gpu", "pads", "ride", "roof", "shapes", "spectacle"]);
    expect(specsForChanges(["src/hud/drawer/ReactorBody.tsx"]).specs).toEqual(["labs", "labs-data", "production", "reactor"]);
    expect(specsForChanges(["src/experience/floors/labs/OpsRoom.tsx"]).specs).toEqual(["labs", "pageview", "production"]);
    expect(specsForChanges(["src/components/page/Production.tsx"]).specs).toEqual(["labs", "pageview", "production"]);
    expect(specsForChanges(["src/experience/floors/career/layout.ts"]).specs).toEqual(["arrivals", "career", "fast-return", "pads", "spectacle", "workshop"]);
    expect(specsForChanges(["src/content/workshop.ts"]).specs).toEqual(["career", "missions", "pageview", "workshop"]);
    expect(specsForChanges(["src/experience/fx/FloatingSign.tsx"]).specs).toEqual(["career", "labs", "library-labels", "library-roof", "spectacle", "visits"]);
    expect(specsForChanges(["src/experience/fx/holoFx.ts"]).specs).toEqual(["career", "daynight", "labs", "library-labels", "library-roof", "spectacle", "visits"]);
    expect(specsForChanges(["src/experience/sky/SkyController.tsx"]).specs).toEqual(["daynight", "engine-room", "experience"]);
    expect(specsForChanges(["src/lib/day-night.ts"]).specs).toEqual(["daynight", "experience"]);
    expect(specsForChanges(["src/experience/floors/library/layout.ts"]).specs).toEqual(["arrivals", "fast-return", "guides-vault", "library-labels", "library-roof", "spectacle", "topics"]);
    expect(specsForChanges(["src/experience/fx/labelPlacement.ts"]).specs).toEqual(["library-labels", "topics"]);
    expect(specsForChanges(["src/experience/fx/plateProjection.ts"]).specs).toEqual(["library-labels", "topics"]);
    expect(specsForChanges(["src/content/topic-index.ts"]).specs).toEqual(["library-roof", "reactor", "topics"]);
    expect(specsForChanges(["src/experience/fx/FilterHighlights.tsx"]).specs).toEqual(["reactor", "topics"]);
    expect(specsForChanges(["src/lib/intro-session.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/components/BootCard.tsx"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    // The per-page script policy: its build step, the headers it derives from and every inline script source.
    expect(specsForChanges(["scripts/csp-hashes.ts"]).specs).toEqual(["boot-first", "csp", "deploy", "sdf-fallback", "static-routes"]);
    expect(specsForChanges(["public/_headers"]).specs).toEqual(["csp", "deploy", "sdf-fallback", "static-routes"]);
    expect(specsForChanges(["src/lib/boot-first.ts"]).specs).toEqual(["boot-first", "csp", "experience", "onboarding", "static-routes", "view-links"]);
    expect(specsForChanges(["src/app/(root)/page.tsx"]).specs).toEqual(["boot-first", "csp", "experience", "onboarding", "static-routes", "view-links"]);
    // Shareable Classic and 3D links.
    for (const file of ["src/lib/view-param.ts", "src/lib/view-pref.ts", "src/components/ViewParamSync.tsx", "src/components/ShareLinks.tsx"]) {
      expect(specsForChanges([file]).specs).toEqual(["boot-first", "experience", "pageview", "view-links"]);
    }
    expect(specsForChanges(["src/components/Analytics.tsx"]).specs).toEqual(["boot-first", "csp", "pageview", "static-routes", "visit"]);
    expect(specsForChanges(["src/experience/introContinue.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/hud/Controls.tsx"]).specs).toEqual(["drawer-solid", "experience", "hud", "missions"]);
    expect(specsForChanges(["src/experience/floors/roof/layout.ts"]).specs).toEqual(["arrivals", "library-roof", "pads", "roof"]);
    expect(specsForChanges(["src/experience/floors/Roof.tsx"]).specs).toEqual(["library-roof", "pads", "roof"]);
    expect(specsForChanges(["src/content/room-views/roof.ts"]).specs).toEqual(["library-roof", "roof"]);
    // The Visitor Observatory lives in the Lobby (owner decision 2026-10-14).
    expect(specsForChanges(["src/experience/floors/lobby/VisitsStation.tsx"]).specs).toEqual(["experience", "highlights", "pageview", "visits"]);
    expect(specsForChanges(["src/experience/floors/lobby/observatory.ts"]).specs).toEqual(["experience", "highlights", "pageview", "visits"]);
    expect(specsForChanges(["src/experience/floors/lobby/kiosk.ts"]).specs).toEqual(["camera", "experience", "highlights", "interact", "onboarding", "visits"]);
  });

  it("selects the arrivals spec for arrival points, zones and the camera (Round 8 J)", () => {
    expect(specsForChanges(["src/experience/config.ts"]).specs).toEqual(["arrivals", "experience"]);
    // The floor order and the Lobby spawn moved out of config.ts (floor layouts out of Classic): same specs.
    expect(specsForChanges(["src/experience/floorOrder.ts"]).specs).toEqual(["arrivals", "experience"]);
    expect(specsForChanges(["src/experience/floors/lobby/spawn.ts"]).specs).toEqual(["arrivals", "camera", "experience", "highlights", "interact", "onboarding", "visits"]);
    // The 3D root writes each built floor's route; the arrivals tour checks it on every floor.
    expect(specsForChanges(["src/experience/Experience.tsx"]).specs).toEqual(["arrivals", "b1-unlock", "experience"]);
    expect(specsForChanges(["src/experience/floors/career/YearGates.tsx"]).specs).toContain("arrivals");
    expect(specsForChanges(["src/experience/floors/library/concepts/newsroom.ts"]).specs).toContain("arrivals");
    expect(specsForChanges(["src/experience/floors/lobby/observatoryLayout.ts"]).specs).toEqual(["arrivals", "experience", "highlights", "pageview", "visits"]);
    expect(specsForChanges(["src/experience/floors/labs/layout.ts"]).specs).toEqual(["arrivals", "fast-return", "gallery", "labs", "labs-data", "labs-paths", "production", "reactor", "spectacle"]);
    expect(specsForChanges(["src/experience/camera/arrival.ts"]).specs).toEqual(["arrivals", "camera", "career", "experience", "ride"]);
    expect(specsForChanges(["src/experience/camera/orbit.ts"]).specs).toContain("arrivals");
    // Only the roof layout moves the RF arrival; the deck mesh does not.
    expect(specsForChanges(["src/experience/floors/Roof.tsx"]).specs).not.toContain("arrivals");
    // The labs layout carries the L3 arrival; its other files do not.
    expect(specsForChanges(["src/experience/floors/labs/Pods.tsx"]).specs).not.toContain("arrivals");
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
    expect(specsForChanges(["src/hud/CommandPalette.tsx"]).specs).toEqual(["ask", "drawer-solid", "engine-room", "experience", "lifecycle", "missions"]);
  });

  it("runs no e2e for the RUM Function", () => {
    expect(specsForChanges(["functions/api/rum.ts", "functions/_lib/rum.ts"]).specs).toEqual([]);
    expect(specsForChanges(["functions/api/guides/[slug].ts", "functions/_lib/guides.ts"]).specs).toEqual([]);
    expect(specsForChanges(["functions/_lib/handler.ts"]).specs).toEqual(["ask"]);
    expect(specsForChanges(["functions/api/office/index.ts", "functions/_lib/office.ts", "workers/office/src/state.ts"]).specs).toEqual([]);
    expect(specsForChanges(["tools/office-relay/src/hook.ts", "tools/office-relay/README.md"])).toEqual({ specs: [], unmatched: [] });
  });

  it("maps the Agent Office to its spec, the 3D experience and the Lobby specs", () => {
    const office = ["experience", "highlights", "hud-corners", "interact", "office", "onboarding"];
    for (const f of [
      "src/experience/floors/lobby/officeLayout.ts",
      "src/experience/floors/lobby/officeShell.ts",
      "src/experience/floors/lobby/office/OfficeScene.tsx",
      "src/experience/floors/lobby/office/OfficeMount.tsx",
      "src/experience/floors/lobby/office/OfficeBody.tsx",
      "src/experience/floors/lobby/office/body.ts",
      "e2e/office-fixtures.ts",
    ])
      expect(specsForChanges([f]).specs, f).toEqual(office);
    // The shared modules feed the Classic card too.
    for (const f of ["src/lib/office/poll.ts", "src/lib/office/model.ts", "src/lib/office/protocol.ts", "src/lib/office/fixtures.ts"])
      expect(specsForChanges([f]).specs, f).toEqual(["experience", "highlights", "hud-corners", "interact", "office", "office-classic", "onboarding"]);
    // The chips host keeps the HUD folder rule's specs on top.
    expect(specsForChanges(["src/hud/OfficeLayer.tsx"]).specs).toEqual(["drawer-solid", "experience", "highlights", "hud", "hud-corners", "interact", "missions", "office", "onboarding"]);
    // A spec file runs itself only (SPEC_FILE in specsForChanges).
    expect(specsForChanges(["e2e/office.spec.ts"]).specs).toEqual(["office"]);
    expect(specsForChanges(["scripts/office-shots.ts"]).specs).toEqual([]);
  });

  it("runs the Classic office spec for the card", () => {
    expect(specsForChanges(["src/components/office/OfficePanel.tsx"]).specs).toEqual(["office-classic", "pageview"]);
    expect(specsForChanges(["src/components/office/OfficeLazy.tsx", "src/components/office/OfficeSection.tsx", "src/components/office/labels.ts"]).specs).toEqual(["office-classic", "pageview"]);
    expect(specsForChanges(["src/app/[locale]/page.tsx"]).specs).toContain("office-classic");
    expect(specsForChanges(["e2e/office-classic.spec.ts"]).specs).toEqual(["office-classic"]);
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
    expect(specsForChanges(["src/hud/FloorButtons.tsx"]).specs).toEqual(["arrivals", "b1-unlock", "engine-room", "experience", "hud", "hud-corners", "onboarding", "pads"]);
    expect(specsForChanges(["e2e/touch.ts"]).specs).toEqual(["boost"]);
    expect(specsForChanges(["src/hud/Joystick.tsx"]).specs).toEqual(["boost", "hud", "hud-corners", "onboarding"]);
    expect(specsForChanges(["src/hud/boost.ts"]).specs).toEqual(["boost", "hud", "hud-corners", "onboarding"]);
    expect(specsForChanges(["e2e/hud-corners.spec.ts"]).specs).toEqual(["hud-corners"]);
    expect(specsForChanges(["src/hud/ChunkFailed.tsx"]).specs).toEqual(corners);
  });

  it("adds hud-corners to the HUD hosts that shape the corner layout, keeping their own specs", () => {
    expect(specsForChanges(["src/hud/Hud.tsx"]).specs).toEqual(["arrivals", "drawer-solid", "experience", "hud", "hud-corners", "missions"]);
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
    expect(specsForChanges(["src/hud/pads/PadPicker.tsx"]).specs).toEqual(["b1-unlock", "engine-room", "experience", "fast-return", "hud", "hud-corners", "pads", "workshop"]);
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

describe("offline tooling and the remaining unmapped paths", () => {
  it("runs no e2e for offline scripts", () => {
    for (const f of ["scripts/arrival-shots.ts", "scripts/ask-eval.ts", "scripts/b1-reactor-shots.ts", "scripts/b1-shots.ts", "scripts/brand-wordmark.py", "scripts/subset-fonts.sh", "scripts/readme-hero.ts", "scripts/refresh-facts.ts", "scripts/uptime.ts", "scripts/check-client-chunks.ts", "scripts/docs-index.ts"]) {
      expect(specsForChanges([f]), f).toEqual({ specs: [], unmatched: [] });
    }
  });

  it("maps the export scans, the shared types, the 3D assets and the Pages bindings", () => {
    expect(specsForChanges(["scripts/scan-export.ts"]).specs).toEqual(["csp", "deploy"]);
    expect(specsForChanges(["scripts/injected-analytics.ts"]).specs).toEqual(["csp", "deploy"]);
    expect(specsForChanges(["src/types/troika-three-text.d.ts"]).specs).toEqual(["static-routes"]);
    expect(specsForChanges(["src/assets/fonts/inter-latin1-wght400-800.woff2"]).specs).toEqual(["boot-first", "experience", "highlights", "ride"]);
    expect(specsForChanges(["wrangler.toml"]).specs).toEqual(["ask", "visit", "visit-live"]);
  });

  it("leaves no tracked file outside the ci, docs and tests classes and the e2e helpers unmatched", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const unmatched = files
      .filter((f) => !["ci", "docs", "tests"].includes(classify(f)) && !(f.startsWith("e2e/") && !f.endsWith(".spec.ts")))
      .filter((f) => specsForChanges([f]).unmatched.length > 0);
    expect(unmatched).toEqual([]);
  });
});

describe("PR smoke set", () => {
  it("locates a test by its exact title", () => {
    const source = ['import { test } from "@playwright/test";', "", 'test("first one", async () => {});', "test.describe(\"group\", () => {", "  test('second one', async () => {});", "  test(`third one`, async () => {});", "});"].join("\n");
    expect(locateTest(source, "first one")).toBe(3);
    expect(locateTest(source, "second one")).toBe(5);
    expect(locateTest(source, "third one")).toBe(6);
    expect(locateTest(source, "group")).toBeNull();
    expect(locateTest(source, "first")).toBeNull();
  });

  it("names real specs and finds every titled test in its spec file", () => {
    expect(PR_SMOKE.map((s) => s.spec)).toEqual(["static-routes", "boot-first", "deploy", "ride", "experience"]);
    for (const { spec, title } of PR_SMOKE) {
      const file = `e2e/${spec}.spec.ts`;
      expect(existsSync(file), file).toBe(true);
      expect((ALL_SPECS as readonly string[]).includes(spec)).toBe(true);
      if (title) expect(locateTest(readFileSync(file, "utf8"), title), `${file}: ${title}`).toBeGreaterThan(0);
    }
  });

  it("estimates the seconds of a spec or one of its tests", () => {
    const durations = { "ride.spec.ts › a": 10, "ride.spec.ts › group › b": 5, "ride-x.spec.ts › c": 100, "experience.spec.ts › d": 7 };
    expect(specSeconds(durations, "ride")).toBe(15);
    expect(specSeconds(durations, "ride", "b")).toBe(5);
    expect(specSeconds(durations, "ride", "a")).toBe(10);
    expect(specSeconds(durations, "ride", "missing")).toBe(UNKNOWN_TEST_SECONDS);
    expect(specSeconds(durations, "camera")).toBe(UNKNOWN_SPEC_SECONDS);
    expect(specSeconds(null, "ride")).toBe(UNKNOWN_SPEC_SECONDS);
    expect(specSeconds(undefined, "ride", "a")).toBe(UNKNOWN_TEST_SECONDS);
  });

  it("leaves the nightly-only tests out of a planned run's seconds", () => {
    const durations = { "ride.spec.ts › a": 10, "ride.spec.ts › sweep @nightly": 300, "ride.spec.ts › group › b @nightly": 5 };
    expect(specSeconds(durations, "ride")).toBe(10);
    expect(specSeconds({ "labels.spec.ts › sweep @nightly": 300 }, "labels")).toBe(0);
    expect(isNightlyTest("ride.spec.ts › sweep @nightly")).toBe(true);
    expect(isNightlyTest("ride.spec.ts › a")).toBe(false);
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

  it("packs onto every worker of a shard, so a long test does not leave its shard's other worker idle", () => {
    // The perf lane on 2026-10-18: one 9.6 min test, planned by shard sums, shared its shard with a single 53 s test.
    const tests = ["long", ...Array.from({ length: 12 }, (_, i) => `short${i}`)].map((t) => `[chromium] › y.spec.ts › ${t}`);
    const secs = { "y.spec.ts › long": 600, ...Object.fromEntries(tests.slice(1).map((t) => [durationKey(t), 50])) };
    const longShard = (shards: string[][]) => shards.find((s) => s.includes(tests[0])) ?? [];
    expect(longShard(planShards(tests, 2, secs))).toEqual([tests[0]]);
    const shards = planShards(tests, 2, secs, CI_WORKERS_PER_SHARD);
    expect(shards.flat().sort()).toEqual([...tests].sort());
    expect(longShard(shards).length).toBeGreaterThan(1);
    // 600 s on one worker; the other 11 workers' worth of 50 s tests spread over the remaining 3 workers.
    expect(shards.map((s) => shardWallSeconds(s, secs, CI_WORKERS_PER_SHARD)).sort((a, b) => a - b)).toEqual([200, 600]);
  });

  it("keeps the shard-sum plan with one worker per shard and rejects a bad worker count", () => {
    expect(planShards(ids, 2, durations, 1)).toEqual(planShards(ids, 2, durations));
    expect(() => planShards(ids, 2, durations, 0)).toThrow();
  });

  it("estimates a shard's wall time on its workers", () => {
    expect(shardWallSeconds(ids, durations, 2)).toBe(100);
    expect(shardWallSeconds(ids, durations, 1)).toBe(190);
    expect(shardWallSeconds(ids, null, 2)).toBe(0);
  });

  it("counts an unknown test as the longest known one with unknown: max (the perf lane)", () => {
    // f is unknown: the median 30 by default, the max 60 for the perf lane.
    expect(unknownSeconds(ids, durations)).toBe(30);
    expect(unknownSeconds(ids, durations, "max")).toBe(60);
    expect(unknownSeconds(ids, {}, "max")).toBe(0);
    expect(shardSeconds(ids, durations, "max")).toBe(220);
    expect(shardWallSeconds(ids, durations, 2, "max")).toBe(110);
    // LPT with f at 60: b 60 -> 1, f 60 -> 2, e 40 -> 2... f and b no longer share a shard.
    const shards = planShards(ids, 2, durations, 1, "max");
    expect(shards.flat().sort()).toEqual([...ids].sort());
    expect(shards.find((s) => s.includes(ids[5]))).not.toContain(ids[1]);
    expect(planShards(ids, 2, durations, 1, "median")).toEqual(planShards(ids, 2, durations));
  });

  it("lists the tests missing from the durations", () => {
    expect(missingTests(ids, durations)).toEqual([ids[5]]);
    expect(missingTests(ids, null)).toEqual([]);
    expect(missingTests(ids, {})).toEqual([]);
  });

  it("a new perf long pole: unknown tests get a shard each instead of piling up as short ones", () => {
    const tests = ["memory", "new1", "new2", "new3", ...Array.from({ length: 8 }, (_, i) => `s${i}`)].map((t) => `[chromium] › p.spec.ts › ${t}`);
    const secs = { "p.spec.ts › memory": 900, ...Object.fromEntries(tests.slice(4).map((t) => [durationKey(t), 60])) };
    const longs = (plan: string[][]) => plan.map((s) => s.filter((t) => /memory|new/.test(t)).length);
    // At the median (60 s) the three new tests look short and all land on the shard without memory; at the max each is a 900 s test.
    expect(longs(planShards(tests, 2, secs, 1))).toEqual([1, 3]);
    expect(longs(planShards(tests, 2, secs, 1, "max"))).toEqual([2, 2]);
    expect(longs(planShards(tests, 4, secs, 1, "max"))).toEqual([1, 1, 1, 1]);
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

  const job = (factor: number, lane: "e2e" | "perf" = "e2e") =>
    [10, 20, 30, 40, 50, 60].map((seconds, i) => ({ lane, key: `t${i}`, seconds: Math.round(seconds * factor * 1000) / 1000 }));

  it("measures each job's runner speed against the tests' medians", () => {
    expect(runnerSpeedFactors([job(1), job(1), job(0.6), job(1.2)])).toEqual([1, 1, 0.6, 1.2]);
  });

  it("keeps the factor at 1 without enough samples of at least 5 s, and leaves skipped tests alone", () => {
    const short = [1, 2, 3, 4, 6, 7].map((seconds, i) => ({ lane: "e2e" as const, key: `s${i}`, seconds: seconds < 5 ? seconds : seconds * 0.5 }));
    const skipped = { lane: "e2e" as const, key: "skip", seconds: null };
    expect(runnerSpeedFactors([short, [skipped]])).toEqual([1, 1]);
    expect(normalizeRunnerSpeed([[skipped]]).samples).toEqual([skipped]);
  });

  it("scales a fast or slow runner's samples back to a median-speed runner before the medians", () => {
    // 3 median-speed runners and 2 fast ones; test y ran once on a median runner and twice on the fast ones.
    const y = (factor: number) => ({ lane: "e2e" as const, key: "y", seconds: 100 * factor });
    const jobs = [[...job(1), y(1)], job(1), job(1), [...job(0.65), y(0.65)], [...job(0.65), y(0.65)]];
    expect(medianDurations(jobs.flat()).e2e.y).toBe(65);
    const { samples, factors } = normalizeRunnerSpeed(jobs);
    expect(factors).toEqual([1, 1, 1, 0.65, 0.65]);
    expect(medianDurations(samples).e2e).toEqual({ t0: 10, t1: 20, t2: 30, t3: 40, t4: 50, t5: 60, y: 100 });
  });

  it("reads the runner fingerprint from a job log", () => {
    const log = "2026-10-18T11:57:29.7Z e2e shard 5/8: 56 of 450 tests, about 1038 worker-s\n2026-10-18T11:57:29.8Z runner: 4 x AMD EPYC 7763 64-Core Processor, sha256 512 MB/s\n";
    expect(parseRunnerLine(log)).toBe("4 x AMD EPYC 7763 64-Core Processor, sha256 512 MB/s");
    expect(parseRunnerLine("Current runner version: '2.329.0'")).toBeNull();
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
    { lane: "e2e" as const, perf: false, args: ["--grep-invert", "@nightly"], totals: [4, 8] },
    { lane: "perf" as const, perf: true, args: ["--grep-invert", "@nightly|@look"], totals: [1, 2, 3, 4] },
  ])("$lane: every listed test lands in exactly one shard", ({ lane, perf, args, totals }) => {
    const all = list(perf, args);
    expect(all.length).toBeGreaterThan(perf ? 10 : 100);
    expect(new Set(all).size).toBe(all.length);
    for (const total of totals) {
      const planned = planShards(all, total, durations[lane], CI_WORKERS_PER_SHARD, perf ? "max" : "median").flat();
      expect(planned).toHaveLength(all.length);
      expect([...planned].sort()).toEqual([...all].sort());
    }
    // Most listed tests have a measured duration; a big gap means e2e/durations.json needs a refresh.
    const known = all.filter((t) => durations[lane]?.[durationKey(t)] !== undefined).length;
    expect(known / all.length).toBeGreaterThan(0.8);
  }, 120_000);

  it("pull requests and main skip exactly the tagged nightly-only tests, each with a measured duration", () => {
    const nightly = list(false, ["--grep", "@nightly"]);
    // The moved tests and why: docs/agents/performance.md (Nightly-only e2e tests). Update both together.
    expect(nightly).toHaveLength(7);
    expect(nightly.every(isNightlyTest)).toBe(true);
    for (const t of nightly) expect(durations.e2e?.[durationKey(t)], t).toBeGreaterThan(0);
    const skipped = new Set(list(false, ["--grep-invert", "@nightly"]));
    expect(nightly.some((t) => skipped.has(t))).toBe(false);
    for (const smoke of PR_SMOKE) if (smoke.title) expect(isNightlyTest(smoke.title)).toBe(false);
  }, 120_000);
});
