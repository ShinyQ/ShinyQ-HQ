import { describe, expect, it } from "vitest";
import { pageSrcSet } from "@/components/docs/PageViewer";
import { CV_PAGES } from "@/lib/cv";

describe("pageSrcSet", () => {
  it("lists every CV rendition, smallest first, so a DPR 3 phone can pick the 1200 px page", () => {
    const p = CV_PAGES[0];
    expect(pageSrcSet(p)).toBe(`${p.srcSmall} 800w, ${p.srcMedium} 1200w, ${p.src} 1600w`);
  });

  it("keeps two candidates without a medium rendition (paper pages) and none without a small one", () => {
    expect(pageSrcSet({ n: 1, src: "/a.webp", width: 1600, height: 2000, srcSmall: "/a-800.webp", widthSmall: 800 })).toBe("/a-800.webp 800w, /a.webp 1600w");
    expect(pageSrcSet({ n: 1, src: "/a.webp", width: 1600, height: 2000 })).toBeUndefined();
  });
});
