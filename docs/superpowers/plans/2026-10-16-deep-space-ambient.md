# Deep Space Ambient Background Music Implementation Plan

Status: shipped in #175, 2026-10-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tower's ambient hum with the procedural "Deep Space Ambient" music the owner picked, at today's ambient loudness, with a robust lookahead scheduler and no leaks.

**Architecture:** A new `src/lib/audio/music.ts` builds the track on the engine's master bus: three triangle drones through a 600 Hz lowpass, random C major pentatonic glass bells scheduled by a lookahead scheduler on `AudioContext.currentTime`, a 3 s synthetic convolution reverb (impulse built once per context, cached) at 60 percent wet and a dynamics compressor, then an output trim. The engine starts the music with the context, stops it (all scheduled notes cancelled, every node disconnected, timer cleared) when a mute or pause fade finishes and on dispose, and starts a fresh one on unmute or unpause.

**Tech Stack:** Web Audio API, TypeScript, Vitest with a fake `AudioContext`.

## Global Constraints

- Owner pick (verbatim): "Deep Space Ambient will be good".
- Port the audition `space` track faithfully: triangle drones at MIDI 36, 43, 48 through a 600 Hz lowpass at gain 0.05 each; every 0.5 s a 35 percent chance of a random bell from MIDI 60, 62, 64, 67, 69, 72, 74, 76, 79 as a sine (10 ms attack, 2.6 s decay, peak 0.06) plus an octave-up partial at 2.01x (1.4 s decay, peak 0.015); 3 s decaying-noise impulse reverb (`(1 - i/len)^2.5`) at 60 percent wet; a dynamics compressor (default settings).
- Loudness: keep the site's ambient level (the hum sat at gain 0.04) so music never masks the sound effects. Offline calibration (K-weighted RMS, 40 s render): the track at the audition's 0.6 master is 1.59x the hum, so the output trim is `MUSIC_LEVEL = 0.6` (about 0.4 dB under the hum).
- The compressor sits on the music bus, not the site master, so beep, ding, whoosh, click, blip and the rover rumble stay byte-for-byte unchanged.
- No audio files, no new dependency. Lazy: starts with the context on the same first gesture or unmute. Respects mute (persisted), pause outside 3D; tab hidden only suspends the context.
- Scheduling uses `ctx.currentTime` with a lookahead window; a `setInterval` only wakes the scheduler. After a main-thread stall the scheduler skips missed steps (no burst of bells).
- Stop cancels every future note, disconnects every node, drops references and clears the timer. The memory gates must stay green.
- Budgets: 3D first-frame and session bytes unchanged or within a few hundred bytes; no frame-time regression in the perf lane.
- No em dashes (U+2014) anywhere.

---

### Task 1: Music module, shared audio fakes and scheduler tests

**Files:**
- Create: `src/lib/audio/music.ts`
- Modify: `src/lib/audio/synth.ts` (export `envelope`)
- Create: `tests/helpers/fake-audio.ts` (fakes moved out of `tests/unit/audio.test.ts`, plus convolver and compressor)
- Modify: `tests/unit/audio.test.ts` (import the fakes from the helper; no behavior change)
- Create: `tests/unit/audio-music.test.ts`

**Interfaces:**
- Produces (`src/lib/audio/music.ts`):
  - `MUSIC_LEVEL = 0.6`, `MUSIC_STEP = 0.5`, `BELL_CHANCE = 0.35`, `MUSIC_LOOKAHEAD = 0.6`, `MUSIC_TICK_MS = 100`, `REVERB_SECONDS = 3`, `DRONE_NOTES = [36, 43, 48]`, `BELL_NOTES = [60, 62, 64, 67, 69, 72, 74, 76, 79]`
  - `midiToHz(note: number): number`
  - `getReverbImpulse(ctx: BaseAudioContext): AudioBuffer` (cached per context)
  - `interface MusicVoice { output: GainNode; activeNotes(): number; stop(): void }`
  - `createSpaceMusic(ctx: BaseAudioContext, destination: AudioNode, random?: () => number): MusicVoice`
- Produces (`tests/helpers/fake-audio.ts`): `FakeParam`, `FakeNode`, `FakeGain`, `FakeFilter`, `FakeSource`, `FakeOscillator`, `FakeBufferSource`, `FakeBuffer`, `FakeConvolver`, `FakeCompressor`, `FakeAudioContext` (with `nodes: FakeNode[]` holding every node it created, `convolvers`, `compressors`).

