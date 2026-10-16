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
    const output = music.output as unknown as FakeGain;
    expect(output.connected).toEqual([destination]);
    expect(output.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(MUSIC_LEVEL, expect.any(Number));
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
