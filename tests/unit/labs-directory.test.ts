import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { boxBuffers } from "@/experience/floors/roof/solids";
import {
  boardList,
  fitTitle,
  LIST_STYLE,
  listChars,
  PANEL,
  panelRows,
  textWidth,
  TIER_MARK,
  wallLabels,
  wallLines,
  wallSolids,
  wrapWords,
  type DirectoryLabels,
} from "@/experience/floors/labs/directory";
import { buildLabsLayout, directoryBoard, LABS, LABS_WINGS, tourOrder, wallPosts, WING_TINT, type DirectoryBoard } from "@/experience/floors/labs/layout";
import type { BatchedLabel } from "@/experience/fx/labelProps";
import type { Rect, Vec2 } from "@/experience/types";

const NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const FONTS = { mono: "/fonts/mono.woff", monoBold: "/fonts/mono-bold.woff", sansBold: "/fonts/sans-bold.woff" };
const WINGS = LABS_WINGS;

/** Entries a list of `lines` lines always holds: every entry takes at most `perEntry` lines. */
const minEntries = (top: number, lines: number, perEntry: number) => Math.min(top, Math.floor(lines / perEntry));
const along = (b: DirectoryBoard, p: Vec2) => (p.x - b.center.x) * b.along.x + (p.z - b.center.z) * b.along.z;
const off = (b: DirectoryBoard, p: Vec2) => (p.x - b.center.x) * b.normal.x + (p.z - b.center.z) * b.normal.z;
/** The texts standing on one board (both faces). */
const onBoard = (texts: readonly BatchedLabel[], b: DirectoryBoard) => texts.filter((t) => Math.hypot(t.position[0] - b.center.x, t.position[2] - b.center.z) <= LABS.board.width / 2 + 0.5);
const inside = (r: Rect, x: number, z: number) => x >= r.minX - 1e-5 && x <= r.maxX + 1e-5 && z >= r.minZ - 1e-5 && z <= r.maxZ + 1e-5;

function setup(locale: "en" | "id") {
  const data = buildExperienceData(locale, NAMES);
  const labels: DirectoryLabels = { wings: data.labs.wings, directory: "Directory", open: "Open the full list", count: (n) => `${n} projects` };
  return { pods: data.labs.pods, labels };
}

