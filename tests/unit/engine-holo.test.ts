import { describe, expect, it } from "vitest";
import { getBuildFacts, getBuildStory, STATION_IDS } from "@/content/build-story";
import { buildEngineRoomViews } from "@/content/room-views";
import { getTechLogo } from "@/content/tech";
import { ENGINE_ATLAS } from "@/experience/floors/engine/engine-atlas";
import { bayHolo, type Emit, HOLO, HOLO_KIND, HOLO_TONES, haloSpeed, holoFrame, stackHalo, stepWake, wakeGain, wakeTarget } from "@/experience/floors/engine/holo";
import { buildEngineLayout, ENGINE } from "@/experience/floors/engine/layout";
import { REACTOR } from "@/experience/floors/engine/reactor";
import { timelineRows } from "@/lib/build-page";
import { engineAtlasLayout, engineAtlasProblems } from "../../scripts/engine-atlas";

const layout = buildEngineLayout();
const views = buildEngineRoomViews("en");
const holoOf = (id: string) => views[`B1:${id}` as keyof typeof views].engine!.holo!;

type Piece = { k: number; tone: number; gain: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; rx: number };
function collect(draw: (emit: Emit, logo: (cell: number, x: number, y: number, z: number, size: number) => void) => void) {
  const pieces: Piece[] = [];
  const logos: { cell: number; x: number; y: number; z: number; size: number }[] = [];
  draw(
    (k, tone, gain, x, y, z, sx, sy, sz, rx = 0) => pieces.push({ k, tone, gain, x, y, z, sx, sy, sz, rx }),
    (cell, x, y, z, size) => logos.push({ cell, x, y, z, size }),
  );
  return { pieces, logos };
}

describe("B1 hologram data (RoomEngine.holo)", () => {
  it("gives every station bay levels between 0 and 1, one per drawn item", () => {
    const story = getBuildStory();
    for (const id of STATION_IDS) {
      const { levels } = holoOf(id);
      expect(levels.length, id).toBeGreaterThan(0);
      for (const l of levels) {
        expect(l, id).toBeGreaterThanOrEqual(0);
        expect(l, id).toBeLessThanOrEqual(1);
      }
    }
    expect(holoOf("gates").levels).toHaveLength(story.stations.gates.gates.length);
    // The story's ideas and, on B1, the plans the owner dropped.
    expect(holoOf("rejected").levels).toHaveLength(story.stations.rejected.ideas.length + (getBuildFacts().log?.plans.droppedPlans.length ?? 0));
    expect(holoOf("brain").levels).toHaveLength(story.stations.brain.steps.length);
    expect(holoOf("agents").levels).toHaveLength(story.stations.agents.tools.length);
  });

  it("sizes the timeline by pull requests per round, the busiest at 1, and marks the open round", () => {
    const rows = timelineRows(getBuildStory(), getBuildFacts());
    const { levels, mark } = holoOf("timeline");
    expect(levels).toHaveLength(rows.length);
    expect(Math.max(...levels)).toBe(1);
    expect(mark).toBe(rows.findIndex((r) => r.open));
  });

  it("colors gates by where they run: CI 1, nightly 0.66, local 0.33", () => {
    const where = getBuildStory().stations.gates.gates.map((g) => g.where);
    expect(holoOf("gates").levels).toEqual(where.map((w) => ({ ci: 1, nightly: 0.66, local: 0.33 })[w]));
  });

  it("leaves the reactor view without a hologram (it has the core)", () => {
    expect(views["B1:reactor"].engine!.holo).toBeUndefined();
  });
});

