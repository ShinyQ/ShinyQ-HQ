import type { SignSpec } from "../../fx/signLayout";
import type { EngineData, GpuTier, Rect } from "../../types";
import type { Box } from "../roof/solids";
import { ENGINE, type EngineBay, type EngineLayout } from "./layout";
import { CORE_FX, coreSolids, PLINTH_STEPS } from "./reactorFx";

/**
 * Pure scenery of the B1 Engine Room (no React or three): the solid boxes (one merged mesh plus its edges), the
 * holo `strip` instances (pipes, cable trays, drops, bay front strips, rack LEDs: edges plus a slow pulse along
 * x with a random phase per instance, so pipes carry data and LEDs blink with no CPU work) and the holo `fall`
 * screens (data waterfalls). Positions are floor-local; `y` is a box's bottom for solids and its center for
 * instances.
 */
export interface FlowInstance {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
}

/** An upright screen facing `yaw` (forward (sin, cos)), or `flat` on a table top; `y` is its center. `roll` turns it about its own normal (a crooked screen). */
export interface PanelInstance {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  yaw: number;
  flat?: boolean;
  roll?: number;
  color: string;
}

/** A lit-seam panel (holo `plate`): a dark inset panel whose thin rim reads as a glowing seam; placed like a screen. */
export type PlateInstance = Omit<PanelInstance, "roll">;

export interface EngineScenery {
  solids: Box[];
  /** Depth-only boxes (no color, no edges): the end mask (`endMask`). */
  masks: Box[];
  flows: FlowInstance[];
  panels: PanelInstance[];
  plates: PlateInstance[];
}

/** Height of the end mask (`endMask`). */
export const END_MASK_H = 1;

/**
 * A low depth-only box along the floor's east end (`DepthMask`: writes depth, never color, no edges): it hides the slab
 * outline's far top edge (the floor's own accent outline at x `bounds.maxX`), which drew a thin line across the reactor
 * view above the core, from every view looking east, without showing itself. Inside the bounds, behind the reactor
 * and out of every road.
 */
export function endMask(layout: EngineLayout): Box {
  const { maxX, minZ, maxZ } = layout.floor.bounds;
  return { x: maxX - 0.3, y: 0, z: (minZ + maxZ) / 2, w: 0.6, h: END_MASK_H, d: maxZ - minZ };
}

/** Floor words (engine.*): the workbench title and subtitle, and the reactor's title and counter lines (`n` comes formatted). */
export interface EngineLabels {
  title: string;
  subtitle: string;
  reactor?: { title: string; visits: (n: string) => string; asks: (n: string) => string };
}

/** The reactor counter plate's numbers, formatted with the locale; null hides that line. */
export interface ReactorCounts {
  visits: string | null;
  asks: string | null;
}

export const ENGINE_TONES = { amber: ENGINE.accent, cyan: "#22d3ee", violet: "#a78bfa", green: "#34d399", dim: "#71717a", warm: "#fde68a", tray: "#78350f", data: "#155e75", pipe: "#7c2d12" } as const;
const LED_TONES = [ENGINE_TONES.green, ENGINE_TONES.amber, ENGINE_TONES.cyan] as const;

/** LEDs per rack cabinet; the lite tier draws half. */
export function engineDetail(tier: GpuTier): { leds: number } {
  return { leds: tier === "full" ? 8 : 4 };
}

const WALL = 0.8;
const SIDE = 0.3;
const CABINET = { w: 1.8, h: 3.6, pitch: 2 } as const;
const SIGN_Y = 5.3;
/**
 * Pipe runs hang over the back walls (z = +-PIPE_Z, held by brackets on the bays' back corners), behind every
 * station sign seen from the aisle, so no bracket or drop ever cuts a sign; cable trays over the aisle edges.
 */
const PIPE_Z = ENGINE.bounds.maxZ - WALL / 2;
const TRAY_Z = 3;
/** Cable trays stay narrow and dim (a warm tray with a faint cyan data line under it), so the stations and signs lead. */
const TRAY = { d: 0.4, h: 0.06, line: 0.08 } as const;
/** Pipe runs and their drops stay thin and dim warm at the ceiling, so each bay's sign is its brightest element. */
const PIPE = { run: 0.14, drop: 0.1 } as const;

/**
 * Lit-seam plates: `lift` off their face or the floor, `bayFloor` the y over a bay's 0.12 u floor (under the projector
 * disc at 0.16), `gap` kept from the aisle, spurs and walls, `tile` the target deck plate size.
 */
