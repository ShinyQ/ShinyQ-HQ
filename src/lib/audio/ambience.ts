import { midiToHz } from "./music";
import { envelope, getNoiseBuffer } from "./synth";

/**
 * Floor ambience: one procedural texture per floor that replaces "Deep Space Ambient" while it plays (the engine
 * crossfades the music out, so two soundtracks never overlap). Every pitched note
 * stays in C major pentatonic (the scale of the music's bells and drones), and every layer is a texture, never a
 * melody: slow chime chords (L1), a warm analog pulse (L2), a sparse plucked arpeggio (L3), typewriter ticks and
 * paper rustle (L4), wind and a distant radio beacon (RF). Same lookahead scheduler as `music.ts`.
 */

export type AmbienceFloor = "L1" | "L2" | "L3" | "L4" | "RF";
export const AMBIENCE_FLOORS: readonly AmbienceFloor[] = ["L1", "L2", "L3", "L4", "RF"];

/** Seconds of the linear crossfade between two floor layers (and of the fade in and out). */
export const AMBIENCE_CROSSFADE = 2;
/**
 * Output trim of the ambience voice. The layers are loudness matched to each other at unity, which sits about 2 to
 * 3 LU (K-weighted) under "Deep Space Ambient": a floor layer takes over from the music at about its loudness,
 * so the effects stay on top. The typing ticks are transient, so their integrated level reads lower still.
 */
export const AMBIENCE_LEVEL = 1;
/** Notes are scheduled this far ahead of `ctx.currentTime` (s). */
export const AMBIENCE_LOOKAHEAD = 0.6;
/** How often the scheduler wakes (ms). Timing comes from the audio clock, never from this interval. */
export const AMBIENCE_TICK_MS = 100;

/** Smallest gain used for exponential ramps (they cannot reach 0). */
const SILENT = 0.0001;
const FIRST_STEP_DELAY = 0.1;
/** Shortest gap a track may ask for, so a bad step can never spin the scheduler. */
const MIN_STEP = 0.02;
/** Fade of a layer cut short by a fast floor change (s), then the stop timer after it (ms). */
const KILL_FADE = 0.05;
const KILL_DELAY_MS = 80;
/** Extra wait after a fade ends before the layer is stopped (ms). */
const STOP_MARGIN_MS = 60;

export interface AmbienceLayer {
  /** Layer output at unity gain; `createAmbience` ramps it for the crossfade. */
  output: GainNode;
  /** Notes scheduled or sounding (leak checks and tests). */
  activeNotes(): number;
  /** Cancels every future note, stops every source, disconnects every node and clears the scheduler. Idempotent. */
  stop(): void;
}

export type AmbienceLayerFactory = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  random?: () => number,
) => AmbienceLayer;

interface Note {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  pending: number;
}

/** An event stream: schedules its event at `when` and returns the seconds until its next one. */
interface Track {
  delay: number;
  step(when: number): number;
}

interface Kit {
  ctx: BaseAudioContext;
  random: () => number;
  output: GainNode;
  /** Context time when the layer was created. */
  t: number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Persistent nodes, disconnected on stop. */
  fixed(...nodes: AudioNode[]): void;
  /** A persistent source (a noise loop), stopped and disconnected on stop. */
  loop(source: AudioScheduledSourceNode): void;
  /** A scheduled note; every node is disconnected once all its sources have ended. */
  note(sources: AudioScheduledSourceNode[], nodes: AudioNode[]): void;
  run(tracks: Track[]): AmbienceLayer;
}

function stopSource(source: AudioScheduledSourceNode, when: number): void {
  try {
    source.stop(when);
  } catch {
    // Already stopped: nothing to cancel.
  }
}

