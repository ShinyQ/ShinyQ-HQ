import { describe, expect, it } from "vitest";
import { buildFloorLayouts, FLOOR_GAP, LOBBY, ROVER, ROVER_HEIGHT, SHAFT } from "@/experience/config";
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
  SKILLS_GRID,
  SKILLS_PAD,
  SKILLS_SPLIT,
  SKILLS_TEXT,
  skillItemWidth,
  skillsWallLayout,
  skillsWallTop,
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
/** Elements stacked on the hologram column by design (pedestal, rover mark, title above them). */
const COLUMN = new Set(["pedestal", "rover-mark", "title"]);

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
    // The spawn stands in front of the Ask Rover kiosk on the kiosk axis (owner 2026-10-14; tests/unit/kiosk.test.ts).
    expect(Math.hypot(LOBBY.spawn.x - LOBBY.hologram.x, LOBBY.spawn.z - LOBBY.hologram.z)).toBeGreaterThan(LOBBY.laneRadius + ROVER.radius);
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
    for (const name of ["skills-wall", "cert-wall", "observatory"]) {
      const { near } = radialSpan(boxes.find((b) => b.name === name)!);
      expect(near - RING.outer, name).toBeGreaterThanOrEqual(4);
    }
    // The kiosk faces the hologram on a radial line: its front (the screen leans 0.3 u) is its nearest point.
    const k = LOBBY.kiosk;
    const kioskNear = Math.hypot(k.x - LOBBY.hologram.x, k.z - LOBBY.hologram.z) - k.depth / 2 - 0.3;
    expect(kioskNear - RING.outer, "kiosk").toBeGreaterThanOrEqual(4);
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

  it("shows every group and every skill 4 across by 2 down with tidy sub-columns (both locales)", () => {
    const line = SKILLS_TEXT.itemSize * SKILLS_TEXT.itemLine;
    for (const locale of ["en", "id"] as const) {
      const splits = Array.from({ length: SKILLS_GRID.columns }, () => new Set<string>());
      const groups = wallSkillGroups(getSkills()).map((g) => ({ label: tr(g.label, locale), items: g.items }));
      expect(groups).toHaveLength(8);
      const l = skillsWallLayout(groups);
      expect(LOBBY.skillsWall.w).toBe(40);
      expect(l.column).toBe(10);
      expect(l.cells).toHaveLength(8);
      // Four grid columns, two rows, aligned edges; a row is as tall as its tallest cell.
      expect(new Set(l.cells.map((c) => c.left)).size).toBe(4);
      expect(new Set(l.cells.map((c) => c.top)).size).toBe(2);
      expect(l.rowHeights).toHaveLength(2);
      for (const [r, rh] of l.rowHeights.entries()) {
        const lines = Math.max(...l.cells.filter((_, i) => Math.floor(i / SKILLS_GRID.columns) === r).map((c) => c.lines));
        expect(rh).toBeCloseTo(l.itemTop + lines * line, 6);
      }
      for (const [i, c] of l.cells.entries()) {
        const g = groups[i];
        // Every item exactly once, in dataset order, each sub-column starting where the previous ended.
        expect(c.columns.flatMap((col) => col.items)).toEqual([...g.items]);
        let start = 0;
        for (const col of c.columns) {
          expect(col.start).toBe(start);
          start += col.items.length;
        }
        expect(c.lines).toBe(Math.max(...c.columns.map((col) => col.items.length)));
        // A long group splits in two (first half left, column-major) unless an item would not fit its slot.
        if (c.columns.length === 2) {
          expect(g.items.length).toBeGreaterThan(SKILLS_SPLIT.over);
          expect(c.columns[0].items).toHaveLength(Math.ceil(g.items.length / 2));
          expect(c.columns[0].x).toBe(c.left);
          // Slots: the left one ends a gap before the second sub-column, which runs to the cell's text edge.
          const offset = c.columns[1].x - c.left;
          expect(c.columns[0].width).toBeCloseTo(offset - SKILLS_SPLIT.gap, 6);
          expect(c.columns[1].width).toBeCloseTo(l.textWidth - offset, 6);
          splits[i % SKILLS_GRID.columns].add(offset.toFixed(6));
        } else {
          expect(c.columns[0].x).toBe(c.left);
          expect(c.columns[0].width).toBe(l.textWidth);
        }
        // Every sub-column's estimated width (icon gap plus about 0.5 em per glyph) fits its slot.
        for (const col of c.columns) {
          for (const item of col.items) expect(skillItemWidth(item), `${locale} ${item}`).toBeLessThanOrEqual(col.width + 1e-9);
        }
        // Every cell ends above the next row, and the base row clears the plinth lip.
        const bottom = c.top + l.itemTop + c.lines * line;
        expect(l.h - bottom, `${locale} ${g.label}`).toBeGreaterThanOrEqual(1.8);
        const row = Math.floor(i / SKILLS_GRID.columns);
        if (row + 1 < l.rowHeights.length) {
          const nextTop = l.cells[(row + 1) * SKILLS_GRID.columns].top;
          expect(nextTop - bottom).toBeGreaterThanOrEqual(SKILLS_PAD.rowGap - 1e-9);
        }
        // Headings fit their cell.
        const charW = SKILLS_TEXT.labelSize * (0.6 + SKILLS_TEXT.labelTracking);
        expect(wrapCount(g.label.toUpperCase(), Math.floor(l.textWidth / charW))).toBeLessThanOrEqual(l.labelLines);
      }
      // Split cells in one grid column share one second sub-column edge, so the sub-columns line up down the wall.
      for (const offsets of splits) expect(offsets.size).toBeLessThanOrEqual(1);
      // Today: AI keeps one column ("Azure OpenAI (incl. Realtime)" is too wide for half a cell); Azure and Data science split.
      expect(l.cells.map((c) => c.columns.map((col) => col.items.length))).toEqual([[9], [6, 6], [6, 6], [6], [4, 4], [5], [4, 3], [5, 4]]);
    }
    const short = skillsWallLayout([{ label: "a", items: ["1", "2", "3", "4", "5", "6"] }]);
    expect(short.cells[0].columns).toHaveLength(1);
    const long = skillsWallLayout([{ label: "a", items: ["1", "2", "3", "4", "5", "6", "7"] }]);
    expect(long.cells[0].columns.map((col) => col.items)).toEqual([["1", "2", "3", "4"], ["5", "6", "7"]]);
  });

  it("keeps the skills wall and its title under one storey, with LOBBY.skillsWall.h covering it (both locales)", () => {
    for (const locale of ["en", "id"] as const) {
      const l = skillsWallLayout(wallSkillGroups(getSkills()).map((g) => ({ label: tr(g.label, locale), items: g.items })));
      // The hit box, the bounds and the colliders read LOBBY.skillsWall.h: a content change that grows the wall must update it.
      expect(l.h, locale).toBeLessThanOrEqual(LOBBY.skillsWall.h + 0.01);
      expect(skillsWallTop(l.h), locale).toBeLessThanOrEqual(12.5);
    }
    expect(skillsWallTop(LOBBY.skillsWall.h)).toBeLessThan(FLOOR_GAP - 1);
  });

  it("wraps headings by words", () => {
    expect(wrapCount("CLOUD INFRASTRUCTURE AND DEVOPS", 25)).toBe(2);
    expect(wrapCount("SOFTWARE ENGINEERING", 25)).toBe(1);
  });

  it("gives each skill cell 10 u on the 40 u wall, 4 across by 2 down", () => {
    expect(SKILLS_GRID).toEqual({ columns: 4, rows: 2 });
    expect(LOBBY.skillsWall.w / SKILLS_GRID.columns).toBeGreaterThanOrEqual(10);
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
