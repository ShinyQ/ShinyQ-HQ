import { describe, expect, it } from "vitest";
import { boxesOverlap } from "@/experience/fx/labelPlacement";
import { LIBRARY_LABEL_MAX, placeLibraryLabels, TITLE_RANGE, type LibraryLabel } from "@/experience/floors/library/signPlacement";

const box = (x: number, y = 0, w = 100, h = 30) => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const lead = (x: number, distance: number, picked = false): LibraryLabel => ({ kind: "lead", box: box(x), distance, picked });
const spine = (x: number, distance: number, { live = false, picked = false } = {}): LibraryLabel => ({ kind: "spine", box: box(x), distance, live, picked });
const track = (x: number, distance: number): LibraryLabel => ({ kind: "track", box: box(x), distance });
const section = (x: number, distance: number): LibraryLabel => ({ kind: "section", box: box(x), distance });

describe("placeLibraryLabels", () => {
  it("never shows two overlapping labels and keeps the nearer one", () => {
    const shown = placeLibraryLabels([lead(0, 20), lead(50, 5)], { narrow: false });
    expect(shown).toEqual([false, true]);
  });

  it("puts the live spine before track names, track names before lead titles, lead titles before sections", () => {
    expect(placeLibraryLabels([track(0, 1), spine(10, 9, { live: true })], { narrow: false })).toEqual([false, true]);
    expect(placeLibraryLabels([lead(0, 1), track(10, 9)], { narrow: false })).toEqual([false, true]);
    expect(placeLibraryLabels([section(0, 1), lead(10, 9)], { narrow: false })).toEqual([false, true]);
  });

  it("a picked lead or spine wins over the live spine and the track names", () => {
    expect(placeLibraryLabels([spine(0, 1, { live: true }), lead(10, 20, true)], { narrow: false })).toEqual([false, true]);
    expect(placeLibraryLabels([track(0, 1), spine(10, 20, { picked: true })], { narrow: false })).toEqual([false, true]);
  });

  it("shows at most one spine, picked or live", () => {
    const shown = placeLibraryLabels([spine(0, 3, { picked: true }), spine(300, 1, { live: true }), spine(600, 2, { picked: true })], { narrow: false });
    expect(shown.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.spine);
    expect(shown).toEqual([false, false, true]);
  });

  it("never shows a spine that is neither live nor picked", () => {
    expect(placeLibraryLabels([spine(0, 1)], { narrow: false })).toEqual([false]);
  });

  it("caps lead titles at 4 on desktop and 2 on phones, nearest first", () => {
    const many = Array.from({ length: 9 }, (_, i) => lead(i * 200, 9 - i));
    const wide = placeLibraryLabels(many, { narrow: false });
    const narrow = placeLibraryLabels(many, { narrow: true });
    expect(wide.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.lead.wide);
    expect(narrow.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.lead.narrow);
    expect(narrow.slice(7)).toEqual([true, true]);
  });

  it("caps track names and sections at 4", () => {
    const tracks = placeLibraryLabels(Array.from({ length: 6 }, (_, i) => track(i * 200, i)), { narrow: false });
    const sections = placeLibraryLabels(Array.from({ length: 6 }, (_, i) => section(i * 200, i)), { narrow: false });
    expect(tracks.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.track);
    expect(sections.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.section);
  });

  it("hides titles beyond TITLE_RANGE unless picked, and labels without a box", () => {
    expect(placeLibraryLabels([lead(0, TITLE_RANGE + 1), { kind: "section", box: null, distance: 0 }], { narrow: false })).toEqual([false, false]);
    expect(placeLibraryLabels([lead(0, TITLE_RANGE + 1, true)], { narrow: false })).toEqual([true]);
  });

  it("yields to fixed boxes (the end plaza's shown signs and the rover)", () => {
    expect(placeLibraryLabels([lead(0, 1)], { narrow: false, fixed: [box(20)] })).toEqual([false]);
    expect(placeLibraryLabels([spine(0, 1, { live: true })], { narrow: false, fixed: [box(20)] })).toEqual([false]);
  });

  it("shown boxes never overlap, whatever the input", () => {
    const labels: LibraryLabel[] = Array.from({ length: 40 }, (_, i) => ({
      kind: (["section", "track", "lead", "spine"] as const)[i % 4],
      box: box((i * 37) % 400, (i * 53) % 200),
      distance: (i * 7) % 30,
      live: i % 8 === 3,
      picked: i % 5 === 0,
    }));
    const shown = placeLibraryLabels(labels, { narrow: false });
    const boxes = labels.filter((_, i) => shown[i]).map((l) => l.box!);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
  });
});
