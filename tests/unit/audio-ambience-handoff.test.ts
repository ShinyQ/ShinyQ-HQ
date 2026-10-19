import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AmbienceFloor, AudioEngine, AudioEngineDeps } from "@/lib/audio";
import { SOUNDTRACK_CROSSFADE, createAudioEngine } from "@/lib/audio/engine";
import * as ambienceModule from "@/lib/audio/ambience";
import { AMBIENCE_CROSSFADE, AMBIENCE_FLOORS } from "@/lib/audio/ambience";

/**
 * Floor ambience handoff (owner report: "when i visit L2, L3, L4, RF all is playing at the same time"). The real
 * engine drives the real ambience voice on a fake context that models gain automation over audio time and the node
 * graph, so "audible" means: a started, unended source with a connected path to the destination whose layer gain
 * is above zero now.
 */

let nowMs = 0;
const now = () => nowMs / 1000;

type Event = { t: number; v: number; kind: "set" | "linear" | "exponential" | "target"; tc?: number };

class Param {
  events: Event[] = [];
  constructor(private initial = 1) {}
  get value(): number {
    return this.at(now());
  }
  set value(v: number) {
    this.initial = v;
    this.events = [];
  }
  at(t: number): number {
    let v = this.initial;
    let from = 0;
    for (const e of this.events) {
      if (e.kind === "target") {
        if (e.t <= t) v = e.v + (v - e.v) * Math.exp(-(t - e.t) / (e.tc ?? 1));
        continue;
      }
      if (e.t <= t) {
        v = e.v;
        from = e.t;
        continue;
      }
      if (e.kind === "set") break;
      // A ramp in progress: linear is exact; an exponential ramp only needs "between the two values" here.
      v = v + (e.v - v) * ((t - from) / (e.t - from));
      break;
    }
    return v;
  }
  private add(e: Event) {
    this.events.push(e);
    this.events.sort((a, b) => a.t - b.t);
    return this;
  }
  setValueAtTime(v: number, t: number) {
    return this.add({ t, v, kind: "set" });
  }
  linearRampToValueAtTime(v: number, t: number) {
    return this.add({ t, v, kind: "linear" });
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (!(v > 0)) throw new RangeError("exponential ramp target must be positive");
    return this.add({ t, v, kind: "exponential" });
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    return this.add({ t, v, kind: "target", tc });
  }
  cancelScheduledValues(t: number) {
    this.events = this.events.filter((e) => e.t < t);
    return this;
  }
}

class Node {
  out = new Set<Node>();
  type = "";
  gain = new Param(1);
  frequency = new Param(350);
  Q = new Param(1);
  detune = new Param(0);
  delayTime = new Param(0);
  playbackRate = new Param(1);
  threshold = new Param(-24);
  knee = new Param(30);
  ratio = new Param(12);
  attack = new Param(0.003);
  release = new Param(0.25);
  buffer: unknown = null;
  loop = false;
  constructor(public kind: string) {
    graph.push(this);
  }
  connect<T>(dest: T): T {
    if (dest instanceof Node) this.out.add(dest);
    return dest;
  }
  disconnect() {
    this.out.clear();
  }
}

class Source extends Node {
  startAt: number | null = null;
  stopAt: number | null = null;
  ended = false;
  onended: (() => void) | null = null;
  /** The floor whose layer this source feeds, read when it starts (an ended note is disconnected later). */
  floor: AmbienceFloor | null = null;
  constructor(kind: string) {
    super(kind);
    started.push(this);
  }
  start(when = 0) {
    if (this.startAt !== null) throw new Error("start twice");
    this.startAt = when;
    this.floor = layers.find((l) => reaches(this, l.output))?.floor ?? null;
  }
  stop(when = 0) {
    if (this.startAt === null) throw new Error("stop before start");
    this.stopAt = this.stopAt === null ? when : Math.min(this.stopAt, Math.max(when, now()));
  }
  setPeriodicWave() {}
}

