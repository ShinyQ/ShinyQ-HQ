import { fpsBucket, RUM_VERSION, timeBucket, type RumPath, type RumPayload, type RumTier } from "@/lib/rum/protocol";
import { FrameSampler } from "./frames";

export const RUM_ENDPOINT = "/api/rum";
/** The FPS window starts this long after explore (first-visit compiles and mounts settle first). */
export const RUM_WARMUP_MS = 2000;
/** Visible frames in the window (about 10 s at 60 Hz). */
export const RUM_WINDOW_FRAMES = 600;
/** With fewer frames the FPS buckets say "na". */
export const RUM_MIN_FRAMES = 60;

/** One sampled session's coarse numbers; `payload()` is the beacon body. */
export class RumSession {
  private readonly frames = new FrameSampler(RUM_WINDOW_FRAMES);
  private readonly input: { tier: RumTier; path: RumPath };
  private lost = false;

  constructor(input: { tier: RumTier; path: RumPath }) {
    this.input = input;
  }

  /** One rendered frame (ms), counted only while visible, from RUM_WARMUP_MS after explore, up to the window. */
  frame(dtMs: number, now: number, exploreAt: number | null, visible: boolean): void {
    if (!visible || exploreAt === null || now - exploreAt < RUM_WARMUP_MS || this.frames.count >= RUM_WINDOW_FRAMES) return;
    this.frames.push(dtMs);
  }

  contextLost(): void {
    this.lost = true;
  }

  get sampled(): number {
    return this.frames.count;
  }

  payload({ released, exploreAt }: { released: string | null; exploreAt: number | null }): RumPayload {
    const stats = this.frames.count >= RUM_MIN_FRAMES ? this.frames.stats() : null;
    return {
      v: RUM_VERSION,
      tier: this.input.tier,
      path: this.input.path,
      fps50: fpsBucket(stats?.fpsP50 ?? null),
      fps10: fpsBucket(stats?.fpsP10 ?? null),
      explore: timeBucket(exploreAt),
      lost: this.lost ? 1 : 0,
      timeout: released === "timeout" ? 1 : 0,
    };
  }
}