function createKit(ctx: BaseAudioContext, destination: AudioNode, random: () => number): Kit {
  const t = ctx.currentTime;
  const output = ctx.createGain();
  output.gain.setValueAtTime(1, t);
  output.connect(destination);
  const fixedNodes: AudioNode[] = [output];
  const loops: AudioScheduledSourceNode[] = [];
  const notes = new Set<Note>();
  let stopped = false;

  function release(note: Note): void {
    for (const source of note.sources) source.onended = null;
    for (const node of note.nodes) node.disconnect();
    notes.delete(note);
  }

  return {
    ctx,
    random,
    output,
    t,
    range: (min, max) => min + (max - min) * random(),
    pick: (items) => items[Math.min(items.length - 1, Math.floor(random() * items.length))],
    fixed(...nodes) {
      fixedNodes.push(...nodes);
    },
    loop(source) {
      loops.push(source);
      fixedNodes.push(source);
    },
    note(sources, nodes) {
      const note: Note = { sources, nodes, pending: sources.length };
      for (const source of sources) {
        source.onended = () => {
          note.pending -= 1;
          if (note.pending <= 0) release(note);
        };
      }
      notes.add(note);
    },
    run(defs) {
      const tracks = defs.map((def) => ({ next: t + Math.max(FIRST_STEP_DELAY, def.delay), step: def.step }));
      function tick(): void {
        if (stopped) return;
        const now = ctx.currentTime;
        for (const track of tracks) {
          // After a stall (or a long suspend) start again from now instead of bursting into the past.
          if (track.next < now) track.next = now + FIRST_STEP_DELAY;
          while (track.next < now + AMBIENCE_LOOKAHEAD) {
            track.next += Math.max(MIN_STEP, track.step(track.next));
          }
        }
      }
      tick();
      const timer = setInterval(tick, AMBIENCE_TICK_MS);
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
          for (const source of loops) stopSource(source, now);
          for (const node of fixedNodes) node.disconnect();
        },
      };
    },
  };
}

/** Linear attack to `peak`, then an exponential decay to silence at `end`: the slow swell of pads and chimes. */
function swell(gain: GainNode, when: number, peak: number, attack: number, end: number): void {
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(SILENT, end);
}

function lowpass(kit: Kit, frequency: number, q = 0.707): BiquadFilterNode {
  const filter = kit.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(frequency, kit.t);
  filter.Q.setValueAtTime(q, kit.t);
  return filter;
}

/**
 * A lowpassed feedback delay (dry plus echoes) into `destination`: the layer's sense of space, five nodes, no
 * convolver. Returns the input.
 */
function echo(kit: Kit, destination: AudioNode, time: number, feedback: number, cutoff: number, wet: number): GainNode {
  const { ctx, t } = kit;
  const input = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.setValueAtTime(time, t);
  const filter = lowpass(kit, cutoff);
  const loop = ctx.createGain();
  loop.gain.setValueAtTime(feedback, t);
  const send = ctx.createGain();
  send.gain.setValueAtTime(wet, t);
  input.connect(destination);
  input.connect(delay).connect(filter);
  filter.connect(loop).connect(delay);
  filter.connect(send).connect(destination);
  kit.fixed(input, delay, filter, loop, send);
  return input;
}

/** A looped slice of the shared white noise buffer, started now at a random offset. */
function noiseLoop(kit: Kit): AudioBufferSourceNode {
  const source = kit.ctx.createBufferSource();
  source.buffer = getNoiseBuffer(kit.ctx);
  source.loop = true;
  source.start(kit.t, kit.random() * 0.9);
  kit.loop(source);
  return source;
}

/* L1 Lobby: soft chime pad. Open pentatonic chords swell in (about 1.8 s), ring about 7 s and overlap. */

