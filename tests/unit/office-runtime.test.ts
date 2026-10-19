import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY } from "@/experience/config";
import { OFFICE_CHIP_FAR, nextChipFar } from "@/experience/floors/lobby/office/runtime";
import { OFFICE, OFFICE_ROOMS } from "@/experience/floors/lobby/officeLayout";
import { atOfficeStop, officeChipsHere, wingSignHidden } from "@/experience/floors/lobby/officeShell";
import { roverRuntime } from "@/experience/rover/runtime";

describe("nextChipFar", () => {
  it("switches to far only past the upper edge of the band and back to near only below the lower edge", () => {
    expect(nextChipFar(false, OFFICE_CHIP_FAR + 0.9)).toBe(false);
    expect(nextChipFar(false, OFFICE_CHIP_FAR + 1.1)).toBe(true);
    expect(nextChipFar(true, OFFICE_CHIP_FAR - 0.9)).toBe(true);
    expect(nextChipFar(true, OFFICE_CHIP_FAR - 1.1)).toBe(false);
  });

  it("holds its value while the camera hovers at the threshold", () => {
    let far = false;
    for (const d of [27.5, 28.5, 27.6, 28.4, 28.9].map((x) => x - 28 + OFFICE_CHIP_FAR)) far = nextChipFar(far, d);
    expect(far).toBe(false);
    far = true;
    for (const d of [28.5, 27.5, 28.4, 27.2].map((x) => x - 28 + OFFICE_CHIP_FAR)) far = nextChipFar(far, d);
    expect(far).toBe(true);
  });

  it("stays far on a phone at any distance (no room for task lines over the wall; the drawer shows them)", () => {
    for (const far of [true, false]) for (const d of [5, OFFICE_CHIP_FAR, 40]) expect(nextChipFar(far, d, true)).toBe(true);
    expect(nextChipFar(true, 5, false)).toBe(false);
  });
});

describe("officeChipsHere", () => {
  const W = LOBBY.officeWing;
  const { rect } = W;
  const { half } = OFFICE.view;
  /** The `L1:office` view zone area around the stop, its edges included. */
  const area = { minX: W.stop.x - half.x, maxX: W.stop.x + half.x, minZ: W.stop.z - half.z, maxZ: W.stop.z + half.z };

  it("is the office stop's view zone area (L1:office)", () => {
    const zone = buildFloorLayouts(8).L1.viewZones!.find((z) => z.id === "L1:office")!;
    expect(zone.area).toEqual(area);
  });

  it("lets the chips show only while the rover is at the office stop (its view zone area, edges included)", () => {
    for (const at of [W.stop, { x: area.minX, z: area.minZ }, { x: area.maxX, z: area.maxZ }, { x: area.minX, z: area.maxZ }, { x: area.maxX, z: area.minZ }])
      expect(officeChipsHere(null, at), JSON.stringify(at)).toBe(true);
    // The lead road in the Lobby (the approach), the wing entry, the wing plaza, the rest of the wing, just outside each
    // edge of the area, the spawn, the elevator arrival.
    const out = [
      { x: W.lead.x, z: rect.minZ - 6 },
      { x: W.lead.x, z: rect.minZ },
      W.plaza.center,
      ...[2, 6, 10, 14].map((dz) => ({ x: W.lead.x, z: rect.minZ + dz })),
      { x: rect.minX, z: W.stop.z },
      { x: rect.maxX, z: rect.maxZ },
      { x: area.minX - 0.01, z: W.stop.z },
      { x: area.maxX + 0.01, z: W.stop.z },
      { x: W.stop.x, z: area.minZ - 0.01 },
      { x: W.stop.x, z: area.maxZ + 0.01 },
      LOBBY.spawn,
      LOBBY.arrival,
    ];
    for (const at of out) {
      expect(officeChipsHere(null, at), JSON.stringify(at)).toBe(false);
      expect(atOfficeStop(at), JSON.stringify(at)).toBe(false);
    }
  });

  it("and while an office drawer is open wherever the rover is; another room's drawer does not count", () => {
    const away = { x: W.lead.x, z: rect.minZ - 6 };
    for (const room of OFFICE_ROOMS) expect(officeChipsHere(room, away), room).toBe(true);
    expect(officeChipsHere("L1:kiosk", away)).toBe(false);
    expect(officeChipsHere("L1:kiosk", W.stop)).toBe(true);
    expect(officeChipsHere(null, W.plaza.center)).toBe(false);
    expect(officeChipsHere("L1:office-desk-3", W.plaza.center)).toBe(true);
  });

  it("reads the rover's live position by default", () => {
    const { x, z } = roverRuntime;
    try {
      Object.assign(roverRuntime, W.stop);
      expect(officeChipsHere(null)).toBe(true);
      expect(atOfficeStop()).toBe(true);
      Object.assign(roverRuntime, LOBBY.spawn);
      expect(officeChipsHere(null)).toBe(false);
    } finally {
      Object.assign(roverRuntime, { x, z });
    }
  });
});

describe("wingSignHidden", () => {
  const W = LOBBY.officeWing;

  it("hides the wing sign on L1 at the office stop only: the lead road, the wing plaza under it and the spawn keep it", () => {
    expect(wingSignHidden("L1", W.stop)).toBe(true);
    expect(wingSignHidden("L1", { x: W.stop.x + OFFICE.view.half.x, z: W.stop.z - OFFICE.view.half.z })).toBe(true);
    for (const at of [{ x: W.lead.x, z: W.rect.minZ - 6 }, W.plaza.center, { x: W.lead.x, z: W.rect.minZ + 14 }, LOBBY.spawn]) expect(wingSignHidden("L1", at), JSON.stringify(at)).toBe(false);
  });

  it("only on L1 (the same x, z on another floor keeps it), and reads the rover by default", () => {
    for (const floor of ["L2", "L3", "L4", "RF", "B1"]) expect(wingSignHidden(floor, W.stop), floor).toBe(false);
    const { x, z } = roverRuntime;
    try {
      Object.assign(roverRuntime, W.stop);
      expect(wingSignHidden("L1")).toBe(true);
    } finally {
      Object.assign(roverRuntime, { x, z });
    }
  });
});