describe("L3 directory wall content (owner request 2026-10-13)", () => {
  it("fits the list between the title block and the footer, two entries at least on every size", () => {
    for (const style of [LIST_STYLE.full, LIST_STYLE.compact]) {
      const rows = panelRows(style);
      expect(rows.titleTop).toBeLessThan(LABS.board.h);
      expect(rows.listTop).toBeLessThan(rows.subTop - PANEL.sub.size);
      expect(rows.listBottom).toBeGreaterThanOrEqual(LABS.board.base);
      expect(rows.listBottom).toBeGreaterThan(LABS.board.base + PANEL.footer.y + PANEL.footer.size);
      expect(rows.listTop - rows.listLines * style.size * style.lineHeight).toBeGreaterThanOrEqual(rows.listBottom - 1e-9);
      expect(rows.listLines).toBeGreaterThanOrEqual(2 * style.perEntry);
    }
    expect(textWidth()).toBeCloseTo(LABS.board.width - 2 * PANEL.inset, 12);
  });

  it("sets the titles about 25 percent and the lists about 20 percent smaller (owner request Round 7)", () => {
    expect(PANEL.title.size).toBeCloseTo(0.8 * 0.75);
    expect(PANEL.list.size).toBeCloseTo(0.46 * 0.8, 2);
    expect(LIST_STYLE.compact.size).toBeCloseTo(0.56 * 0.8, 2);
  });

  it("wraps on word boundaries, the first line shorter to leave room for the tier mark", () => {
    expect(wrapWords("Serupa Ticket Hub: Event Ticketing Platform", 23, 25)).toEqual(["Serupa Ticket Hub:", "Event Ticketing Platform"]);
    expect(wrapWords("Supercalifragilistic", 5)).toEqual(["Supercalifragilistic"]);
    expect(wrapWords("  a  b ", 10)).toEqual(["a b"]);
  });

  it("gives both wing names the same two-line title, uppercase, from messages", () => {
    expect(fitTitle("Product Engineering", textWidth())).toEqual({ lines: ["PRODUCT", "ENGINEERING"], size: PANEL.title.size });
    expect(fitTitle("AI Engineering", textWidth())).toEqual({ lines: ["AI", "ENGINEERING"], size: PANEL.title.size });
    expect(fitTitle("Laboratorium", textWidth()).lines).toEqual(["LABORATORIUM"]);
  });

  for (const locale of ["en", "id"] as const) {
    it(`lists each wing's top docked pods in docking order, as many as fit, two lines at most each (${locale})`, () => {
      const { pods } = setup(locale);
      const rows = panelRows();
      for (const wing of WINGS) {
        const inWing = pods.filter((p) => p.wing === wing);
        const top = tourOrder(inWing).slice(0, LABS.boardEntries);
        const list = boardList(inWing, rows.listLines);
        expect(list.entries, wing).toBeLessThanOrEqual(top.length);
        expect(list.entries, wing).toBeGreaterThanOrEqual(minEntries(top.length, rows.listLines, PANEL.list.perEntry));
        const lines = list.text.split("\n");
        expect(lines).toHaveLength(list.lines);
        expect(list.lines).toBeLessThanOrEqual(Math.min(rows.listLines, top.length * PANEL.list.perEntry));
        for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(listChars());
        const heads = lines.filter((l) => Object.values(TIER_MARK).some((mark) => l.startsWith(`${mark} `)));
        expect(heads).toHaveLength(list.entries);
        heads.forEach((head, i) => expect(head.slice(2).split(" ")[0]).toBe(top[i].title.split(" ")[0]));
      }
    });
  }

  it("puts the same four texts on both faces of each board; the front faces read left to right toward the board stop", () => {
    const { pods, labels } = setup("en");
    const texts = wallLabels(pods, labels, FONTS);
    expect(texts).toHaveLength(WINGS.length * 2 * 4);
    for (const wing of WINGS) {
      const b = directoryBoard(wing);
      const mine = onBoard(texts, b);
      expect(mine, wing).toHaveLength(8);
      for (const t of mine) {
        expect(t.position[1], t.text).toBeGreaterThanOrEqual(LABS.board.base);
        expect(t.position[1], t.text).toBeLessThanOrEqual(LABS.board.h);
        const p = { x: t.position[0], z: t.position[2] };
        // PANEL.out off one face, inside the board's span.
        expect(Math.abs(off(b, p)), t.text).toBeCloseTo(LABS.board.w / 2 + PANEL.out, 9);
        expect(Math.abs(along(b, p)), t.text).toBeLessThanOrEqual(LABS.board.width / 2 + 1e-9);
      }
      const front = mine.filter((t) => off(b, { x: t.position[0], z: t.position[2] }) > 0);
      const back = mine.filter((t) => off(b, { x: t.position[0], z: t.position[2] }) < 0);
      expect(front).toHaveLength(4);
      expect(back).toHaveLength(4);
      expect(front.map((t) => t.text)).toEqual(back.map((t) => t.text));
      expect(front[0].text).toBe(fitTitle(labels.wings[wing], textWidth()).lines.join("\n"));
      expect(front[0].color).toBe(WING_TINT[wing]);
      for (const t of front) {
        expect(t.yaw).toBeCloseTo(b.yaw, 12);
        // Text yaw turns its front to (sin yaw, cos yaw) and reads along (cos yaw, -sin yaw): the board's normal and along.
        expect(Math.sin(t.yaw!) * b.normal.x + Math.cos(t.yaw!) * b.normal.z).toBeCloseTo(1, 12);
        expect(Math.cos(t.yaw!) * b.along.x - Math.sin(t.yaw!) * b.along.z).toBeCloseTo(1, 12);
      }
      for (const t of back) expect(t.yaw).toBeCloseTo(b.yaw + Math.PI, 12);
      // The list starts at the left text edge of each face: -along on the back face.
      expect(along(b, { x: front[2].position[0], z: front[2].position[2] })).toBeCloseTo(-textWidth() / 2, 9);
      expect(along(b, { x: back[2].position[0], z: back[2].position[2] })).toBeCloseTo(textWidth() / 2, 9);
    }
    // The gate over the spine names the Data and ML wing on both faces.
    const gate = directoryBoard("data");
    expect(gate.yaw).toBeCloseTo(-Math.PI / 2, 12);
    const titles = onBoard(texts, gate).filter((t) => t.color === WING_TINT.data && t.anchorY === "top" && t.textAlign === "center" && t.fontSize >= PANEL.sub.size * 1.5);
    expect(titles).toHaveLength(2);
    for (const t of titles) expect(t.text.replace(/\n/g, " ")).toBe(labels.wings.data.toUpperCase());
  });

  it("raises three turned boards, the gate on two posts and each side board on a pylon, as solids that match the board geometry", () => {
    const solids = wallSolids();
    expect(solids).toHaveLength(3 + 4);
    const boards = WINGS.map(directoryBoard);
    const posts = wallPosts();
    boards.forEach((b, i) => {
      expect(solids[i]).toEqual({ x: b.center.x, y: LABS.board.base, z: b.center.z, w: LABS.board.w, h: LABS.board.h - LABS.board.base, d: LABS.board.width, yaw: b.yaw + Math.PI / 2 });
    });
    posts.forEach((p, i) => {
      expect(solids[3 + i]).toEqual({ x: p.center.x, y: 0, z: p.center.z, w: p.across, h: LABS.board.base, d: p.along, yaw: directoryBoard(p.wing).yaw + Math.PI / 2 });
    });
    // The merged mesh (roof/solids.ts yaw convention) puts each board's corners where the board's own math does.
    const { positions } = boxBuffers(solids);
    boards.forEach((b, i) => {
      const expected = [-1, 1].flatMap((s) => [-1, 1].map((t) => ({ x: b.center.x + (s * b.along.x * LABS.board.width) / 2 + (t * b.normal.x * LABS.board.w) / 2, z: b.center.z + (s * b.along.z * LABS.board.width) / 2 + (t * b.normal.z * LABS.board.w) / 2 })));
      for (let v = 0; v < 24; v++) {
        const [x, , z] = positions.slice((i * 24 + v) * 3, (i * 24 + v) * 3 + 3);
        expect(expected.some((c) => Math.abs(c.x - x) < 1e-4 && Math.abs(c.z - z) < 1e-4), `${WINGS[i]} vertex ${v}`).toBe(true);
        expect(inside(b, x, z), `${WINGS[i]} vertex ${v}`).toBe(true);
      }
    });
    posts.forEach((p, i) => {
      for (let v = 0; v < 24; v++) {
        const k = ((3 + i) * 24 + v) * 3;
        expect(inside(p.rect, positions[k], positions[k + 2]), `post ${i} vertex ${v}`).toBe(true);
      }
    });
  });

  it("draws each board's 12 rim edges and two title underlines in its tint, and four vertical edges per post", () => {
    const lines = wallLines();
    expect(lines).toHaveLength(WINGS.length * (12 + 2) + 4 * 4);
    // Pylons carry their wing's tint, the two gate posts the Data and ML tint.
    expect(lines.filter((l) => l.color === WING_TINT.software)).toHaveLength(14 + 4);
    expect(lines.filter((l) => l.color === WING_TINT.ai)).toHaveLength(14 + 4);
    expect(lines.filter((l) => l.color === WING_TINT.data)).toHaveLength(14 + 8);
    const y = panelRows().underline;
    const underlines = lines.filter((l) => l.seg[1] === y && l.seg[4] === y);
    expect(underlines).toHaveLength(6);
    WINGS.forEach((wing, i) => {
      const b = directoryBoard(wing);
      const own = lines.slice(i * 14, i * 14 + 14);
      for (const l of own) {
        expect(l.color).toBe(WING_TINT[wing]);
        for (const [x, yy, z] of [l.seg.slice(0, 3), l.seg.slice(3)]) {
          expect(yy).toBeGreaterThanOrEqual(LABS.board.base - 1e-9);
          expect(yy).toBeLessThanOrEqual(LABS.board.h + 1e-9);
          expect(inside({ minX: b.minX - PANEL.out, maxX: b.maxX + PANEL.out, minZ: b.minZ - PANEL.out, maxZ: b.maxZ + PANEL.out }, x, z), `${wing} ${l.seg}`).toBe(true);
        }
      }
      // The underlines run along each face, PANEL.out off it, as wide as the text.
      for (const l of own.slice(12)) {
        const a = { x: l.seg[0], z: l.seg[2] };
        const e = { x: l.seg[3], z: l.seg[5] };
        expect(Math.abs(off(b, a))).toBeCloseTo(LABS.board.w / 2 + PANEL.out, 9);
        expect(Math.abs(off(b, e))).toBeCloseTo(LABS.board.w / 2 + PANEL.out, 9);
        expect(Math.hypot(e.x - a.x, e.z - a.z)).toBeCloseTo(textWidth(), 9);
      }
    });
    const postLines = lines.slice(WINGS.length * 14);
    wallPosts().forEach((p, i) => {
      for (const l of postLines.slice(i * 4, i * 4 + 4)) {
        expect(l.color).toBe(WING_TINT[p.wing]);
        expect(l.seg[0]).toBeCloseTo(l.seg[3], 12);
        expect(l.seg[2]).toBeCloseTo(l.seg[5], 12);
        expect([l.seg[1], l.seg[4]]).toEqual([0, LABS.board.base]);
        expect(inside(p.rect, l.seg[0], l.seg[2])).toBe(true);
      }
    });
  });

  for (const locale of ["en", "id"] as const) {
    it(`uses the layout's fixed boards, the data board listing the data pods (${locale})`, () => {
      const { pods, labels } = setup(locale);
      const layout = buildLabsLayout(pods);
      expect(wallSolids(layout.boards)).toEqual(wallSolids());
      expect(wallLines(layout.boards)).toEqual(wallLines());
      for (const size of ["full", "compact"] as const) {
        expect(wallLabels(pods, labels, FONTS, size, layout.boards)).toEqual(wallLabels(pods, labels, FONTS, size));
        const texts = onBoard(wallLabels(pods, labels, FONTS, size), directoryBoard("data"));
        expect(texts, size).toHaveLength(8);
        const style = LIST_STYLE[size];
        const top = tourOrder(pods.filter((p) => p.wing === "data")).slice(0, style.entries);
        const heads = texts[2].text.split("\n").filter((l) => Object.values(TIER_MARK).some((m) => l.startsWith(`${m} `)));
        expect(heads.length, size).toBeLessThanOrEqual(top.length);
        expect(heads.length, size).toBeGreaterThanOrEqual(minEntries(top.length, panelRows(style).listLines, style.perEntry));
      }
    });
  }

  it("lists the top three in larger type on phones, every title whole in two lines (coordinator decision 2026-10-13)", () => {
    const compact = LIST_STYLE.compact;
    const lines = panelRows(compact).listLines;
    expect(compact.entries).toBe(3);
    expect(compact.size).toBeGreaterThan(LIST_STYLE.full.size);
    for (const locale of ["en", "id"] as const) {
      const { pods, labels } = setup(locale);
      for (const wing of WINGS) {
        const inWing = pods.filter((p) => p.wing === wing);
        const top = tourOrder(inWing).slice(0, compact.entries);
        const list = boardList(inWing, lines, compact);
        expect(list.entries, `${locale} ${wing}`).toBeLessThanOrEqual(top.length);
        expect(list.entries, `${locale} ${wing}`).toBeGreaterThanOrEqual(minEntries(top.length, lines, compact.perEntry));
        // The data titles are longer than two lines at any phone size; they shorten with "...".
        if (wing !== "data") expect(list.text, `${locale} ${wing}`).not.toContain("...");
        for (const line of list.text.split("\n")) expect(line.length, line).toBeLessThanOrEqual(listChars(compact));
      }
      const texts = wallLabels(pods, labels, FONTS, "compact");
      const lists = texts.filter((t) => t.fontSize === compact.size);
      expect(lists).toHaveLength(WINGS.length * 2);
      for (const t of lists) expect(t.lineHeight).toBe(compact.lineHeight);
    }
  });
});