/** Seconds between chords. */
export const L1_CHORD_EVERY: readonly [number, number] = [4, 5.5];
const L1_VOICINGS: readonly (readonly number[])[] = [
  [60, 67, 74],
  [57, 64, 69],
  [55, 62, 67],
  [62, 69, 76],
  [64, 69, 74],
  [60, 64, 69],
];
const L1_GLINTS = [76, 79, 81, 84];
const L1_PEAK = 0.016;
const L1_GLINT_PEAK = 0.005;
const L1_GLINT_CHANCE = 0.35;
/** Harmonic amplitudes of the chime wave (fundamental, octave, twelfth, two octaves): airy, a little glassy. */
const L1_HARMONICS = [0, 1, 0.28, 0.1, 0.04];

function createLobbyLayer(ctx: BaseAudioContext, destination: AudioNode, random: () => number = Math.random): AmbienceLayer {
  const kit = createKit(ctx, destination, random);
  const tone = lowpass(kit, 2400);
  tone.connect(echo(kit, kit.output, 0.43, 0.38, 1600, 0.4));
  kit.fixed(tone);
  const wave = ctx.createPeriodicWave(new Float32Array(L1_HARMONICS.length), new Float32Array(L1_HARMONICS));

  function chime(when: number, midi: number, peak: number, attack: number, length: number): void {
    const end = when + length;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(midiToHz(midi), when);
    osc.detune.setValueAtTime(kit.range(-5, 5), when);
    const gain = ctx.createGain();
    swell(gain, when, peak, attack, end);
    osc.connect(gain).connect(tone);
    osc.start(when);
    osc.stop(end + 0.05);
    kit.note([osc], [osc, gain]);
  }

  let last = -1;
  return kit.run([
    {
      delay: FIRST_STEP_DELAY,
      step(when) {
        let index = Math.floor(random() * L1_VOICINGS.length) % L1_VOICINGS.length;
        if (index === last) index = (index + 1) % L1_VOICINGS.length;
        last = index;
        L1_VOICINGS[index].forEach((midi, i) => {
          chime(when + i * kit.range(0.15, 0.35), midi, L1_PEAK, kit.range(1.4, 2.2), kit.range(6.5, 8));
        });
        if (random() < L1_GLINT_CHANCE) chime(when + kit.range(1, 3), kit.pick(L1_GLINTS), L1_GLINT_PEAK, 0.6, 4.5);
        return kit.range(L1_CHORD_EVERY[0], L1_CHORD_EVERY[1]);
      },
    },
  ]);
}

/* L2 Career: warm analog pulse, a slow "lub dub" of two detuned saws under a closing lowpass, at 66 BPM. */

export const L2_BPM = 66;
const L2_HALF_BEAT = 60 / L2_BPM / 2;
/** [root, upper] per bar: C, Am, G, Dsus, all inside C major pentatonic. */
const L2_BARS: ReadonlyArray<readonly [number, number]> = [
  [48, 55],
  [45, 52],
  [43, 50],
  [50, 57],
];
/** Per half beat: [0 root | 1 upper | 2 root an octave up, velocity, chance], or null for a rest. */
const L2_PATTERN: ReadonlyArray<readonly [0 | 1 | 2, number, number] | null> = [
  [0, 1, 1],
  [1, 0.45, 1],
  null,
  null,
  [0, 0.7, 1],
  [1, 0.35, 1],
  null,
  [2, 0.3, 0.4],
];
const L2_PEAK = 0.047;
const L2_DETUNE = 7;
/** Tape wow: a slow pitch drift (cents) and its period (s). */
const L2_WOW = 6;
const L2_WOW_PERIOD = 11;

