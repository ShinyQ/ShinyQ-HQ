/**
 * Path-following twin light trails for the boost (pure, no three.js). A ring buffer keeps the rear
 * wheel positions the rover actually drove through; `writeTrail` turns them into two camera-facing
 * ribbons (one per rear wheel) in preallocated arrays, so the trail bends exactly along the path and
 * nothing is allocated per frame.
 */

export interface TrailSample {
  /** Left rear wheel (world x, z). */
  lx: number;
  lz: number;
  /** Right rear wheel (world x, z). */
  rx: number;
  rz: number;
  /** Ribbon height (floor y plus the lamp height). */
  y: number;
  /** Sample time (s, the effect's own clock). */
  t: number;
}

export const BOOST_TRAIL = {
  /** Rear wheel offsets in rover space: half track and rear axle (forward is +z). */
  rearX: 0.7,
  rearZ: -0.45,
  /** Ribbon center height above the floor. */
  lampY: 0.3,
  /** Tail half-width as a share of the head half-width. */
  tailWidth: 0.2,
  /** Head opacity at boost level 1. */
  alpha: 0.9,
  head: [0x67 / 255, 0xe8 / 255, 0xf9 / 255] as const,
  tail: [0xa7 / 255, 0x8b / 255, 0xfa / 255] as const,
};

/** A larger step between samples is a teleport or an elevator ride: the trail starts over. */
export const TRAIL_JUMP = 3;

export const emptySample = (): TrailSample => ({ lx: 0, lz: 0, rx: 0, rz: 0, y: 0, t: 0 });

/** Writes the two rear wheel positions of a rover at (x, y, z) facing `heading` into `out`. */
export function rearCorners(x: number, y: number, z: number, heading: number, t: number, out: TrailSample): TrailSample {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const { rearX: hx, rearZ: rz } = BOOST_TRAIL;
  // Rover space (a, b) to world: (a cos h + b sin h, -a sin h + b cos h).
  out.lx = x - hx * c + rz * s;
  out.lz = z + hx * s + rz * c;
  out.rx = x + hx * c + rz * s;
  out.rz = z - hx * s + rz * c;
  out.y = y + BOOST_TRAIL.lampY;
  out.t = t;
  return out;
}

function copySample(from: TrailSample, to: TrailSample) {
  to.lx = from.lx;
  to.lz = from.lz;
  to.rx = from.rx;
  to.rz = from.rz;
  to.y = from.y;
  to.t = from.t;
}

export class TrailBuffer {
  readonly capacity: number;
  count = 0;
  private head = -1;
  private readonly slots: TrailSample[];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.slots = Array.from({ length: capacity }, emptySample);
  }

  reset() {
    this.count = 0;
    this.head = -1;
  }

  /** Sample `i` (0 is the newest). */
  at(i: number): TrailSample {
    return this.slots[(this.head - i + this.capacity * 2) % this.capacity];
  }

  /** Adds a sample once it is `spacing` away from the newest one; a jump or floor change starts over. */
  push(sample: TrailSample, spacing: number): boolean {
    if (this.count > 0) {
      const last = this.at(0);
      const d = Math.hypot((sample.lx + sample.rx - last.lx - last.rx) / 2, (sample.lz + sample.rz - last.lz - last.rz) / 2);
      if (d > TRAIL_JUMP || Math.abs(sample.y - last.y) > 0.5) this.reset();
      else if (d < spacing) return false;
    }
    this.head = (this.head + 1) % this.capacity;
    copySample(sample, this.slots[this.head]);
    this.count = Math.min(this.capacity, this.count + 1);
    return true;
  }
}

/** Points per ribbon: the live head plus every buffered sample. */
const pointsFor = (samples: number) => samples + 1;

/** Vertices of both ribbons: two edges per point. */
export function trailVertexCount(samples: number): number {
  return 2 * pointsFor(samples) * 2;
}

/** Static triangle indices for both ribbons (two triangles per segment). */
export function trailIndices(samples: number): Uint16Array {
  const k = pointsFor(samples);
  const out = new Uint16Array(2 * (k - 1) * 6);
  let o = 0;
  for (let r = 0; r < 2; r++) {
    const base = r * 2 * k;
    for (let i = 0; i < k - 1; i++) {
      const a = base + 2 * i;
      out[o++] = a;
      out[o++] = a + 1;
      out[o++] = a + 2;
      out[o++] = a + 1;
      out[o++] = a + 3;
      out[o++] = a + 2;
    }
  }
  return out;
}

