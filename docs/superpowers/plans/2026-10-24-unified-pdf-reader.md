# One PDF Reader for Every PDF Implementation Plan

Status: in review.

**Goal:** Every PDF on the site opens in the study guide reader's modal (owner request: "For all of pdf modal i expecting it to be used the modal just like the study guide change all"). Today the CV (`/cv`, every CV button, the RF kiosk) and the paper PDFs use an image-based `PageViewer`.

**Architecture:** The study guide reader moves out of `src/components/guides/` into a shared `src/components/pdf-reader/` and takes a `ReaderDoc` (`url`, `downloadUrl`, `file`, `title`, `cover`, `pageKey`), a Close label, optional page names, a Back control and a footer, and a `testPrefix` for test ids. A small static shell (`ReaderDialog.tsx`: `useLazyReader`, `ReaderState`, `LazyPdfReader`) imports the reader chunk and pdf.js on open. `GuideDialog`, `CvDialog` and `PaperDialog` all render it. `/cv` becomes server markup (page 1 image, View CV with `data-hq-cv`, Download). `PageViewer` and `CvViewer` are deleted.

**Tech Stack:** Next.js 16 static export, React 19, pdf.js (`pdfjs-dist`), next-intl, Vitest, Playwright.

## Owner decisions (2026-10-24)

1. pdf.js for every PDF, the page-1 WebP as the loading cover.
2. `/cv` is a cover card: page 1 (the LCP), View CV (opens the modal), Download PDF; no new JS.
3. The pdf.js text layer stays on for every PDF, the CV included (runtime only, from the PDF itself; never in HTML, metadata, search or alt text; never OCR).
4. The page image pipelines (`cv:pages`, `paper:pages`, manifests, sha pins, deploy smoke) stay unchanged.

## Tasks

- [x] Move the reader files with `git mv` and generalize them (`PdfReader`, `ReaderToolbar` with Back, `ReaderControls`, `ReaderThumbs`, `ReaderPage`, `ui`, `pdf.ts`, `reader-model.ts` with `savedPage(storage, key)`, `CV_PAGE_KEY`, `PAPER_PAGE_KEY`).
- [x] Add the `ReaderDialog.tsx` shell; port `GuideDialog` to it (test ids `guide-*` and `hq:guide:<slug>` unchanged).
- [x] Strings: a `reader` namespace in the layout; drop the image viewer's `cv` and `paper` keys and the reader keys from `guides`; `/data/guides/{locale}.json` also carries `reader`.
- [x] CV: `CvDialog` on `LazyPdfReader`; `CvCover` on `/cv`; `DialogHost` opens the CV on a plain click on `[data-hq-cv]`.
- [x] Papers: the reading view on `LazyPdfReader` with Back (focus kept through the loading swap by a callback ref), the version line and `PaperNotice` as the footer.
- [x] Tests: unit (reader parts, dialogs, DialogHost, chunk graph for all three dialogs, namespaces, data route, `CvCover`, plan scripts), e2e (`pageview`, `library-roof`, `csp`); `e2e-plan` and `perf-plan` map the new paths.
- [x] Docs: `docs/agents/content.md` (new PDF reader section), `styling-and-i18n.md`, `performance.md`, `ci-and-deploy.md`, `folder-layout.md`, `docs/features.md`, `docs/content.md`, `docs/deploy.md`, README routes, the decision file.

## Notes

- Cloudflare Pages answers a Range request on a static file with 200 and the whole file, so the CV (125 KB) and the papers (up to 2.6 MB) load in one fetch; the guides' Function keeps byte ranges.
- No CSP change: pdf.js and its worker already run for the guides, and the PDFs are same-origin.
- Budgets: the reader chunk and worker are the guides' (160 KB and 400 KB gzip); `/cv` loses its client island.
