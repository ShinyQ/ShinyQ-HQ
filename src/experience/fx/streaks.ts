/**
 * Screen-space speed streaks for the boost (pure data and shader source, no three.js import). Each
 * streak is one quad written straight into clip space by the vertex shader, so it needs no camera
 * matrix (no one-frame lag) and draws in one call. Streaks start outside a clear ellipse that covers
 * the middle of the screen (the rover and the HUD center) and rush outward toward the edges.
 */

/** Pool size (the full tier); lite draws the first half through the draw range. */
export const STREAK_MAX = 28;
/** Inner edge of the streak band as a share of the half screen (the clear center). */
export const STREAK_INNER = 0.7;

/** Deterministic pseudo-random numbers (mulberry32), so every load draws the same pattern. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per vertex: `corner` (along 0 to 1, across -1 or 1) and `seed` (angle, phase, speed, inner radius),
 * plus the triangle indices (two per streak, in streak order so a draw range keeps the first N).
 */
export function streakAttributes(count: number) {
  const corner = new Float32Array(count * 4 * 2);
  const seed = new Float32Array(count * 4 * 4);
  const indices = new Uint16Array(count * 6);
  const rnd = random(0x5eed);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const angle = i * golden + (rnd() - 0.5) * 0.3;
    const phase = rnd();
    const speed = 0.9 + rnd() * 0.9;
    const inner = STREAK_INNER + rnd() * 0.3;
    for (let v = 0; v < 4; v++) {
      const c = (i * 4 + v) * 2;
      corner[c] = v < 2 ? 0 : 1;
      corner[c + 1] = v % 2 === 0 ? -1 : 1;
      const s = (i * 4 + v) * 4;
      seed[s] = angle;
      seed[s + 1] = phase;
      seed[s + 2] = speed;
      seed[s + 3] = inner;
    }
    const b = i * 4;
    indices.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6);
  }
  return { corner, seed, indices };
}

export const STREAK_VS = `attribute vec2 corner; attribute vec4 seed;
uniform float uTime; uniform float uLevel; uniform float uAspect;
varying float vAlpha; varying vec2 vCorner;
void main(){
  float t = fract(seed.y + uTime * seed.z);
  vec2 dir = vec2(cos(seed.x), sin(seed.x));
  float len = (0.08 + 0.26 * uLevel) * (0.6 + t);
  float r = seed.w + t * 0.8 + corner.x * len;
  vec2 p = dir * r;
  vec2 side = vec2(-dir.y / uAspect, dir.x) * corner.y * 0.004 * (1.0 + t);
  vCorner = corner;
  vAlpha = uLevel * sin(3.14159 * t);
  gl_Position = vec4(p + side, 0.0, 1.0);
}`;

export const STREAK_FS = `uniform vec3 uColor; uniform float uOpacity;
varying float vAlpha; varying vec2 vCorner;
void main(){
  float a = vAlpha * uOpacity * sin(3.14159 * vCorner.x) * (1.0 - abs(vCorner.y) * 0.6);
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;