- [ ] **Step 1: Move the fakes into `tests/helpers/fake-audio.ts`**

Cut `FakeParam`, `FakeNode`, `FakeGain`, `FakeFilter`, `FakeSource`, `FakeOscillator`, `FakeBufferSource`, `FakeBuffer` and `FakeAudioContext` from `tests/unit/audio.test.ts` into the helper (export each; keep `import { vi } from "vitest"`), and add:

```ts
export class FakeConvolver extends FakeNode {
  buffer: unknown = null;
  normalize = true;
}

export class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  ratio = new FakeParam(12);
}
```

In `FakeAudioContext` add `nodes: FakeNode[] = []`, `convolvers: FakeConvolver[] = []`, `compressors: FakeCompressor[] = []`, push every created node (oscillator, buffer source, gain, filter, convolver, compressor) into `nodes` as well as its typed list, and add:

```ts
  createConvolver = vi.fn(() => {
    const node = new FakeConvolver();
    this.convolvers.push(node);
    this.nodes.push(node);
    return node;
  });
  createDynamicsCompressor = vi.fn(() => {
    const node = new FakeCompressor();
    this.compressors.push(node);
    this.nodes.push(node);
    return node;
  });
```

`tests/unit/audio.test.ts` imports what it uses from `../helpers/fake-audio` (`FakeStorage` and `FakeDoc` stay in the test file).

- [ ] **Step 2: Run the existing audio tests (still green before the music exists)**

Run: `bunx vitest run tests/unit/audio.test.ts`
Expected: PASS (same count as before).