function createCareerLayer(ctx: BaseAudioContext, destination: AudioNode, random: () => number = Math.random): AmbienceLayer {
  const kit = createKit(ctx, destination, random);
  const tape = echo(kit, kit.output, L2_HALF_BEAT * 1.5, 0.25, 1100, 0.22);

  function pulse(when: number, midi: number, velocity: number): void {
    const end = when + 1.1;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.setValueAtTime(0.8, when);
    filter.frequency.setValueAtTime(260 + 700 * velocity, when);
    filter.frequency.exponentialRampToValueAtTime(220, when + 0.6);
    const gain = ctx.createGain();
    envelope(gain, when, L2_PEAK * velocity, 0.025, end);
    filter.connect(gain).connect(tape);
    const wow = L2_WOW * Math.sin((2 * Math.PI * when) / L2_WOW_PERIOD);
    const oscs = [-L2_DETUNE, L2_DETUNE].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(midiToHz(midi), when);
      osc.detune.setValueAtTime(cents + wow, when);
      osc.connect(filter);
      osc.start(when);
      osc.stop(end + 0.05);
      return osc;
    });
    kit.note(oscs, [...oscs, filter, gain]);
  }

  let index = 0;
  return kit.run([
    {
      delay: FIRST_STEP_DELAY,
      step(when) {
        const [root, upper] = L2_BARS[Math.floor(index / L2_PATTERN.length) % L2_BARS.length];
        const hit = L2_PATTERN[index % L2_PATTERN.length];
        index = (index + 1) % (L2_PATTERN.length * L2_BARS.length);
        if (hit && random() < hit[2]) {
          const midi = hit[0] === 0 ? root : hit[0] === 1 ? upper : root + 12;
          pulse(when, midi, hit[1] * kit.range(0.9, 1));
        }
        return L2_HALF_BEAT;
      },
    },
  ]);
}

/* L3 Labs: light electronic arpeggio. Short square plucks under a snapping lowpass, 0.3 s steps, many rests. */

export const L3_STEP = 0.3;
const L3_PHRASE = 16;
const L3_CHORDS: readonly (readonly number[])[] = [
  [64, 67, 72, 76, 79, 84],
  [62, 67, 69, 74, 79, 81],
  [64, 69, 72, 76, 81, 84],
  [62, 64, 69, 74, 76, 81],
];
const L3_SHAPES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 5],
  [5, 4, 3, 2, 1, 2, 3, 4],
  [0, 1, 2, 1, 3, 2, 4, 3],
];
const L3_PEAK = 0.05;
const L3_REST_CHANCE = 0.3;
/** Chance that the second half of a phrase rests, so the arpeggio breathes. */
const L3_QUIET_HALF_CHANCE = 0.3;

function createLabsLayer(ctx: BaseAudioContext, destination: AudioNode, random: () => number = Math.random): AmbienceLayer {
  const kit = createKit(ctx, destination, random);
  const space = echo(kit, kit.output, L3_STEP * 1.5, 0.32, 1500, 0.3);

  function pluck(when: number, midi: number, velocity: number): void {
    const end = when + 0.25;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(midiToHz(midi), when);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.setValueAtTime(2, when);
    filter.frequency.setValueAtTime(2200, when);
    filter.frequency.exponentialRampToValueAtTime(400, when + 0.15);
    const gain = ctx.createGain();
    envelope(gain, when, L3_PEAK * velocity, 0.003, end);
    osc.connect(filter).connect(gain).connect(space);
    osc.start(when);
    osc.stop(end + 0.02);
    kit.note([osc], [osc, filter, gain]);
  }

  let index = 0;
  let phrase = -1;
  let chord = L3_CHORDS[0];
  let shape = L3_SHAPES[0];
  let quietHalf = false;
  return kit.run([
    {
      delay: FIRST_STEP_DELAY,
      step(when) {
        const position = index % L3_PHRASE;
        if (position === 0) {
          phrase = (phrase + 1) % L3_CHORDS.length;
          chord = L3_CHORDS[phrase];
          shape = kit.pick(L3_SHAPES);
          quietHalf = random() < L3_QUIET_HALF_CHANCE;
        }
        index = (index + 1) % L3_PHRASE;
        const resting = (quietHalf && position >= L3_PHRASE / 2) || random() < L3_REST_CHANCE;
        if (!resting) {
          const accent = position % 4 === 0 ? 1 : kit.range(0.55, 0.8);
          pluck(when, chord[shape[position % shape.length]], accent);
        }
        return L3_STEP;
      },
    },
  ]);
}

