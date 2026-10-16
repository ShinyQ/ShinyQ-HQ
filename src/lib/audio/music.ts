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
