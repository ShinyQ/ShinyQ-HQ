import { describe, expect, it } from "vitest";
import { buildFloorLayouts } from "@/experience/config";
import { createOrbitState, createZoneHold, holdZone, rotate, rotateStep, setPitchRange, stepOrbit, updateZone, zoomBy, type OrbitState } from "@/experience/camera/orbit";
import { pitchRange } from "@/experience/camera/rigs";
import { officeChipMode } from "@/experience/floors/lobby/officeShell";
import { LOBBY } from "@/experience/config";

/**
 * `holdZone` (CameraDirector writes it to `roverRuntime.cameraView` and `cameraHeld`): which zone's view the camera shows
 * and whether it has come to rest in it. The office chips read it (`officeChipMode`): full once held, hidden while the
 * view eases in, compact dots when the view does not apply (reduced motion, a hand turn, first person).
 */
const office = buildFloorLayouts(8).L1.viewZones!.find((z) => z.id === "L1:office")!;
const stop = LOBBY.officeWing.stop;

function atStop(reduced = false, cls: "desktop" | "tablet" | "mobile" = "desktop") {
  const s = createOrbitState();
  setPitchRange(s, pitchRange(cls, "follow"));
  updateZone(s, office, reduced, cls);
  return s;
}
const settle = (s: OrbitState, reduced = false) => {
  for (let i = 0; i < 300 && s.easing; i++) stepOrbit(s, 1 / 60, reduced);
};
const mode = (h: ReturnType<typeof createZoneHold>) => officeChipMode(null, stop, h.zone, h.held);

describe("holdZone", () => {
  it("holds the office view from the frame the camera comes to rest in it, not while it eases in", () => {
    const s = atStop();
    const h = createZoneHold();
    holdZone(h, s, false, false);
    expect(h).toMatchObject({ zone: "L1:office", held: false });
    expect(mode(h)).toBeNull();
    settle(s);
    holdZone(h, s, false, true);
    expect(h.held).toBe(true);
    expect(mode(h)).toBe("full");
  });

  it("keeps holding through a hand zoom out (a held look offset, no near aim) and camera motion that changes nothing it tracks", () => {
    const s = atStop();
    const h = createZoneHold();
    settle(s);
    holdZone(h, s, false, true);
    zoomBy(s, 1.1, false);
    for (let i = 0; i < 30; i++) {
      stepOrbit(s, 1 / 60, false);
      holdZone(h, s, false, false);
      expect(mode(h)).toBe("full");
    }
  });

  it("lets go when a desktop hand zoom in re-aims its held look offset (the near pose), and holds again once the camera rests", () => {
    const s = atStop();
    const h = createZoneHold();
    settle(s);
    holdZone(h, s, false, true);
    zoomBy(s, 0.8, false);
    holdZone(h, s, false, false);
    expect(mode(h)).toBeNull();
    settle(s);
    holdZone(h, s, false, true);
    expect(mode(h)).toBe("full");
  });

  it("lets go when a portrait screen's hand zoom eases its look offset out, and holds again once the camera rests", () => {
    const s = atStop(false, "mobile");
    const h = createZoneHold();
    settle(s);
    holdZone(h, s, false, true);
    zoomBy(s, 0.8, false);
    holdZone(h, s, false, false);
    expect(mode(h)).toBeNull();
    settle(s);
    holdZone(h, s, false, true);
    expect(mode(h)).toBe("full");
  });

  it("lets go on a device rotation (the camera class changes)", () => {
    const s = atStop();
    const h = createZoneHold();
    settle(s);
    holdZone(h, s, false, true);
    setPitchRange(s, pitchRange("tablet", "follow"));
    updateZone(s, office, false, "tablet");
    holdZone(h, s, false, false);
    expect(mode(h)).toBeNull();
  });

  it("shows no zone view under reduced motion, after a hand turn, a key turn or in first person: compact dots", () => {
    const reduced = atStop(true);
    const h = createZoneHold();
    settle(reduced, true);
    holdZone(h, reduced, true, true);
    expect(h.zone).toBeNull();
    expect(mode(h)).toBe("compact");
    for (const turn of [(s: OrbitState) => rotate(s, 0.2, 0), (s: OrbitState) => rotateStep(s, 1), (s: OrbitState) => zoomBy(s, 0.1)]) {
      const s = atStop();
      const g = createZoneHold();
      settle(s);
      holdZone(g, s, false, true);
      expect(mode(g)).toBe("full");
      turn(s);
      holdZone(g, s, false, false);
      expect(g.zone, "the view no longer applies").toBeNull();
      expect(mode(g)).toBe("compact");
    }
  });

  it("off the stop, nothing shows whatever the camera holds", () => {
    const far = { x: stop.x, z: stop.z - 10 };
    expect(officeChipMode(null, far, "L1:office", true)).toBeNull();
    expect(officeChipMode(null, far, null, true)).toBeNull();
    // An office drawer open away from the stop: the view is not applied there, so the dots show.
    expect(officeChipMode("L1:office", far, null, true)).toBe("compact");
  });
});