/* L4 Writing: typewriter ticks in word-like bursts, a soft bell and return at line ends, and paper rustle swells. */

const L4_TICK_PEAK = 0.26;
const L4_DING_PEAK = 0.008;
const L4_RETURN_PEAK = 0.016;
const L4_PAPER_BASE = 0.004;
const L4_PAPER_PEAK: readonly [number, number] = [0.012, 0.025];
/** E7: the carriage bell, inside the pentatonic scale. */
const L4_DING_HZ = midiToHz(100);
const L4_THINK_CHANCE = 0.12;

function createWritingLayer(ctx: BaseAudioContext, destination: AudioNode, random: () => number = Math.random): AmbienceLayer {
  const kit = createKit(ctx, destination, random);
  const desk = lowpass(kit, 4500);
  desk.connect(kit.output);
  kit.fixed(desk);

  function noiseBurst(when: number, length: number, peak: number, from: number, q: number, to?: number): void {
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.setValueAtTime(q, when);
    filter.frequency.setValueAtTime(from, when);
    if (to !== undefined) filter.frequency.exponentialRampToValueAtTime(to, when + length);
    const gain = ctx.createGain();
    envelope(gain, when, peak, Math.min(0.002, length / 4), when + length);
    source.connect(filter).connect(gain).connect(desk);
    // Keep the slice inside the one second buffer.
    source.start(when, random() * Math.max(0, 0.95 - length));
    source.stop(when + length + 0.01);
    kit.note([source], [source, filter, gain]);
  }

  function ding(when: number): void {
    const end = when + 0.7;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(L4_DING_HZ, when);
    const gain = ctx.createGain();
    envelope(gain, when, L4_DING_PEAK, 0.004, end);
    osc.connect(gain).connect(desk);
    osc.start(when);
    osc.stop(end + 0.02);
    kit.note([osc], [osc, gain]);
  }

  let wordLeft = 0;
  let lineLeft = Math.round(kit.range(28, 48));
  const typing: Track = {
    delay: kit.range(0.3, 1),
    step(when) {
      const space = wordLeft === 0;
      if (space) {
        noiseBurst(when, 0.045, L4_TICK_PEAK * 0.7, kit.range(800, 1000), 1.2);
      } else {
        noiseBurst(when, 0.03, L4_TICK_PEAK * kit.range(0.55, 1), kit.range(1400, 2600), 1.4);
      }
      lineLeft -= 1;
      if (lineLeft <= 0) {
        lineLeft = Math.round(kit.range(28, 48));
        wordLeft = 0;
        ding(when + 0.15);
        noiseBurst(when + 0.55, 0.3, L4_RETURN_PEAK, 600, 1.1, 1500);
        return kit.range(1.4, 2.4);
      }
      if (space) {
        wordLeft = Math.round(kit.range(2, 7));
        return random() < L4_THINK_CHANCE ? kit.range(1.5, 4) : kit.range(0.25, 0.6);
      }
      wordLeft -= 1;
      return kit.range(0.07, 0.17);
    },
  };

  const paper = noiseLoop(kit);
  const paperFilter = ctx.createBiquadFilter();
  paperFilter.type = "bandpass";
  paperFilter.frequency.setValueAtTime(1300, kit.t);
  paperFilter.Q.setValueAtTime(0.5, kit.t);
  const paperGain = ctx.createGain();
  paperGain.gain.setValueAtTime(L4_PAPER_BASE, kit.t);
  paper.connect(paperFilter).connect(paperGain).connect(desk);
  kit.fixed(paperFilter, paperGain);
  const rustle: Track = {
    delay: kit.range(1, 3),
    step(when) {
      const rise = kit.range(0.6, 1.4);
      const fall = kit.range(0.9, 2);
      paperGain.gain.setValueAtTime(L4_PAPER_BASE, when);
      paperGain.gain.linearRampToValueAtTime(kit.range(L4_PAPER_PEAK[0], L4_PAPER_PEAK[1]), when + rise);
      paperGain.gain.linearRampToValueAtTime(L4_PAPER_BASE, when + rise + fall);
      paperFilter.frequency.setTargetAtTime(kit.range(900, 2200), when, 0.4);
      // A new playback rate per swell also keeps the one second noise loop from sounding periodic.
      paper.playbackRate.setTargetAtTime(kit.range(0.8, 1.15), when, 0.5);
      return rise + fall + kit.range(3, 9);
    },
  };

  return kit.run([typing, rustle]);
}

