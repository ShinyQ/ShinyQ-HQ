import { describe, expect, it } from "vitest";
import { buildRoomViews } from "@/content/room-views";
import { hologramPose, hologramShift, HOLOGRAM_RIG } from "@/experience/camera/rigs";
import { layBoard } from "@/experience/floors/labs/board";
import { hologramParts } from "@/experience/floors/labs/hologramParts";
import { BOARD } from "@/experience/floors/labs/layout";
import type { HologramKind } from "@/experience/types";

const KINDS: HologramKind[] = ["waveform", "shield", "documents", "graph", "chart", "template", "pipeline"];
const heroes = Object.values(buildRoomViews("en")).filter((v) => v.hologram);

describe("pod holograms", () => {
  it("has a compact box recipe for every kind", () => {
    for (const kind of KINDS) {
      const parts = hologramParts(kind);
      expect(parts.length, kind).toBeGreaterThan(2);
      for (const p of parts) {
        expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(1.2);
        expect(p.w > 0 && p.h > 0 && p.d > 0).toBe(true);
      }
    }
  });
});

describe("hologram board", () => {
  it("lays nodes out by layer (columns, left to right) and row (top to bottom)", () => {
    for (const view of heroes) {
      const arch = view.architecture!;
      const laid = layBoard(arch);
      const byId = new Map(laid.nodes.map((n) => [n.id, n]));
      for (const a of arch.nodes)
        for (const b of arch.nodes) {
          if (a.layer < b.layer) expect(byId.get(a.id)!.x).toBeLessThan(byId.get(b.id)!.x);
          if (a.layer === b.layer && a.row < b.row) expect(byId.get(a.id)!.y).toBeGreaterThan(byId.get(b.id)!.y);
        }
      expect(laid.edges.length).toBe(arch.edges.length);
      expect(laid.width).toBeLessThanOrEqual(BOARD.maxWidth + 1e-9);
      expect(laid.edges.filter((e) => e.async).length).toBe(arch.edges.filter((e) => e.async).length);
    }
  });
});

describe("hologram camera", () => {
  const board: [number, number, number] = [21, 31.4, -8];

  it("stands at least 9 u in front of the board at eye height 4, with the rig FOV", () => {
    const pose = hologramPose("desktop", board, { x: 0, z: 1 }, 16 / 9, 3, 28);
    expect(pose.fov).toBe(HOLOGRAM_RIG.desktop.fov);
    expect(pose.position[2] - board[2]).toBeGreaterThanOrEqual(9);
    expect(pose.position[1]).toBeCloseTo(32, 0);
    expect(pose.target).toEqual(board);
  });

  it("pulls back on portrait phones so the whole board fits", () => {
    const wide = hologramPose("desktop", board, { x: 0, z: 1 }, 16 / 9, 9, 28);
    const phone = hologramPose("mobile", board, { x: 0, z: -1 }, 390 / 844, 9, 28);
    expect(board[2] - phone.position[2]).toBeGreaterThan(wide.position[2] - board[2]);
    const d = board[2] - phone.position[2];
    const halfWidth = Math.tan(((phone.fov / 2) * Math.PI) / 180) * (390 / 844) * d;
    expect(halfWidth * 2).toBeGreaterThanOrEqual(9);
  });

  it("shifts the diagram away from the result cards", () => {
    expect(hologramShift(1.6).x).toBeGreaterThan(0);
    expect(hologramShift(0.5)).toEqual({ x: 0, y: expect.any(Number) });
  });
});
