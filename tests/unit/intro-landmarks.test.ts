import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { beaconAlpha, INTRO_LANDMARKS } from "@/experience/intro/landmarks";
import { revealDistance } from "@/experience/intro/runtime";

describe("INTRO_LANDMARKS", () => {
  it("lists the five landmarks the orbit passes, in order", () => {
    expect(INTRO_LANDMARKS.map((l) => l.id)).toEqual(["stats", "skills", "hall", "observatory", "elevator"]);
  });

  it("keeps every beacon footprint on the Lobby slab", () => {
    const b = LOBBY.bounds;
    for (const l of INTRO_LANDMARKS) {
      expect(l.w, l.id).toBeGreaterThan(0);
      expect(l.d, l.id).toBeGreaterThan(0);
      expect(l.y, l.id).toBeGreaterThan(0);
      expect(l.x - l.w / 2, l.id).toBeGreaterThanOrEqual(b.minX);
      expect(l.x + l.w / 2, l.id).toBeLessThanOrEqual(b.maxX);
      expect(l.z - l.d / 2, l.id).toBeGreaterThanOrEqual(b.minZ);
      expect(l.z + l.d / 2, l.id).toBeLessThanOrEqual(b.maxZ);
    }
  });

  it("builds the footprints from the layout constants", () => {
    const by = Object.fromEntries(INTRO_LANDMARKS.map((l) => [l.id, l]));
    expect(by.stats).toMatchObject({ x: LOBBY.hologram.x, z: LOBBY.hologram.z, y: LOBBY.statsTile.y });
    expect(by.stats.w).toBeCloseTo(2 * (LOBBY.statsRadius + LOBBY.statsTile.w / 2 + 1));
    expect(by.hall).toMatchObject({ x: (HALL.entry.minX + HALL.entry.maxX) / 2, z: (HALL.entry.minZ + HALL.entry.maxZ) / 2, y: HALL.gate.h / 2 });
    const o = LOBBY.observatory;
    expect(by.observatory).toMatchObject({ x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2, w: o.maxX - o.minX, d: o.maxZ - o.minZ, y: 4.6 });
    expect(by.elevator).toMatchObject({ x: LOBBY.bounds.minX + 1.5, z: 0, w: 3, d: 6, y: 1.8 });
  });
});

describe("revealDistance", () => {
  const rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 2 };
  it("is 0 inside the rect and on its edge", () => {
    expect(revealDistance({ x: 2, z: 1 }, rect)).toBe(0);
    expect(revealDistance({ x: 4, z: 2 }, rect)).toBe(0);
  });
  it("is the distance to the nearest point of the rect outside it", () => {
    expect(revealDistance({ x: -3, z: 1 }, rect)).toBeCloseTo(3);
    expect(revealDistance({ x: 7, z: 6 }, rect)).toBeCloseTo(5);
  });
});

describe("beaconAlpha", () => {
  it("is 0 before the hit and after 2 s", () => {
    expect(beaconAlpha(-0.1)).toBe(0);
    expect(beaconAlpha(2)).toBe(0);
    expect(beaconAlpha(5)).toBe(0);
  });
  it("rises over 0.3 s, holds until 0.8 s, then falls", () => {
    expect(beaconAlpha(0)).toBe(0);
    expect(beaconAlpha(0.15)).toBeCloseTo(0.5);
    expect(beaconAlpha(0.3)).toBe(1);
    expect(beaconAlpha(0.6)).toBe(1);
    expect(beaconAlpha(0.8)).toBe(1);
    expect(beaconAlpha(1.4)).toBeCloseTo(0.5);
    let prev = 1;
    for (let s = 0.8; s <= 2; s += 0.05) {
      const a = beaconAlpha(s);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });
});

describe("beacon holo mode", () => {
  it("adds mode 14 to the shared holo program", async () => {
    const { HOLO_FS, HOLO_MODE } = await import("@/experience/fx/holoFx");
    expect(HOLO_MODE.beacon).toBe(14);
    expect(HOLO_FS).toContain("uMode == 14");
  });
});
