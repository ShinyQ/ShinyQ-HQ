import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
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
import { buildLabsLayout, directoryBoard, LABS, tourOrder, WING_TINT } from "@/experience/floors/labs/layout";

const NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const FONTS = { mono: "/fonts/mono.woff", monoBold: "/fonts/mono-bold.woff", sansBold: "/fonts/sans-bold.woff" };
const WINGS = ["software", "ai"] as const;

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
    expect(rows.listBottom).toBeGreaterThan(PANEL.footer.y + PANEL.footer.size);
    expect(rows.listLines).toBeGreaterThanOrEqual(LABS.boardEntries * PANEL.list.perEntry);
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

  it("puts the same four texts on both faces of each panel; the west faces read left to right for the arrival camera", () => {
    const { pods, labels } = setup("en");
    const texts = wallLabels(pods, labels, FONTS);
    expect(texts).toHaveLength(WINGS.length * 2 * 4);
    for (const wing of WINGS) {
      const b = directoryBoard(wing);
      const mine = texts.filter((t) => Math.abs(t.position[2] - b.center.z) <= LABS.board.d / 2);
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
  });

  it("draws both panels as two solids, with rims and title underlines in the wing tints", () => {
    expect(wallSolids()).toEqual(
      WINGS.map((wing) => {
        const b = directoryBoard(wing);
        return { x: b.center.x, y: 0, z: b.center.z, w: LABS.board.w, h: LABS.board.h, d: LABS.board.d };
      }),
    );
    const lines = wallLines();
    expect(lines).toHaveLength(WINGS.length * (12 + 2));
    for (const wing of WINGS) expect(lines.filter((l) => l.color === WING_TINT[wing])).toHaveLength(14);
    const y = panelRows().underline;
    expect(lines.filter((l) => l.seg[1] === y && l.seg[4] === y)).toHaveLength(4);
  });

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
        expect(list.text, `${locale} ${wing}`).not.toContain("...");
        for (const line of list.text.split("\n")) expect(line.length, line).toBeLessThanOrEqual(listChars(compact));
      }
      const texts = wallLabels(pods, labels, FONTS, "compact");
      const lists = texts.filter((t) => t.fontSize === compact.size);
      expect(lists).toHaveLength(WINGS.length * 2);
      for (const t of lists) expect(t.lineHeight).toBe(compact.lineHeight);
    }
  });

});

describe("Data and ML directory panel (owner request 2026-10-14)", () => {
  for (const locale of ["en", "id"] as const) {
    it(`stands a third panel past the data plaza, amber, listing the data pods (${locale})`, () => {
      const { pods, labels } = setup(locale);
      const layout = buildLabsLayout(pods);
      const data = layout.boards.data!;
      expect(data).toBeDefined();
      expect(wallSolids(layout.boards)).toHaveLength(3);
      expect(wallSolids(layout.boards)[2]).toMatchObject({ x: data.center.x, z: data.center.z, h: LABS.board.h });
      const lines = wallLines(layout.boards);
      expect(lines.filter((l) => l.color === WING_TINT.data)).toHaveLength(14);
      for (const size of ["full", "compact"] as const) {
        const texts = wallLabels(pods, labels, FONTS, size, layout.boards).filter((l) => Math.abs(l.position[0] - data.center.x) < 1);
        // Four texts on each face.
        expect(texts, size).toHaveLength(8);
        expect(texts[0].text).toBe(fitTitle(labels.wings.data, textWidth()).lines.join("\n"));
        expect(texts[0].color).toBe(WING_TINT.data);
        const dataPods = pods.filter((p) => p.wing === "data");
        const top = tourOrder(dataPods).slice(0, LIST_STYLE[size].entries);
        expect(texts[2].text.split("\n").filter((l) => Object.values(TIER_MARK).some((m) => l.startsWith(`${m} `)))).toHaveLength(top.length);
      }
      // The hub pair is unchanged by the third panel.
      expect(wallSolids(layout.boards).slice(0, 2)).toEqual(wallSolids());
      expect(wallLabels(pods, labels, FONTS, "full", layout.boards).slice(0, 16)).toEqual(wallLabels(pods, labels, FONTS));
    });
  }
});
