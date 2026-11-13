import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { contactBeacon, gateOpening, hallLights } from "@/experience/floors/lobby/hallGallery";
import { HALL, HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
import { PART_OF, premiumInstances } from "@/experience/floors/lobby/hallPremium/build";
import { caseFrame, type PremiumInstance } from "@/experience/floors/lobby/hallPremium/caseFrame";
import { ORIENT, PREMIUM_MODE as M } from "@/experience/floors/lobby/hallPremium/shader";
import { ENCLOSURE } from "@/experience/floors/lobby/hallSolids";
import { hallShellInstances, lightInstances, RING_OUTER, ringInstances, STAGE_KIND, type StageInstance } from "@/experience/floors/lobby/hallStage";
import { HIGHLIGHT_STATIONS } from "@/experience/floors/lobby/stations";

/**
 * Owner bug (2026-11-13): the contact beacon's signal rings reached through the hall's glass west side and over the south
 * wall. Every animated hall effect's swept footprint (each animation state: growth, spin, orbit, wake) has to stay inside
 * the hall's walls and under its ceiling, and the beacon's inside the contact station's glass case. The still floor lights
 * may reach under an opaque wall (the dark north, east and south walls hide the rest from every view inside the hall and
 * from the Lobby), never past the glass west side. Footprints follow the shaders (`hallPremium/shader.ts`, the stage
 * branch of `fx/holoFx.ts`).
 */
type Box = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type P3 = [number, number, number];

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const HALL_BOX = { minX: HALL.partition.line + HALL.partition.thickness, maxX: HALL.zone.maxX, minZ: HALL.zone.minZ, maxZ: HALL.zone.maxZ, minY: 0, maxY: ENCLOSURE.ceiling };
const TAU = Math.PI * 2;
const turns = (n: number) => Array.from({ length: n }, (_, i) => (i / n) * TAU);
const circle = (r: number, n = 32): [number, number][] => turns(n).map((a) => [Math.cos(a) * r, Math.sin(a) * r]);

/** The instance matrix's yaw (three's rotation about +y). */
const yawed = ([x, y, z]: P3, yaw: number): P3 => [x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw)];
const tilted = ([x, y, z]: P3, t: number): P3 => [x, y * Math.cos(t) - z * Math.sin(t), y * Math.sin(t) + z * Math.cos(t)];
const spun = ([x, y, z]: P3, g: number): P3 => [x * Math.cos(g) + z * Math.sin(g), y, z * Math.cos(g) - x * Math.sin(g)];

function boxOf(points: readonly P3[]): Box {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [x, y, z] of points) {
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
    b.minZ = Math.min(b.minZ, z);
    b.maxZ = Math.max(b.maxZ, z);
  }
  return b;
}

/** Every point an interior instance can reach (its largest size, every spin and orbit angle, wake 0 to 1). */
function premiumReach(i: PremiumInstance): Box {
  const [mode, w, h] = i.a;
  const [tilt, spin] = i.b;
  const at = i.at;
  const out: P3[] = [];
  const place = (p: P3) => {
    const [x, y, z] = yawed(p, i.yaw);
    out.push([at[0] + x, at[1] + y, at[2] + z]);
  };
  if (mode === M.token || mode === M.particle) {
    // A camera-facing dot (size `w`) around its centre: an orbit (radius `c.z`, tilted) or a scatter offset that closes on wake.
    const centres: P3[] = mode === M.token ? turns(16).map((a) => tilted([Math.cos(a) * i.c[2], 0, Math.sin(a) * i.c[2]], tilt)) : [[0, 0, 0], (i.d ?? [0, 0, 0, 0]).slice(0, 3) as P3];
    for (const c of centres) for (const [dx, dz] of circle(w / 2, 8)) for (const dy of [-w / 2, w / 2]) place([c[0] + dx, c[1] + dy, c[2] + dz]);
    return boxOf(out);
  }
  const round = mode === M.ring || mode === M.pool;
  const outline: [number, number][] = round ? circle(1).map(([x, y]) => [(x * w) / 2, (y * h) / 2]) : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  // A bar grows from its left end (`aC.x` of its length to all of it with the wake).
  const grow = mode === M.bar ? Math.max(1, i.c[0]) : 1;
  const along = (qx: number) => ((qx / w + 0.5) * grow - 0.5) * w;
  const push = mode === M.screen || mode === M.shimmer ? [0, i.c[1]] : [0];
  const angles = spin !== 0 ? turns(16) : [0];
  const orient = i.c[2];
  for (const [qx, qy] of outline)
    for (const pz of push)
      for (const g of angles) {
        if (orient === ORIENT.column) {
          // Turned to the camera about the vertical: any horizontal direction.
          for (const [dx, dz] of circle(Math.abs(along(qx)), 8)) place([dx, qy, dz]);
          continue;
        }
        let p: P3 = [along(qx), qy, pz];
        if (orient === ORIENT.lying) p = [p[0], 0, -p[1]];
        place(spun(tilted(p, tilt), g));
      }
  return boxOf(out);
}

