import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine, useAudio, type AudioEngine, type AudioEngineDeps } from "@/lib/audio";
import { rumbleTargets } from "@/lib/audio/synth";

class FakeParam {
  value: number;
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  linearRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  cancelScheduledValues = vi.fn(() => this);
}

class FakeNode {
  connected: unknown[] = [];
  connect = vi.fn((target: unknown) => {
    this.connected.push(target);
    return target;
  });
  disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}

class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeOscillator extends FakeSource {
  type = "sine";
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
}

class FakeBuffer {
  private data: Float32Array;
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.data = new Float32Array(length);
  }
  getChannelData() {
    return this.data;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  sampleRate = 8000;
  state: AudioContextState = "suspended";
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  buffers: FakeBuffer[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    this.state = "suspended";
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = "closed";
    return Promise.resolve();
  });
  createOscillator = vi.fn(() => {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  });
  createBufferSource = vi.fn(() => {
    const node = new FakeBufferSource();
    this.bufferSources.push(node);
    return node;
  });
  createGain = vi.fn(() => {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  });
  createBiquadFilter = vi.fn(() => {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  });
  createBuffer = vi.fn((channels: number, length: number, rate: number) => {
    const buffer = new FakeBuffer(channels, length, rate);
    this.buffers.push(buffer);
    return buffer;
  });

  get sources(): FakeSource[] {
    return [...this.oscillators, ...this.bufferSources];
  }
}

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

function setup(stored?: string): Setup {
  const storage = new FakeStorage();
  if (stored !== undefined) storage.map.set("hq:sound", stored);
  const doc = new FakeDoc();
  const clock = { t: 0 };
  const createContext = vi.fn(() => new FakeAudioContext() as unknown as AudioContext);
  const engine = createAudioEngine({
    createContext,
    storage,
    doc: doc as unknown as AudioEngineDeps["doc"],
    now: () => clock.t,
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

describe("audio engine: muted default and lazy init", () => {
  it("is muted by default and creates no context on import, creation or play", () => {
    const { engine, createContext } = setup();
    expect(engine.isMuted()).toBe(true);
    engine.play("beep");
    engine.play("click");
    engine.setRumble(9);
    expect(createContext).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("treats invalid stored values as muted", () => {
    expect(setup("yes").engine.isMuted()).toBe(true);
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
    vi.runAllTimers();
    expect(ctx().suspend).toHaveBeenCalledTimes(1);
    expect(ctx().state).toBe("suspended");
  });

  it("unmuting again during the fade cancels the pending suspend", () => {
    const { engine, ctx } = setup();
    engine.setMuted(false);
    engine.setMuted(true);
    engine.setMuted(false);
    vi.runAllTimers();
    expect(ctx().suspend).not.toHaveBeenCalled();
  });

  it("toggleMuted flips the state", () => {
    const { engine } = setup();
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

  it("creates and resumes the context on the first user gesture", () => {
    const { doc, createContext, ctx } = setup("on");
    expect(doc.count("pointerdown")).toBe(1);
    doc.fire("pointerdown");
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx().resume).toHaveBeenCalled();
    expect(doc.count("pointerdown")).toBe(0);
    expect(doc.count("keydown")).toBe(0);
  });

  it("does not register gesture listeners when muted", () => {
    const { doc } = setup();
    expect(doc.count("pointerdown")).toBe(0);
  });
});

describe("audio engine: one-shots", () => {
  it.each(["beep", "ding", "whoosh", "click"] as const)("%s starts and stops its sources", (name) => {
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
    expect(ctx().buffers).toHaveLength(1);
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
    vi.runAllTimers();
    context.resume.mockClear();
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    expect(context.resume).not.toHaveBeenCalled();
  });

  it("notifies subscribers on mute changes and supports unsubscribe", () => {
    const { engine } = setup();
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

describe("audio engine: SSR and missing Web Audio", () => {
  it("works without storage, document or AudioContext", () => {
    expect(typeof window).toBe("undefined");
    const engine = createAudioEngine({ storage: null, doc: null });
    expect(engine.isMuted()).toBe(true);
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
