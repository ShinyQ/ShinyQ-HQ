import { describe, expect, it } from "vitest";
import { boxesOverlap } from "@/experience/fx/labelPlacement";
import { LIBRARY_LABEL_MAX, placeLibraryLabels, TITLE_RANGE, type LibraryLabel } from "@/experience/floors/library/signPlacement";

const box = (x: number, y = 0, w = 100, h = 30) => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const title = (x: number, distance: number, picked = false): LibraryLabel => ({ kind: "title", box: box(x), distance, picked });

describe("placeLibraryLabels", () => {
  it("never shows two overlapping labels and keeps the nearer one", () => {
    const shown = placeLibraryLabels([title(0, 20), title(50, 5)], { narrow: false });
    expect(shown).toEqual([false, true]);
  });

  it("puts sections before years before titles", () => {
    const shown = placeLibraryLabels(
      [title(0, 1), { kind: "year", box: box(10), distance: 9 }, { kind: "section", box: box(20), distance: 30 }],
      { narrow: false },
    );
    expect(shown).toEqual([false, false, true]);
  });

  it("a picked title wins over a section", () => {
    expect(placeLibraryLabels([{ kind: "section", box: box(0), distance: 1 }, title(10, 20, true)], { narrow: false })).toEqual([false, true]);
  });

  it("caps titles at 6 on desktop and 4 on phones, nearest first", () => {
    const many = Array.from({ length: 9 }, (_, i) => title(i * 200, 9 - i));
    const wide = placeLibraryLabels(many, { narrow: false });
    const narrow = placeLibraryLabels(many, { narrow: true });
    expect(wide.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.title.wide);
    expect(narrow.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.title.narrow);
    expect(narrow.slice(5)).toEqual([true, true, true, true]);
  });

  it("hides titles beyond TITLE_RANGE and labels without a box", () => {
    expect(placeLibraryLabels([title(0, TITLE_RANGE + 1), { kind: "section", box: null, distance: 0 }], { narrow: false })).toEqual([false, false]);
  });

  it("yields to fixed boxes (the end plaza's shown signs)", () => {
    expect(placeLibraryLabels([title(0, 1)], { narrow: false, fixed: [box(20)] })).toEqual([false]);
  });

  it("shown boxes never overlap, whatever the input", () => {
    const labels: LibraryLabel[] = Array.from({ length: 40 }, (_, i) => ({
      kind: (["section", "year", "title"] as const)[i % 3],
      box: box((i * 37) % 400, (i * 53) % 200),
      distance: (i * 7) % 30,
    }));
    const shown = placeLibraryLabels(labels, { narrow: false });
    const boxes = labels.filter((_, i) => shown[i]).map((l) => l.box!);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
  });
});
