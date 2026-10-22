import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAudio, type AmbienceFloor, type AudioEngine, type AudioEngineDeps } from "@/lib/audio";
import { createAudioEngine } from "@/lib/audio/engine";
import { AMBIENCE_CROSSFADE, type AmbienceVoice } from "@/lib/audio/ambience";
import { ONE_SHOTS, rumbleTargets } from "@/lib/audio/synth";
import { FakeAudioContext, FakeFilter, FakeGain } from "../helpers/fake-audio";

class FakeStorage {
  map = new Map<string, string>();
  getItem = vi.fn((key: string) => this.map.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => {
    this.map.set(key, value);
  });
}

class FakeDoc {
  visibilityState: DocumentVisibilityState = "visible";
  handlers = new Map<string, Set<() => void>>();
  addEventListener = vi.fn((type: string, handler: () => void) => {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  });
  removeEventListener = vi.fn((type: string, handler: () => void) => {
    this.handlers.get(type)?.delete(handler);
  });
  count(type: string) {
    return this.handlers.get(type)?.size ?? 0;
  }
  fire(type: string) {
    for (const handler of [...(this.handlers.get(type) ?? [])]) handler();
  }
  setVisibility(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.fire("visibilitychange");
  }
}

interface Setup {
  engine: AudioEngine;
  storage: FakeStorage;
  doc: FakeDoc;
  createContext: ReturnType<typeof vi.fn>;
  clock: { t: number };
  ctx: () => FakeAudioContext;
}

function setup(stored?: string, initial: Record<string, string> = {}, extra: Partial<AudioEngineDeps> = {}): Setup {
  const storage = new FakeStorage();
  if (stored !== undefined) storage.map.set("hq:sound", stored);
  for (const [key, value] of Object.entries(initial)) storage.map.set(key, value);
  const doc = new FakeDoc();
  const clock = { t: 0 };
  const createContext = vi.fn(() => new FakeAudioContext() as unknown as AudioContext);
  const engine = createAudioEngine({
    createContext,
    storage,
    doc: doc as unknown as AudioEngineDeps["doc"],
    now: () => clock.t,
    paused: false,
    ...extra,
  });
  return {
    engine,
    storage,
    doc,
    createContext,
    clock,
    ctx: () => FakeAudioContext.instances.at(-1)!,
  };
}

