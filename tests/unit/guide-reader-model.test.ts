import { describe, expect, it } from "vitest";
import { GUIDE_PAGE_KEY } from "@/content/guides";
import { canvasScale, clampPage, nextZoom, readerKey, releasable, renderWindow, savedPage, savePage, ZOOM_STEPS } from "@/components/guides/reader-model";

describe("guide reader model", () => {
  it("snaps zoom to the next step either way and stops at the ends", () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(1.13, 1)).toBe(1.25);
    expect(nextZoom(1.13, -1)).toBe(1.1);
    expect(nextZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1)).toBe(3);
    expect(nextZoom(0.5, -1)).toBe(0.5);
    expect(nextZoom(9, 1)).toBe(3);
    expect(nextZoom(0.1, -1)).toBe(0.5);
  });

  it("clamps a page to 1..count and treats NaN as page 1", () => {
    expect(clampPage(Number.NaN, 10)).toBe(1);
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-3, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(4.6, 10)).toBe(5);
    expect(clampPage(Number.POSITIVE_INFINITY, 10)).toBe(10);
    expect(clampPage(3, 0)).toBe(1);
  });

  it("pads the visible pages by the margin, merges overlaps and stays inside the document", () => {
    expect(renderWindow([5], 10)).toEqual([4, 5, 6]);
    expect(renderWindow([1], 10)).toEqual([1, 2]);
    expect(renderWindow([10], 10)).toEqual([9, 10]);
    expect(renderWindow([6, 4, 5], 10)).toEqual([3, 4, 5, 6, 7]);
    expect(renderWindow([2, 8], 10, 2)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
    expect(renderWindow([], 10)).toEqual([]);
    expect(renderWindow([12], 10)).toEqual([]);
  });

  it("releases drawn pages farther than `keep` from the current page", () => {
    expect(releasable([1, 2, 3, 8, 9, 14], 9)).toEqual([1, 2, 3, 14]);
    expect(releasable([5, 6, 7], 6)).toEqual([]);
    expect(releasable([1, 10], 5, 4)).toEqual([10]);
    expect(releasable([1, 9], 5, 4)).toEqual([]);
  });

  it("scales to the css width and caps the device ratio at 2 and the long side at 4096", () => {
    expect(canvasScale(595, 595, 1)).toEqual({ scale: 1, ratio: 1 });
    expect(canvasScale(595, 595, 3)).toEqual({ scale: 1, ratio: 2 });
    const big = canvasScale(2400, 600, 2, 4096, 800);
    expect(big.scale).toBe(4);
    expect(800 * big.scale * big.ratio).toBeLessThanOrEqual(4096);
    expect(big.ratio).toBeCloseTo(4096 / 3200);
    const huge = canvasScale(5000, 500, 2, 4096, 500);
    expect(Math.max(500, 500) * huge.scale * huge.ratio).toBeLessThanOrEqual(4096);
    expect(canvasScale(0, 595, 2).scale).toBeGreaterThan(0);
    expect(canvasScale(595, 595, Number.NaN).ratio).toBe(1);
  });

  it("maps reader keys", () => {
    expect(readerKey("PageDown", false)).toBe("next");
    expect(readerKey("ArrowRight", false)).toBe("next");
    expect(readerKey("PageUp", false)).toBe("prev");
    expect(readerKey("ArrowLeft", false)).toBe("prev");
    expect(readerKey(" ", false)).toBe("next");
    expect(readerKey(" ", true)).toBe("prev");
    expect(readerKey("Home", false)).toBe("first");
    expect(readerKey("End", false)).toBe("last");
    expect(readerKey("+", false)).toBe("zoomIn");
    expect(readerKey("=", false)).toBe("zoomIn");
    expect(readerKey("-", false)).toBe("zoomOut");
    expect(readerKey("0", false)).toBe("fit");
    expect(readerKey("a", false)).toBeNull();
    expect(readerKey("ArrowDown", false)).toBeNull();
  });

  it("reads and writes the saved page, and survives blocked or missing storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(savedPage(storage, "gh-600", 40)).toBe(1);
    savePage(storage, "gh-600", 12);
    expect(store.get(GUIDE_PAGE_KEY("gh-600"))).toBe("12");
    expect(savedPage(storage, "gh-600", 40)).toBe(12);
    expect(savedPage(storage, "gh-600", 8)).toBe(8);
    store.set(GUIDE_PAGE_KEY("gh-600"), "nope");
    expect(savedPage(storage, "gh-600", 40)).toBe(1);
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(savedPage(blocked, "gh-600", 40)).toBe(1);
    expect(() => savePage(blocked, "gh-600", 3)).not.toThrow();
    expect(savedPage(null, "gh-600", 40)).toBe(1);
    expect(() => savePage(null, "gh-600", 3)).not.toThrow();
  });
});
