import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AMBIENCE_CROSSFADE,
  AMBIENCE_FLOORS,
  AMBIENCE_LAYERS,
  B1_HUM_LEVEL,
  B1_HUM_MIDI,
  B1_UNDER_FLOORS,
  FLOOR_TONE_PEAK,
  createAmbience,
  type AmbienceFloor,
} from "@/lib/audio/ambience";
import { engineHum } from "@/lib/audio/engineHum";

// The ambience graph needs delay, analyser and periodic wave nodes that the shared fake does not model, so this
// file keeps its own context. It also records every frequency an oscillator is given.
let nowMs = 0;

class FakeParam {
  history: number[] = [];
  constructor(public value = 0) {}
  setValueAtTime(v: number) {
    this.value = v;
    this.history.push(v);
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    if (!(v > 0)) throw new RangeError("exponential ramp target must be positive");
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

let nodes: FakeNode[] = [];
let sources: FakeSource[] = [];

class FakeNode {
  out = new Set<unknown>();
  type = "";
  gain = new FakeParam(1);
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  detune = new FakeParam(0);
  delayTime = new FakeParam(0);
  playbackRate = new FakeParam(1);
  buffer: unknown = null;
  loop = false;
  fftSize = 2048;
  constructor() {
    nodes.push(this);
  }
  connect<T>(dest: T): T {
    this.out.add(dest);
    return dest;
  }
  disconnect() {
    this.out.clear();
  }
}

class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  ended = false;
  onended: (() => void) | null = null;
  constructor() {
    super();
    sources.push(this);
  }
  start(when = 0) {
    if (this.startAt !== null) throw new Error("start twice");
    this.startAt = when;
  }
  stop(when = 0) {
    if (this.startAt === null) throw new Error("stop before start");
    this.stopAt = this.stopAt === null ? when : Math.min(this.stopAt, Math.max(when, nowMs / 1000));
  }
  setPeriodicWave() {}
}

const ctx = {
  sampleRate: 8000,
  get currentTime() {
    return nowMs / 1000;
  },
  createGain: () => new FakeNode(),
  createBiquadFilter: () => new FakeNode(),
  createDelay: () => new FakeNode(),
  createAnalyser: () => new FakeNode(),
  createOscillator: () => new FakeSource(),
  createBufferSource: () => new FakeSource(),
  createPeriodicWave: () => ({}),
  createBuffer: (_channels: number, length: number) => {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  },
} as unknown as BaseAudioContext;
const destination = new FakeNode() as unknown as AudioNode;

/** Advances the fake audio clock and the fake timers together, ending due sources. `probe` runs after every 5 ms. */
function advance(ms: number, probe?: () => void): void {
  const end = nowMs + ms;
  while (nowMs < end) {
    const step = Math.min(5, end - nowMs);
    nowMs += step;
    vi.advanceTimersByTime(step);
    for (const source of sources) {
      if (!source.ended && source.stopAt !== null && source.stopAt <= nowMs / 1000) {
        source.ended = true;
        source.onended?.();
      }
    }
    probe?.();
  }
}

function idleState(fromNode: number, fromSource: number): { connected: number; running: number } {
  const connected = nodes.slice(fromNode).filter((n) => n.out.size > 0 && n !== (destination as unknown)).length;
  const running = sources.slice(fromSource).filter((s) => s.startAt !== null && s.stopAt === null).length;
  return { connected, running };
}

const PENTATONIC = new Set([0, 2, 4, 7, 9]);
const pitchClass = (hz: number) => (((Math.round(69 + 12 * Math.log2(hz / 440)) % 12) + 12) % 12);

beforeEach(() => {
  nowMs = 0;
  nodes = [];
  sources = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A small seeded generator (mulberry32), so a sparse layer such as the RF beacon never lands under the count by chance. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("floor ambience: single layers", () => {
  it.each(AMBIENCE_FLOORS)("%s schedules bounded notes and stop() cleans up fully", (floor) => {
    const layer = AMBIENCE_LAYERS[floor](ctx, destination, seeded(7));
    let maxNotes = 0;
    advance(30_000, () => {
      maxNotes = Math.max(maxNotes, layer.activeNotes());
    });
    expect(sources.length).toBeGreaterThan(5);
    expect(maxNotes).toBeGreaterThan(0);
    expect(maxNotes).toBeLessThan(60);

    layer.stop();
    layer.stop();
    expect(layer.activeNotes()).toBe(0);
    expect(idleState(0, 0)).toEqual({ connected: 0, running: 0 });
    expect(vi.getTimerCount()).toBe(0);
    const before = sources.length;
    advance(2_000);
    expect(sources.length).toBe(before);
  });

  it("has a B1 Engine Room layer: a low C and G hum and relay ticks in the scale", () => {
    expect(AMBIENCE_FLOORS).toContain("B1");
    expect(B1_HUM_MIDI).toEqual([36, 43]);
    expect(typeof AMBIENCE_LAYERS.B1).toBe("function");
  });

  it("keeps the B1 layer about 6 dB under the other floor layers (owner, 2026-10-18)", () => {
    expect(B1_UNDER_FLOORS).toBe(0.5);
    expect(B1_HUM_LEVEL).toBeCloseTo(FLOOR_TONE_PEAK * 0.5, 10);
    expect(20 * Math.log10(B1_HUM_LEVEL / FLOOR_TONE_PEAK)).toBeCloseTo(-6, 0);
    // Every fixed gain and tick peak the layer sets stays at or under the hum level.
    const before = nodes.length;
    const layer = AMBIENCE_LAYERS.B1(ctx, destination, seeded(3));
    advance(10_000);
    const gains = nodes.slice(before).flatMap((n) => n.gain.history.filter((v) => v > 0 && v < 1));
    expect(gains).toContain(B1_HUM_LEVEL);
    for (const v of gains) expect(v).toBeLessThanOrEqual(B1_HUM_LEVEL);
    layer.stop();
  });

  it("registers the B1 hum gain while its layer plays and clears it on stop (B1-2)", () => {
    expect(engineHum.node).toBeNull();
    const layer = AMBIENCE_LAYERS.B1(ctx, destination, seeded(3));
    const node = engineHum.node as unknown as FakeNode;
    expect(node).not.toBeNull();
    expect(node.gain.history).toEqual([B1_HUM_LEVEL]);
    expect(engineHum.level).toBe(B1_HUM_LEVEL);
    layer.stop();
    expect(engineHum.node).toBeNull();
    // Other floors never touch it.
    const other = AMBIENCE_LAYERS.L3(ctx, destination, seeded(3));
    expect(engineHum.node).toBeNull();
    other.stop();
  });

  it("never lets a stopped older B1 layer clear a newer layer's hum", () => {
    const older = AMBIENCE_LAYERS.B1(ctx, destination, seeded(3));
    const olderNode = engineHum.node;
    const newer = AMBIENCE_LAYERS.B1(ctx, destination, seeded(4));
    const newerNode = engineHum.node;
    expect(newerNode).not.toBe(olderNode);
    older.stop();
    expect(engineHum.node).toBe(newerNode);
    newer.stop();
    expect(engineHum.node).toBeNull();
  });

  it("keeps the hum registered across a B1 to L3 and back crossfade until its own layer stops", () => {
    const voice = createAmbience(ctx, destination, seeded(5));
    voice.setFloor("B1");
    const first = engineHum.node;
    expect(first).not.toBeNull();
    voice.setFloor("L3");
    expect(engineHum.node).toBe(first);
    voice.setFloor("B1");
    const second = engineHum.node;
    expect(second).not.toBe(first);
    advance((AMBIENCE_CROSSFADE + 1) * 1000);
    expect(engineHum.node).toBe(second);
    voice.stop();
    expect(engineHum.node).toBeNull();
  });

  it("keeps every pitched oscillator in C major pentatonic", () => {
    for (const floor of AMBIENCE_FLOORS) {
      const layer = AMBIENCE_LAYERS[floor](ctx, destination);
      advance(60_000);
      layer.stop();
    }
    const frequencies = sources.flatMap((s) => s.frequency.history);
    expect(frequencies.length).toBeGreaterThan(0);
    for (const hz of frequencies) expect(PENTATONIC.has(pitchClass(hz))).toBe(true);
  });

  it("does not burst into the past after a 5 s stall", () => {
    const layer = AMBIENCE_LAYERS.L3(ctx, destination);
    advance(2_000);
    const before = sources.length;
    nowMs += 5_000;
    advance(100);
    expect(sources.length - before).toBeLessThanOrEqual(3);
    layer.stop();
  });
});

describe("floor ambience: voice", () => {
  it("never holds more than 3 layers during rapid floor changes, then fades out to none", () => {
    const voice = createAmbience(ctx, destination);
    let maxLayers = 0;
    const probe = () => {
      maxLayers = Math.max(maxLayers, voice.activeLayers());
    };
    const sequence: Array<AmbienceFloor | null> = ["L1", "L2", "L3", "L4", "RF", null];
    for (const floor of sequence) {
      voice.setFloor(floor);
      probe();
      advance(200, probe);
    }
    expect(maxLayers).toBeLessThanOrEqual(3);
    expect(voice.floor()).toBeNull();
    advance(AMBIENCE_CROSSFADE * 1000 + 200, probe);
    expect(voice.activeLayers()).toBe(0);
    voice.stop();
  });

  it("treats the same floor as a no-op and crossfades between floors", () => {
    const voice = createAmbience(ctx, destination);
    voice.setFloor("L1");
    advance(3_000);
    expect(voice.activeLayers()).toBe(1);
    const count = sources.length;
    voice.setFloor("L1");
    expect(voice.activeLayers()).toBe(1);
    expect(sources.length).toBe(count);

    voice.setFloor("L2");
    expect(voice.activeLayers()).toBe(2);
    advance(AMBIENCE_CROSSFADE * 1000 + 200);
    expect(voice.activeLayers()).toBe(1);
    expect(voice.floor()).toBe("L2");

    voice.setFloor("L1");
    voice.setFloor("L2");
    voice.setFloor("L1");
    voice.setFloor("RF");
    expect(voice.activeLayers()).toBeLessThanOrEqual(3);
    voice.stop();
  });

  it("stop() leaves no layers, connected nodes, running sources or timers, and ignores later setFloor", () => {
    const voice = createAmbience(ctx, destination);
    for (const floor of ["L1", "L2", "L3", "L4", "RF"] as const) {
      voice.setFloor(floor);
      advance(200);
    }
    advance(500);
    voice.stop();
    voice.stop();
    voice.setFloor("L3");
    expect(voice.activeLayers()).toBe(0);
    expect(idleState(0, 0)).toEqual({ connected: 0, running: 0 });
    const before = sources.length;
    advance(5_000);
    expect(sources.length).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