/** Gain node feeding the destination. */
function masterOf(ctx: FakeAudioContext): FakeGain {
  return ctx.gains.find((g) => g.connected.includes(ctx.destination))!;
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("audio engine: on by default and lazy init", () => {
  it("is on for a visitor who never chose, but creates no context on import or creation", () => {
    const { engine, createContext, storage } = setup();
    expect(engine.isMuted()).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
    // The default is not written: only an explicit choice is stored.
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps a stored muted choice: no context, no sound, even after a gesture", () => {
    const { engine, createContext, doc } = setup("off");
    expect(engine.isMuted()).toBe(true);
    engine.play("beep");
    engine.setRumble(9);
    doc.fire("pointerdown");
    doc.fire("click");
    expect(createContext).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("treats invalid stored values as the default (on)", () => {
    expect(setup("yes").engine.isMuted()).toBe(false);
    expect(setup("on").engine.isMuted()).toBe(false);
    expect(setup("off").engine.isMuted()).toBe(true);
  });

  it("setMuted(false) creates exactly one context, resumes, persists and starts ambient", () => {
    const { engine, storage, createContext, ctx } = setup();
    engine.setMuted(false);
    engine.setMuted(false);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(engine.isMuted()).toBe(false);
    expect(ctx().resume).toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenLastCalledWith("hq:sound", "on");
    const ambient = ctx().oscillators;
    expect(ambient.length).toBeGreaterThan(0);
    expect(ambient.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    expect(masterOf(ctx()).connected).toEqual([ctx().destination]);
  });

  it("setMuted(true) persists off, fades and suspends", () => {
    const { engine, storage, ctx } = setup();
    engine.setMuted(false);
    engine.setMuted(true);
    expect(storage.setItem).toHaveBeenLastCalledWith("hq:sound", "off");
    expect(masterOf(ctx()).gain.setTargetAtTime).toHaveBeenLastCalledWith(0, expect.any(Number), expect.any(Number));
    vi.advanceTimersByTime(1000);
    expect(ctx().suspend).toHaveBeenCalledTimes(1);
    expect(ctx().state).toBe("suspended");
  });

  it("unmuting again during the fade cancels the pending suspend", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setMuted(true);
    engine.setMuted(false);
    vi.advanceTimersByTime(1000);
    expect(ctx().suspend).not.toHaveBeenCalled();
  });

  it("toggleMuted flips the state", () => {
    const { engine } = setup("off");
    engine.toggleMuted();
    expect(engine.isMuted()).toBe(false);
    engine.toggleMuted();
    expect(engine.isMuted()).toBe(true);
  });
});

describe("audio engine: persisted on", () => {
  it("reports unmuted but creates the context only on first use", () => {
    const { engine, createContext, ctx } = setup("on");
    expect(engine.isMuted()).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
    engine.play("beep");
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx().resume).toHaveBeenCalled();
  });

  it("creates and resumes the context (and the background music) on the first user gesture", async () => {
    const { doc, createContext, ctx } = setup();
    expect(doc.count("pointerdown")).toBe(1);
    doc.fire("pointerdown");
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx().resume).toHaveBeenCalled();
    expect(ctx().oscillators.length).toBeGreaterThan(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(doc.count("pointerdown")).toBe(0);
    expect(doc.count("keydown")).toBe(0);
  });

  it("starts on the end of a tap on touch screens", async () => {
    const { doc, createContext } = setup();
    expect(doc.count("touchend")).toBe(1);
    doc.fire("touchend");
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("keeps listening when the browser refuses to start the context", async () => {
    const { doc, ctx } = setup();
    doc.fire("keydown");
    ctx().resume.mockImplementationOnce(() => Promise.resolve());
    ctx().state = "suspended";
    doc.fire("click");
    await Promise.resolve();
    await Promise.resolve();
    expect(doc.count("click")).toBe(1);
  });

  it("does not register gesture listeners when muted", () => {
    const { doc } = setup("off");
    expect(doc.count("pointerdown")).toBe(0);
  });
});

describe("audio engine: paused outside the 3D view", () => {
  it("silences play and rumble while paused and resumes on unpause, keeping the setting", () => {
    const { engine, ctx, storage } = setup();
    engine.play("beep");
    const master = masterOf(ctx());
    const before = ctx().sources.length;
    engine.setPaused(true);
    expect(engine.isPaused()).toBe(true);
    expect(engine.isMuted()).toBe(false);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, expect.any(Number), expect.any(Number));
    vi.advanceTimersByTime(1000);
    expect(ctx().suspend).toHaveBeenCalled();
    engine.play("ding");
    expect(ctx().sources.length).toBe(before);
    engine.setPaused(false);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, expect.any(Number), expect.any(Number));
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("audio engine: play counts", () => {
  it("counts every requested one-shot, audible or not, and returns a copy", () => {
    const { engine } = setup();
    expect(engine.playCounts()).toEqual({});
    engine.play("chime");
    engine.setPaused(true);
    engine.play("chime");
    engine.play("ding");
    const counts = engine.playCounts();
    expect(counts).toEqual({ chime: 2, ding: 1 });
    engine.play("ding");
    expect(counts.ding).toBe(1);
  });
});

describe("audio engine: paused until the 3D view opens", () => {
  it("starts paused: no context from gestures or one-shots on the Page View", () => {
    const storage = new FakeStorage();
    const doc = new FakeDoc();
    const createContext = vi.fn(() => new FakeAudioContext() as unknown as AudioContext);
    const engine = createAudioEngine({ createContext, storage, doc: doc as unknown as AudioEngineDeps["doc"], now: () => 0 });
    expect(engine.isPaused()).toBe(true);
    expect(engine.isMuted()).toBe(false);
    doc.fire("pointerdown");
    engine.play("click");
    engine.setRumble(5);
    expect(createContext).not.toHaveBeenCalled();
    engine.setPaused(false);
    doc.fire("pointerdown");
    expect(createContext).toHaveBeenCalledTimes(1);
  });
});

describe("audio engine: one-shots", () => {
  it("plays a short chime for the B1 unlock", () => {
    expect(Object.keys(ONE_SHOTS)).toContain("chime");
  });

  it.each(["beep", "ding", "whoosh", "click", "blip"] as const)("%s starts and stops its sources", (name) => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    const before = ctx().sources.length;
    engine.play(name);
    const added = ctx().sources.slice(before);
    expect(added.length).toBeGreaterThan(0);
    for (const source of added) {
      expect(source.start).toHaveBeenCalledTimes(1);
      expect(source.stop).toHaveBeenCalledTimes(1);
      const [startAt] = source.start.mock.calls[0] as number[];
      const [stopAt] = source.stop.mock.calls[0] as number[];
      expect(stopAt).toBeGreaterThan(startAt);
      expect(stopAt).toBeLessThan(0.6);
      source.onended?.();
      expect(source.disconnect).toHaveBeenCalled();
    }
  });

  it("caches the noise buffer per context", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.play("whoosh");
    engine.play("whoosh");
    engine.play("click");
    expect(ctx().buffers.filter((b) => b.numberOfChannels === 1)).toHaveLength(1);
  });

  it("play while muted after unmuting is a no-op", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setMuted(true);
    const before = ctx().sources.length;
    engine.play("ding");
    expect(ctx().sources.length).toBe(before);
  });

  it("rate limits key clicks to 20 per second", () => {
    const { engine, ctx, clock } = setup();
    engine.setMuted(false);
    const before = ctx().bufferSources.length;
    for (let i = 0; i < 21; i++) {
      clock.t = i * 40;
      engine.play("click");
    }
    expect(ctx().bufferSources.length - before).toBe(20);
    clock.t = 1001;
    engine.play("click");
    expect(ctx().bufferSources.length - before).toBe(21);
  });

  it("rate limits dialog blips together with key clicks", () => {
    const { engine, ctx, clock } = setup();
    engine.setMuted(false);
    const before = ctx().oscillators.length;
    for (let i = 0; i < 21; i++) {
      clock.t = i * 40;
      engine.play("blip");
    }
    expect(ctx().oscillators.length - before).toBe(20);
  });
});

describe("audio engine: rumble", () => {
  function rumbleGain(ctx: FakeAudioContext): FakeGain {
    const source = ctx.bufferSources.find((s) => s.loop)!;
    const filter = source.connected[0] as FakeFilter;
    return filter.connected[0] as FakeGain;
  }

  it("is silent at or below 1 u/s and audible above", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setRumble(0.5);
    expect(ctx().bufferSources.some((s) => s.loop)).toBe(false);
    engine.setRumble(6);
    const gain = rumbleGain(ctx());
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), expect.any(Number));
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBeGreaterThan(0);
    engine.setRumble(0.5);
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBe(0);
  });

  it("clamps speed at 12 and follows speed", () => {
    expect(rumbleTargets(50)).toEqual(rumbleTargets(12));
    expect(rumbleTargets(-3).gain).toBe(0);
    expect(rumbleTargets(Number.NaN).gain).toBe(0);
    expect(rumbleTargets(9).gain).toBeGreaterThan(rumbleTargets(3).gain);
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setRumble(50);
    const gain = rumbleGain(ctx());
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBeCloseTo(rumbleTargets(12).gain);
  });

  it("fades the rumble on mute and restores it on unmute", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setRumble(9);
    const gain = rumbleGain(ctx());
    engine.setMuted(true);
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBe(0);
    engine.setRumble(10);
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBe(0);
    engine.setMuted(false);
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBeCloseTo(rumbleTargets(10).gain);
  });
});