/* RF Roof: gusting band-passed wind over a low body, and a distant radio beacon in short morse-like patterns. */

const RF_WIND_BASE = 0.055;
const RF_WIND_GUST: readonly [number, number] = [0.085, 0.15];
const RF_BODY = 0.045;
const RF_BEEP_PEAK = 0.02;
/** G6, A6, C7: high and inside the pentatonic scale. */
const RF_BEACON_HZ = [midiToHz(91), midiToHz(93), midiToHz(96)];
const RF_DOT = 0.08;
/** Morse-like patterns: "." dot, "-" dash, " " letter gap. The last one spells HQ. */
const RF_PATTERNS = [".", "..", ". .", "-", ".-", "... ", ".... --.-"];

function createRoofLayer(ctx: BaseAudioContext, destination: AudioNode, random: () => number = Math.random): AmbienceLayer {
  const kit = createKit(ctx, destination, random);

  const air = noiseLoop(kit);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(500, kit.t);
  band.Q.setValueAtTime(1.6, kit.t);
  const wind = ctx.createGain();
  wind.gain.setValueAtTime(RF_WIND_BASE, kit.t);
  air.connect(band).connect(wind).connect(kit.output);
  const low = lowpass(kit, 240);
  const body = ctx.createGain();
  body.gain.setValueAtTime(RF_BODY, kit.t);
  air.connect(low).connect(body).connect(kit.output);
  kit.fixed(band, wind, low, body);

  const gusts: Track = {
    delay: kit.range(0.5, 2),
    step(when) {
      const length = kit.range(1.5, 4);
      const up = kit.range(0.5, 1.2);
      const down = kit.range(0.8, 1.6);
      wind.gain.setTargetAtTime(kit.range(RF_WIND_GUST[0], RF_WIND_GUST[1]), when, up);
      band.frequency.setTargetAtTime(kit.range(450, 1300), when, up);
      air.playbackRate.setTargetAtTime(kit.range(0.85, 1.2), when, up);
      wind.gain.setTargetAtTime(RF_WIND_BASE, when + length, down);
      band.frequency.setTargetAtTime(kit.range(380, 600), when + length, down);
      return length + kit.range(1.5, 5);
    },
  };

  const radio = lowpass(kit, 2600);
  const tuned = ctx.createBiquadFilter();
  tuned.type = "highpass";
  tuned.frequency.setValueAtTime(900, kit.t);
  radio.connect(tuned).connect(echo(kit, kit.output, 0.55, 0.45, 2500, 0.5));
  kit.fixed(radio, tuned);

  function beep(when: number, frequency: number, length: number): void {
    const end = when + length + 0.03;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, when);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(RF_BEEP_PEAK, when + 0.01);
    gain.gain.setValueAtTime(RF_BEEP_PEAK, when + length);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(radio);
    osc.start(when);
    osc.stop(end + 0.02);
    kit.note([osc], [osc, gain]);
  }

  const beacon: Track = {
    delay: kit.range(2, 5),
    step(when) {
      const frequency = kit.pick(RF_BEACON_HZ);
      let at = when;
      for (const symbol of kit.pick(RF_PATTERNS)) {
        if (symbol === " ") {
          at += RF_DOT * 2;
          continue;
        }
        const length = symbol === "-" ? RF_DOT * 3 : RF_DOT;
        beep(at, frequency, length);
        at += length + RF_DOT;
      }
      return at - when + kit.range(6, 14);
    },
  };

  return kit.run([gusts, beacon]);
}