- [ ] **Step 3: Write the failing scheduler tests in `tests/unit/audio-music.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BELL_NOTES,
  DRONE_NOTES,
  MUSIC_LEVEL,
  MUSIC_LOOKAHEAD,
  MUSIC_STEP,
  MUSIC_TICK_MS,
  createSpaceMusic,
  getReverbImpulse,
  midiToHz,
} from "@/lib/audio/music";
import { FakeAudioContext, FakeGain, FakeNode, FakeOscillator } from "../helpers/fake-audio";

const always = () => 0; // every step rings, always the first bell note
const never = () => 0.99;

function setup(random: () => number = always) {
  const ctx = new FakeAudioContext();
  const destination = new FakeGain();
  const music = createSpaceMusic(ctx as unknown as AudioContext, destination as unknown as AudioNode, random);
  return { ctx, destination, music };
}

const bells = (ctx: FakeAudioContext) => ctx.oscillators.filter((o) => o.type === "sine");
const startTime = (o: FakeOscillator) => o.start.mock.calls[0][0] as number;

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deep space music: graph", () => {
  it("plays three triangle drones at MIDI 36, 43 and 48 through one 600 Hz lowpass", () => {
    const { ctx } = setup(never);
    const drones = ctx.oscillators.filter((o) => o.type === "triangle");
    expect(drones.map((o) => o.frequency.value)).toEqual(DRONE_NOTES.map(midiToHz));
    expect(drones.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    const lowpass = ctx.filters.find((f) => f.frequency.value === 600)!;
    expect(lowpass.type).toBe("lowpass");
    expect(drones.every((o) => o.connected.includes(lowpass))).toBe(true);
  });

  it("feeds a cached 3 s stereo reverb and a compressor, then fades the output in to MUSIC_LEVEL", () => {
    const { ctx, destination, music } = setup(never);
    expect(ctx.convolvers).toHaveLength(1);
    expect(ctx.compressors).toHaveLength(1);
    const impulse = ctx.convolvers[0].buffer as { numberOfChannels: number; length: number };
    expect(impulse.numberOfChannels).toBe(2);
    expect(impulse.length).toBe(ctx.sampleRate * 3);
    expect(getReverbImpulse(ctx as unknown as AudioContext)).toBe(impulse);
    expect(music.output.connected).toEqual([destination]);
    expect((music.output as unknown as FakeGain).gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(MUSIC_LEVEL, expect.any(Number));
  });
});

describe("deep space music: lookahead scheduler", () => {
  it("schedules bells only inside the lookahead window, one step apart", () => {
    const { ctx } = setup();
    const first = bells(ctx).map(startTime);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((t) => t >= 0 && t < MUSIC_LOOKAHEAD)).toBe(true);

    for (let i = 0; i < 30; i++) {
      ctx.currentTime += MUSIC_TICK_MS / 1000;
      const before = bells(ctx).length;
      vi.advanceTimersByTime(MUSIC_TICK_MS);
      const added = bells(ctx).slice(before).map(startTime);
      expect(added.every((t) => t >= ctx.currentTime && t < ctx.currentTime + MUSIC_LOOKAHEAD)).toBe(true);
    }
    const times = [...new Set(bells(ctx).map(startTime))].sort((a, b) => a - b);
    expect(times.length).toBeGreaterThan(5);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(MUSIC_STEP, 6);
  });

  it("rings a sine bell with a quiet 2.01x partial from the pentatonic set", () => {
    const { ctx } = setup();
    const [fundamental, partial] = bells(ctx);
    expect(fundamental.frequency.value).toBeCloseTo(midiToHz(BELL_NOTES[0]), 6);
    expect(partial.frequency.value).toBeCloseTo(midiToHz(BELL_NOTES[0]) * 2.01, 6);
  });

  it("rolls the dice per step: no bells when every roll misses", () => {
    const { ctx } = setup(never);
    ctx.currentTime = 10;
    vi.advanceTimersByTime(MUSIC_TICK_MS * 5);
    expect(bells(ctx)).toHaveLength(0);
  });

  it("skips missed steps after a stall instead of bursting into the past", () => {
    const { ctx } = setup();
    ctx.currentTime = 30;
    const before = bells(ctx).length;
    vi.advanceTimersByTime(MUSIC_TICK_MS);
    const late = bells(ctx).slice(before).map(startTime);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((t) => t >= 30 && t <= 30 + MUSIC_LOOKAHEAD)).toBe(true);
  });

  it("does not advance while the context is suspended (currentTime frozen)", () => {
    const { ctx } = setup();
    const before = bells(ctx).length;
    vi.advanceTimersByTime(MUSIC_TICK_MS * 20);
    expect(bells(ctx)).toHaveLength(before);
  });
});

describe("deep space music: stop", () => {
  it("cancels future notes, disconnects every node and clears the timer", () => {
    const { ctx, music } = setup();
    ctx.currentTime = 1;
    vi.advanceTimersByTime(MUSIC_TICK_MS);
    expect(music.activeNotes()).toBeGreaterThan(0);
    const future = bells(ctx).filter((o) => startTime(o) > 1);
    expect(future.length).toBeGreaterThan(0);

    music.stop();
    expect(future.every((o) => o.stop.mock.calls.at(-1)![0] <= 1)).toBe(true);
    expect(ctx.oscillators.every((o) => o.stop.mock.calls.length > 0)).toBe(true);
    expect(ctx.nodes.every((n: FakeNode) => n.disconnect.mock.calls.length > 0)).toBe(true);
    expect(music.activeNotes()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    const count = ctx.oscillators.length;
    ctx.currentTime = 5;
    vi.advanceTimersByTime(MUSIC_TICK_MS * 10);
    expect(ctx.oscillators).toHaveLength(count);
    music.stop();
  });

  it("drops a finished bell when its fundamental ends", () => {
    const { ctx, music } = setup();
    const notes = music.activeNotes();
    const [fundamental, partial] = bells(ctx);
    fundamental.onended?.();
    expect(music.activeNotes()).toBe(notes - 1);
    expect(fundamental.disconnect).toHaveBeenCalled();
    expect(partial.disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `bunx vitest run tests/unit/audio-music.test.ts`
Expected: FAIL (cannot resolve `@/lib/audio/music`).

- [ ] **Step 5: Export `envelope` from `synth.ts`**

Change `function envelope(` to `export function envelope(` (signature unchanged: `(gain: GainNode, when: number, peak: number, attack: number, end: number): void`).

- [ ] **Step 6: Implement `src/lib/audio/music.ts`**

```ts
import { envelope } from "./synth";

/**
 * "Deep Space Ambient" (owner pick 2026-10-16): slow triangle drones, random pentatonic glass bells and a long
 * synthetic reverb. Ported from the audition the owner approved; the only structural changes are cost savings
 * that keep the sound (one shared drone lowpass, no lowpass on the bells, the audition volume folded into the
 * dry and wet gains).
 */

/** Output trim: the audition track matched to the old hum's loudness (K-weighted RMS at hum gain 0.04), a hair under. */
export const MUSIC_LEVEL = 0.6;
/** Seconds between bell chances. */
export const MUSIC_STEP = 0.5;
export const BELL_CHANCE = 0.35;
/** Notes are scheduled this far ahead of `ctx.currentTime` (s), so a main-thread stall under about 0.5 s never drops one. */
export const MUSIC_LOOKAHEAD = 0.6;
/** How often the scheduler wakes (ms). Timing comes from the audio clock, never from this interval. */
export const MUSIC_TICK_MS = 100;
export const REVERB_SECONDS = 3;
export const DRONE_NOTES = [36, 43, 48];
export const BELL_NOTES = [60, 62, 64, 67, 69, 72, 74, 76, 79];

/** The audition's master volume; the compressor sees the same level the owner heard. */
const AUDITION_GAIN = 0.6;
const WET = 0.6;
const DRONE_GAIN = 0.05;
const DRONE_CUTOFF = 600;
const FADE_IN = 2;
const FIRST_STEP_DELAY = 0.1;
const BELL_ATTACK = 0.01;
const BELL_TAIL = 0.1;
/** [frequency ratio, peak, decay seconds]; the fundamental (longest) comes first. */
const BELL_PARTIALS: Array<[ratio: number, peak: number, decay: number]> = [
  [1, 0.06, 2.6],
  [2.01, 0.015, 1.4],
];

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

const impulseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Stereo decaying-noise impulse, `(1 - i/len)^2.5`, built once per context and reused by every start. */
export function getReverbImpulse(ctx: BaseAudioContext): AudioBuffer {
  let buffer = impulseCache.get(ctx);
  if (!buffer) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * REVERB_SECONDS));
    buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const k = 1 - i / length;
        data[i] = (Math.random() * 2 - 1) * k * k * Math.sqrt(k);
      }
    }
    impulseCache.set(ctx, buffer);
  }
  return buffer;
}

