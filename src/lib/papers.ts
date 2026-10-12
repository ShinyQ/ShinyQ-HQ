import manifest from "../../content/generated/paper-pages.json";

/**
 * Self-hosted paper PDFs (`public/papers/{file}.pdf`) and their page images for the in-site paper
 * reader, rendered by `bun run paper:pages` (`scripts/paper-pages.ts`). Dependency-free so client
 * components can import it; a test fails when a PDF changes and the images were not regenerated.
 */
export interface PaperPageImage {
  n: number;
  src: string;
  width: number;
  height: number;
}

const documents: Record<string, { pages: PaperPageImage[] }> = manifest.documents;

export function paperPdfPath(file: string): string {
  return `/papers/${file}.pdf`;
}

/** Page images of `file`, empty when it has not been rendered. */
export function paperPages(file: string): readonly PaperPageImage[] {
  return documents[file]?.pages ?? [];
}

/** File names with rendered page images. */
export const PAPER_FILES: readonly string[] = Object.keys(documents);
