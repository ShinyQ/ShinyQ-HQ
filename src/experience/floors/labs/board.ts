import type { RoomArchitecture } from "@/content/room-views/types";
import { BOARD, boardSize } from "./layout";

/** Hologram board layout in board-local units: x along the board, y up (floor-local height). */
export interface Laid {
  nodes: { id: string; label: string; kind: RoomArchitecture["nodes"][number]["kind"]; x: number; y: number }[];
  edges: { from: [number, number]; to: [number, number]; async: boolean }[];
  width: number;
  scale: number;
}

/** Positions nodes by layer (columns) and row (rows) on the board plane: no automatic graph layout. */
export function layBoard(arch: RoomArchitecture): Laid {
  const layers = Math.max(...arch.nodes.map((n) => n.layer)) + 1;
  const rows = Math.max(...arch.nodes.map((n) => n.row)) + 1;
  const { width, scale } = boardSize(layers, rows);
  const pos = new Map<string, { x: number; y: number; layer: number }>();
  const nodes = arch.nodes.map((n) => {
    const x = (n.layer - (layers - 1) / 2) * BOARD.colGap * scale;
    const y = BOARD.y + ((rows - 1) / 2 - n.row) * BOARD.rowGap * scale;
    pos.set(n.id, { x, y, layer: n.layer });
    return { id: n.id, label: n.label, kind: n.kind, x, y };
  });
  const half = (BOARD.nodeW / 2) * scale;
  const halfH = (BOARD.nodeH / 2) * scale;
  const edges = arch.edges.flatMap((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return [];
    if (a.layer === b.layer) {
      const dir = Math.sign(b.y - a.y) || 1;
      return [{ from: [a.x, a.y + dir * halfH] as [number, number], to: [b.x, b.y - dir * halfH] as [number, number], async: Boolean(e.async) }];
    }
    const dir = Math.sign(b.x - a.x);
    return [{ from: [a.x + dir * half, a.y] as [number, number], to: [b.x - dir * half, b.y] as [number, number], async: Boolean(e.async) }];
  });
  return { nodes, edges, width, scale };
}