export interface MusicVoice {
  output: GainNode;
  /** Bells scheduled or ringing (leak checks and tests). */
  activeNotes(): number;
  /** Cancels every future note, stops the drones, disconnects every node and clears the scheduler. Idempotent. */
  stop(): void;
}

interface Note {
  sources: OscillatorNode[];
  nodes: AudioNode[];
}

export function createSpaceMusic(
  ctx: BaseAudioContext,
  destination: AudioNode,
  random: () => number = Math.random,
): MusicVoice {
  const t = ctx.currentTime;
  const output = ctx.createGain();
  output.gain.setValueAtTime(0, t);
  output.gain.linearRampToValueAtTime(MUSIC_LEVEL, t + FADE_IN);
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(output).connect(destination);

  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.setValueAtTime((1 - WET) * AUDITION_GAIN, t);
  const wet = ctx.createGain();
  wet.gain.setValueAtTime(WET * AUDITION_GAIN, t);
  const reverb = ctx.createConvolver();
  reverb.buffer = getReverbImpulse(ctx);
  bus.connect(dry).connect(compressor);
  bus.connect(reverb).connect(wet).connect(compressor);

  // One lowpass and gain for all three drones: the same sum as one chain per drone, four nodes fewer.
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.setValueAtTime(DRONE_CUTOFF, t);
  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(DRONE_GAIN, t);
  droneFilter.connect(droneGain).connect(bus);
  const drones = DRONE_NOTES.map((note) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(midiToHz(note), t);
    osc.connect(droneFilter);
    osc.start(t);
    return osc;
  });
  const fixed: AudioNode[] = [output, compressor, bus, dry, wet, reverb, droneFilter, droneGain, ...drones];

  const notes = new Set<Note>();
  let stopped = false;

  function release(note: Note): void {
    for (const source of note.sources) source.onended = null;
    for (const node of note.nodes) node.disconnect();
    notes.delete(note);
  }

  function bell(when: number): void {
    const frequency = midiToHz(BELL_NOTES[Math.floor(random() * BELL_NOTES.length)]);
    const note: Note = { sources: [], nodes: [] };
    for (const [ratio, peak, decay] of BELL_PARTIALS) {
      const end = when + BELL_ATTACK + decay;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency * ratio, when);
      const gain = ctx.createGain();
      envelope(gain, when, peak, BELL_ATTACK, end);
      osc.connect(gain).connect(bus);
      osc.start(when);
      osc.stop(end + BELL_TAIL);
      note.sources.push(osc);
      note.nodes.push(osc, gain);
    }
    note.sources[0].onended = () => release(note);
    notes.add(note);
  }

  let next = t + FIRST_STEP_DELAY;
  function tick(): void {
    if (stopped) return;
    const now = ctx.currentTime;
    // After a stall (or a long suspend) start again from now instead of bursting into the past.
    if (next < now) next = now + FIRST_STEP_DELAY;
    while (next < now + MUSIC_LOOKAHEAD) {
      if (random() < BELL_CHANCE) bell(next);
      next += MUSIC_STEP;
    }
  }
  tick();
  const timer = setInterval(tick, MUSIC_TICK_MS);

  function stopSource(source: AudioScheduledSourceNode, when: number): void {
    try {
      source.stop(when);
    } catch {
      // Already stopped: nothing to cancel.
    }
  }

  return {
    output,
    activeNotes: () => notes.size,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      const now = ctx.currentTime;
      for (const note of [...notes]) {
        for (const source of note.sources) stopSource(source, now);
        release(note);
      }
      for (const drone of drones) stopSource(drone, now);
      for (const node of fixed) node.disconnect();
    },
  };
}
```

- [ ] **Step 7: Run the music and engine tests**

Run: `bunx vitest run tests/unit/audio-music.test.ts tests/unit/audio.test.ts`
Expected: PASS (`audio.test.ts` is untouched in behavior; the engine still uses the hum until Task 2).

- [ ] **Step 8: Typecheck and lint the changed files**

Run: `bunx tsc --noEmit -p . && bunx eslint src/lib/audio tests/unit/audio-music.test.ts tests/unit/audio.test.ts tests/helpers/fake-audio.ts`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/audio/music.ts src/lib/audio/synth.ts tests/helpers/fake-audio.ts tests/unit/audio.test.ts tests/unit/audio-music.test.ts
git commit -m "feat(audio): Deep Space Ambient music voice with a lookahead scheduler"
```

