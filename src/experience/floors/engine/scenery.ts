import type { SignSpec } from "../../fx/signLayout";
import type { EngineData, GpuTier, Rect } from "../../types";
import type { Box } from "../roof/solids";
import { ENGINE, type EngineBay, type EngineLayout } from "./layout";

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

/** An upright screen facing `yaw` (forward (sin, cos)), or `flat` on a table top; `y` is its center. */
export interface PanelInstance {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  yaw: number;
  flat?: boolean;
  color: string;
}

export interface EngineScenery {
  solids: Box[];
  flows: FlowInstance[];
  panels: PanelInstance[];
}

/** Floor words (hud.engine.*): the workbench title and subtitle, and the dark bays' plate. */
export interface EngineLabels {
  title: string;
  subtitle: string;
  soon: string;
}

export const ENGINE_TONES = { amber: ENGINE.accent, cyan: "#22d3ee", violet: "#a78bfa", green: "#34d399", dim: "#71717a", warm: "#fde68a", tray: "#78350f", data: "#155e75" } as const;
const LED_TONES = [ENGINE_TONES.green, ENGINE_TONES.amber, ENGINE_TONES.cyan] as const;

/** LEDs per rack cabinet; the lite tier draws half. */
export function engineDetail(tier: GpuTier): { leds: number } {
  return { leds: tier === "full" ? 8 : 4 };
}

const WALL = 0.8;
const SIDE = 0.3;
const CABINET = { w: 1.8, h: 3.6, pitch: 2 } as const;
const SIGN_Y = 5.3;
/** Pipe runs hang over the bay fronts (z = +-PIPE_Z, held by brackets on the bay walls); cable trays over the aisle edges. */
const PIPE_Z = 8.4;
const TRAY_Z = 3;
/** Cable trays stay narrow and dim (a warm tray with a faint cyan data line under it), so the stations and signs lead. */
const TRAY = { d: 0.4, h: 0.06, line: 0.08 } as const;

/** +1 when the bay's open face looks toward +z (north bays), -1 for south bays. */
const out = (bay: EngineBay): 1 | -1 => (bay.side === "north" ? 1 : -1);
/** z of the inner face of the bay's back wall. */
const backFace = (bay: EngineBay) => (bay.side === "north" ? bay.rect.minZ + WALL : bay.rect.maxZ - WALL);
/** Upright screens in a bay face the aisle. */
const faceYaw = (bay: EngineBay) => (bay.side === "north" ? 0 : Math.PI);