export const PLATE = { lift: 0.02, bayFloor: 0.13, gap: 0.3, tile: 2 } as const;

/** `n` equal cells across [a, b]: their centers and size. */
function split(a: number, b: number, n: number): { c: number[]; s: number } {
  const s = (b - a) / n;
  return { c: Array.from({ length: n }, (_, i) => a + s * (i + 0.5)), s };
}
/** Cells near `PLATE.tile` across [a, b]. */
const tiles = (a: number, b: number) => split(a, b, Math.max(1, Math.round((b - a) / PLATE.tile)));

/** A grid of plates over [x0, x1] x [z0, z1] (flat, at `y`). */
function deck(x0: number, x1: number, z0: number, z1: number, y: number, color: string, nx?: number, nz?: number): PlateInstance[] {
  const xs = nx ? split(x0, x1, nx) : tiles(x0, x1);
  const zs = nz ? split(Math.min(z0, z1), Math.max(z0, z1), nz) : tiles(Math.min(z0, z1), Math.max(z0, z1));
  return xs.c.flatMap((x) => zs.c.map((z) => ({ x, y, z, w: xs.s, h: zs.s, yaw: 0, flat: true, color })));
}

/** One bay's cladding: its back wall in 4 x 2 panels, each side wall's inner face in 2 x 2, its floor in 3 x 2. */
function bayPlates(bay: EngineBay): PlateInstance[] {
  const o = out(bay);
  const back = backFace(bay);
  const x0 = bay.rect.minX + SIDE;
  const x1 = bay.rect.maxX - SIDE;
  const rows = split(0, ENGINE.bay.h, 2);
  const along = split(Math.min(back, bay.front), Math.max(back, bay.front), 2);
  const cols = split(x0, x1, 4);
  const color = ENGINE_TONES.tray;
  return [
    ...cols.c.flatMap((x) => rows.c.map((y) => ({ x, y, z: back + o * PLATE.lift, w: cols.s, h: rows.s, yaw: faceYaw(bay), color }))),
    ...[
      [x0 + PLATE.lift, Math.PI / 2],
      [x1 - PLATE.lift, -Math.PI / 2],
    ].flatMap(([x, yaw]) => along.c.flatMap((z) => rows.c.map((y) => ({ x, y, z, w: along.s, h: rows.s, yaw, color })))),
    ...deck(x0, x1, back, bay.center.z + (o * (ENGINE.bay.d - WALL)) / 2, PLATE.bayFloor, color, 3, 2),
  ];
}

/**
 * The deck: flat plates on the open floor between the aisle and the bay fronts (both sides of each spur) and between the
 * aisle and the rack rows, `gap` clear of the aisle, the spurs and the faces behind.
 */
function deckPlates(layout: EngineLayout): PlateInstance[] {
  const edge = ENGINE.aisle.width / 2 + PLATE.gap;
  const spur = ENGINE.spurWidth / 2 + PLATE.gap;
  const strip = (x0: number, x1: number, front: number) => {
    const s = Math.sign(front);
    return deck(x0, x1, s * edge, front - s * PLATE.gap, PLATE.lift, ENGINE_TONES.tray);
  };
  return [
    ...layout.bays.flatMap((bay) => [strip(bay.rect.minX, bay.center.x - spur, bay.front), strip(bay.center.x + spur, bay.rect.maxX, bay.front)].flat()),
    ...layout.racks.flatMap((r) => strip(r.minX, r.maxX, r.minZ === ENGINE.bounds.minZ ? r.maxZ : r.minZ)),
  ];
}

/** The reactor plinth: each step's four faces clad upright (4 and 2 panels a face) and a 1 u ring of flat plates round it inside the core's footprint. */
function plinthPlates(layout: EngineLayout): PlateInstance[] {
  const { x, z } = ENGINE.reactor;
  const R = layout.reactor;
  const color = ENGINE_TONES.data;
  const faces = PLINTH_STEPS.flatMap((size, i) => {
    const h = i === 0 ? 0.4 : CORE_FX.plinth - 0.4;
    const y = i === 0 ? 0.2 : 0.4 + h / 2;
    const half = size / 2 + PLATE.lift;
    const cells = split(-size / 2, size / 2, i === 0 ? 4 : 2);
    return cells.c.flatMap((u) => [
      { x: x + half, y, z: z + u, w: cells.s, h, yaw: Math.PI / 2, color },
      { x: x - half, y, z: z + u, w: cells.s, h, yaw: -Math.PI / 2, color },
      { x: x + u, y, z: z + half, w: cells.s, h, yaw: 0, color },
      { x: x + u, y, z: z - half, w: cells.s, h, yaw: Math.PI, color },
    ]);
  });
  const half = PLINTH_STEPS[0] / 2;
  return [
    ...faces,
    ...deck(R.minX, R.maxX, R.minZ, z - half, PLATE.lift, color),
    ...deck(R.minX, R.maxX, z + half, R.maxZ, PLATE.lift, color),
    ...deck(R.minX, x - half, z - half, z + half, PLATE.lift, color),
    ...deck(x + half, R.maxX, z - half, z + half, PLATE.lift, color),
  ];
}

