import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, ROVER, ROVER_HEIGHT, SHAFT } from "@/experience/config";
import {
  arcPoint,
  boxesOverlap,
  CERT_PAGE_SIZE,
  CERT_PANEL_MAX_HALF,
  CERT_WALL,
  certPage,
  certPanelHalf,
  certSlots,
  faceYaw,
  lobbyElements,
  radialSpan,
  SKILLS_PAD,
  SKILLS_TEXT,
  skillsWallLayout,
  wrapCount,
  type Box,
} from "@/experience/floors/lobby/layout";
import { getSkills, tr } from "@/content/load";
import { wallSkillGroups } from "@/content/selectors";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { getStats } from "@/content/load";

const STATS = getStats().length;
const TURNS = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
/** The walkable lane ring: the rover's footprint around the lane radius, up to its height. */
const RING = { inner: LOBBY.laneRadius - ROVER.radius - 0.5, outer: LOBBY.laneRadius + ROVER.radius + 0.5 };
/** Elements stacked on the hologram column by design (pedestal, monogram, title above them). */
const COLUMN = new Set(["pedestal", "monogram", "title"]);

const pairs = (boxes: Box[]) => boxes.flatMap((a, i) => boxes.slice(i + 1).map((b) => [a, b] as const));

describe("Lobby layout", () => {
  it("centers the plaza circle and the slab on the elevator axis (owner: lurus with the elevator)", () => {
    const l1 = buildFloorLayouts(8).L1;
    const axis = SHAFT.z;
    expect(l1.door.z).toBe(axis);
    expect(l1.approach.z).toBe(axis);
    // Lane ring, stats ring and certification arc all center on the hologram.
    expect(LOBBY.hologram.z).toBe(axis);
    // The slab and its grid floor center on the bounds (FloorLevel); same 52 x 42 u footprint as before.
    expect((LOBBY.bounds.minZ + LOBBY.bounds.maxZ) / 2).toBe(axis);
    expect(LOBBY.bounds.maxZ - LOBBY.bounds.minZ).toBe(42);
    expect(LOBBY.certWall.z).toBe(axis);
    // The spawn keeps its place on the default camera diagonal from the plaza.
    expect({ dx: LOBBY.spawn.x - LOBBY.hologram.x, dz: LOBBY.spawn.z - LOBBY.hologram.z }).toEqual({ dx: 8, dz: 10 });
  });

  it("has no overlapping elements at any stats ring rotation", () => {
    for (const turn of TURNS) {
      const clashes = pairs(lobbyElements(STATS, turn))
        .filter(([a, b]) => !(COLUMN.has(a.name) && COLUMN.has(b.name)))
        .filter(([a, b]) => boxesOverlap(a, b))
        .map(([a, b]) => `${a.name} x ${b.name}`);
      expect(clashes).toEqual([]);
    }
  });

  it("keeps the stats tiles above the rover and below the title", () => {
    const boxes = lobbyElements(STATS);
    const title = boxes.find((b) => b.name === "title")!;
    for (const tile of boxes.filter((b) => b.name.startsWith("tile-"))) {
      expect(tile.min[1]).toBeGreaterThan(ROVER_HEIGHT);
      expect(tile.max[1]).toBeLessThan(title.min[1]);
    }
  });

  it("keeps the walkable ring clear of everything at rover height", () => {
    for (const turn of TURNS) {
      const blocking = lobbyElements(STATS, turn)
        .filter((b) => b.min[1] < ROVER_HEIGHT)
        .filter((b) => {
          const { near, far } = radialSpan(b);
          return near < RING.outer && far > RING.inner;
        })
        .map((b) => b.name);
      expect(blocking).toEqual([]);
    }
  });

  it("leaves a walkway of at least 4 u between the ring and each wall", () => {
    const boxes = lobbyElements(STATS);
    for (const name of ["skills-wall", "cert-wall", "kiosk"]) {
      const { near } = radialSpan(boxes.find((b) => b.name === name)!);
      expect(near - RING.outer, name).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps every element on the slab and the ring walkable", () => {
    const { bounds } = LOBBY;
    for (const b of lobbyElements(STATS).filter((e) => e.name !== "elevator-door")) {
      expect(b.min[0]).toBeGreaterThanOrEqual(bounds.minX);
      expect(b.max[0]).toBeLessThanOrEqual(bounds.maxX);
      expect(b.min[2]).toBeGreaterThanOrEqual(bounds.minZ);
      expect(b.max[2]).toBeLessThanOrEqual(bounds.maxZ);
    }
    const l1 = buildFloorLayouts(8).L1;
    const grid = buildNavGrid(l1, ROVER.radius);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const p = { x: LOBBY.hologram.x + Math.cos(a) * LOBBY.laneRadius, z: LOBBY.hologram.z + Math.sin(a) * LOBBY.laneRadius };
      expect(isWalkable(grid, p), `ring point ${i}`).toBe(true);
    }
    expect(isWalkable(grid, l1.spawn)).toBe(true);
    expect(isWalkable(grid, l1.approach)).toBe(true);
  });

  it("measures the skills wall so every heading and column fits with margin (both locales)", () => {
    for (const locale of ["en", "id"] as const) {
      const groups = wallSkillGroups(getSkills()).map((g) => ({ label: tr(g.label, locale), items: g.items }));
      expect(groups).toHaveLength(4);
      const l = skillsWallLayout(groups);
      expect(l.h).toBeGreaterThanOrEqual(LOBBY.skillsWall.h);
      // The CV refresh must not make the wall taller than it was (9.85 u at f61fbba).
      expect(l.h).toBeLessThanOrEqual(9.85);
      // The longest heading wraps; every column reserves its lines, so items start below it.
      const headingBottom = SKILLS_PAD.top + l.labelLines * SKILLS_TEXT.labelSize * SKILLS_TEXT.labelLine;
      expect(l.itemTop - headingBottom).toBeGreaterThanOrEqual(0.3);
      for (const g of groups) {
        const charW = SKILLS_TEXT.labelSize * (0.6 + SKILLS_TEXT.labelTracking);
        expect(wrapCount(g.label.toUpperCase(), Math.floor(l.textWidth / charW))).toBeLessThanOrEqual(l.labelLines);
        const bottom = l.h - l.itemTop - g.items.length * SKILLS_TEXT.itemSize * SKILLS_TEXT.itemLine;
        expect(bottom, `${locale} ${g.label}`).toBeGreaterThanOrEqual(1.2);
      }
    }
    expect(skillsWallLayout([{ label: "Cloud infrastructure and DevOps", items: [] }]).labelLines).toBe(1);
    expect(skillsWallLayout([{ label: "a", items: [] }, { label: "b", items: [] }, { label: "c", items: [] }, { label: "Cloud infrastructure and DevOps", items: [] }]).labelLines).toBe(2);
  });

  it("wraps headings by words", () => {
    expect(wrapCount("CLOUD INFRASTRUCTURE AND DEVOPS", 25)).toBe(2);
    expect(wrapCount("SOFTWARE ENGINEERING", 25)).toBe(1);
  });

  it("gives each skill column room to breathe", () => {
    expect(LOBBY.skillsWall.w / 4).toBeGreaterThanOrEqual(9);
  });

  describe("certification wall", () => {
    const cw = LOBBY.certWall;

    it("keeps the widest panel, badges and tabs inside the wall footprint", () => {
      const r = CERT_WALL.radius + CERT_WALL.inset;
      for (const a of [-CERT_PANEL_MAX_HALF, 0, CERT_PANEL_MAX_HALF]) {
        for (const radius of [CERT_WALL.radius - 0.05, r]) {
          const [x, , z] = arcPoint(radius, a, 0);
          expect(x, `x at ${a}`).toBeGreaterThanOrEqual(cw.x - cw.w / 2);
          expect(x, `x at ${a}`).toBeLessThanOrEqual(cw.x + cw.w / 2);
          expect(Math.abs(z - cw.z), `z at ${a}`).toBeLessThanOrEqual(cw.d / 2);
        }
      }
      expect(CERT_WALL.titleY + 0.45).toBeLessThanOrEqual(cw.h + 0.8);
      expect(CERT_WALL.panel.y1).toBeLessThanOrEqual(CERT_WALL.titleY);
    });

    it("lays out up to 12 badges in two rows, sized to content and without overlaps", () => {
      expect(certSlots(0)).toEqual([]);
      expect(certSlots(7).map((s) => s.col)).toEqual([0, 1, 2, 3, 0, 1, 2]);
      expect(certSlots(40)).toHaveLength(CERT_PAGE_SIZE);
      const slots = certSlots(CERT_PAGE_SIZE);
      for (const [a, b] of slots.flatMap((p, i) => slots.slice(i + 1).map((q) => [p, q] as const))) {
        const [ax, , az] = arcPoint(CERT_WALL.radius, a.a, 0);
        const [bx, , bz] = arcPoint(CERT_WALL.radius, b.a, 0);
        const apart = a.row === b.row ? Math.hypot(ax - bx, az - bz) >= CERT_WALL.badge.w : Math.abs(a.y - b.y) >= CERT_WALL.badge.h;
        expect(apart, `${a.index} and ${b.index}`).toBe(true);
      }
      // Bottom row clears the pager, top row stays under the tabs.
      expect(Math.min(...slots.map((s) => s.y)) - CERT_WALL.badge.h / 2).toBeGreaterThan(CERT_WALL.pagerY + CERT_WALL.tab.h / 2);
      expect(Math.max(...slots.map((s) => s.y)) + CERT_WALL.badge.h / 2).toBeLessThan(CERT_WALL.tabsY - CERT_WALL.tab.h / 2);
      expect(certPanelHalf(3, [])).toBeLessThan(certPanelHalf(12, []));
    });

    it("pages past 12 and wraps around", () => {
      expect(certPage(7, 0)).toEqual({ page: 0, pages: 1, start: 0, end: 7 });
      expect(certPage(30, 2)).toEqual({ page: 2, pages: 3, start: 24, end: 30 });
      expect(certPage(30, 3).page).toBe(0);
      expect(certPage(30, -1).page).toBe(2);
    });

    it("turns every badge toward the plaza center", () => {
      for (const a of [-0.3, 0, 0.3]) {
        const yaw = faceYaw(a);
        const [x, , z] = arcPoint(CERT_WALL.radius, a, 0);
        const toCenter = { x: LOBBY.hologram.x - x, z: LOBBY.hologram.z - z };
        const len = Math.hypot(toCenter.x, toCenter.z);
        expect(Math.sin(yaw)).toBeCloseTo(toCenter.x / len);
        expect(Math.cos(yaw)).toBeCloseTo(toCenter.z / len);
      }
    });
  });
});