function bayShell(bay: EngineBay): Box[] {
  const { w, d, h } = ENGINE.bay;
  const { x } = bay.center;
  const bracketZ = bay.front - out(bay) * 0.4;
  return [
    { x, y: 0, z: backFace(bay) - out(bay) * (WALL / 2), w, h, d: WALL },
    { x: bay.rect.minX + SIDE / 2, y: 0, z: bay.center.z, w: SIDE, h, d },
    { x: bay.rect.maxX - SIDE / 2, y: 0, z: bay.center.z, w: SIDE, h, d },
    { x, y: 0, z: bay.center.z, w: w - 2 * SIDE, h: 0.12, d: d - WALL },
    { x: bay.rect.minX + SIDE / 2, y: h, z: bracketZ, w: 0.2, h: ENGINE.ceiling - h, d: 0.2 },
    { x: bay.rect.maxX - SIDE / 2, y: h, z: bracketZ, w: 0.2, h: ENGINE.ceiling - h, d: 0.2 },
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

function stationProps(bay: EngineBay, leds: number): { solids: Box[]; flows: FlowInstance[]; panels: PanelInstance[] } {
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
    default:
      // Bays 6 and 7: empty until their stations ship.
      return { solids: [], flows: [], panels: [] };
  }
}

function pipes(layout: EngineLayout): FlowInstance[] {
  const from = ENGINE.approach.x - 1;
  const to = ENGINE.bounds.maxX - 2;
  const x = (from + to) / 2;
  const w = to - from;
  const drops = layout.bays
    .filter((bay) => bay.lit)
    .map((bay) => ({ x: bay.center.x + 3, y: (ENGINE.bay.h + ENGINE.ceiling) / 2, z: bay.front - out(bay) * 0.4, w: 0.2, h: ENGINE.ceiling - ENGINE.bay.h, d: 0.2, color: ENGINE_TONES.amber }));
  return [
    ...[-PIPE_Z, PIPE_Z].map((z) => ({ x, y: ENGINE.ceiling, z, w, h: 0.36, d: 0.36, color: ENGINE_TONES.amber })),
    ...[-TRAY_Z, TRAY_Z].flatMap((z) => [
      { x, y: ENGINE.ceiling + 0.5, z, w, h: TRAY.h, d: TRAY.d, color: ENGINE_TONES.tray },
      { x, y: ENGINE.ceiling + 0.45, z, w, h: 0.04, d: TRAY.line, color: ENGINE_TONES.data },
    ]),
    ...drops,
  ];
}

const frontStrip = (bay: EngineBay): FlowInstance => ({ x: bay.center.x, y: 0.03, z: bay.front - out(bay) * 0.15, w: ENGINE.bay.w - 0.6, h: 0.04, d: 0.25, color: ENGINE_TONES.amber });

export function engineScenery(layout: EngineLayout, tier: GpuTier): EngineScenery {
  const { leds } = engineDetail(tier);
  const solids: Box[] = [];
  const flows: FlowInstance[] = pipes(layout);
  const panels: PanelInstance[] = [];
  for (const bay of layout.bays) {
    const props = stationProps(bay, leds);
    solids.push(...bayShell(bay), ...props.solids);
    flows.push(...props.flows, ...(bay.lit ? [frontStrip(bay)] : []));
    panels.push(...props.panels);
  }
  layout.racks.forEach((rack, i) => {
    const row = rackRow(rack, leds, i);
    solids.push(...row.solids);
    flows.push(...row.flows);
  });
  const w = layout.workbench;
  solids.push({ x: w.minX + 1.4, y: 0, z: 0, w: 2.6, h: 1.1, d: 7 }, { x: w.maxX - 0.4, y: 0, z: 0, w: 0.8, h: 5, d: w.maxZ - w.minZ });
  panels.push({ x: w.maxX - 0.85, y: 3.2, z: 0, w: 7, h: 2.6, yaw: -Math.PI / 2, color: ENGINE_TONES.amber });
  return { solids, flows, panels };
}

/** Station names over every bay (lit amber, dark dim with a Coming soon plate) and the title over the workbench. */
export function engineSigns(layout: EngineLayout, data: EngineData, labels: EngineLabels): SignSpec[] {
  const titles = new Map(data.bays.map((bay) => [bay.id, bay.title]));
  const signs: SignSpec[] = [];
  for (const bay of layout.bays) {
    const z = bay.front - out(bay) * 0.6;
    signs.push({ text: titles.get(bay.id) ?? bay.id, x: bay.center.x, y: SIGN_Y, z, color: bay.lit ? ENGINE_TONES.amber : ENGINE_TONES.dim, fontSize: 0.42 });
    if (!bay.lit) signs.push({ text: labels.soon, x: bay.center.x, y: SIGN_Y - 0.8, z, color: ENGINE_TONES.dim, fontSize: 0.3, opacity: 0.8 });
  }
  const x = (layout.workbench.minX + layout.workbench.maxX) / 2;
  signs.push({ text: labels.title.toLocaleUpperCase(), x, y: 6.6, z: 0, color: ENGINE_TONES.amber, fontSize: 0.7 });
  signs.push({ text: labels.subtitle, x, y: 5.7, z: 0, color: ENGINE_TONES.warm, fontSize: 0.36 });
  return signs;
}