/** +1 when the bay's open face looks toward +z (north bays), -1 for south bays. */
const out = (bay: EngineBay): 1 | -1 => (bay.side === "north" ? 1 : -1);
/** z of the inner face of the bay's back wall. */
const backFace = (bay: EngineBay) => (bay.side === "north" ? bay.rect.minZ + WALL : bay.rect.maxZ - WALL);
/** Upright screens in a bay face the aisle. */
const faceYaw = (bay: EngineBay) => (bay.side === "north" ? 0 : Math.PI);

function bayShell(bay: EngineBay): Box[] {
  const { w, d, h } = ENGINE.bay;
  const { x } = bay.center;
  const wallZ = backFace(bay) - out(bay) * (WALL / 2);
  return [
    { x, y: 0, z: wallZ, w, h, d: WALL },
    { x: bay.rect.minX + SIDE / 2, y: 0, z: bay.center.z, w: SIDE, h, d },
    { x: bay.rect.maxX - SIDE / 2, y: 0, z: bay.center.z, w: SIDE, h, d },
    { x, y: 0, z: bay.center.z, w: w - 2 * SIDE, h: 0.12, d: d - WALL },
    { x: bay.rect.minX + SIDE / 2, y: h, z: wallZ, w: 0.2, h: ENGINE.ceiling - h, d: 0.2 },
    { x: bay.rect.maxX - SIDE / 2, y: h, z: wallZ, w: 0.2, h: ENGINE.ceiling - h, d: 0.2 },
  ];
}

function cabinetLeds(x: number, frontZ: number, dir: 1 | -1, count: number, seed: number): FlowInstance[] {
  return Array.from({ length: count }, (_, j) => ({
    x: x - 0.6 + (j % 4) * 0.4,
    y: 3 - Math.floor(j / 4) * 0.45,
    z: frontZ + dir * 0.03,
    w: 0.16,
    h: 0.08,
    d: 0.04,
    color: LED_TONES[(seed + j) % LED_TONES.length],
  }));
}

function rackRow(rack: Rect, leds: number, seed: number): { solids: Box[]; flows: FlowInstance[] } {
  const north = rack.minZ === ENGINE.bounds.minZ;
  const z = (rack.minZ + rack.maxZ) / 2;
  const front = north ? rack.maxZ : rack.minZ;
  const count = Math.floor((rack.maxX - rack.minX) / CABINET.pitch);
  const solids: Box[] = [];
  const flows: FlowInstance[] = [];
  for (let i = 0; i < count; i++) {
    const x = rack.minX + CABINET.pitch * (i + 0.5);
    solids.push({ x, y: 0, z, w: CABINET.w, h: CABINET.h, d: rack.maxZ - rack.minZ });
    flows.push(...cabinetLeds(x, front, north ? 1 : -1, leds, seed + i));
  }
  return { solids, flows };
}

