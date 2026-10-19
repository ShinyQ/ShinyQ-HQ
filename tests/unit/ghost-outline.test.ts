import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ceilingOpacity, FIRST_PERSON } from "@/experience/camera/firstPerson";
import { buildFloorLayouts, floorY, LOBBY } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { ghostOutlineHidden, ghostOutlineOpacity, inLookUnderArea, stepGhostOutline } from "@/experience/tower/ghostOutline";

/**
 * Owner decision 2026-10-20 (option a): the ghost outline of the floors above the rover (the amber L2 line that
 * crossed the office view) hides only while the rover is in the L1 office wing or a view zone that looks under it,
 * and stays everywhere else, the spawn included. It fades out and back over the ghost floors' own fade (the first
 * person glide) and cuts under reduced motion.
 */
const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const layouts = buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) });
const L1 = layouts.L1;
const W = LOBBY.officeWing;
const on = (floor: "L1" | "L2" | "L3", p: { x: number; z: number }) => ({ x: p.x, y: floorY(floor), z: p.z });

describe("ghostOutlineHidden", () => {
  it("marks the office wing on L1 and the office zone (data, nothing else)", () => {
    expect(L1.hideGhostAbove).toEqual([W.rect]);
    expect((L1.viewZones ?? []).filter((z) => z.hideGhostAbove).map((z) => z.id)).toEqual(["L1:office"]);
    for (const id of ["L2", "L3", "L4", "RF", "B1"] as const) {
      expect(layouts[id].hideGhostAbove, id).toBeUndefined();
      expect((layouts[id].viewZones ?? []).some((z) => z.hideGhostAbove), id).toBe(false);
    }
  });

  it("hides the floors above while the rover is in the wing: at the stop, on the wing plaza, at its corners", () => {
    for (const p of [W.stop, W.plaza.center, { x: W.rect.minX + 0.5, z: W.rect.minZ + 0.5 }, { x: W.rect.maxX - 0.5, z: W.rect.maxZ - 0.5 }])
      for (const floor of ["L2", "L3", "L4", "RF"] as const) expect(ghostOutlineHidden(floor, on("L1", p), L1), `${floor} at ${p.x}, ${p.z}`).toBe(true);
  });

  it("keeps the outline at the spawn, the elevator arrival, on the lead road and in every other zone", () => {
    const zones = (L1.viewZones ?? []).filter((z) => z.id !== "L1:office");
    expect(zones.length).toBeGreaterThan(3);
    const spots = [
      LOBBY.spawn,
      LOBBY.arrival,
      { x: W.lead.x, z: W.lead.from + 1 },
      { x: W.lead.x, z: W.rect.minZ - 0.5 },
      ...zones.map((z) => ({ x: (z.area.minX + z.area.maxX) / 2, z: (z.area.minZ + z.area.maxZ) / 2 })),
    ];
    for (const p of spots) expect(ghostOutlineHidden("L2", on("L1", p), L1), `${p.x}, ${p.z}`).toBe(false);
  });

  it("only touches floors above the rover, and only from the floor that marks the area", () => {
    // The rover's own floor and the floors below keep their solid outline.
    expect(ghostOutlineHidden("L1", on("L1", W.stop), L1)).toBe(false);
    expect(ghostOutlineHidden("B1", on("L1", W.stop), L1)).toBe(false);
    // The same x, z on another floor (no marked area there) keeps the floors above it.
    expect(ghostOutlineHidden("L4", on("L3", W.stop), layouts.L3)).toBe(false);
    expect(ghostOutlineHidden("L3", on("L2", W.stop), layouts.L2)).toBe(false);
    expect(ghostOutlineHidden("L2", on("L1", W.stop), undefined)).toBe(false);
  });

  it("follows a flagged zone outside any marked rect", () => {
    const zone = { id: "x", area: { minX: 100, maxX: 104, minZ: 0, maxZ: 4 }, yaw: 0, hideGhostAbove: true as const };
    const layout = { viewZones: [zone] };
    expect(ghostOutlineHidden("L2", on("L1", { x: 102, z: 2 }), layout)).toBe(true);
    expect(ghostOutlineHidden("L2", on("L1", { x: 106, z: 2 }), layout)).toBe(false);
    expect(ghostOutlineHidden("L2", on("L1", { x: 102, z: 2 }), { viewZones: [{ ...zone, hideGhostAbove: undefined }] })).toBe(false);
  });
});

