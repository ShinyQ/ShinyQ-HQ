/**
 * Pooled wheel sparks for the boost (pure, typed arrays, no allocations after construction). Emitting
 * into a full pool overwrites the oldest spark, so the count never exceeds `max`.
 */
export const SPARK = {
  gravity: -16,
  /** Share of the vertical speed kept on a floor bounce, and of the horizontal speed. */
  bounce: 0.3,
  friction: 0.7,
};

export class SparkPool {
  readonly max: number;
  alive = 0;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly floor: Float32Array;
  private next = 0;

  constructor(max: number) {
    this.max = max;
    this.px = new Float32Array(max);
    this.py = new Float32Array(max);
    this.pz = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.floor = new Float32Array(max);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, floorY: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.floor[i] = floorY;
  }

  step(dt: number) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.life[i] = 0;
        continue;
      }
      this.vy[i] += SPARK.gravity * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floor[i]) {
        this.py[i] = this.floor[i];
        this.vy[i] = -this.vy[i] * SPARK.bounce;
        this.vx[i] *= SPARK.friction;
        this.vz[i] *= SPARK.friction;
      }
      alive++;
    }
    this.alive = alive;
  }

  clear() {
    this.life.fill(0);
    this.alive = 0;
  }
}