/** The props inside one station bay (no shell, no front strip); exported for the bay-fit tests. */
export function stationProps(bay: EngineBay, leds: number): { solids: Box[]; flows: FlowInstance[]; panels: PanelInstance[] } {
  const { x, z: cz } = bay.center;
  const o = out(bay);
  const back = backFace(bay);
  const yaw = faceYaw(bay);
  const onBack = back + o * 0.05;
  switch (bay.id) {
    case "blueprint":
      // A table with the site diagram glowing on its top.
      return { solids: [{ x, y: 0, z: cz, w: 4.4, h: 1.1, d: 2.4 }], flows: [], panels: [{ x, y: 1.13, z: cz, w: 4.2, h: 2.2, yaw: 0, flat: true, color: ENGINE_TONES.cyan }] };
    case "timeline":
      // Nine lit screens on the back wall: rounds 1 to 9.
      return { solids: [], flows: [], panels: Array.from({ length: 9 }, (_, i) => ({ x: x - 3.2 + i * 0.8, y: 2.5, z: onBack, w: 0.6, h: 2.8, yaw, color: ENGINE_TONES.violet })) };
    case "agents": {
      // A desk with two monitors.
      const screenZ = back + o * 0.25;
      return {
        solids: [{ x, y: 0, z: back + o * 0.9, w: 5, h: 1, d: 1.6 }, ...[-1.2, 1.2].map((dx): Box => ({ x: x + dx, y: 1, z: screenZ, w: 1.8, h: 1.2, d: 0.12 }))],
        flows: [],
        panels: [-1.2, 1.2].map((dx) => ({ x: x + dx, y: 1.6, z: screenZ + o * 0.07, w: 1.6, h: 0.9, yaw, color: ENGINE_TONES.green })),
      };
    }
    case "gates": {
      // Three gate cabinets with their LEDs.
      const front = back + o * 1.6;
      const xs = [-2.2, 0, 2.2].map((dx) => x + dx);
      return { solids: xs.map((cx): Box => ({ x: cx, y: 0, z: back + o * 0.8, w: CABINET.w, h: 3.8, d: 1.6 })), flows: xs.flatMap((cx, i) => cabinetLeds(cx, front, o, leds, i)), panels: [] };
    }
    case "dashboard":
      // A wall of numbers over a console.
      return { solids: [{ x, y: 0, z: cz + o * 0.8, w: 4, h: 0.9, d: 1 }], flows: [], panels: [{ x, y: 2.6, z: onBack, w: 6.4, h: 2.8, yaw, color: ENGINE_TONES.cyan }] };
    case "brain": {
      // Rover's Brain: a server column of two cabinets beside a back-wall grid of six retrieved "chunk" screens feeding one answer screen.
      const column = back + o * 0.65;
      return {
        solids: [-3, -1.7].map((dx): Box => ({ x: x + dx, y: 0, z: column, w: 1.2, h: 4, d: 1.2 })),
        flows: [],
        panels: [
          ...[2, 2.9].flatMap((y) => [-0.6, 0.4, 1.4].map((dx) => ({ x: x + dx, y, z: onBack, w: 0.8, h: 0.6, yaw, color: ENGINE_TONES.cyan }))),
          { x: x + 2.85, y: 2.45, z: onBack, w: 1.4, h: 1.6, yaw, color: ENGINE_TONES.violet },
        ],
      };
    }
    case "rejected": {
      // Rejected Designs: a low scrap rack holding four crooked dim screens (the ideas set aside) and one upright amber one.
      const rack = { x, y: 0, z: back + o * 1, w: 5.6, h: 0.6, d: 1.4 };
      const rolls = [0.22, -0.16, 0.3, -0.25];
      return {
        solids: [rack],
        flows: [],
        panels: [
          ...rolls.map((roll, i) => ({ x: x - 2.1 + i * 1.05, y: 1.35, z: back + o * (0.6 + 0.2 * i), w: 0.9, h: 1.3, yaw, roll, color: ENGINE_TONES.dim })),
          { x: x + 2.1, y: 1.45, z: back + o * 1.4, w: 0.9, h: 1.5, yaw, color: ENGINE_TONES.amber },
        ],
      };
    }
  }
}

function pipes(layout: EngineLayout): FlowInstance[] {
  const from = ENGINE.approach.x - 1;
  const to = ENGINE.bounds.maxX - 2;
  const x = (from + to) / 2;
  const w = to - from;
  // Trays run over the aisle edges and stop short of the reactor core.
  const trayTo = layout.reactor.minX - 1;
  const trayX = (from + trayTo) / 2;
  const trayW = trayTo - from;
  const drops = layout.bays.map((bay) => ({ x: bay.center.x + 3, y: (ENGINE.bay.h + ENGINE.ceiling) / 2, z: backFace(bay) - out(bay) * (WALL / 2), w: PIPE.drop, h: ENGINE.ceiling - ENGINE.bay.h, d: PIPE.drop, color: ENGINE_TONES.pipe }));
  return [
    ...[-PIPE_Z, PIPE_Z].map((z) => ({ x, y: ENGINE.ceiling, z, w, h: PIPE.run, d: PIPE.run, color: ENGINE_TONES.pipe })),
    ...[-TRAY_Z, TRAY_Z].flatMap((z) => [
      { x: trayX, y: ENGINE.ceiling - 0.5, z, w: trayW, h: TRAY.h, d: TRAY.d, color: ENGINE_TONES.tray },
      { x: trayX, y: ENGINE.ceiling - 0.55, z, w: trayW, h: 0.04, d: TRAY.line, color: ENGINE_TONES.data },
    ]),
    ...drops,
  ];
}

