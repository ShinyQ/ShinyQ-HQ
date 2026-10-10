import type { SoundName } from "./types";

/** Smallest gain used for exponential ramps (they cannot reach 0). */
const SILENT = 0.0001;

const whiteNoiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const brownNoiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise, generated once per context. */
export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = whiteNoiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    whiteNoiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** Two seconds of brown (integrated) noise for the tread rumble loop, generated once per context. */
export function getBrownNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = brownNoiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 2)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    brownNoiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** Disconnects the given nodes once the source ends so the whole chain can be collected. */
function cleanupOnEnded(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  source.onended = () => {
    for (const node of nodes) node.disconnect();
  };
}

function envelope(gain: GainNode, when: number, peak: number, attack: number, end: number): void {
  gain.gain.setValueAtTime(SILENT, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(SILENT, end);
}

/** Two-tone chirp, about 120 ms. */
export function scheduleBeep(ctx: BaseAudioContext, destination: AudioNode, when: number): void {
  const tones: Array<[number, number]> = [
    [1320, 0],
    [1980, 0.06],
  ];
  for (const [frequency, offset] of tones) {
    const start = when + offset;
    const end = start + 0.055;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(frequency, start);
    envelope(gain, start, 0.08, 0.005, end);
    osc.connect(gain).connect(destination);
    cleanupOnEnded(osc, [osc, gain]);
    osc.start(start);
    osc.stop(end + 0.005);
  }
}

/** Bell-like elevator ding: inharmonic sine partials with exponential decay, about 550 ms. */
export function scheduleDing(ctx: BaseAudioContext, destination: AudioNode, when: number): void {
  const base = 880;
  const partials: Array<[ratio: number, amp: number, decay: number]> = [
    [1, 0.22, 0.55],
    [2.76, 0.1, 0.35],
    [5.4, 0.05, 0.2],
    [8.93, 0.025, 0.12],
  ];
  for (const [ratio, amp, decay] of partials) {
    const end = when + decay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base * ratio, when);
    envelope(gain, when, amp, 0.004, end);
    osc.connect(gain).connect(destination);
    cleanupOnEnded(osc, [osc, gain]);
    osc.start(when);
    osc.stop(end + 0.01);
  }
}

/** Drawer whoosh: band-passed noise with a rising sweep, about 220 ms. */
export function scheduleWhoosh(ctx: BaseAudioContext, destination: AudioNode, when: number): void {
  const duration = 0.22;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.setValueAtTime(1.2, when);
  filter.frequency.setValueAtTime(350, when);
  filter.frequency.exponentialRampToValueAtTime(3200, when + duration);
  const gain = ctx.createGain();
  envelope(gain, when, 0.18, 0.08, when + duration);
  source.connect(filter).connect(gain).connect(destination);
  cleanupOnEnded(source, [source, filter, gain]);
  source.start(when, Math.random() * 0.5);
  source.stop(when + duration + 0.01);
}

/** Terminal key click: a very short burst of high-passed noise, about 25 ms. */
export function scheduleClick(ctx: BaseAudioContext, destination: AudioNode, when: number): void {
  const duration = 0.02;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(2400 + Math.random() * 800, when);
  const gain = ctx.createGain();
  envelope(gain, when, 0.12, 0.001, when + duration);
  source.connect(filter).connect(gain).connect(destination);
  cleanupOnEnded(source, [source, filter, gain]);
  source.start(when, Math.random() * 0.9);
  source.stop(when + duration + 0.005);
}

export type OneShot = (ctx: BaseAudioContext, destination: AudioNode, when: number) => void;

export const ONE_SHOTS: Record<SoundName, OneShot> = {
  beep: scheduleBeep,
  ding: scheduleDing,
  whoosh: scheduleWhoosh,
  click: scheduleClick,
};

export interface LoopVoice {
  output: GainNode;
  stop(): void;
}

/** Target gain of the ambient pad (roughly -24 LUFS against the other sounds). */
export const AMBIENT_LEVEL = 0.04;

/** Quiet low-passed pad: detuned saws plus a sine sub, with a slow LFO on the cutoff. */
export function createAmbientPad(ctx: BaseAudioContext, destination: AudioNode): LoopVoice {
  const t = ctx.currentTime;
  const output = ctx.createGain();
  output.gain.setValueAtTime(0, t);
  output.gain.linearRampToValueAtTime(AMBIENT_LEVEL, t + 2);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(420, t);
  filter.Q.setValueAtTime(0.7, t);
  filter.connect(output).connect(destination);

  const voices: Array<[type: OscillatorType, frequency: number, detune: number, level: number]> = [
    ["sawtooth", 55, -6, 0.35],
    ["sawtooth", 82.5, 5, 0.25],
    ["sine", 110, 0, 0.4],
  ];
  const sources: OscillatorNode[] = [];
  const nodes: AudioNode[] = [filter, output];
  for (const [type, frequency, detune, level] of voices) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    osc.detune.setValueAtTime(detune, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    osc.connect(gain).connect(filter);
    osc.start(t);
    sources.push(osc);
    nodes.push(osc, gain);
  }

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(0.07, t);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.setValueAtTime(160, t);
  lfo.connect(lfoDepth).connect(filter.frequency);
  lfo.start(t);
  sources.push(lfo);
  nodes.push(lfo, lfoDepth);

  return {
    output,
    stop() {
      const now = ctx.currentTime;
      for (const source of sources) source.stop(now + 0.05);
      sources[0].onended = () => {
        for (const node of nodes) node.disconnect();
      };
    },
  };
}

export const RUMBLE_MIN_SPEED = 1;
export const RUMBLE_MAX_SPEED = 12;
export const RUMBLE_MAX_GAIN = 0.2;

/** Maps rover speed (u/s) to rumble gain and lowpass cutoff. Speeds at or below 1 are silent. */
export function rumbleTargets(speed: number): { gain: number; cutoff: number } {
  const s = Number.isFinite(speed) ? Math.min(Math.max(speed, 0), RUMBLE_MAX_SPEED) : 0;
  if (s <= RUMBLE_MIN_SPEED) return { gain: 0, cutoff: 90 };
  const t = (s - RUMBLE_MIN_SPEED) / (RUMBLE_MAX_SPEED - RUMBLE_MIN_SPEED);
  return { gain: RUMBLE_MAX_GAIN * (0.2 + 0.8 * t), cutoff: 90 + 520 * t };
}

export interface RumbleVoice extends LoopVoice {
  filter: BiquadFilterNode;
  setSpeed(speed: number): void;
}

/** Looped brown noise through a lowpass filter; gain and cutoff follow speed. Starts silent. */
export function createRumble(ctx: BaseAudioContext, destination: AudioNode): RumbleVoice {
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = getBrownNoiseBuffer(ctx);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(90, t);
  filter.Q.setValueAtTime(0.9, t);
  const output = ctx.createGain();
  output.gain.setValueAtTime(0, t);
  source.connect(filter).connect(output).connect(destination);
  source.start(t);

  return {
    output,
    filter,
    setSpeed(speed) {
      const { gain, cutoff } = rumbleTargets(speed);
      const now = ctx.currentTime;
      output.gain.setTargetAtTime(gain, now, 0.08);
      filter.frequency.setTargetAtTime(cutoff, now, 0.08);
    },
    stop() {
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        output.disconnect();
      };
      source.stop(ctx.currentTime + 0.05);
    },
  };
}