describe("B1 station holograms (holo.ts)", () => {
  for (const bay of layout.bays) {
    it(`keeps the ${bay.id} hologram inside its bay, under its sign and over its projector`, () => {
      const { pieces, logos } = collect((emit, logo) => bayHolo(bay, holoOf(bay.id), 3.7, emit, logo, ENGINE_ATLAS.agents));
      expect(pieces.length).toBeGreaterThan(3);
      const f = holoFrame(bay);
      const [disc, cone] = pieces;
      expect(disc.k).toBe(HOLO_KIND.dot);
      expect(disc.rx).toBe(-Math.PI / 2);
      expect(cone.k).toBe(HOLO_KIND.cone);
      expect(cone.y - cone.sy / 2).toBeCloseTo(f.floor);
      for (const p of pieces) {
        expect(p.x, JSON.stringify(p)).toBeGreaterThan(bay.rect.minX);
        expect(p.x, JSON.stringify(p)).toBeLessThan(bay.rect.maxX);
        expect(p.z, JSON.stringify(p)).toBeGreaterThan(bay.rect.minZ);
        expect(p.z, JSON.stringify(p)).toBeLessThan(bay.rect.maxZ);
        // The station sign floats at 5.3: every piece stays under it.
        expect(p.y, JSON.stringify(p)).toBeLessThan(4.8);
        expect(p.tone).toBeGreaterThan(0);
        expect(p.tone).toBeLessThan(HOLO_TONES.length);
      }
      expect(logos.length).toBe(bay.id === "agents" ? ENGINE_ATLAS.agents.length : 0);
    });
  }

  it("draws the same pieces at any time (the renderer sizes its buffers once)", () => {
    for (const bay of layout.bays) {
      const n = (t: number) => collect((emit, logo) => bayHolo(bay, holoOf(bay.id), t, emit, logo, ENGINE_ATLAS.agents)).pieces.length;
      expect(n(0), bay.id).toBe(n(17.3));
    }
  });

  it("moves with time: an awake bay plays its motion", () => {
    const bay = layout.bays.find((b) => b.id === "rejected")!;
    const at = (t: number) => collect((emit, logo) => bayHolo(bay, holoOf(bay.id), t, emit, logo, [])).pieces.map((p) => p.x);
    expect(at(1)).not.toEqual(at(2));
  });

  it("puts the agents' logos on their tiles, one per coding agent", () => {
    const bay = layout.bays.find((b) => b.id === "agents")!;
    const { logos } = collect((emit, logo) => bayHolo(bay, holoOf("agents"), 0, emit, logo, ENGINE_ATLAS.agents));
    expect(logos.map((l) => l.cell)).toEqual(ENGINE_ATLAS.agents);
  });
});

describe("B1 Stack Halo", () => {
  it("orbits one logo per atlas cell around the core, above its crown", () => {
    const { pieces, logos } = collect((emit, logo) => stackHalo(ENGINE_ATLAS.cells, 0.4, 2, emit, logo));
    expect(logos.map((l) => l.cell)).toEqual([...Array(ENGINE_ATLAS.cells).keys()]);
    for (const l of logos) {
      expect(Math.hypot(l.x - ENGINE.reactor.x, l.z - ENGINE.reactor.z)).toBeCloseTo(HOLO.halo.r);
      expect(l.y).toBeGreaterThan(ENGINE.reactor.h);
      expect(l.x).toBeLessThan(ENGINE.bounds.maxX);
    }
    expect(pieces.every((p) => p.tone === 0)).toBe(true);
  });

  it("turns faster with a busier reactor pulse", () => {
    expect(haloSpeed(REACTOR.pulse.max)).toBeGreaterThan(haloSpeed(REACTOR.pulse.idle));
    expect(haloSpeed(REACTOR.pulse.max)).toBeLessThan(0.3);
  });
});

describe("B1 hologram wake", () => {
  it("wakes the bay whose door pad is nearest the rover, none far from every pad", () => {
    layout.bays.forEach((b, i) => expect(wakeTarget(layout.bays, b.pad.x, b.pad.z)).toBe(i));
    expect(wakeTarget(layout.bays, ENGINE.reactor.x, 0)).toBe(-1);
  });

  it("eases in and out within about half a second, idling dim", () => {
    expect(stepWake(0, true, 0.25)).toBeCloseTo(0.5);
    expect(stepWake(1, true, 0.25)).toBe(1);
    expect(stepWake(0.2, false, 0.25)).toBe(0);
    expect(wakeGain(0)).toBe(HOLO.wake.idle);
    expect(wakeGain(1)).toBe(1);
  });
});

describe("B1 engine atlas (scripts/engine-atlas.ts)", () => {
  it("is fresh against the story's stack and the agents' tools", () => {
    expect(engineAtlasProblems()).toEqual([]);
  });

  it("holds the stack then the agents' tools, logos from the registry and Codex as a text cell", () => {
    const { blueprint, agents } = getBuildStory().stations;
    const { layout: atlas, agents: cells } = engineAtlasLayout();
    expect(atlas.srcs).toHaveLength(blueprint.stack.length + agents.tools.length);
    expect(ENGINE_ATLAS.cells).toBe(atlas.srcs.length);
    expect(ENGINE_ATLAS.agents).toEqual(cells);
    for (const name of blueprint.stack) expect(getTechLogo(name), name).not.toBeNull();
    expect(atlas.srcs).toContain("text:Codex");
    expect(ENGINE_ATLAS.file).toMatch(/^\/atlas\/engine\.[0-9a-f]{10}\.webp$/);
  });
});
