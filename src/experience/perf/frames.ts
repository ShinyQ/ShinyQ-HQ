/** Frame time statistics: FPS at the median and at the 10th percentile (from the 90th percentile frame time), frame p95 in ms. */
export interface FrameStats {
  count: number;
  fpsP50: number | null;
  fpsP10: number | null;
  frameP95: number | null;
}

/**
 * Ring buffer of the newest frame times (ms), for the `?perf=1` overlay and the RUM probe (P2's runtime
 * monitor may share it). Pure, no allocation per push.
 */
export class FrameSampler {
  private readonly samples: Float64Array;
  private next = 0;
  private filled = 0;

  constructor(readonly capacity: number) {
    this.samples = new Float64Array(capacity);
  }

  push(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.samples[this.next] = ms;
    this.next = (this.next + 1) % this.capacity;
    this.filled = Math.min(this.filled + 1, this.capacity);
  }

  get count(): number {
    return this.filled;
  }

  clear(): void {
    this.next = 0;
    this.filled = 0;
  }

  stats(): FrameStats {
    if (this.filled === 0) return { count: 0, fpsP50: null, fpsP10: null, frameP95: null };
    const sorted = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return { count: this.filled, fpsP50: 1000 / at(0.5), fpsP10: 1000 / at(0.9), frameP95: at(0.95) };
  }
}
