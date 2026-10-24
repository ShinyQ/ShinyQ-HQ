import { pageSrcSet } from "@/lib/page-images";
import { CV_FILE_NAME, CV_PAGES, cvDownloadName, cvPdfPath } from "@/lib/cv";

export interface CvCoverLabels {
  /** "View CV": opens the CV reader modal. */
  view: string;
  download: string;
  /** "2 pages", already resolved. */
  pages: string;
  /** "CV page 1 of 2", already resolved. */
  coverAlt: string;
}

/**
 * The `/cv` page body (server markup, no client island): page 1 of the CV as an image (the page's LCP) and two
 * actions. "View CV" is a real link to the PDF carrying `data-hq-cv`: `DialogHost` turns a plain click into the CV
 * reader modal (the shared PDF reader), and without JS it opens the PDF. Download saves the file.
 */
export function CvCover({ labels }: { labels: CvCoverLabels }) {
  const cover = CV_PAGES[0];
  const pdf = cvPdfPath(CV_FILE_NAME);
  return (
    <div className="card mt-8 grid gap-6 p-5 sm:grid-cols-[minmax(0,320px)_1fr] sm:p-6" data-testid="cv-card">
      {cover && (
        <a href={pdf} data-hq-cv="" aria-haspopup="dialog" tabIndex={-1} aria-hidden="true" className="block overflow-hidden rounded-md border border-line bg-[#fff]">
          {/* Static export: page images are pre-rendered webp files under public/. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.src}
            srcSet={pageSrcSet(cover)}
            sizes="(min-width: 640px) 320px, calc(100vw - 4.5rem)"
            width={cover.width}
            height={cover.height}
            alt={labels.coverAlt}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            draggable={false}
            className="block h-auto w-full"
            data-testid="cv-cover-image"
          />
        </a>
      )}
      <div className="flex min-w-0 flex-col">
        <p className="pv-data">{labels.pages} · PDF</p>
        <div className="mt-5 flex flex-wrap gap-3 sm:mt-auto">
          <a href={pdf} data-hq-cv="" aria-haspopup="dialog" className="pv-btn pv-btn-primary" data-testid="cv-read">
            {labels.view}
          </a>
          <a href={pdf} download={cvDownloadName(CV_FILE_NAME)} type="application/pdf" className="pv-btn pv-btn-ghost" data-testid="cv-download">
            {labels.download}
          </a>
        </div>
      </div>
    </div>
  );
}
