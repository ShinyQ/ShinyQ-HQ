/** A pre-rendered PDF page image (`bun run cv:pages`, `bun run paper:pages`) with optional smaller renditions. */
export interface PageImage {
  src: string;
  width: number;
  /** Optional smaller rendition for narrow screens. */
  srcSmall?: string;
  widthSmall?: number;
  /** Optional in-between rendition (the CV's 1200 px page, so a DPR 3 phone skips the full-size file). */
  srcMedium?: string;
  widthMedium?: number;
}

/** `srcset` from the renditions a page has, smallest first; undefined without a small one (src only). */
export function pageSrcSet(p: PageImage): string | undefined {
  if (!p.srcSmall || !p.widthSmall) return undefined;
  const medium = p.srcMedium && p.widthMedium ? `, ${p.srcMedium} ${p.widthMedium}w` : "";
  return `${p.srcSmall} ${p.widthSmall}w${medium}, ${p.src} ${p.width}w`;
}
