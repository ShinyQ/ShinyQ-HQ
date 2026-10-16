import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { signPlate, wrapSign } from "@/experience/fx/signLayout";
import {
  boardList,
  fitTitle,
  LIST_STYLE,
  listChars,
  PANEL,
  panelRows,
  ROAD_SIGN,
  roadSigns,
  textWidth,
  TIER_MARK,
  wallLabels,
  wallLines,
  wallSolids,
  wrapWords,
  type DirectoryLabels,
} from "@/experience/floors/labs/directory";
import { buildLabsLayout, directoryBoard, LABS, LABS_WINGS, tourOrder, wallPosts, WING_TINT } from "@/experience/floors/labs/layout";

const NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const FONTS = { mono: "/fonts/mono.woff", monoBold: "/fonts/mono-bold.woff", sansBold: "/fonts/sans-bold.woff" };
const WINGS = LABS_WINGS;

function setup(locale: "en" | "id") {
  const data = buildExperienceData(locale, NAMES);
  const labels: DirectoryLabels = { wings: data.labs.wings, directory: "Directory", open: "Open the full list", count: (n) => `${n} projects` };
  return { pods: data.labs.pods, labels };
}

describe("L3 directory wall content (owner request 2026-10-13)", () => {
  it("fits five two-line entries between the title block and the footer", () => {
    const rows = panelRows();
    expect(rows.titleTop).toBeLessThan(LABS.board.h);
    expect(rows.listTop).toBeLessThan(rows.subTop - PANEL.sub.size);
    expect(rows.listBottom).toBeGreaterThanOrEqual(LABS.board.base);
    expect(rows.listBottom).toBeGreaterThan(LABS.board.base + PANEL.footer.y + PANEL.footer.size);
    expect(rows.listLines).toBeGreaterThanOrEqual(LABS.boardEntries * PANEL.list.perEntry);
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
    it(`lists each wing's top five docked pods in docking order, two lines at most each (${locale})`, () => {
      const { pods } = setup(locale);
      for (const wing of WINGS) {
        const inWing = pods.filter((p) => p.wing === wing);
        const top = tourOrder(inWing).slice(0, LABS.boardEntries);
        const list = boardList(inWing, panelRows().listLines);
        expect(list.entries, wing).toBe(top.length);
        const lines = list.text.split("\n");
        expect(lines).toHaveLength(list.lines);
        expect(list.lines).toBeLessThanOrEqual(Math.min(panelRows().listLines, top.length * PANEL.list.perEntry));
        for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(listChars());
        const heads = lines.filter((l) => Object.values(TIER_MARK).some((mark) => l.startsWith(`${mark} `)));
        expect(heads).toHaveLength(top.length);
        heads.forEach((head, i) => expect(head.slice(2).split(" ")[0]).toBe(top[i].title.split(" ")[0]));
      }
    });
  }

  it("puts the same four texts on both faces of each board; the west faces read left to right for the arrival camera", () => {
    const { pods, labels } = setup("en");
    const texts = wallLabels(pods, labels, FONTS);
    expect(texts).toHaveLength(WINGS.length * 2 * 4);
    for (const wing of WINGS) {
      const b = directoryBoard(wing);
      const mine = texts.filter((t) => Math.abs(t.position[2] - b.center.z) <= (b.maxZ - b.minZ) / 2);
      expect(mine, wing).toHaveLength(8);
      for (const t of mine) {
        expect(t.position[1], t.text).toBeGreaterThanOrEqual(LABS.board.base);
        expect(t.position[1], t.text).toBeLessThanOrEqual(LABS.board.h);
      }
      const west = mine.filter((t) => t.yaw === -Math.PI / 2);
      const east = mine.filter((t) => t.yaw === Math.PI / 2);
      expect(west).toHaveLength(4);
      expect(east).toHaveLength(4);
      expect(west.map((t) => t.text)).toEqual(east.map((t) => t.text));
      expect(west[0].text).toBe(fitTitle(labels.wings[wing], textWidth()).lines.join("\n"));
      expect(west[0].color).toBe(WING_TINT[wing]);
      for (const t of west) {
        expect(t.position[0]).toBeLessThan(b.minX);
        // Yaw -PI/2 turns the text's front to -x (the camera west of the wall) and its reading direction
        // (cos yaw, -sin yaw) to +z, which is screen right for a camera looking east: never mirrored.
        expect(Math.cos(t.yaw!)).toBeCloseTo(0);
        expect(-Math.sin(t.yaw!)).toBeCloseTo(1);
      }
      for (const t of east) expect(t.position[0]).toBeGreaterThan(b.maxX);
    }
    // The gate over the spine names the Data and ML wing on both faces.
    const gate = directoryBoard("data");
    const titles = texts.filter((t) => Math.abs(t.position[2] - gate.center.z) < 1e-9 && t.color === WING_TINT.data && t.anchorY === "top" && t.textAlign === "center" && t.fontSize >= PANEL.sub.size * 1.5);
    expect(titles).toHaveLength(2);
    for (const t of titles) expect(t.text.replace(/\n/g, " ")).toBe(labels.wings.data.toUpperCase());
  });

  it("raises three boards on four posts, with rims, post edges and title underlines in the wing tints", () => {
    const boards = WINGS.map((wing) => {
      const b = directoryBoard(wing);
      return { x: b.center.x, y: LABS.board.base, z: b.center.z, w: LABS.board.w, h: LABS.board.h - LABS.board.base, d: b.maxZ - b.minZ };
    });
    const posts = wallPosts().map((p) => ({ x: (p.minX + p.maxX) / 2, y: 0, z: (p.minZ + p.maxZ) / 2, w: p.maxX - p.minX, h: LABS.board.base, d: p.maxZ - p.minZ }));
    expect(posts).toHaveLength(4);
    expect(wallSolids()).toEqual([...boards, ...posts]);
    const lines = wallLines();
    expect(lines).toHaveLength(WINGS.length * (12 + 2) + 4 * 4);
    // Outer posts carry their wing's tint, the two gate posts the Data and ML tint.
    expect(lines.filter((l) => l.color === WING_TINT.software)).toHaveLength(14 + 4);
    expect(lines.filter((l) => l.color === WING_TINT.ai)).toHaveLength(14 + 4);
    expect(lines.filter((l) => l.color === WING_TINT.data)).toHaveLength(14 + 8);
    const y = panelRows().underline;
    expect(lines.filter((l) => l.seg[1] === y && l.seg[4] === y)).toHaveLength(6);
    for (const l of lines) {
      expect(Math.min(l.seg[1], l.seg[4])).toBeGreaterThanOrEqual(0);
      expect(Math.max(l.seg[1], l.seg[4])).toBeLessThanOrEqual(LABS.board.h);
    }
  });

  for (const locale of ["en", "id"] as const) {
    it(`uses the layout's fixed boards, the data board listing the data pods (${locale})`, () => {
      const { pods, labels } = setup(locale);
      const layout = buildLabsLayout(pods);
      expect(wallSolids(layout.boards)).toEqual(wallSolids());
      expect(wallLines(layout.boards)).toEqual(wallLines());
      for (const size of ["full", "compact"] as const) {
        expect(wallLabels(pods, labels, FONTS, size, layout.boards)).toEqual(wallLabels(pods, labels, FONTS, size));
        const data = directoryBoard("data");
        const texts = wallLabels(pods, labels, FONTS, size).filter((l) => Math.abs(l.position[2] - data.center.z) <= (data.maxZ - data.minZ) / 2);
        expect(texts, size).toHaveLength(8);
        const top = tourOrder(pods.filter((p) => p.wing === "data")).slice(0, LIST_STYLE[size].entries);
        expect(texts[2].text.split("\n").filter((l) => Object.values(TIER_MARK).some((m) => l.startsWith(`${m} `)))).toHaveLength(top.length);
      }
    });
  }

  it("lists the top three in larger type on phones, every title whole in two lines (coordinator decision 2026-10-13)", () => {
    const compact = LIST_STYLE.compact;
    expect(compact.entries).toBe(3);
    expect(compact.size).toBeGreaterThan(LIST_STYLE.full.size);
    expect(panelRows(compact).listLines).toBeGreaterThanOrEqual(compact.entries * compact.perEntry);
    for (const locale of ["en", "id"] as const) {
      const { pods, labels } = setup(locale);
      for (const wing of WINGS) {
        const inWing = pods.filter((p) => p.wing === wing);
        const top = tourOrder(inWing).slice(0, compact.entries);
        const list = boardList(inWing, panelRows(compact).listLines, compact);
        expect(list.entries, `${locale} ${wing}`).toBe(top.length);
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

describe("L3 road signs (Round 7 G)", () => {
  for (const locale of ["en", "id"] as const) {
    it(`floats one sign per road, upright over its mouth, the plate above the rover (${locale})`, () => {
      const { pods, labels } = setup(locale);
      const layout = buildLabsLayout(pods);
      const specs = roadSigns(layout, labels.wings, FONTS.monoBold);
      expect(specs).toHaveLength(3);
      LABS_WINGS.forEach((wing, i) => {
        const spec = specs[i];
        expect(spec.text).toBe(wrapSign(labels.wings[wing].toUpperCase(), ROAD_SIGN.wrap));
        expect(spec.color).toBe(WING_TINT[wing]);
        expect(spec.fontSize).toBe(ROAD_SIGN.font);
        expect(spec.font).toBe(FONTS.monoBold);
        expect(spec.y - signPlate(spec).h / 2).toBeCloseTo(ROAD_SIGN.y);
        expect(spec.x).toBe(layout.signs[wing].float.x);
        expect(spec.z).toBe(layout.signs[wing].float.z);
        for (const other of LABS_WINGS) {
          const has = spec.text.replace(/\n/g, " ").includes(labels.wings[other].toUpperCase());
          expect(has, `${wing} sign names ${other}`).toBe(other === wing);
        }
      });
    });
  }
});