describe("inLookUnderArea (the tower frame's rule, the same areas as the ghost outline)", () => {
  it("holds in the office wing and at the office stop, so the frame's far edge leaves the office view", () => {
    for (const p of [W.stop, W.plaza.center, { x: W.rect.minX + 0.5, z: W.rect.minZ + 0.5 }, { x: W.rect.maxX - 0.5, z: W.rect.maxZ - 0.5 }])
      expect(inLookUnderArea(p, L1), `${p.x}, ${p.z}`).toBe(true);
  });

  it("does not hold at the spawn, the elevator arrival, on the lead road, in every other zone or on another floor", () => {
    const zones = (L1.viewZones ?? []).filter((z) => z.id !== "L1:office");
    for (const p of [LOBBY.spawn, LOBBY.arrival, { x: W.lead.x, z: W.lead.from + 1 }, { x: W.lead.x, z: W.rect.minZ - 0.5 }, ...zones.map((z) => ({ x: (z.area.minX + z.area.maxX) / 2, z: (z.area.minZ + z.area.maxZ) / 2 }))])
      expect(inLookUnderArea(p, L1), `${p.x}, ${p.z}`).toBe(false);
    for (const id of ["L2", "L3", "L4", "RF", "B1"] as const) expect(inLookUnderArea(W.stop, layouts[id]), id).toBe(false);
    expect(inLookUnderArea(W.stop, undefined)).toBe(false);
  });

  it("is the ghost outline's area: ghostOutlineHidden adds only the floor-above rule", () => {
    for (const p of [W.stop, LOBBY.spawn, { x: W.lead.x, z: W.rect.minZ - 0.5 }, W.plaza.center])
      expect(ghostOutlineHidden("L2", on("L1", p), L1)).toBe(inLookUnderArea(p, L1));
  });
});

describe("stepGhostOutline and ghostOutlineOpacity", () => {
  it("fades over the ghost floors' own fade time (the first person glide), frame-rate independent, and back", () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 6; i++) a = stepGhostOutline(a, true, 1 / 60, false);
    for (let i = 0; i < 3; i++) b = stepGhostOutline(b, true, 1 / 30, false);
    expect(a).toBeCloseTo(b, 12);
    expect(a).toBeCloseTo(0.1 / FIRST_PERSON.glide, 12);
    let t = 0;
    let hide = 0;
    while (hide < 1) {
      hide = stepGhostOutline(hide, true, 1 / 60, false);
      t += 1 / 60;
    }
    expect(t).toBeCloseTo(FIRST_PERSON.glide, 1);
    expect(ghostOutlineOpacity(1)).toBe(0);
    expect(ghostOutlineOpacity(0)).toBe(1);
    // The same eased curve as the ghost floors' fade.
    for (const v of [0.2, 0.5, 0.8]) expect(ghostOutlineOpacity(v)).toBe(ceilingOpacity(v));
    hide = stepGhostOutline(1, false, 1 / 60, false);
    expect(hide).toBeCloseTo(1 - 1 / 60 / FIRST_PERSON.glide, 12);
    expect(stepGhostOutline(0, false, 1 / 60, false)).toBe(0);
    expect(stepGhostOutline(1, true, 1, false)).toBe(1);
    expect(stepGhostOutline(0.5, true, 10, false)).toBe(1);
  });

  it("cuts under reduced motion", () => {
    expect(stepGhostOutline(0, true, 1 / 60, true)).toBe(1);
    expect(stepGhostOutline(1, false, 1 / 60, true)).toBe(0);
    expect(stepGhostOutline(0.4, true, 0, true)).toBe(1);
  });
});
