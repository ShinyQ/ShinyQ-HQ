import { BufferGeometry, Float32BufferAttribute } from "three";
import { slabCorners, slabEdges, type SlabShape } from "../nav/slab";

/**
 * The slab's accent edges (floor-local, top face at y 0): its outer edges at the top and the bottom face,
 * and a vertical edge where the outline turns; none across a joint between slab rects. For a plain slab
 * these are the 12 edges `EdgesGeometry(BoxGeometry)` drew.
 */
export function slabOutline(slab: SlabShape, thickness: number): BufferGeometry {
  const p: number[] = [];
  for (const e of slabEdges(slab)) for (const y of [0, -thickness]) p.push(e.minX, y, e.minZ, e.maxX, y, e.maxZ);
  for (const c of slabCorners(slab)) p.push(c.x, 0, c.z, c.x, -thickness, c.z);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(p, 3));
  return g;
}
