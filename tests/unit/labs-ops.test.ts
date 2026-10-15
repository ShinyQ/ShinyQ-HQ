import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { buildFloorLayouts } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { buildLabsLayout, LABS } from "@/experience/floors/labs/layout";
import { OPS } from "@/experience/floors/labs/ops";
import { OPS_ROOM, opsRoomFromHash } from "@/experience/floors/labs/opsHash";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { onNetwork } from "@/experience/nav/road";
import type { LabPod } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const experience = buildExperienceData("en", FLOOR_NAMES);
const layout = buildLabsLayout(experience.labs.pods);
const { floor, ops } = layout;

const pod = (slug: string, wing: LabPod["wing"], tier: LabPod["tier"], order: number): LabPod => ({
  id: slug,
  slug,
  title: slug,
  tier,
  wing,
  accent: "cyan",
  hologram: "pipeline",
  order,
  hasHologramView: tier === "hero",
  hasGallery: false,
});

describe("L3 Ops Control Room placement", () => {
  it("docks in the inner pocket of the AI wing beside the Tech Reactor (owner pick 2026-10-14)", () => {
    // Its front stays on the inner forecourt line of the AI wing road, which runs at |z| = layout.wingZ (36 with the spine).
    expect(layout.wingZ).toBe(36);
    expect(ops.rect).toEqual({ minX: 97, maxX: 103, minZ: 23, maxZ: 29 });
    expect(ops.rect.maxX - ops.rect.minX).toBe(OPS.w);
    expect(ops.rect.maxZ - ops.rect.minZ).toBe(OPS.d);
    // Today's floor is unchanged: the room fits before the AI road turns to the plaza.
    expect(layout.east.center).toEqual({ x: 107, z: 0 });
  });

  it("is a room with a door pad, a spur from the AI wing road, an obstacle, a tall column, a camera zone and no stop", () => {
    const door = floor.doors?.find((d) => d.room === OPS_ROOM);
    expect(door).toEqual({ room: OPS_ROOM, at: ops.door, facing: { x: 0, z: -1 } });
    expect(ops.door).toEqual({ x: 100, z: 29 + LABS.padInset });
    const spur = layout.network.spurs.find((s) => s.room === OPS_ROOM);
    expect(spur?.from).toEqual({ x: 100, z: layout.wingZ });
    expect(spur?.to).toEqual(ops.door);
    expect(onNetwork(layout.network, spur!.from)).toBe(true);
    expect(floor.obstacles).toContainEqual(ops.rect);
    expect(floor.tall).toContainEqual({ ...ops.rect, h: OPS.h });
    expect(floor.stops?.[OPS_ROOM]).toBeUndefined();
    expect(zoneAt("L3", ops.door, floor.viewZones ?? [])?.id).toBe(OPS_ROOM);
  });

  it("keeps the real, a lopsided and an empty floor inside the space rules", () => {
    expectSpaceRules({ bounds: floor.bounds, obstacles: floor.obstacles, doors: floor.doors ?? [], network: layout.network, start: floor.approach });
    const lopsided = buildLabsLayout([
      ...Array.from({ length: 9 }, (_, i) => pod(`s${i}`, "software", i % 3 ? "featured" : "hero", i)),
      ...Array.from({ length: 3 }, (_, i) => pod(`a${i}`, "ai", "hero", i)),
    ]);
    expectSpaceRules({ bounds: lopsided.floor.bounds, obstacles: lopsided.floor.obstacles, doors: lopsided.floor.doors ?? [], network: lopsided.network, start: lopsided.floor.approach });
    const longAi = buildLabsLayout(Array.from({ length: 12 }, (_, i) => pod(`a${i}`, "ai", "featured", i)));
    expectSpaceRules({ bounds: longAi.floor.bounds, obstacles: longAi.floor.obstacles, doors: longAi.floor.doors ?? [], network: longAi.network, start: longAi.floor.approach });
    const lastInner = Math.max(...longAi.placed.filter((p) => p.pod.wing === "ai" && p.row === "inner").map((p) => p.rect.maxX));
    expect(longAi.ops.rect.minX).toBe(lastInner + OPS.gap);
    const empty = buildLabsLayout([]);
    expectSpaceRules({ bounds: empty.floor.bounds, obstacles: empty.floor.obstacles, doors: empty.floor.doors ?? [], network: empty.network, start: empty.floor.approach });
  });

  it("reaches the room from the tower through buildFloorLayouts", () => {
    const layouts = buildFloorLayouts(experience.years.length, {
      labs: experience.labs.pods,
      career: careerLayoutInput(experience.career),
      library: libraryLayoutInput(experience.library),
    });
    expect(layouts.L3.doors?.some((d) => d.room === OPS_ROOM)).toBe(true);
  });

  it("opens from /{locale}/contact#production in 3D only", () => {
    expect(opsRoomFromHash("RF", "#production")).toBe(OPS_ROOM);
    expect(opsRoomFromHash("RF", "#Production")).toBe(OPS_ROOM);
    expect(opsRoomFromHash("RF", "#visits")).toBeNull();
    expect(opsRoomFromHash("L3", "#production")).toBeNull();
    expect(opsRoomFromHash(undefined, "#production")).toBeNull();
  });
});
