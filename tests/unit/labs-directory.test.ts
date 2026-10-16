import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { boxBuffers } from "@/experience/floors/roof/solids";
import {
  boardList,
  fitTitle,
  LIST_STYLE,
  listWidthEm,
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
import { interWidth } from "@/experience/fx/interWidth";
import type { LabPod, Rect, Vec2 } from "@/experience/types";

const NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const FONTS = { mono: "/fonts/mono.woff", monoBold: "/fonts/mono-bold.woff", sans: "/fonts/sans.woff", sansBold: "/fonts/sans-bold.woff" };
const WINGS = LABS_WINGS;
const SIZES = ["full", "compact"] as const;
const MONO_EM = 0.6;
const MARKS = Object.values(TIER_MARK);

const along = (b: DirectoryBoard, p: Vec2) => (p.x - b.center.x) * b.along.x + (p.z - b.center.z) * b.along.z;
const off = (b: DirectoryBoard, p: Vec2) => (p.x - b.center.x) * b.normal.x + (p.z - b.center.z) * b.normal.z;
/** The texts standing on one board (both faces). */
const onBoard = (texts: readonly BatchedLabel[], b: DirectoryBoard) => texts.filter((t) => Math.hypot(t.position[0] - b.center.x, t.position[2] - b.center.z) <= LABS.board.width / 2 + 0.5);
const inside = (r: Rect, x: number, z: number) => x >= r.minX - 1e-5 && x <= r.maxX + 1e-5 && z >= r.minZ - 1e-5 && z <= r.maxZ + 1e-5;
const shown = (p: LabPod) => p.shortTitle ?? p.title;

function setup(locale: "en" | "id") {
  const data = buildExperienceData(locale, NAMES);
  const more = locale === "en" ? (n: number) => `+${n} more` : (n: number) => `+${n} lainnya`;
  const open = locale === "en" ? "Open the full list" : "Buka daftar lengkap";
  const labels: DirectoryLabels = { wings: data.labs.wings, directory: "Directory", open, count: (n) => `${n} projects`, more };
  return { pods: data.labs.pods, labels };
}

describe("L3 directory wall content (owner request 2026-10-13, clean board text 2026-10-16)", () => {
  it("keeps the list between the underline block and the footer, with a line for every entry in both styles", () => {
    const full = panelRows(LIST_STYLE.full);
    expect(full.titleTop).toBeCloseTo(9.2, 9);
    expect(full.underline).toBeCloseTo(8.38, 9);
    expect(full.subTop).toBeCloseTo(8.16, 9);
    expect(full.listTop).toBeCloseTo(7.54, 9);
    expect(full.listBottom).toBeCloseTo(4.35, 9);
    for (const size of SIZES) {
      const style = LIST_STYLE[size];
      const rows = panelRows(style);
      expect(rows.titleTop).toBeLessThan(LABS.board.h);
      expect(rows.listTop).toBeLessThan(rows.subTop - PANEL.sub.size);
      expect(rows.listBottom).toBeGreaterThan(LABS.board.base + PANEL.footer.y + PANEL.footer.size);
      expect(rows.listTop - rows.listLines * style.size * style.lineHeight).toBeGreaterThanOrEqual(rows.listBottom - 1e-9);
      expect(rows.listLines, size).toBeGreaterThanOrEqual(style.entries);
    }
    expect(textWidth()).toBeCloseTo(LABS.board.width - 2 * PANEL.inset, 12);
  });

  it("sets the type: titles 0.6, lists 0.37 at line height 1.45 (phones 0.45 at 1.4), five entries on desktops and three on phones", () => {
    expect(PANEL.title.size).toBe(0.6);
    expect(LIST_STYLE.full).toEqual({ size: 0.37, lineHeight: 1.45, perEntry: 2, entries: 5 });
    expect(LIST_STYLE.compact).toEqual({ size: 0.45, lineHeight: 1.4, perEntry: 2, entries: 3 });
    expect(listWidthEm(LIST_STYLE.full)).toBeCloseTo((textWidth() - PANEL.mark * 0.37) / 0.37, 9);
    expect(listWidthEm(LIST_STYLE.compact)).toBeCloseTo((textWidth() - PANEL.mark * 0.45) / 0.45, 9);
  });

  it("keeps every wing name on one line at the title size, uppercase, from messages; a long name shrinks", () => {
    for (const locale of ["en", "id"] as const) {
      const { labels } = setup(locale);
      for (const wing of WINGS) {
        const name = labels.wings[wing];
        expect(fitTitle(name, textWidth()), `${locale} ${wing}`).toEqual({ text: name.toUpperCase(), size: PANEL.title.size });
        expect(MONO_EM * PANEL.title.size * name.length).toBeLessThanOrEqual(textWidth());
      }
    }
    const long = fitTitle("Laboratorium Rekayasa Perangkat Lunak", textWidth());
    expect(long.text).toBe("LABORATORIUM REKAYASA PERANGKAT LUNAK");
    expect(long.size).toBeLessThan(PANEL.title.size);
    expect(MONO_EM * long.size * long.text.length).toBeCloseTo(textWidth(), 9);
  });

  for (const locale of ["en", "id"] as const) {
    for (const size of SIZES) {
      it(`lists each wing's top projects one line each, whole, marks in their own column (${locale}, ${size})`, () => {
        const { pods } = setup(locale);
        const style = LIST_STYLE[size];
        const rows = panelRows(style);
        const limit = 0.97 * listWidthEm(style);
        for (const wing of WINGS) {
          const inWing = pods.filter((p) => p.wing === wing);
          const top = tourOrder(inWing).slice(0, style.entries);
          const list = boardList(inWing, rows.listLines, style);
          expect(list.entries, wing).toBe(top.length);
          expect(list.more, wing).toBe(inWing.length - list.entries);
          const text = list.text.split("\n");
          const marks = list.marks.split("\n");
          expect(text, wing).toEqual(top.map(shown));
          expect(marks, wing).toEqual(top.map((p) => TIER_MARK[p.tier]));
          expect(list.lines).toBe(top.length);
          for (const line of text) {
            expect(interWidth(line), line).toBeLessThanOrEqual(limit);
            expect(line, line).not.toContain("...");
          }
        }
      });
    }
  }

  it("shows exactly five entries on desktops and three on phones on every wing today", () => {
    const { pods } = setup("en");
    for (const size of SIZES) {
      const style = LIST_STYLE[size];
      for (const wing of WINGS) expect(boardList(pods.filter((p) => p.wing === wing), panelRows(style).listLines, style).entries, `${size} ${wing}`).toBe(style.entries);
    }
  });

  it("wraps a title that still does not fit on word boundaries, two lines at most, ending on a whole word and ...", () => {
    const style = LIST_STYLE.full;
    const limit = 0.97 * listWidthEm(style);
    const words = "Extraordinarily Long Placeholder Title For The Wrapping Fallback That Never Ends Anywhere Soon Enough Today".split(" ");
    const pod = (slug: string, title: string, tier: LabPod["tier"]): LabPod => ({ slug, title, tier, wing: "software" }) as LabPod;
    const list = boardList([pod("a", words.join(" "), "hero"), pod("b", "Short One", "featured")], 5, style);
    const text = list.text.split("\n");
    const marks = list.marks.split("\n");
    expect(marks).toHaveLength(text.length);
    expect(marks).toEqual([TIER_MARK.hero, "\u00A0", TIER_MARK.featured]);
    expect(list.lines).toBe(3);
    expect(text[2]).toBe("Short One");
    expect(text[1].endsWith("...")).toBe(true);
    for (const line of text) expect(interWidth(line), line).toBeLessThanOrEqual(limit);
    // Whole words only: both lines rejoin into a prefix of the title.
    const joined = `${text[0]} ${text[1].slice(0, -3)}`;
    expect(words.join(" ").startsWith(joined)).toBe(true);
    expect(wrapWords(words.join(" "), limit).every((l) => interWidth(l) <= limit || !l.includes(" "))).toBe(true);
    // A list too short for every entry stops before the entry that would not fit.
    expect(boardList([pod("a", words.join(" "), "hero"), pod("b", "Short One", "featured")], 2, style).entries).toBe(1);
  });

  it("puts the same five texts on both faces of each board; the front faces read left to right toward the board stop", () => {
    for (const locale of ["en", "id"] as const) {
      const { pods, labels } = setup(locale);
      for (const size of SIZES) {
        const style = LIST_STYLE[size];
        const texts = wallLabels(pods, labels, FONTS, size);
        expect(texts).toHaveLength(WINGS.length * 2 * 5);
        for (const wing of WINGS) {
          const b = directoryBoard(wing);
          const mine = onBoard(texts, b);
          expect(mine, wing).toHaveLength(10);
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
          expect(front).toHaveLength(5);
          expect(back).toHaveLength(5);
          expect(front.map((t) => t.text)).toEqual(back.map((t) => t.text));
          const [title, sub, marks, list, footer] = front;
          const inWing = pods.filter((p) => p.wing === wing);
          const rows = panelRows(style);
          const listed = boardList(inWing, rows.listLines, style);
          expect(title.text).toBe(labels.wings[wing].toUpperCase());
          expect(title.font).toBe(FONTS.monoBold);
          expect(title.color).toBe(WING_TINT[wing]);
          expect(sub.font).toBe(FONTS.mono);
          expect(sub.color).toBe("#a1a1aa");
          expect(sub.fontSize).toBe(PANEL.sub.size);
          expect(marks.text).toBe(listed.marks);
          expect(list.text).toBe(listed.text);
          for (const t of [marks, list]) {
            expect(t.font).toBe(FONTS.sans);
            expect(t.fontSize).toBe(style.size);
            expect(t.lineHeight).toBe(style.lineHeight);
            expect(t.anchorX).toBe("left");
            expect(t.position[1]).toBeCloseTo(rows.listTop, 9);
          }
          expect(marks.color).toBe("#8b8b94");
          expect(list.color).toBe("#c4c4cc");
          const more = inWing.length - listed.entries;
          expect(footer.text).toBe(`\u25B8 ${labels.open.toUpperCase()}${more > 0 ? ` \u00B7 ${labels.more(more).toUpperCase()}` : ""}`);
          expect(footer.font).toBe(FONTS.monoBold);
          expect(footer.color).toBe(WING_TINT[wing]);
          expect(footer.fontSize).toBe(PANEL.footer.size);
          expect(MONO_EM * PANEL.footer.size * footer.text.length).toBeLessThanOrEqual(textWidth());
          for (const t of front) {
            expect(t.yaw).toBeCloseTo(b.yaw, 12);
            // Text yaw turns its front to (sin yaw, cos yaw) and reads along (cos yaw, -sin yaw): the board's normal and along.
            expect(Math.sin(t.yaw!) * b.normal.x + Math.cos(t.yaw!) * b.normal.z).toBeCloseTo(1, 12);
            expect(Math.cos(t.yaw!) * b.along.x - Math.sin(t.yaw!) * b.along.z).toBeCloseTo(1, 12);
          }
          for (const t of back) expect(t.yaw).toBeCloseTo(b.yaw + Math.PI, 12);
          // The marks start at the left text edge of each face (-along on the back face), the list PANEL.mark list em right of them.
          const markAt = textWidth() / 2;
          const listAt = textWidth() / 2 - PANEL.mark * style.size;
          expect(along(b, { x: front[2].position[0], z: front[2].position[2] })).toBeCloseTo(-markAt, 9);
          expect(along(b, { x: front[3].position[0], z: front[3].position[2] })).toBeCloseTo(-listAt, 9);
          expect(along(b, { x: back[2].position[0], z: back[2].position[2] })).toBeCloseTo(markAt, 9);
          expect(along(b, { x: back[3].position[0], z: back[3].position[2] })).toBeCloseTo(listAt, 9);
        }
      }
    }
  });

  it("reads +N more on the footer of every wing today (more projects than entries)", () => {
    const { pods, labels } = setup("en");
    const texts = wallLabels(pods, labels, FONTS, "full");
    for (const wing of WINGS) {
      const footer = onBoard(texts, directoryBoard(wing))[4];
      expect(footer.text, wing).toMatch(/^\u25B8 OPEN THE FULL LIST \u00B7 \+\d+ MORE$/);
    }
    // The gate over the spine names the Data and ML wing on both faces.
    const gate = directoryBoard("data");
    expect(gate.yaw).toBeCloseTo(-Math.PI / 2, 12);
    const titles = onBoard(texts, gate).filter((t) => t.color === WING_TINT.data && t.fontSize === PANEL.title.size);
    expect(titles).toHaveLength(2);
    for (const t of titles) expect(t.text).toBe(labels.wings.data.toUpperCase());
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
      for (const size of SIZES) {
        expect(wallLabels(pods, labels, FONTS, size, layout.boards)).toEqual(wallLabels(pods, labels, FONTS, size));
        const texts = onBoard(wallLabels(pods, labels, FONTS, size), directoryBoard("data"));
        expect(texts, size).toHaveLength(10);
        const top = tourOrder(pods.filter((p) => p.wing === "data")).slice(0, LIST_STYLE[size].entries);
        expect(texts[3].text.split("\n"), size).toEqual(top.map(shown));
        expect(texts[2].text.split("\n").every((m) => MARKS.includes(m)), size).toBe(true);
      }
    });
  }
});
