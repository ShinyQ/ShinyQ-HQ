import { Matrix4, Quaternion, Vector3 } from "three";
import { expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { backToFront, boxEdgeVertices, composeTile, TILE_EDGES, TILE_H, TILE_STAGGER, TILE_W, TILE_Y, tileBase, writeEdges } from "@/experience/floors/lobby/statsRingLayout";

it("places tiles on the ring like the old billboards (first at 45 degrees, odd tiles staggered up)", () => {
  const [x, y, z] = tileBase(0, 6);
  expect(x).toBeCloseTo(Math.sin(Math.PI / 4) * LOBBY.statsRadius);
  expect(z).toBeCloseTo(Math.cos(Math.PI / 4) * LOBBY.statsRadius);
  expect(y).toBe(TILE_Y);
  expect(tileBase(1, 6)[1]).toBe(TILE_Y + TILE_STAGGER);
});

it("draws the 12 edges of the tile box", () => {
  const v = boxEdgeVertices(2, 1, 0.01);
  expect(v).toHaveLength(72);
  for (let i = 0; i < v.length; i += 3) {
    expect(Math.abs(v[i])).toBeCloseTo(1);
    expect(Math.abs(v[i + 1])).toBeCloseTo(0.5);
    expect(Math.abs(v[i + 2])).toBeCloseTo(0.005);
  }
  expect(TILE_EDGES).toHaveLength(72);
});

it("writes each tile's edges through its matrix", () => {
  const out = new Float32Array(2 * 72);
  writeEdges(out, 1, new Matrix4().makeTranslation(10, 0, 0));
  expect(out[72]).toBeCloseTo(TILE_EDGES[0] + 10);
  expect(out[73]).toBeCloseTo(TILE_EDGES[1]);
  expect(out[0]).toBe(0);
});

it("sorts tiles far to near for blending", () => {
  expect(backToFront([3, 9, 1, 5])).toEqual([1, 3, 0, 2]);
});

it("collapses a tile that has shrunk away (the old `visible = scale > 0.01`)", () => {
  const m = new Matrix4();
  // Matrix4.decompose reports scale 1 for a singular matrix, so read the basis column lengths.
  const scaleOf = (mat: Matrix4) => new Vector3().setFromMatrixColumn(mat, 0).length();
  expect(scaleOf(composeTile(m, 1, 2, 3, new Quaternion(), 0.005))).toBe(0);
  expect(scaleOf(composeTile(m, 1, 2, 3, new Quaternion(), 0.5))).toBeCloseTo(0.5);
  expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual([1, 2, 3]);
  expect(TILE_W).toBe(LOBBY.statsTile.w);
  expect(TILE_H).toBe(LOBBY.statsTile.h);
});