/** Every point a stage instance (`hallStage.ts`) can reach: lights (open cylinders), pulse rings at full growth, lying halos. */
function stageReach(i: StageInstance): Box {
  const [kind, a, b, c] = i.stage;
  const [x, y, z] = i.at;
  const ring = (r: number, h = 0): P3[] => circle(r).flatMap(([dx, dz]) => [[x + dx, y, z + dz] as P3, [x + dx, y + h, z + dz] as P3]);
  if (kind <= STAGE_KIND.pool) return boxOf(ring(Math.max(b, c), a));
  if (kind === STAGE_KIND.ring) return boxOf(ring(RING_OUTER * (1 + a)));
  if (kind === STAGE_KIND.halo) return boxOf(ring(Math.max(a, b) + c / 2));
  throw new Error(`no reach for stage kind ${kind}`);
}

type Bound = Omit<Box, "minY"> & { minY?: number };
/** Each side of `bound` the box passes, by how far (u); empty when inside. */
function overflow(b: Box, bound: Bound, eps = 1e-6): string[] {
  const out: string[] = [];
  const past = (side: string, d: number) => d > eps && out.push(`${side} +${d.toFixed(2)}`);
  past("west", bound.minX - b.minX);
  past("east", b.maxX - bound.maxX);
  past("north", bound.minZ - b.minZ);
  past("south", b.maxZ - bound.maxZ);
  past("top", b.maxY - bound.maxY);
  past("bottom", (bound.minY ?? -Infinity) - b.minY);
  return out;
}
const MODE_NAME = Object.fromEntries(Object.entries(M).map(([k, v]) => [v, k]));
const KIND_NAME = Object.fromEntries(Object.entries(STAGE_KIND).map(([k, v]) => [v, k]));

/** The gate's floor glow lies across the gateway opening (the hall's way in) by design, centred on the gate line. */
const gateGlow = (i: PremiumInstance) => {
  const o = gateOpening();
  return i.a[0] === M.pool && i.a[3] === 0 && i.at[0] === o.x && Math.abs(i.at[2] - (o.minZ + o.maxZ) / 2) < 1e-6 && i.a[2] <= o.maxZ - o.minZ + 1e-6;
};
/** Still floor lights: the glass west side and the ceiling bound them; the opaque walls do not. */
const LIGHT_BOX = { ...HALL_BOX, minZ: -Infinity, maxZ: Infinity, maxX: Infinity };

describe("Highlights Hall effects stay inside the hall (owner bug, 2026-11-13)", () => {
  for (const tier of ["full", "lite"] as const) {
    it(`keeps every interior effect inside the walls and under the ceiling (${tier})`, () => {
      const parts = premiumInstances(data, tier);
      const all = [...parts.north, ...parts.contact, ...parts.south];
      expect(all.filter(gateGlow)).toHaveLength(1);
      const out = all.filter((i) => !gateGlow(i)).flatMap((i) => {
        const o = overflow(premiumReach(i), HALL_BOX);
        return o.length ? [`${HIGHLIGHT_STATIONS[i.a[3] - 1] ?? "hall"} ${MODE_NAME[i.a[0]]} at ${i.at.map((v) => v.toFixed(1))}: ${o.join(", ")}`] : [];
      });
      expect([...new Set(out)]).toEqual([]);
    });

    it(`keeps the beacon's pulse rings and the door-pad halos inside the walls, the floor lights off the glass west side (${tier})`, () => {
      const b = contactBeacon();
      const list = [
        ...ringInstances(b.pulses, HALL.tone.contact, tier, b.reach).map((i) => ({ i, bound: HALL_BOX })),
        ...hallShellInstances(tier)
          .filter((i) => i.tag === "halo")
          .map((i) => ({ i, bound: HALL_BOX })),
        ...lightInstances(hallLights(), tier).map((i) => ({ i, bound: LIGHT_BOX })),
      ];
      const out = list.flatMap(({ i, bound }) => {
        const o = overflow(stageReach(i), bound);
        return o.length ? [`${KIND_NAME[i.stage[0]]} at ${i.at.map((v) => v.toFixed(1))}: ${o.join(", ")}`] : [];
      });
      expect([...new Set(out)]).toEqual([]);
    });
  }

  it("keeps the beacon's signal rings and ripples inside the contact station's glass case", () => {
    const s = HALL_LAYOUT.stations.find((x) => x.station === "contact")!;
    const box = caseFrame(s, "full").box;
    const bound = { ...box, maxY: box.h };
    const mast = contactBeacon().mast;
    const b = contactBeacon();
    for (const i of ringInstances(b.pulses, HALL.tone.contact, "full", b.reach)) expect(overflow(stageReach(i), bound), "pulse ring").toEqual([]);
    // The mast's glow pool too (it sits on the case's floor).
    const pool = lightInstances(hallLights(), "full").find((i) => i.stage[0] === STAGE_KIND.pool && i.at[0] === mast.x && i.at[2] === mast.z)!;
    expect(overflow(stageReach(pool), bound), "mast pool").toEqual([]);
    const ripples = premiumInstances(data, "full")[PART_OF.contact].filter((i) => i.a[0] === M.ring && i.at[0] === mast.x && i.at[2] === mast.z);
    expect(ripples.length).toBeGreaterThan(0);
    for (const i of ripples) expect(overflow(premiumReach(i), bound), "floor ripple").toEqual([]);
  });
});
