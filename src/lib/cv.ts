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