---

### Task 2: Engine wiring, hum removal and docs

**Files:**
- Modify: `src/lib/audio/engine.ts`
- Modify: `src/lib/audio/synth.ts` (delete `createAmbientPad` and `AMBIENT_LEVEL`; keep `LoopVoice`, used by the rumble)
- Modify: `src/lib/audio/types.ts` (comments: "ambient hum" becomes "background music")
- Modify: `tests/unit/audio.test.ts`
- Modify: `src/lib/audio/README.md`, `docs/agents/ci-and-deploy.md` (Audio section), `docs/features.md` (the Sound entry, if it names the hum), `docs/decisions.md` (new row), `docs/superpowers/README.md` (plan row)

**Interfaces:**
- Consumes: `createSpaceMusic(ctx, destination): MusicVoice`, `MusicVoice.stop()`, `MusicVoice.activeNotes()`, fakes from `tests/helpers/fake-audio.ts` (Task 1).
- Produces: unchanged public `AudioEngine` API.

- [ ] **Step 1: Make the engine tests timer-safe and add music lifecycle tests**

The music keeps a 100 ms interval while it plays, so `vi.runAllTimers()` would loop: replace every `vi.runAllTimers()` in `tests/unit/audio.test.ts` with `vi.advanceTimersByTime(1000)`. Then add:

```ts
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
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `bunx vitest run tests/unit/audio.test.ts`
Expected: FAIL in "audio engine: background music" (no triangle drones, no convolver).

- [ ] **Step 3: Wire the music into `engine.ts`**

- Import: `import { createSpaceMusic, type MusicVoice } from "./music";` and drop `createAmbientPad` from the synth import.
- Replace `let ambient: LoopVoice | null = null;` with `let music: MusicVoice | null = null;`.
- Add:

```ts
  /** Starts the background music on the master bus if it is not playing. */
  function startMusic(): void {
    if (!music && ctx && master && ctx.state !== "closed") music = createSpaceMusic(ctx, master);
  }

  /** Cancels every scheduled note and disconnects the music graph. */
  function stopMusic(): void {
    music?.stop();
    music = null;
  }
