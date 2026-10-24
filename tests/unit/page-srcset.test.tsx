import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvCover } from "@/components/cv/CvCover";
import { CV_PAGES } from "@/lib/cv";
import { pageSrcSet } from "@/lib/page-images";

describe("pageSrcSet", () => {
  it("lists every CV rendition, smallest first, so a DPR 3 phone can pick the 1200 px page", () => {
    const p = CV_PAGES[0];
    expect(pageSrcSet(p)).toBe(`${p.srcSmall} 800w, ${p.srcMedium} 1200w, ${p.src} 1600w`);
  });

  it("keeps two candidates without a medium rendition (paper pages) and none without a small one", () => {
    expect(pageSrcSet({ src: "/a.webp", width: 1600, srcSmall: "/a-800.webp", widthSmall: 800 })).toBe("/a-800.webp 800w, /a.webp 1600w");
    expect(pageSrcSet({ src: "/a.webp", width: 1600 })).toBeUndefined();
  });
});

describe("the /cv page cover", () => {
  const html = renderToStaticMarkup(<CvCover labels={{ view: "View CV", download: "Download PDF", pages: "2 pages", coverAlt: "CV page 1 of 2" }} />);
  const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);

  it("shows page 1 only, eagerly with high priority (it is the LCP), with every rendition and a CV page alt", () => {
    expect(imgs).toHaveLength(1);
    const [img] = imgs;
    expect(img).toContain(`src="${CV_PAGES[0].src}"`);
    expect(img).toContain(`srcSet="${pageSrcSet(CV_PAGES[0])}"`);
    expect(img).toContain('loading="eager"');
    expect(img).toContain('fetchPriority="high"');
    expect(img).toContain('decoding="async"');
    expect(img).toContain('alt="CV page 1 of 2"');
  });

  it("opens the reader through DialogHost from real PDF links (no island) and offers the download", () => {
    const pdf = "/cv/kurniadi-ahmad-wijaya-cv.pdf";
    expect(html).toMatch(new RegExp(`<a href="${pdf}" data-hq-cv="" aria-haspopup="dialog" class="pv-btn pv-btn-primary" data-testid="cv-read">View CV</a>`));
    expect(html).toContain(`<a href="${pdf}" download="kurniadi-ahmad-wijaya-cv.pdf" type="application/pdf"`);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<iframe");
  });
});
