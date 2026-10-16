import { describe, expect, it } from "vitest";
import { Color } from "three";
import { sceneSettings } from "@/experience/scene/settings";
import { clockPhase, CYCLE_MS, parseSkyParam, resolveSkyMode, skyState, SKY, SKY_PHASES } from "@/experience/sky/dayNight";

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
  it("resolves the mode: param, automation, preference, reduced motion", () => {
    const base = { param: null, pref: null, reducedMotion: false, automated: false } as const;
    expect(resolveSkyMode(base)).toEqual({ source: "clock", phase: null });
    expect(resolveSkyMode({ ...base, reducedMotion: true })).toEqual({ source: "held", phase: 0 });
    expect(resolveSkyMode({ ...base, reducedMotion: true, pref: "on" })).toEqual({ source: "clock", phase: null });
    expect(resolveSkyMode({ ...base, pref: "off" })).toEqual({ source: "held", phase: 0 });
    expect(resolveSkyMode({ ...base, automated: true })).toEqual({ source: "held", phase: 0 });
    expect(resolveSkyMode({ ...base, automated: true, param: { kind: "cycle" } })).toEqual({ source: "clock", phase: null });
    expect(resolveSkyMode({ ...base, pref: "off", param: { kind: "phase", phase: 0.5 } })).toEqual({ source: "param", phase: 0.5 });
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
  it("sun and moon move on opposite sides of a low arc around the dome horizon", () => {
    const night = skyState(0);
    const day = skyState(0.5);
    expect(night.moon.elevation).toBeCloseTo(SKY.horizon + SKY.arc);
    expect(night.sun.elevation).toBeCloseTo(SKY.horizon - SKY.arc);
    expect(day.sun.elevation).toBeCloseTo(SKY.horizon + SKY.arc);
    expect(night.moon.dir.dot(night.sun.dir)).toBeLessThan(0);
    expect(night.moon.dir.length()).toBeCloseTo(1);
    // The night moon and the midday sun share one direction (in front of the L1 default camera).
    expect(night.moon.dir.distanceTo(day.sun.dir)).toBeLessThan(1e-6);
    expect(skyState(0.25).sun.elevation).toBeCloseTo(SKY.horizon);
  });
  it("is continuous across the cycle", () => {
    const a = skyState(0.999999);
    const b = skyState(0);
    expect(a.fog.getHex()).toBe(b.fog.getHex());
  });
});
