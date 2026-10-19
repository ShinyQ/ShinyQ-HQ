import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageViewer, pageSrcSet, type PageViewerLabels } from "@/components/docs/PageViewer";
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

describe("PageViewer page images", () => {
  const text = () => "x";
  const labels: PageViewerLabels = {
    toolbar: "t",
    zoom: "z",
    zoomIn: "+",
    zoomOut: "-",
    fit: "f",
    pageOf: text,
    pageAlt: (n, total) => `CV page ${n} of ${total}`,
    region: "r",
    download: "d",
    openTab: "o",
    external: "e",
    fallback: "fb",
    hint: "h",
  };
  const imgs = (variant: "page" | "modal") =>
    [...renderToStaticMarkup(<PageViewer variant={variant} pages={CV_PAGES} pdf="/cv/a.pdf" downloadName="a.pdf" labels={labels} testPrefix="cv" />).matchAll(/<img [^>]*>/g)].map((m) => m[0]);

  it("loads page 1 eagerly (high priority on the /cv page, it is the LCP) and every later page lazily", () => {
    expect(CV_PAGES.length).toBeGreaterThan(1);
    for (const variant of ["page", "modal"] as const) {
      const [first, ...rest] = imgs(variant);
      expect(first, variant).toContain('loading="eager"');
      expect(first, variant).toContain('decoding="async"');
      if (variant === "page") expect(first).toContain('fetchPriority="high"');
      else expect(first).not.toContain("fetchPriority");
      expect(rest).toHaveLength(CV_PAGES.length - 1);
      for (const img of rest) {
        expect(img, variant).toContain('loading="lazy"');
        expect(img, variant).toContain('decoding="async"');
        expect(img, variant).not.toContain("fetchPriority");
      }
    }
  });
});