let graph: Node[] = [];
let started: Source[] = [];

class Ctx {
  state: AudioContextState = "suspended";
  sampleRate = 8000;
  destination = new Node("destination");
  get currentTime() {
    return now();
  }
  createGain = () => new Node("gain");
  createBiquadFilter = () => new Node("filter");
  createDelay = () => new Node("delay");
  createDynamicsCompressor = () => new Node("compressor");
  createConvolver = () => new Node("convolver");
  createOscillator = () => new Source("osc");
  createBufferSource = () => new Source("buffer");
  createPeriodicWave = () => ({});
  createBuffer = (channels: number, length: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
  };
  resume = vi.fn(() => {
    if (this.state !== "closed") this.state = "running";
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    if (this.state !== "closed") this.state = "suspended";
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = "closed";
    return Promise.resolve();
  });
}

class Doc {
  visibilityState: DocumentVisibilityState = "visible";
  handlers = new Map<string, Set<() => void>>();
  addEventListener(type: string, handler: () => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }
  removeEventListener(type: string, handler: () => void) {
    this.handlers.get(type)?.delete(handler);
  }
  fire(type: string) {
    for (const handler of [...(this.handlers.get(type) ?? [])]) handler();
  }
}

/** Advances the audio clock and the timers together, in 5 ms steps, ending due sources. */
function advance(ms: number, probe?: () => void): void {
  const end = nowMs + ms;
  while (nowMs < end) {
    const step = Math.min(5, end - nowMs);
    nowMs += step;
    vi.advanceTimersByTime(step);
    for (const source of started) {
      if (!source.ended && source.stopAt !== null && source.stopAt <= now()) {
        source.ended = true;
        source.onended?.();
      }
    }
    probe?.();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

let ctx: Ctx;
let engine: AudioEngine;
let doc: Doc;
/** Gain nodes created by an ambience layer factory, in creation order, with the floor they belong to. */
let layers: Array<{ floor: AmbienceFloor; output: Node }>;

function audibleGain(node: Node, t: number, seen = new Set<Node>()): number {
  // Largest product of gains along any path from `node` to the destination (0 when unreachable).
  if (node === ctx.destination) return 1;
  if (seen.has(node)) return 0;
  seen.add(node);
  let best = 0;
  for (const next of node.out) best = Math.max(best, audibleGain(next, t, new Set(seen)));
  const own = node.kind === "gain" ? Math.max(0, node.gain.at(t)) : 1;
  return own * best;
}

/** Floors whose layer is audible right now (its output reaches the destination with a gain above -60 dB). */
function audibleFloors(): AmbienceFloor[] {
  return layers.filter((l) => audibleGain(l.output, now()) > 1e-3 * 0.4).map((l) => l.floor);
}

/** Deep Space Ambient is audible: one of its triangle drones reaches the destination with a gain above -60 dB. */
function musicAudible(): boolean {
  return started.some((s) => s.type === "triangle" && !s.ended && s.stopAt === null && audibleGain(s, now()) > 1e-3 * 0.05);
}

/** Drones still running (a stopped music voice stops them). */
function runningDrones(): number {
  return started.filter((s) => s.type === "triangle" && s.stopAt === null).length;
}

/** Floors whose layer output is still connected (a stopped layer disconnects everything). */
function connectedFloors(): AmbienceFloor[] {
  return layers.filter((l) => l.output.out.size > 0).map((l) => l.floor);
}

function reaches(n: Node, target: Node, seen = new Set<Node>()): boolean {
  if (n === target) return true;
  if (seen.has(n)) return false;
  seen.add(n);
  for (const m of n.out) if (reaches(m, target, seen)) return true;
  return false;
}

/** Floors whose scheduler started a source since `fromIndex` (attributed when each source started). */
function schedulingFloors(fromIndex: number): AmbienceFloor[] {
  const floors = new Set<AmbienceFloor>();
  for (const source of started.slice(fromIndex)) if (source.floor) floors.add(source.floor);
  return [...floors];
}

beforeEach(async () => {
  nowMs = 0;
  graph = [];
  started = [];
  layers = [];
  vi.useFakeTimers();
  // Wrap each layer factory to record its output node and floor.
  const original = { ...ambienceModule.AMBIENCE_LAYERS };
  const wrapped = Object.fromEntries(
    AMBIENCE_FLOORS.map((floor) => [
      floor,
      (c: BaseAudioContext, d: AudioNode, r?: () => number) => {
        const layer = original[floor](c, d, r);
        layers.push({ floor, output: layer.output as unknown as Node });
        return layer;
      },
    ]),
  );
  Object.assign(ambienceModule.AMBIENCE_LAYERS, wrapped);
  restoreLayers = () => Object.assign(ambienceModule.AMBIENCE_LAYERS, original);
  doc = new Doc();
  engine = createAudioEngine({
    createContext: () => {
      ctx = new Ctx();
      return ctx as unknown as AudioContext;
    },
    storage: null,
    doc: doc as unknown as AudioEngineDeps["doc"],
    now: () => nowMs,
    paused: false,
    loadAmbience: () => Promise.resolve(ambienceModule),
  });
  engine.setFloor("L1");
  doc.fire("pointerdown");
  await flush();
  advance(AMBIENCE_CROSSFADE * 1000 + 500);
});

let restoreLayers = () => {};

afterEach(() => {
  engine.dispose();
  restoreLayers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const FADE_MS = AMBIENCE_CROSSFADE * 1000 + 500;

describe("floor ambience handoff (real engine and voice)", () => {
  it("plays exactly one floor layer at a time from L1 to RF and B1, and stops and disconnects the old ones", () => {
    expect(audibleFloors()).toEqual(["L1"]);
    for (const floor of ["L2", "L3", "L4", "RF", "B1"] as const) {
      engine.setFloor(floor);
      advance(FADE_MS);
      expect(audibleFloors()).toEqual([floor]);
      expect(connectedFloors()).toEqual([floor]);
      const mark = started.length;
      advance(6_000);
      expect(schedulingFloors(mark).filter((f) => f !== floor)).toEqual([]);
      expect(audibleFloors()).toEqual([floor]);
    }
  });

  it("settles on the last floor after quick hops mid-fade, never holding more than 3 layers", () => {
    let maxConnected = 0;
    const probe = () => {
      maxConnected = Math.max(maxConnected, connectedFloors().length);
    };
    for (const floor of ["L2", "L3", "L4", "RF", "L2", "L1", "L3"] as const) {
      engine.setFloor(floor);
      advance(300, probe);
    }
    expect(maxConnected).toBeLessThanOrEqual(3);
    advance(FADE_MS, probe);
    expect(audibleFloors()).toEqual(["L3"]);
    expect(connectedFloors()).toEqual(["L3"]);
    const mark = started.length;
    advance(6_000);
    expect(schedulingFloors(mark)).toEqual(["L3"]);
  });

  it.each([
    ["muted", (e: AudioEngine) => e.setMuted(true), (e: AudioEngine) => e.setMuted(false)],
    ["paused", (e: AudioEngine) => e.setPaused(true), (e: AudioEngine) => e.setPaused(false)],
    ["switched off", (e: AudioEngine) => e.setAmbience(false), (e: AudioEngine) => e.setAmbience(true)],
  ])("silences and stops every layer when %s, and brings back only the current floor", async (_label, off, on) => {
    engine.setFloor("L2");
    advance(500);
    engine.setFloor("L3");
    advance(500);
    off(engine);
    advance(FADE_MS);
    expect(audibleFloors()).toEqual([]);
    expect(connectedFloors()).toEqual([]);
    const mark = started.length;
    advance(5_000);
    expect(schedulingFloors(mark)).toEqual([]);

    on(engine);
    await flush();
    advance(FADE_MS);
    expect(audibleFloors()).toEqual(["L3"]);
    expect(connectedFloors()).toEqual(["L3"]);
    expect(musicAudible()).toBe(false);
  });

  it("keeps the crossfade in step with the ambience module", () => {
    expect(SOUNDTRACK_CROSSFADE).toBe(AMBIENCE_CROSSFADE);
  });

  it("plays one soundtrack: the floor layer replaces Deep Space Ambient on every floor", () => {
    // The floor was set before the first gesture, so the music never started under the layer.
    expect(musicAudible()).toBe(false);
    expect(runningDrones()).toBe(0);
    for (const floor of ["L2", "L3", "L4", "RF", "B1", "L1"] as const) {
      engine.setFloor(floor);
      advance(FADE_MS);
      expect(musicAudible()).toBe(false);
      expect(audibleFloors()).toEqual([floor]);
    }
  });

  it("crossfades to the music when the ambience is switched off or the floor cleared, and back to the layer", async () => {
    engine.setAmbience(false);
    advance(FADE_MS);
    expect(musicAudible()).toBe(true);
    expect(audibleFloors()).toEqual([]);

    engine.setAmbience(true);
    await flush();
    let both = 0;
    advance(FADE_MS, () => {
      if (musicAudible() && audibleFloors().length > 0) both += 1;
    });
    // Both only during the 2 s crossfade, then the music is stopped and disconnected.
    expect(both * 5).toBeLessThanOrEqual(SOUNDTRACK_CROSSFADE * 1000 + 100);
    expect(musicAudible()).toBe(false);
    expect(runningDrones()).toBe(0);
    expect(audibleFloors()).toEqual(["L1"]);

    engine.setFloor(null);
    advance(FADE_MS);
    expect(musicAudible()).toBe(true);
    expect(audibleFloors()).toEqual([]);
    engine.setFloor("L4");
    advance(FADE_MS);
    expect(musicAudible()).toBe(false);
    expect(runningDrones()).toBe(0);
    expect(audibleFloors()).toEqual(["L4"]);
  });

  it("keeps the music with the music toggle on and the ambience off, and is silent with both off", () => {
    engine.setAmbience(false);
    advance(FADE_MS);
    expect(musicAudible()).toBe(true);
    engine.setMusic(false);
    advance(FADE_MS);
    expect(musicAudible()).toBe(false);
    expect(audibleFloors()).toEqual([]);
    // Music back on with a floor layer playing: the setting is recorded, the layer keeps the soundtrack.
    engine.setAmbience(true);
    engine.setMusic(true);
    advance(FADE_MS);
    expect(musicAudible()).toBe(false);
  });

  it("plays the music when the ambience chunk fails to load", async () => {
    engine.dispose();
    engine = createAudioEngine({
      createContext: () => {
        ctx = new Ctx();
        return ctx as unknown as AudioContext;
      },
      storage: null,
      doc: doc as unknown as AudioEngineDeps["doc"],
      now: () => nowMs,
      paused: false,
      loadAmbience: () => Promise.reject(new Error("chunk load failed")),
    });
    engine.setFloor("L2");
    doc.fire("pointerdown");
    await flush();
    advance(FADE_MS);
    expect(musicAudible()).toBe(true);
  });

  it("suspends the context while the tab is hidden", () => {
    engine.setFloor("L4");
    advance(500);
    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    expect(ctx.suspend).toHaveBeenCalled();
    expect(ctx.state).toBe("suspended");
  });

  it("dispose stops every layer and leaves no ambience timers", () => {
    engine.setFloor("RF");
    advance(500);
    engine.dispose();
    expect(connectedFloors()).toEqual([]);
    const mark = started.length;
    advance(5_000);
    expect(started.length).toBe(mark);
    expect(vi.getTimerCount()).toBe(0);
  });
});