const px = (s: TrailSample, r: number) => (r === 0 ? s.lx : s.rx);
const pz = (s: TrailSample, r: number) => (r === 0 ? s.lz : s.rz);

/**
 * Fills `positions` (xyz) and `colors` (rgba) for both ribbons. Point 0 is the live head, then the
 * buffered samples newest first while younger than `maxAge`; unused points collapse onto the last
 * drawn one with alpha 0. Opacity and width fall with age and with distance along the trail, and the
 * color runs from cyan at the rover to violet at the tail. Returns the brightest alpha written.
 */
export function writeTrail(
  buf: TrailBuffer,
  head: TrailSample,
  camera: { x: number; y: number; z: number },
  level: number,
  now: number,
  cfg: { maxAge: number; width: number },
  positions: Float32Array,
  colors: Float32Array,
): number {
  const k = pointsFor(buf.capacity);
  const maxLen = buf.capacity * 0.3 + 1;
  let used = 1;
  while (used <= buf.count && now - buf.at(used - 1).t < cfg.maxAge) used++;
  const point = (i: number) => (i === 0 ? head : buf.at(i - 1));
  const [hr, hg, hb] = BOOST_TRAIL.head;
  const [tr, tg, tb] = BOOST_TRAIL.tail;
  let peak = 0;

  for (let r = 0; r < 2; r++) {
    let along = 0;
    let lastX = 0;
    let lastZ = 0;
    for (let i = 0; i < k; i++) {
      const v = (r * 2 * k + 2 * i) * 3;
      const c = (r * 2 * k + 2 * i) * 4;
      if (i >= used) {
        // Collapse the unused tail onto the last drawn point, fully transparent.
        const last = (r * 2 * k + 2 * (used - 1)) * 3;
        for (let e = 0; e < 2; e++) {
          positions[v + e * 3] = positions[last];
          positions[v + e * 3 + 1] = positions[last + 1];
          positions[v + e * 3 + 2] = positions[last + 2];
          colors[c + e * 4 + 3] = 0;
        }
        continue;
      }
      const p = point(i);
      const x = px(p, r);
      const z = pz(p, r);
      if (i > 0) along += Math.hypot(x - lastX, z - lastZ);
      lastX = x;
      lastZ = z;
      // Tangent from the next point to the previous one (clamped at the ends).
      const a = point(Math.max(0, i - 1));
      const b = point(Math.min(used - 1, i + 1));
      let tx = px(a, r) - px(b, r);
      let tz = pz(a, r) - pz(b, r);
      if (Math.hypot(tx, tz) < 1e-6) {
        tx = 0;
        tz = 1;
      }
      // Side vector: tangent x (point to camera), so the ribbon faces the camera.
      const vx = camera.x - x;
      const vy = camera.y - p.y;
      const vz = camera.z - z;
      let sx = -tz * vy;
      let sy = tz * vx - tx * vz;
      let sz = tx * vy;
      const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-6) {
        sx = 0;
        sy = 1;
        sz = 0;
      } else {
        sx /= sl;
        sy /= sl;
        sz /= sl;
      }
      const fade = Math.min(1, Math.max((now - p.t) / cfg.maxAge, along / maxLen, 0));
      const w = cfg.width * (1 - (1 - BOOST_TRAIL.tailWidth) * fade);
      const alpha = Math.max(0, level) * BOOST_TRAIL.alpha * Math.pow(1 - fade, 1.4);
      peak = Math.max(peak, alpha);
      const cr = hr + (tr - hr) * fade;
      const cg = hg + (tg - hg) * fade;
      const cb = hb + (tb - hb) * fade;
      for (let e = 0; e < 2; e++) {
        const sign = e === 0 ? 1 : -1;
        positions[v + e * 3] = x + sx * w * sign;
        positions[v + e * 3 + 1] = p.y + sy * w * sign;
        positions[v + e * 3 + 2] = z + sz * w * sign;
        colors[c + e * 4] = cr;
        colors[c + e * 4 + 1] = cg;
        colors[c + e * 4 + 2] = cb;
        colors[c + e * 4 + 3] = alpha;
      }
    }
  }
  return peak;
}