```

- In `ensureContext`, replace `ambient = createAmbientPad(ctx, master);` with `startMusic();`.
- In `fadeOut`'s timer callback: `if ((muted || paused) && !disposed) { stopMusic(); ignore(context.suspend()); }`.
- In `setMuted`'s unmute branch, after `if (context.state !== "closed") ignore(context.resume());` add `startMusic();`.
- In `setPaused`'s unpause path, after `resume();` add `startMusic();`.
- In `dispose`, replace `ambient?.stop(); ... ambient = null;` with `stopMusic();`.
- Update the gesture comment ("and the ambient hum") to "and the background music".

- [ ] **Step 4: Delete the hum from `synth.ts`**

Remove `AMBIENT_LEVEL` and `createAmbientPad` (and its doc comment). Keep `LoopVoice` (the rumble extends it). Confirm nothing else imports them: `grep -rn "createAmbientPad\|AMBIENT_LEVEL" src tests` returns nothing.

- [ ] **Step 5: Run the audio tests**

Run: `bunx vitest run tests/unit/audio.test.ts tests/unit/audio-music.test.ts`
Expected: PASS.

- [ ] **Step 6: Docs**

- `src/lib/audio/types.ts`: `setMuted` comment ends "...creates the AudioContext and starts the background music."
- `src/lib/audio/README.md`:
  - API `setMuted` row: "...resumes it and starts the background music."
  - Sounds table: replace the Ambient hum row with `| Background music: "Deep Space Ambient" | automatic while unmuted | endless, never repeats exactly | Three triangle drones (MIDI 36, 43, 48) through a 600 Hz lowpass; every 0.5 s a 35 percent chance of a C major pentatonic glass bell (sine, 2.6 s decay, plus a 2.01x partial); 3 s synthetic convolution reverb at 60 percent wet and a compressor on the music bus; output trim 0.6 (the old hum's loudness) |`
  - Behavior: in "Lazy init" say "starts the background music"; add a bullet **Background music** describing: `src/lib/audio/music.ts`; a lookahead scheduler on `AudioContext.currentTime` (0.6 s window, woken every 100 ms; skips missed steps after a stall; does nothing while the context is suspended); the reverb impulse is built once per context and reused; muting or pausing stops the music when the fade ends (every scheduled note cancelled, every node disconnected, the timer cleared) and unmuting or unpausing starts a fresh one with a 2 s fade in; tab hidden only suspends; the compressor is on the music bus so the effects are unchanged; reduced motion does not affect audio.
  - Muting bullet: "(music and rumble included)".
- `docs/agents/ci-and-deploy.md` Audio section: add "- Background music is the procedural Deep Space Ambient track (`src/lib/audio/music.ts`); keep it at `MUSIC_LEVEL` (the old hum's loudness) so it never masks the effects, and stop it through `MusicVoice.stop()` (no leaked nodes or timers)."
- `docs/features.md`: if the Sound entry or a status log mentions the ambient hum, say "Deep Space Ambient background music"; add a status log line for this change if the file keeps one.
- `docs/decisions.md`: row `| 2026-10-16 | Audio | Background music: the ambient hum becomes the procedural "Deep Space Ambient" track (owner pick after six auditions: "Deep Space Ambient will be good"), at the hum's loudness. | |` placed in date order.
- `docs/superpowers/README.md`: add the plan row in the 2026-10-16 group, status `shipped` with the PR link once known.

- [ ] **Step 7: Verify**

Run: `bun run verify:quick`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/lib/audio tests/unit/audio.test.ts docs
git commit -m "feat(audio): replace the ambient hum with Deep Space Ambient music"
```

---

### Task 3 (controller): bytes, perf and ship

- [ ] Compare the audio chunk gzip against the baseline (`7166` B for the chunk holding `hq:sound` before the change) after `bun run build`.
- [ ] `bun run e2e:changed`, then `E2E_PORT=<port> bun run e2e:perf` (frame time, bytes, memory gates) and compare with main's last perf numbers.
- [ ] Wait for a free CI slot, push, open the PR, merge when every required check is green, deploy via `deploy.yml`, confirm main CI.