export const AMBIENCE_LAYERS: Record<AmbienceFloor, AmbienceLayerFactory> = {
  L1: createLobbyLayer,
  L2: createCareerLayer,
  L3: createLabsLayer,
  L4: createWritingLayer,
  RF: createRoofLayer,
};

export interface AmbienceVoice {
  output: GainNode;
  /** Crossfades to the floor's layer over `AMBIENCE_CROSSFADE`; `null` fades out. The same floor is a no-op. */
  setFloor(floor: AmbienceFloor | null): void;
  floor(): AmbienceFloor | null;
  /** Layers alive (current, fading out, and one being cut short): never more than 3. */
  activeLayers(): number;
  /** Stops every layer at once and disconnects the output. Idempotent. */
  stop(): void;
}

interface Slot {
  floor: AmbienceFloor;
  layer: AmbienceLayer;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Ramps from the current value (read before cancelling) to `target`, linearly over `duration`. */
function rampFromNow(ctx: BaseAudioContext, param: AudioParam, target: number, duration: number): void {
  const now = ctx.currentTime;
  const value = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(value, now);
  param.linearRampToValueAtTime(target, now + duration);
}

export function createAmbience(
  ctx: BaseAudioContext,
  destination: AudioNode,
  random: () => number = Math.random,
): AmbienceVoice {
  const output = ctx.createGain();
  output.gain.setValueAtTime(AMBIENCE_LEVEL, ctx.currentTime);
  output.connect(destination);
  let current: Slot | null = null;
  /** The previous layer, fading out over the full crossfade. */
  let fading: Slot | null = null;
  /** An older layer cut short by a fast floor change (a 50 ms fade, then stopped). */
  let dying: Slot | null = null;
  let stopped = false;

  function finish(slot: Slot): void {
    if (slot.timer !== null) clearTimeout(slot.timer);
    slot.timer = null;
    slot.layer.stop();
    if (fading === slot) fading = null;
    if (dying === slot) dying = null;
  }

  function cutShort(slot: Slot): void {
    if (dying) finish(dying);
    if (slot.timer !== null) clearTimeout(slot.timer);
    if (fading === slot) fading = null;
    dying = slot;
    rampFromNow(ctx, slot.layer.output.gain, 0, KILL_FADE);
    slot.timer = setTimeout(() => finish(slot), KILL_DELAY_MS);
  }

  function fadeOut(slot: Slot): void {
    if (fading) cutShort(fading);
    fading = slot;
    rampFromNow(ctx, slot.layer.output.gain, 0, AMBIENCE_CROSSFADE);
    slot.timer = setTimeout(() => finish(slot), AMBIENCE_CROSSFADE * 1000 + STOP_MARGIN_MS);
  }

  return {
    output,
    setFloor(floor) {
      if (stopped || floor === (current?.floor ?? null)) return;
      if (current) fadeOut(current);
      current = null;
      if (!floor) return;
      const layer = AMBIENCE_LAYERS[floor](ctx, output, random);
      const now = ctx.currentTime;
      layer.output.gain.cancelScheduledValues(now);
      layer.output.gain.setValueAtTime(0, now);
      layer.output.gain.linearRampToValueAtTime(1, now + AMBIENCE_CROSSFADE);
      current = { floor, layer, timer: null };
    },
    floor: () => current?.floor ?? null,
    activeLayers: () => (current ? 1 : 0) + (fading ? 1 : 0) + (dying ? 1 : 0),
    stop() {
      if (stopped) return;
      stopped = true;
      for (const slot of [current, fading, dying]) if (slot) finish(slot);
      current = null;
      output.disconnect();
    },
  };
}
