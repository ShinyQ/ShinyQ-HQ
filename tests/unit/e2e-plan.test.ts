import { describe, expect, it } from "vitest";
import { ALL_SPECS, assignShard, parseShard, SMOKE_SPECS, specsForChanges } from "../../scripts/e2e-plan";
import { readdirSync } from "node:fs";

describe("specsForChanges", () => {
  it("maps the elevator ride code to the ride spec", () => {
    expect(specsForChanges(["src/experience/tower/elevator.ts"]).specs).toEqual(["experience", "ride"]);
    expect(specsForChanges(["src/experience/scene/Director.tsx"]).specs).toEqual(["experience", "ride"]);
    expect(specsForChanges(["src/experience/text-config.ts"]).specs).toEqual(["experience", "ride"]);
    expect(specsForChanges(["src/experience/camera/CameraDirector.tsx"]).specs).toEqual(["camera", "career", "experience", "ride"]);
    expect(specsForChanges(["e2e/ride.spec.ts"]).specs).toEqual(["ride"]);
  });
  it("maps the Rover dialog, the onboarding and the hint bubbles to the onboarding spec", () => {
    expect(specsForChanges(["src/hud/dialog/engine.ts"]).specs).toEqual(["camera", "experience", "onboarding", "walk"]);
    expect(specsForChanges(["src/experience/hints/HintProbe.tsx"]).specs).toEqual(["camera", "experience", "onboarding", "walk"]);
    expect(specsForChanges(["src/hud/walk/WalkLayer.tsx"]).specs).toEqual(["hud", "missions", "onboarding", "walk"]);
    expect(specsForChanges(["src/experience/introContinue.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
  });
  it("maps point-and-go code to the interact spec and the specs that click targets", () => {
    expect(specsForChanges(["src/experience/interact/registry.ts"]).specs).toEqual(["career", "experience", "interact", "pads"]);
    expect(specsForChanges(["src/hud/InteractStatus.tsx"]).specs).toEqual(["career", "experience", "interact", "pads"]);
    expect(specsForChanges(["e2e/interact.spec.ts"]).specs).toEqual(["interact"]);
  });
  it("maps the 3D gate, its tier probe and the landing's Enter button to the gate specs", () => {
    expect(specsForChanges(["src/experience/gate-tier.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/components/page/EnterHqButton.tsx"]).specs).toEqual(["boot-first", "experience", "pageview"]);
  });

  it("maps the Highlights Hall to its spec, the 3D experience and the walks", () => {
    expect(specsForChanges(["src/experience/floors/lobby/hallLayout.ts"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/experience/floors/lobby/HighlightsHall.tsx"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/content/room-views/highlights.ts"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/hud/drawer/HighlightsBody.tsx"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/experience/floors/lobby/CertWall.tsx"]).specs).toEqual(["experience", "highlights"]);
  });

  it("maps floor code to its spec", () => {
    expect(specsForChanges(["src/experience/floors/labs/Pods.tsx"]).specs).toEqual(["gallery", "labs", "walk"]);
    expect(specsForChanges(["src/experience/floors/career/layout.ts"]).specs).toEqual(["career", "pads"]);
    expect(specsForChanges(["src/experience/floors/library/layout.ts"]).specs).toEqual(["library-roof", "walk"]);
    expect(specsForChanges(["src/lib/intro-session.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/components/BootCard.tsx"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/experience/introContinue.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
    expect(specsForChanges(["src/hud/Controls.tsx"]).specs).toEqual(["drawer-solid", "experience", "hud", "missions"]);
    expect(specsForChanges(["src/hud/walk/WalkBar.tsx"]).specs).toEqual(["hud", "missions", "onboarding", "walk"]);
    expect(specsForChanges(["src/experience/floors/roof/layout.ts"]).specs).toEqual(["library-roof", "pads", "roof", "walk"]);
    expect(specsForChanges(["src/experience/floors/Roof.tsx"]).specs).toEqual(["library-roof", "pads", "roof", "walk"]);
    expect(specsForChanges(["src/content/room-views/roof.ts"]).specs).toEqual(["library-roof", "roof"]);
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
    expect(specsForChanges(["src/hud/CommandPalette.tsx"]).specs).toEqual(["ask", "drawer-solid", "experience", "missions"]);
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
      .filter((f) => f.endsWith(".spec.ts") && f !== "screenshots.spec.ts" && f !== "pageview-visual.spec.ts" && f !== "camera-visual.spec.ts" && f !== "visual-gate.spec.ts")
      .map((f) => f.replace(/\.spec\.ts$/, ""))
      .sort();
    expect(onDisk).toEqual([...ALL_SPECS].sort());
  });

  it("never runs the opt-in camera look gate from e2e:changed", () => {
    expect(specsForChanges(["e2e/camera-visual.spec.ts"]).specs).toEqual([]);
  });

  it("maps the camera, its input, the rover fade and the view buttons to the camera spec", () => {
    expect(specsForChanges(["src/experience/camera/orbit.ts"]).specs).toEqual(["camera", "career", "experience", "ride"]);
    expect(specsForChanges(["src/experience/input/useInputSources.ts"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["src/experience/rover/fade.ts"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["src/hud/ViewControls.tsx"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["e2e/camera.spec.ts"]).specs).toEqual(["camera"]);
    expect(specsForChanges(["src/experience/fx/Readable.tsx", "src/experience/tower/FloorLevel.tsx"]).specs).toEqual(["camera", "career", "experience", "ride"]);
  });

  it("never runs the visual gate or the perf scripts as part of e2e:changed", () => {
    expect(specsForChanges(["e2e/visual-gate.spec.ts"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/vclock.ts"]).specs).toEqual([]);
    expect(specsForChanges(["scripts/visual-gate.ts"]).specs).toEqual([]);
    expect(specsForChanges(["scripts/perf-gpu.ts"]).specs).toEqual([]);
  });

  it("maps floor pads, their pickers and thumbnails to the pads spec", () => {
    expect(specsForChanges(["src/experience/nav/pads.ts"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["src/experience/fx/PadGlow.tsx"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["src/hud/pads/PadPicker.tsx"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["public/floors/L2.webp"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["src/experience/nav/space.ts"]).specs).toEqual(["experience", "pads", "walk"]);
    expect(specsForChanges(["scripts/floor-thumbs.ts"]).specs).toEqual([]);
  });

  it("maps share cards and search metadata to the SEO specs (R5 P9)", () => {
    expect(specsForChanges(["src/lib/seo.ts"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["src/lib/og-layout.ts"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["public/og-assets/floor-L1.jpg"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["scripts/og-check.ts"]).specs).toEqual(["seo", "static-routes"]);
    expect(specsForChanges(["scripts/og-stills.ts", "scripts/og-before-after.ts"]).specs).toEqual([]);
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
