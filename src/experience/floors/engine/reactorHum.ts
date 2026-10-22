import { engineHum } from "@/lib/audio/engineHum";

/**
 * The B1 hum rises near the reactor core (B1-2): full at `outer` and beyond, `1 + boost` (about 6 dB louder) at
 * `inner` and closer, linear between (distances from the core's center, floor units). Applied `hz` times a second,
 * each change a `setTargetAtTime` glide with time constant `tau` (s).
 */
export const REACTOR_HUM = { inner: 6, outer: 26, boost: 1, hz: 4, tau: 0.25 } as const;

/** The hum's gain factor at distance `d` from the core, 1 to `1 + boost`, never rising with distance. */
export function nearGain(d: number): number {
  const { inner, outer, boost } = REACTOR_HUM;
  return 1 + boost * Math.min(1, Math.max(0, 1 - (d - inner) / (outer - inner)));
}

const last: { node: GainNode | null; gain: number } = { node: null, gain: 1 };

/**
 * Glides the playing hum (if any) toward its resting level times `nearGain(d)`, capped at twice the resting level;
 * `Infinity` returns it to rest. Skips a repeat of the same factor on the same node. Uses the node's own context.
 */
export function humNear(d: number): void {
  const node = engineHum.node;
  const gain = Math.min(2, nearGain(d));
  if (!node || (node === last.node && gain === last.gain)) return;
  last.node = node;
  last.gain = gain;
  node.gain.setTargetAtTime(engineHum.level * gain, node.context.currentTime, REACTOR_HUM.tau);
}
