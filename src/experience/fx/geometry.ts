import { BoxGeometry, BufferGeometry, Float32BufferAttribute, type ShaderMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createGlassMaterial } from "./materials";

type P = [number, number];

/** Four vertical side quads of a w x h x d box (no top or bottom), uv.y 0 at the base and 1 at the top. */
export function glassSidesGeometry(w: number, h: number, d: number): BufferGeometry {
  const x = w / 2;
  const z = d / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  // [ax, az, bx, bz, nx, nz]
  const sides: [number, number, number, number, number, number][] = [
    [-x, z, x, z, 0, 1],
    [x, -z, -x, -z, 0, -1],
    [x, z, x, -z, 1, 0],
    [-x, -z, -x, z, -1, 0],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  sides.forEach(([ax, az, bx, bz, nx, nz], i) => {
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    for (let k = 0; k < 4; k++) nor.push(nx, 0, nz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Rim thickness for a box: thin bars like the prototype's walls, never fatter than a third of the box. */
export function rimThickness(w: number, h: number, d: number, coarse = false): number {
  return Math.max(0.012, Math.min(coarse ? 0.07 : 0.045, Math.min(w, h, d) * 0.3));
}

/** The 12 edges of a w x h x d box as thin bars, merged into one geometry (one draw call). */
export function rimGeometry(w: number, h: number, d: number, t: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const y of [-h / 2, h / 2]) {
    for (const z of [-d / 2, d / 2]) parts.push(new BoxGeometry(w + t, t, t).translate(0, y, z));
    for (const x of [-w / 2, w / 2]) parts.push(new BoxGeometry(t, t, d + t).translate(x, y, 0));
  }
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) parts.push(new BoxGeometry(t, h, t).translate(x, 0, z));
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Lane ribbons for open polylines on the floor plane, merged into one geometry. uv.x is the distance
 * along the path in world units (so one lane material with uLen = 1 serves every lane), uv.y runs
 * across the strip.
 */
export function laneRibbonGeometry(paths: P[][], width = 0.75, y = 0.015): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const hw = width / 2;
  for (const path of paths) {
    let s = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const o = pos.length / 3;
      pos.push(ax + nx * hw, y, az + nz * hw, ax - nx * hw, y, az - nz * hw, bx - nx * hw, y, bz - nz * hw, bx + nx * hw, y, bz + nz * hw);
      uv.push(s, 1, s, 0, s + len, 0, s + len, 1);
      // Counter-clockwise seen from above, so the ribbon faces up.
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
      s += len;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const glassCache = new Map<string, ShaderMaterial>();

/** One shared glass material per color and opacity; every cached material is animated by one uTime hook. */
export function getGlassMaterial(color: string, opacity: number): ShaderMaterial {
  const key = `${color}|${opacity}`;
  let m = glassCache.get(key);
  if (!m) {
    m = createGlassMaterial(color, opacity);
    glassCache.set(key, m);
  }
  return m;
}

export function allGlassMaterials(): Iterable<ShaderMaterial> {
  return glassCache.values();
}
