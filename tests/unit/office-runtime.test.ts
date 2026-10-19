import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { OFFICE_CHIP_FAR, nextChipFar } from "@/experience/floors/lobby/office/runtime";
import { OFFICE_ROOMS } from "@/experience/floors/lobby/officeLayout";
import { officeChipsHere } from "@/experience/floors/lobby/officeShell";
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

  it("lets the chips show only while the rover is in the office wing (its edges included)", () => {
    for (const at of [W.stop, W.plaza.center, { x: rect.minX, z: rect.minZ }, { x: rect.maxX, z: rect.maxZ }, { x: W.lead.x, z: rect.minZ }]) expect(officeChipsHere(null, at), JSON.stringify(at)).toBe(true);
    // The lead road in the Lobby (the approach), the spawn, the elevator arrival, just outside each edge.
    for (const at of [{ x: W.lead.x, z: rect.minZ - 6 }, { x: W.lead.x, z: rect.minZ - 0.01 }, LOBBY.spawn, LOBBY.arrival, { x: rect.minX - 0.01, z: W.stop.z }, { x: rect.maxX + 0.01, z: W.stop.z }, { x: W.lead.x, z: rect.maxZ + 0.01 }])
      expect(officeChipsHere(null, at), JSON.stringify(at)).toBe(false);
  });

  it("and while an office drawer is open wherever the rover is; another room's drawer does not count", () => {
    const away = { x: W.lead.x, z: rect.minZ - 6 };
    for (const room of OFFICE_ROOMS) expect(officeChipsHere(room, away), room).toBe(true);
    expect(officeChipsHere("L1:kiosk", away)).toBe(false);
    expect(officeChipsHere("L1:kiosk", W.stop)).toBe(true);
  });

  it("reads the rover's live position by default", () => {
    const { x, z } = roverRuntime;
    try {
      Object.assign(roverRuntime, W.stop);
      expect(officeChipsHere(null)).toBe(true);
      Object.assign(roverRuntime, LOBBY.spawn);
      expect(officeChipsHere(null)).toBe(false);
    } finally {
      Object.assign(roverRuntime, { x, z });
    }
  });
});
