import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { REACTOR_RINGS } from "@/content/tech-rings";
import { buildLabsLayout } from "@/experience/floors/labs/layout";
import { REACTOR, reactorRect } from "@/experience/floors/labs/reactor";
import {
  litPods,
  podAt,
  REACTOR_ROOM,
  reactorStop,
  ringBands,
  roadGlow,
  surprisePod,
  TECH_RINGS,
  techFromHash,
  techHash,
} from "@/experience/floors/labs/techReactor";
import { onNetwork } from "@/experience/nav/road";
import { distanceToRect } from "@/experience/nav/collision";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const pods = buildExperienceData("en", FLOOR_NAMES).labs.pods;
const layout = buildLabsLayout(pods);
const center = layout.reactor.center;

describe("tech reactor model", () => {
  it("has one ring per reactor ring id, stacked below the core top, DevOps at the bottom and AI at the top", () => {
    expect(TECH_RINGS.map((r) => r.id).sort()).toEqual([...REACTOR_RINGS].sort());
    const ys = TECH_RINGS.map((r) => r.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(TECH_RINGS[0].id).toBe("devops");
    expect(TECH_RINGS.at(-1)!.id).toBe("ai");
    expect(Math.max(...ys)).toBeLessThan(REACTOR.height);
  });

  it("splits the core into contiguous pick bands from the floor up", () => {
    const bands = ringBands();
    expect(bands[0].base).toBe(0);
    bands.forEach((band, i) => {
      expect(band.top).toBeGreaterThan(band.base);
      expect(band.base).toBeLessThanOrEqual(TECH_RINGS[i].y);
      expect(band.top).toBeGreaterThanOrEqual(TECH_RINGS[i].y);
      if (i > 0) expect(band.base).toBe(bands[i - 1].top);
    });
    expect(bands.at(-1)!.top).toBeLessThanOrEqual(REACTOR.height + 1);
  });

  it("parks the rover on the ring road east of the core, outside it", () => {
    const stop = reactorStop(center);
    expect(onNetwork(layout.network, stop)).toBe(true);
    expect(distanceToRect(stop, reactorRect(center))).toBeGreaterThan(3);
    expect(stop.x).toBeGreaterThan(center.x);
    expect(layout.floor.stops?.[REACTOR_ROOM]).toEqual(stop);
    expect(layout.floor.viewZones?.some((z) => z.id === REACTOR_ROOM)).toBe(true);
  });

  it("lights placed pods only", () => {
    const docked = layout.placed.slice(0, 2).map((p) => p.pod.slug);
    const listed = Object.values(layout.directory).flat()[0]?.slug;
    const lit = litPods(layout.placed, [...docked, ...(listed ? [listed] : [])]);
    expect(lit.map((p) => p.pod.slug)).toEqual(docked);
  });

  it("glows the road from the reactor to every lit pod, on the network", () => {
    expect(roadGlow(layout, [])).toEqual([]);
    const soft = layout.placed.filter((p) => p.pod.wing === "software");
    const ai = layout.placed.filter((p) => p.pod.wing === "ai");
    const lit = [soft[0], soft.at(-1)!, ai[1]];
    const segs = roadGlow(layout, lit);
    for (const s of segs) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = { x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t };
        expect(onNetwork(layout.network, p), JSON.stringify(p)).toBe(true);
      }
    }
    // Each lit pod's spur ends at its door.
    for (const p of lit) expect(segs.some((s) => s.b.x === p.door.x && s.b.z === p.door.z)).toBe(true);
    // The wing run reaches the westmost lit pod of the wing.
    const westSoft = Math.min(...[soft[0], soft.at(-1)!].map((p) => p.door.x));
    expect(segs.some((s) => Math.min(s.a.x, s.b.x) === westSoft && s.a.z === s.b.z)).toBe(true);
  });

  it("picks a surprise pod other than the current one, preferring the selection", () => {
    const all = ["a", "b", "c"];
    expect(surprisePod(all, [], "a", () => 0)).toBe("b");
    expect(surprisePod(all, ["a", "c"], "a", () => 0.99)).toBe("c");
    expect(surprisePod(all, ["a"], "a", () => 0)).toBe("b");
    expect(surprisePod(["a"], [], "a", () => 0)).toBeNull();
    for (let i = 0; i < 20; i++) expect(surprisePod(all, [], "b", Math.random)).not.toBe("b");
  });

  it("finds the pod the rover is at", () => {
    const p = layout.placed[3];
    expect(podAt(layout.placed, p.door)).toBe(p.pod.slug);
    expect(podAt(layout.placed, reactorStop(center))).toBeNull();
  });

  it("round-trips the deep link hash", () => {
    expect(techHash("azure-openai")).toBe("#labs-tech=azure-openai");
    expect(techHash(null)).toBe("");
    expect(techFromHash("#labs-tech=azure-openai")).toBe("azure-openai");
    expect(techFromHash("labs-tech=next-js")).toBe("next-js");
    expect(techFromHash("#highlights-about")).toBeNull();
    expect(techFromHash("#labs-tech=Bad Slug!")).toBeNull();
    expect(techFromHash("")).toBeNull();
  });
});