describe("audio engine: visibility, subscribe, dispose", () => {
  it("suspends when hidden and resumes on visible only when unmuted", () => {
    const { engine, doc, ctx } = setup();
    engine.setMuted(false);
    const context = ctx();
    context.resume.mockClear();
    doc.setVisibility("hidden");
    expect(context.suspend).toHaveBeenCalledTimes(1);
    doc.setVisibility("visible");
    expect(context.resume).toHaveBeenCalledTimes(1);

    engine.setMuted(true);
    vi.advanceTimersByTime(1000);
    context.resume.mockClear();
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    expect(context.resume).not.toHaveBeenCalled();
  });

  it("notifies subscribers on mute changes and supports unsubscribe", () => {
    const { engine } = setup("off");
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    engine.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
    engine.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
    engine.toggleMuted();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    engine.toggleMuted();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("dispose closes the context and removes listeners", () => {
    const { engine, doc, ctx } = setup("on");
    engine.setMuted(false);
    expect(doc.count("visibilitychange")).toBe(1);
    engine.dispose();
    expect(ctx().close).toHaveBeenCalledTimes(1);
    expect(doc.count("visibilitychange")).toBe(0);
    expect(doc.count("pointerdown")).toBe(0);
    const before = ctx().sources.length;
    engine.play("beep");
    expect(ctx().sources.length).toBe(before);
  });
});

describe("audio engine: background music", () => {
  const drones = (ctx: FakeAudioContext) => ctx.oscillators.filter((o) => o.type === "triangle");

  it("starts the Deep Space music with the context: drones, reverb and compressor", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    expect(drones(ctx())).toHaveLength(3);
    expect(ctx().convolvers).toHaveLength(1);
    expect(ctx().compressors).toHaveLength(1);
  });

  it("stops the music once the mute fade ends and starts a fresh one on unmute, reusing the impulse", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    const first = drones(ctx());
    engine.setMuted(true);
    expect(first.every((o) => o.stop.mock.calls.length === 0)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(first.every((o) => o.stop.mock.calls.length === 1 && o.disconnect.mock.calls.length > 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    engine.setMuted(false);
    expect(drones(ctx())).toHaveLength(6);
    expect(ctx().buffers.filter((b) => b.numberOfChannels === 2)).toHaveLength(1);
  });

  it("keeps the music when unmuted again during the fade", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setMuted(true);
    engine.setMuted(false);
    vi.advanceTimersByTime(1000);
    expect(drones(ctx())).toHaveLength(3);
    expect(drones(ctx()).every((o) => o.stop.mock.calls.length === 0)).toBe(true);
  });

  it("stops on pause (Page View) and restarts on unpause", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setPaused(true);
    vi.advanceTimersByTime(1000);
    expect(drones(ctx()).every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    engine.setPaused(false);
    expect(drones(ctx())).toHaveLength(6);
  });

  it("only suspends while the tab is hidden: the music keeps its nodes", () => {
    const { engine, doc, ctx } = setup();
    engine.setMuted(false);
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    expect(drones(ctx())).toHaveLength(3);
    expect(drones(ctx()).every((o) => o.stop.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    ["mute", (engine: ReturnType<typeof setup>["engine"]) => engine.setMuted(true)],
    ["pause", (engine: ReturnType<typeof setup>["engine"]) => engine.setPaused(true)],
  ])("stops the music when the tab hides during a pending %s fade", (_name, silence) => {
    const { engine, doc, ctx } = setup();
    engine.setMuted(false);
    silence(engine);
    doc.setVisibility("hidden");
    expect(drones(ctx())).toHaveLength(3);
    expect(drones(ctx()).every((o) => o.stop.mock.calls.length === 1 && o.disconnect.mock.calls.length > 0)).toBe(true);
    expect(ctx().suspend).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no music nodes or timers after dispose", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    ctx().currentTime = 3;
    vi.advanceTimersByTime(500);
    engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
    const music = [...drones(ctx()), ...ctx().convolvers, ...ctx().compressors];
    expect(music.every((n) => n.disconnect.mock.calls.length > 0)).toBe(true);
  });
});

describe("audio engine: SSR and missing Web Audio", () => {
  it("works without storage, document or AudioContext", () => {
    expect(typeof window).toBe("undefined");
    const engine = createAudioEngine({ storage: null, doc: null });
    expect(engine.isMuted()).toBe(false);
    expect(() => {
      engine.play("beep");
      engine.setMuted(false);
      engine.play("ding");
      engine.setRumble(8);
      engine.setMuted(true);
      engine.dispose();
    }).not.toThrow();
  });

  it("survives a context factory that throws", () => {
    const engine = createAudioEngine({
      storage: null,
      doc: null,
      createContext: () => {
        throw new Error("blocked");
      },
    });
    expect(() => {
      engine.setMuted(false);
      engine.play("click");
    }).not.toThrow();
  });

  it("the singleton import is free and useAudio renders muted on the server", async () => {
    const { audio } = await import("@/lib/audio");
    expect(audio).toBeDefined();
    const { engine } = setup("on");
    function Probe() {
      const { muted } = useAudio(engine);
      return createElement("span", null, muted ? "muted" : "on");
    }
    expect(renderToString(createElement(Probe))).toContain("muted");
  });
});

describe("audio settings", () => {
  /** Live music voices: each voice is three drones, stopped ones are gone. */
  const musicVoices = (ctx: FakeAudioContext) =>
    ctx.oscillators.filter((o) => o.type === "triangle" && o.stop.mock.calls.length === 0).length / 3;
  const start = (s: Setup) => s.doc.fire("pointerdown");

  it("defaults to effects on, music on, full volume, and reads stored values", () => {
    const { engine } = setup();
    expect(engine.getSettings()).toEqual({ effects: true, music: true, musicVolume: 1, ambience: true });
    const stored = setup(undefined, { "hq:sfx": "off", "hq:music": "off", "hq:music-volume": "0.4" });
    expect(stored.engine.getSettings()).toEqual({ effects: false, music: false, musicVolume: 0.4, ambience: true });
    expect(setup(undefined, { "hq:music-volume": "junk" }).engine.getSettings().musicVolume).toBe(1);
  });

  it("persists changes, clamps the volume and notifies once per change", () => {
    const { engine, storage } = setup();
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.setEffects(false);
    engine.setMusic(false);
    engine.setMusicVolume(3);
    expect(storage.map.get("hq:sfx")).toBe("off");
    expect(storage.map.get("hq:music")).toBe("off");
    expect(engine.getSettings().musicVolume).toBe(1);
    engine.setMusicVolume(0.25);
    expect(storage.map.get("hq:music-volume")).toBe("0.25");
    expect(fn).toHaveBeenCalledTimes(3);
    engine.setEffects(false);
    expect(fn).toHaveBeenCalledTimes(3);
    const a = engine.getSettings();
    expect(engine.getSettings()).toBe(a);
    engine.setMusicVolume(0.5);
    expect(engine.getSettings()).not.toBe(a);
  });

  it("effects off silences one-shots and the rumble but keeps the context for music", () => {
    const s = setup();
    const { engine } = s;
    start(s);
    const ctx = s.ctx();
    engine.setRumble(9);
    engine.setEffects(false);
    const before = ctx.oscillators.length;
    engine.play("beep");
    expect(ctx.oscillators.length).toBe(before);
    const rumbleGain = ctx.bufferSources.find((b) => b.loop)!.connected[0] as FakeFilter;
    const gain = rumbleGain.connected[0] as FakeGain;
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBe(0);
    engine.setRumble(10);
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBe(0);
    expect(musicVoices(ctx)).toBe(1);
    engine.setEffects(true);
    expect(gain.gain.setTargetAtTime.mock.lastCall![0]).toBeCloseTo(rumbleTargets(10).gain);
    engine.play("beep");
    expect(ctx.oscillators.length).toBeGreaterThan(before);
  });

  it("effects back on while muted does not restore the rumble", () => {
    const s = setup();
    const { engine } = s;
    start(s);
    engine.setRumble(9);
    engine.setEffects(false);
    engine.setMuted(true);
    const gain = (s.ctx().bufferSources.find((b) => b.loop)!.connected[0] as FakeFilter).connected[0] as FakeGain;
    const calls = gain.gain.setTargetAtTime.mock.calls.length;
    engine.setEffects(true);
    expect(gain.gain.setTargetAtTime.mock.calls.length).toBe(calls);
  });

  it("music off stops the music voice, on starts a fresh one", () => {
    const s = setup();
    const { engine } = s;
    start(s);
    expect(musicVoices(s.ctx())).toBe(1);
    engine.setMusic(false);
    expect(musicVoices(s.ctx())).toBe(0);
    engine.setMusic(true);
    expect(musicVoices(s.ctx())).toBe(1);
    expect(s.ctx().oscillators.filter((o) => o.type === "triangle")).toHaveLength(6);
  });

  it("a stored music off never starts a voice, but effects still work", () => {
    const s = setup(undefined, { "hq:music": "off" });
    start(s);
    expect(s.ctx().oscillators.filter((o) => o.type === "triangle")).toHaveLength(0);
    s.engine.play("beep");
    expect(s.ctx().oscillators.length).toBeGreaterThan(0);
  });

  it("setMusic(true) while muted only records the setting; the music starts on unmute", () => {
    const s = setup(undefined, { "hq:music": "off" });
    start(s);
    s.engine.setMuted(true);
    s.engine.setMusic(true);
    expect(s.engine.getSettings().music).toBe(true);
    expect(s.ctx().oscillators.filter((o) => o.type === "triangle")).toHaveLength(0);
    s.engine.setMuted(false);
    expect(musicVoices(s.ctx())).toBe(1);
  });

  it("the volume glides on a bus between the music and the master, and a stored volume seeds it", () => {
    const s = setup(undefined, { "hq:music-volume": "0.4" });
    start(s);
    const ctx = s.ctx();
    const master = masterOf(ctx);
    const bus = ctx.gains.find((g) => g.connected.includes(master) && g !== master)!;
    expect(bus.gain.setValueAtTime).toHaveBeenCalledWith(0.4, expect.any(Number));
    const output = ctx.gains.find((g) => g.connected.includes(bus) && g !== bus)!;
    expect(output).toBeDefined();
    s.engine.setMusicVolume(0.2);
    expect(bus.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(bus.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, expect.any(Number), 0.05);
  });

  it("the master mute still wins over the effects and music settings", () => {
    const m = setup("off");
    m.engine.setMusic(true);
    m.engine.setEffects(true);
    m.engine.play("beep");
    start(m);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});

describe("audio engine: floor ambience", () => {
  interface FakeVoice extends AmbienceVoice {
    setFloor: Mock<(floor: AmbienceFloor | null) => void>;
    stop: Mock<() => void>;
  }

  function ambienceSetup(stored?: string, initial: Record<string, string> = {}) {
    const voices: FakeVoice[] = [];
    const buses: AudioNode[] = [];
    const createAmbience = vi.fn((_ctx: BaseAudioContext, bus: AudioNode) => {
      buses.push(bus);
      let current: AmbienceFloor | null = null;
      const voice = {
        output: {} as GainNode,
        setFloor: vi.fn((f: AmbienceFloor | null) => {
          current = f;
        }),
        floor: () => current,
        activeLayers: () => 0,
        stop: vi.fn(),
      } as FakeVoice;
      voices.push(voice);
      return voice;
    });
    const loadAmbience = vi.fn(() => Promise.resolve({ createAmbience }));
    const s = setup(stored, initial, { loadAmbience });
    const flush = async () => {
      for (let i = 0; i < 4; i++) await Promise.resolve();
    };
    return { ...s, voices, buses, createAmbience, loadAmbience, flush };
  }

  it("starts after the gesture once a floor is set, on the music bus, and loads the module once", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    await s.flush();
    expect(s.createAmbience).not.toHaveBeenCalled();
    s.doc.fire("pointerdown");
    await s.flush();
    expect(s.createAmbience).toHaveBeenCalledTimes(1);
    const master = masterOf(s.ctx());
    const musicBus = s.ctx().gains.find((g) => g.connected.includes(master) && g !== master);
    expect(s.buses[0]).toBe(musicBus);
    expect(s.voices[0].setFloor).toHaveBeenCalledWith("L1");
    s.engine.setMuted(true);
    vi.advanceTimersByTime(1000);
    s.engine.setMuted(false);
    await s.flush();
    expect(s.loadAmbience).toHaveBeenCalledTimes(1);
  });

  it("waits for a floor: a context without one makes no voice, and the first floor starts it", async () => {
    const s = ambienceSetup();
    s.doc.fire("pointerdown");
    await s.flush();
    expect(s.createAmbience).not.toHaveBeenCalled();
    expect(s.engine.ambienceFloor()).toBeNull();
    s.engine.setFloor("L3");
    await s.flush();
    expect(s.createAmbience).toHaveBeenCalledTimes(1);
    expect(s.voices[0].setFloor).toHaveBeenCalledWith("L3");
    expect(s.engine.ambienceFloor()).toBe("L3");
  });

  it("crossfades on a floor change and fades out on null; the same floor is a no-op", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    s.engine.setFloor("L1");
    expect(s.voices[0].setFloor).toHaveBeenCalledTimes(1);
    s.engine.setFloor("L2");
    expect(s.voices[0].setFloor).toHaveBeenLastCalledWith("L2");
    s.engine.setFloor(null);
    expect(s.voices[0].setFloor).toHaveBeenLastCalledWith(null);
    expect(s.createAmbience).toHaveBeenCalledTimes(1);
  });

  it("mute stops it when the fade ends and unmute restarts it with the remembered floor", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L4");
    s.doc.fire("pointerdown");
    await s.flush();
    s.engine.setMuted(true);
    expect(s.voices[0].stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(s.voices[0].stop).toHaveBeenCalledTimes(1);
    s.engine.setFloor("RF");
    await s.flush();
    expect(s.createAmbience).toHaveBeenCalledTimes(1);
    s.engine.setMuted(false);
    await s.flush();
    expect(s.createAmbience).toHaveBeenCalledTimes(2);
    expect(s.voices[1].setFloor).toHaveBeenCalledWith("RF");
  });

  it("pause stops it, stays silent while paused, and unpause restarts it", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L2");
    s.doc.fire("pointerdown");
    await s.flush();
    s.engine.setPaused(true);
    vi.advanceTimersByTime(1000);
    expect(s.voices[0].stop).toHaveBeenCalledTimes(1);
    s.engine.setFloor("L3");
    await s.flush();
    expect(s.createAmbience).toHaveBeenCalledTimes(1);
    s.engine.setPaused(false);
    await s.flush();
    expect(s.createAmbience).toHaveBeenCalledTimes(2);
    expect(s.voices[1].setFloor).toHaveBeenCalledWith("L3");
  });

  it("makes no ambience while paused from the start, even after a gesture", async () => {
    const s = ambienceSetup();
    s.engine.setPaused(true);
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(s.createAmbience).not.toHaveBeenCalled();
  });

  it("a hidden tab only suspends; the voice keeps living", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    s.doc.setVisibility("hidden");
    await s.flush();
    expect(s.ctx().suspend).toHaveBeenCalled();
    expect(s.voices[0].stop).not.toHaveBeenCalled();
  });

  it("setAmbience(false) fades it out, stops it after the crossfade, and persists off", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    s.engine.setAmbience(false);
    expect(s.storage.map.get("hq:ambience")).toBe("off");
    expect(s.engine.getSettings().ambience).toBe(false);
    expect(s.voices[0].setFloor).toHaveBeenLastCalledWith(null);
    expect(s.voices[0].stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AMBIENCE_CROSSFADE * 1000);
    expect(s.voices[0].stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(s.voices[0].stop).toHaveBeenCalledTimes(1);
    s.engine.setFloor("L2");
    await s.flush();
    expect(s.createAmbience).toHaveBeenCalledTimes(1);
    s.engine.setAmbience(true);
    await s.flush();
    expect(s.storage.map.get("hq:ambience")).toBe("on");
    expect(s.createAmbience).toHaveBeenCalledTimes(2);
    expect(s.voices[1].setFloor).toHaveBeenCalledWith("L2");
  });

  it("a mute or dispose during the fade-out stops the retiring voice at once", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    s.engine.setAmbience(false);
    s.engine.dispose();
    expect(s.voices[0].stop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(s.voices[0].stop).toHaveBeenCalledTimes(1);
  });

  it("reads a stored off at creation: no voice, and the module is never loaded", async () => {
    const s = ambienceSetup(undefined, { "hq:ambience": "off" });
    expect(s.engine.getSettings().ambience).toBe(false);
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    expect(s.loadAmbience).not.toHaveBeenCalled();
    expect(s.createAmbience).not.toHaveBeenCalled();
  });

  it("is independent of the music toggle", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    s.engine.setMusic(false);
    expect(s.voices[0].stop).not.toHaveBeenCalled();
    s.engine.setMusic(true);
    expect(s.createAmbience).toHaveBeenCalledTimes(1);
  });

  it("ignores a module that arrives after a mute or a switch-off", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    s.engine.setMuted(true);
    await s.flush();
    expect(s.createAmbience).not.toHaveBeenCalled();
    s.engine.setMuted(false);
    s.engine.setAmbience(false);
    await s.flush();
    expect(s.createAmbience).not.toHaveBeenCalled();
  });

  it("never touches the effects path: one-shots still connect to the master, not the music bus", async () => {
    const s = ambienceSetup();
    s.engine.setFloor("L1");
    s.doc.fire("pointerdown");
    await s.flush();
    const ctx = s.ctx();
    const master = masterOf(ctx);
    const musicBus = ctx.gains.find((g) => g.connected.includes(master) && g !== master)!;
    const before = ctx.oscillators.length;
    s.engine.play("beep");
    const beepGains = ctx.gains.filter((g) => g.connected.includes(master) && g !== musicBus && g !== master);
    expect(ctx.oscillators.length).toBeGreaterThan(before);
    expect(beepGains.length).toBeGreaterThan(0);
    expect(master.gain.setTargetAtTime).not.toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
  });
});
