import manifest from "../../content/generated/cv-pages.json";

/**
 * The owner's CV: one PDF committed as-is at `public/cv/{fileName}.pdf` and served for every
 * locale (no web export, no translation). Dependency-free so client components can import it.
 */
export function cvPdfPath(fileName: string): string {
  return `/cv/${fileName}.pdf`;
}

/** Suggested file name for the `download` attribute of CV links. */
export function cvDownloadName(fileName: string): string {
  return `${fileName}.pdf`;
}

export interface CvPageImage {
  n: number;
  src: string;
  width: number;
  height: number;
  srcMedium: string;
  widthMedium: number;
  heightMedium: number;
  srcSmall: string;
  widthSmall: number;
  heightSmall: number;
}

/**
 * Page images of the CV PDF, rendered by `bun run cv:pages` (`scripts/cv-pages.ts`) into
 * `public/cv/pages/`: page 1 is the /cv page's cover, the RF drawer's cover and the CV reader's
 * loading cover. A test fails when the PDF changes and the
 * images were not regenerated.
 */
export const CV_PAGES: readonly CvPageImage[] = manifest.pages;

/** File name (no extension) the page images were rendered from; equals `roof.cv.fileName` (tested). */
export const CV_FILE_NAME: string = manifest.fileName;
