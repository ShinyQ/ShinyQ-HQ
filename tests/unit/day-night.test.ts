import { describe, expect, it } from "vitest";
import { Color, Vector3 } from "three";
import { floorY } from "@/experience/config";
import { sceneSettings } from "@/experience/scene/settings";
import { clockPhase, CYCLE_MS, parseSkyParam, parseSkyValue, resolveSkyMode, skyAzimuth, skyState, SKY, SKY_PHASES, underground, UNDERGROUND_BELOW } from "@/experience/sky/dayNight";

describe("day and night model", () => {
  it("runs an 8 minute cycle from clock time", () => {
    expect(CYCLE_MS).toBe(480_000);
    expect(clockPhase(0)).toBe(0);
    expect(clockPhase(120_000)).toBeCloseTo(0.25);
    expect(clockPhase(480_000 * 3 + 240_000)).toBeCloseTo(0.5);
  });
  it("parses ?sky=", () => {
    expect(parseSkyParam("?sky=day")).toEqual({ kind: "phase", phase: 0.5 });
    expect(parseSkyParam("?sky=0.1")).toEqual({ kind: "phase", phase: 0.1 });
    expect(parseSkyParam("?sky=cycle")).toEqual({ kind: "cycle" });
    expect(parseSkyParam("?sky=noon")).toBeNull();
    expect(parseSkyParam("?sky=2")).toBeNull();
    expect(parseSkyParam("")).toBeNull();
  });
  it("parses a stored sky value", () => {
    expect(parseSkyValue("night")).toEqual({ kind: "phase", phase: 0 });
    expect(parseSkyValue("dusk")).toEqual({ kind: "phase", phase: SKY_PHASES.dusk });
    expect(parseSkyValue("0.25")).toEqual({ kind: "phase", phase: 0.25 });
    expect(parseSkyValue("cycle")).toEqual({ kind: "cycle" });
    expect(parseSkyValue(null)).toBeNull();
    expect(parseSkyValue("")).toBeNull();
    expect(parseSkyValue("noon")).toBeNull();
    expect(parseSkyValue("1.5")).toBeNull();
  });
  it("resolves the mode: param, automation, preference, reduced motion", () => {
    const base = { param: null, pref: null, reducedMotion: false, automated: false } as const;
    expect(resolveSkyMode(base)).toEqual({ source: "clock", phase: null, still: false });
    expect(resolveSkyMode({ ...base, reducedMotion: true })).toEqual({ source: "held", phase: 0, still: false });
    expect(resolveSkyMode({ ...base, reducedMotion: true, pref: "on" })).toEqual({ source: "clock", phase: null, still: false });
    expect(resolveSkyMode({ ...base, pref: "off" })).toEqual({ source: "held", phase: 0, still: false });
    expect(resolveSkyMode({ ...base, automated: true })).toEqual({ source: "held", phase: 0, still: true });
    expect(resolveSkyMode({ ...base, automated: true, param: { kind: "cycle" } })).toEqual({ source: "clock", phase: null, still: false });
    expect(resolveSkyMode({ ...base, pref: "off", param: { kind: "phase", phase: 0.5 } })).toEqual({ source: "param", phase: 0.5, still: false });
  });
  it("only the automation hold is still: a visitor's held night keeps the moon and stars", () => {
    const base = { param: null, pref: null, reducedMotion: false, automated: false } as const;
    expect(resolveSkyMode({ ...base, pref: "off" }).still).toBe(false);
    expect(resolveSkyMode({ ...base, reducedMotion: true }).still).toBe(false);
    expect(resolveSkyMode({ ...base, automated: true }).still).toBe(true);
    expect(resolveSkyMode({ ...base, automated: true, param: { kind: "phase", phase: 0 } }).still).toBe(false);
  });
  it("night reproduces today's scene settings exactly", () => {
    const s = skyState(SKY_PHASES.night);
    const today = sceneSettings("full");
    expect(s.day).toBe(0);
    expect(s.warm).toBe(0);
    expect(s.stars).toBe(1);
    expect(s.fog.getHex()).toBe(new Color(today.fog.color).getHex());
    expect(s.zenith.getHex()).toBe(new Color(today.fog.color).getHex());
    expect(s.horizon.getHex()).toBe(new Color(today.fog.color).getHex());
    expect(s.hemisphere.sky.getHex()).toBe(new Color(today.hemisphere[0]).getHex());
    expect(s.hemisphere.intensity).toBe(today.hemisphere[2]);
    expect(s.directional.color.getHex()).toBe(new Color(today.directional.color).getHex());
    expect(s.directional.intensity).toBe(today.directional.intensity);
    expect(s.bloom).toBe(today.bloom!.intensity);
  });
  it("midday is a deep twilight: day 1, no stars, dimmer neon, warm sun glow", () => {
    const s = skyState(SKY_PHASES.day);
    expect(s.day).toBe(1);
    expect(s.stars).toBe(0);
    expect(s.bloom).toBeLessThan(0.9);
    expect(s.glow.r).toBeGreaterThan(s.glow.b);
    expect(s.horizon.getHex()).not.toBe(s.zenith.getHex());
  });
  it("dawn and dusk are warm and half lit", () => {
    for (const p of [SKY_PHASES.dawn, SKY_PHASES.dusk]) {
      const s = skyState(p);
      expect(s.day).toBeCloseTo(0.5);
      expect(s.warm).toBeCloseTo(1);
    }
  });
  it("sun and moon ride one tall vertical arc facing the camera, opposite each other", () => {
    expect(skyAzimuth("desktop")).toBe(SKY.azimuth.desktop);
    expect(skyAzimuth("tablet")).toBe(SKY.azimuth.tablet);
    expect(skyAzimuth("mobile")).toBe(SKY.azimuth.mobile);
    // The default azimuth is the desktop one.
    expect(skyState(0.5).sun.dir.distanceTo(skyState(0.5, undefined, SKY.azimuth.desktop).sun.dir)).toBeLessThan(1e-9);
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      const az = skyAzimuth(cls);
      const at = (p: number) => skyState(p, undefined, az);
      // Camera right when looking along `az` (increasing azimuth is to the left).
      const right = new Vector3(-Math.cos(az), 0, Math.sin(az));
      // Midday: the sun at the top, the moon at the bottom; night: the other way round.
      expect(at(0.5).sun.elevation).toBeCloseTo(SKY.horizon + SKY.rise, 6);
      expect(at(0.5).moon.elevation).toBeCloseTo(SKY.horizon - SKY.rise, 6);
      expect(at(0).moon.elevation).toBeCloseTo(SKY.horizon + SKY.rise, 6);
      expect(at(0).sun.elevation).toBeCloseTo(SKY.horizon - SKY.rise, 6);
      // Top and bottom sit straight above and below the center: no sideways offset.
      expect(Math.abs(at(0.5).sun.dir.dot(right))).toBeLessThan(1e-9);
      // Dawn and dusk: on the horizon, the sun rising on the left and setting on the right, the moon opposite.
      const dawn = at(0.25);
      const dusk = at(0.75);
      expect(dawn.sun.elevation).toBeCloseTo(SKY.horizon, 2);
      expect(dusk.sun.elevation).toBeCloseTo(SKY.horizon, 2);
      expect(dawn.sun.dir.dot(right)).toBeLessThan(0);
      expect(dusk.sun.dir.dot(right)).toBeGreaterThan(0);
      expect(dawn.moon.dir.dot(right)).toBeGreaterThan(0);
      expect(dusk.moon.dir.dot(right)).toBeLessThan(0);
      let lateral = 0;
      let low = Infinity;
      let high = -Infinity;
      for (let i = 0; i < 64; i++) {
        const p = i / 64;
        const s = at(p);
        expect(s.sun.dir.length()).toBeCloseTo(1, 9);
        expect(s.moon.dir.length()).toBeCloseTo(1, 9);
        // The moon is the sun half a cycle later: the same ellipse, the opposite side.
        expect(s.moon.dir.distanceTo(at((p + 0.5) % 1).sun.dir)).toBeLessThan(1e-9);
        lateral = Math.max(lateral, Math.abs(Math.asin(s.sun.dir.dot(right))));
        low = Math.min(low, s.sun.elevation);
        high = Math.max(high, s.sun.elevation);
      }
      // Up to down: the vertical travel is more than twice the sideways travel.
      expect(high - low).toBeGreaterThan(2 * (2 * lateral));
    }
    // The night moon and the midday sun share one direction (in front of the L1 default camera).
    expect(skyState(0).moon.dir.distanceTo(skyState(0.5).sun.dir)).toBeLessThan(1e-9);
  });
  it("is continuous across the cycle", () => {
    const a = skyState(0.999999);
    const b = skyState(0);
    expect(a.fog.getHex()).toBe(b.fog.getHex());
  });
});

describe("no sky underground (B1 Engine Room)", () => {
  it("is underground only below the Lobby slab", () => {
    expect(UNDERGROUND_BELOW).toBe(-0.5);
    expect(underground(floorY("B1"))).toBe(true);
    expect(underground(floorY("L1"))).toBe(false);
    expect(underground(floorY("RF"))).toBe(false);
    // The car between the Lobby and B1: the sky goes as soon as the car is below the Lobby slab.
    expect(underground(-1)).toBe(true);
  });
});