/** The workbench against a long wall: a back board on the wall, a table in front of it and a wall screen facing the room. */
function workbenchProps(w: Rect): { solids: Box[]; panels: PanelInstance[] } {
  const south = w.maxZ === ENGINE.bounds.maxZ;
  /** +1 when the room lies toward +z of the bench (a bench on the north wall), -1 on the south wall. */
  const o = south ? -1 : 1;
  const wall = south ? w.maxZ : w.minZ;
  const x = (w.minX + w.maxX) / 2;
  const span = w.maxX - w.minX;
  const depth = w.maxZ - w.minZ;
  return {
    solids: [
      { x, y: 0, z: wall + o * 0.4, w: span, h: 5, d: 0.8 },
      { x, y: 0, z: wall + o * (depth - 0.9), w: span - 1, h: 1.1, d: 1.8 },
    ],
    panels: [{ x, y: 3.2, z: wall + o * 0.85, w: span - 1, h: 2.6, yaw: south ? Math.PI : 0, color: ENGINE_TONES.amber }],
  };
}

const frontStrip = (bay: EngineBay): FlowInstance => ({ x: bay.center.x, y: 0.03, z: bay.front - out(bay) * 0.15, w: ENGINE.bay.w - 0.6, h: 0.04, d: 0.25, color: ENGINE_TONES.amber });

export function engineScenery(layout: EngineLayout, tier: GpuTier): EngineScenery {
  const { leds } = engineDetail(tier);
  const solids: Box[] = [];
  const flows: FlowInstance[] = pipes(layout);
  const panels: PanelInstance[] = [];
  const plates: PlateInstance[] = [...deckPlates(layout), ...plinthPlates(layout)];
  for (const bay of layout.bays) {
    const props = stationProps(bay, leds);
    solids.push(...bayShell(bay), ...props.solids);
    flows.push(...props.flows, frontStrip(bay));
    panels.push(...props.panels);
    plates.push(...bayPlates(bay));
  }
  layout.racks.forEach((rack, i) => {
    const row = rackRow(rack, leds, i);
    solids.push(...row.solids);
    flows.push(...row.flows);
  });
  const bench = workbenchProps(layout.workbench);
  solids.push(...bench.solids, ...coreSolids());
  panels.push(...bench.panels);
  return { solids, masks: [endMask(layout)], flows, panels, plates };
}

/**
 * Station names over every bay (amber), the title over the workbench, and on the reactor platform's front edge (its
 * aisle side, west of the energy column, so a deploy flash never washes it out) the reactor's title (amber) right above
 * its counter plate (visits and questions, cyan), both below the rings. Every sign turns to the camera.
 */
export function engineSigns(layout: EngineLayout, data: EngineData, labels: EngineLabels, counts?: ReactorCounts): SignSpec[] {
  const titles = new Map(data.bays.map((bay) => [bay.id, bay.title]));
  const signs: SignSpec[] = [];
  for (const bay of layout.bays) {
    const z = bay.front - out(bay) * 0.6;
    signs.push({ text: titles.get(bay.id) ?? bay.id, x: bay.center.x, y: SIGN_Y, z, color: ENGINE_TONES.amber, fontSize: 0.42 });
  }
  const x = (layout.workbench.minX + layout.workbench.maxX) / 2;
  const z = (layout.workbench.minZ + layout.workbench.maxZ) / 2;
  signs.push({ text: labels.title.toLocaleUpperCase(), x, y: 6.6, z, color: ENGINE_TONES.amber, fontSize: 0.7 });
  signs.push({ text: labels.subtitle, x, y: 5.7, z, color: ENGINE_TONES.warm, fontSize: 0.36 });
  const reactor = labels.reactor;
  if (!reactor) return signs;
  const R = ENGINE.reactor;
  const front = layout.reactor.minX + 0.6;
  const plateY = CORE_FX.rings[0].y - 0.65;
  signs.push({ text: reactor.title.toLocaleUpperCase(), x: front, y: plateY + 1, z: R.z, color: ENGINE_TONES.amber, fontSize: 0.36 });
  const lines = [counts?.visits != null ? reactor.visits(counts.visits) : null, counts?.asks != null ? reactor.asks(counts.asks) : null].filter((l) => l !== null);
  if (lines.length > 0) signs.push({ text: lines.join("\n"), x: front, y: plateY, z: R.z, color: ENGINE_TONES.cyan, fontSize: 0.28 });
  return signs;
}
