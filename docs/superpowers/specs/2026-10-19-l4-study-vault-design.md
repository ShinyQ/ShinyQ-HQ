# L4 Study Vault and in-app study guide reader (design)

Status: in review

Date: 2026-10-19. Owner-approved design. Repo: ShinyQ/ShinyQ-HQ (main 633750e or later).

## Owner request (verbatim)

"Btw when i do my certification i made pdf certification learn material i need you to add this in the app for L4
(store it on cloudflare since its kinda big) explore creatively and make place where u can showcase that
AI-103_Study_Guide.pdf AI-901_Study_Guide.pdf Google_Generative_AI_Leader_Study_Guide.pdf GH-600_Study_Guide.pdf Much
better if user can read it on the app without open link or new tab"

## Owner decisions (confirmed)

1. Placement: a "Study Vault" on L4, a glowing alcove off the end plaza (the ring road around the Topic
   Constellation) with its own stop and camera zone. Four giant holo books with the exam code on the spine in issuer
   tones; the cover slides out as the Rover approaches; selecting a book opens the in-app reader. Instanced meshes,
   part of the lazy L4 floor chunk, inside the draw-call and triangle budgets and `SPACE_RULES` (clearance tests),
   and part of the end plaza label placement so no label overlaps.
2. Outside 3D: a "Study guides" shelf section on the Classic site (`/{locale}/library`), and `CertDialog` gains a
   "Read study guide" action for the matching certifications (AI-103, AI-901, GH-600, Google Generative AI Leader;
   all four already exist in `content/site-content.json`).
3. Reader: in-app reading plus a Download button (same-origin `download` attribute, no new tab, no
   `target="_blank"`). Approach A: a pdf.js (`pdfjs-dist`) reader in a lazy chunk loaded only when the reader opens
   (outside the 3D session byte totals, with its own cap); canvas pages virtualized, HTTP Range streaming, text
   layer, page navigation, zoom and fit width, keyboard, a thumbnail rail on desktop, a full-screen sheet on phones,
   last-page memory in `localStorage`; built on the shared `Modal` and `DialogHost` (focus trap, Esc, `aria-modal`
   pauses 3D input). Works on iOS Safari, Android Chrome, desktop and tablet.
4. Storage: a private R2 bucket `hq-study-guides`. PDFs are linearized (`qpdf --linearize`) with fixed metadata
   before upload. Served through a same-origin Pages Function `/api/guides/[slug]` with an R2 binding in
   `wrangler.toml`: Range (206), ETag and If-None-Match (304), long immutable cache on versioned URLs,
   `Content-Type: application/pdf`, `Content-Disposition: inline` (`attachment` for `?download=1`), a slug
   allowlist, 404 otherwise. The CSP stays unchanged (`connect-src 'self'`); the pdf.js worker loads from self
   (`worker-src 'self' blob:` is already allowed). Covers: page 1 rendered to small WebP files in `public/`
   (committed). Docs: an upload runbook, the L4 floor doc, a decisions entry.
5. Data: one content entry per guide (slug, exam code, title, issuer, pages, bytes, domain weights from the cover,
   cover image, linked certification id), with English and Indonesian strings.
6. Tests: unit (vault layout, space rules, data, the label sweep stays clean), Function tests (Range, 304, 404,
   headers), e2e (open the reader from the 3D vault, the Classic shelf and `CertDialog` on desktop and phone; no
   new page or tab opens; download works; axe), perf (the reader chunk is not in the session totals; floor budgets
   hold).
7. Delivery: PR1 (R2, Function, data, reader, Classic shelf, CertDialog) may merge when CI is green. PR2 (3D Study
   Vault) needs the owner's review of desktop, tablet and phone captures before merging.

## Source files

| Slug | Exam | Title on the cover | Issuer | Pages | Size |
|---|---|---|---|---|---|
| `ai-103` | AI-103 | Developing AI Apps and Agents on Azure | Microsoft | 155 | 4.4 MB |
| `ai-901` | AI-901 | Microsoft Azure AI Fundamentals | Microsoft | 150 | 4.7 MB |
| `gh-600` | GH-600 | Developing in Agentic AI Systems | GitHub | 158 | 5.5 MB |
| `google-gen-ai-leader` | none (spine label "Gen AI Leader") | Generative AI Leader | Google | 144 | 3.4 MB |

- Slugs equal the certification ids, so a guide links to its certification by id.
- All four files carry the AI-103 title and subject in their Info dictionary: the prepare script rewrites Title,
  Subject and Author per guide. All fonts are embedded and there are no raster images, so pdf.js needs no standard
  font data, no CMaps and no WASM image decoders.
- Each file has a PDF outline (bookmarks): the reader shows it as a chapter list.
- The PDFs are never committed. Only the page 1 covers (WebP) are.

## Architecture

```mermaid
flowchart LR
  subgraph Build
    S[scripts/study-guides.ts] -->|qpdf metadata + linearize| R2[(R2 hq-study-guides)]
    S -->|pages, bytes, version| J[content/study-guides.json]
    S -->|page 1 WebP| C[public/study-guides/*.webp]
  end
  J --> L[src/content loaders] --> P[/library shelf + CertDialog + L4 vault/]
  J --> F[functions/api/guides/[slug].ts]
  J --> D[/data/guides/{locale}.json]
  P -->|hq:hud guide command| H[DialogHost]
  H -->|lazy| RD[GuideReader chunk: pdfjs-dist]
  RD -->|fetch view data| D
  RD -->|Range GETs, same origin| F --> R2
```

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `scripts/study-guides.ts` | Prepare (metadata, linearize, version hash, covers, safety scan of the text) and upload with `bunx wrangler r2 object put`; writes the machine fields of `content/study-guides.json` | qpdf, pdftoppm, pdftotext, cwebp, wrangler |
| `content/study-guides.json` + `src/content/guides.ts` | The dataset (zod schema in `schema.ts`, loader `getStudyGuides()`), pure view helpers (`guideView`, `guideUrl`, `guideDownloadUrl`, `weightLabel`) | content schema |
| `functions/_lib/guides.ts`, `functions/api/guides/[slug].ts` | The R2 proxy: allowlist, Range, conditional requests, headers | R2 binding `GUIDES` |
| `/data/guides/{locale}.json` (existing data route) | Locale-resolved guide views plus the `guides` UI strings, fetched by the reader on open, so no reader text rides in every page's HTML | dataset, messages |
| `src/components/guides/` | `GuideShelf` (Classic section), `GuideCard`, `GuideReadButton`, `GuideDialog` (lazy), `GuideReader` (lazy, pdf.js), `pdf.ts` (pdf.js setup) | Modal, DialogHost |
| `openGuide(slug, { page? })` | `hq:hud` command `{ type: "guide", slug }` handled by `DialogHost` | `hud/events` |
| L4 Study Vault (PR2) | Layout (alcove, spur road, stop, camera zone, book slots), scene (`StudyVault.tsx`), signs, point-and-go targets | L4 chunk, `FloatingSigns`, point-and-go |

## Data

`content/study-guides.json`:

```json
{
  "guides": [
    {
      "slug": "ai-103",
      "certId": "ai-103",
      "code": "AI-103",
      "spine": "AI-103",
      "issuer": "Microsoft",
      "title": { "en": "Developing AI Apps and Agents on Azure", "id": "Developing AI Apps and Agents on Azure" },
      "summary": { "en": "...", "id": "..." },
      "edition": "2026-10",
      "file": "AI-103_Study_Guide.pdf",
      "pages": 155,
      "bytes": 4427853,
      "version": "0123456789ab",
      "cover": "/study-guides/ai-103.webp",
      "domains": [{ "weight": [25, 30], "label": { "en": "Plan and manage an Azure AI solution", "id": "..." } }]
    }
  ]
}
```

- `version`: the first 12 hex digits of the SHA-256 of the prepared (linearized) file; the R2 key is
  `<slug>/<version>.pdf`, so a new upload never overwrites a cached object.
- `weight`: `[min, max]` percent; `[n, n]` reads "about n%" (the Google guide's "~30%").
- Titles stay in English in both locales (exam titles are technical terms); summaries and domain labels are
  bilingual. Titles pass `titleCase`. No first person in titles.
- Validation: a zod schema; slugs are unique and each `certId` exists in `certifications`; `cover` exists in
  `public/`; `pages` and `bytes` are positive; `version` is 12 hex digits.
- `CertView` gains `guide: string | null` (the slug), so `CertDialog` and the 3D Lobby wall can offer the reader.

## Pages Function `/api/guides/[slug]`

- `GET` and `HEAD` only (405 otherwise, `Allow: GET, HEAD`).
- Slug allowlist from `content/study-guides.json` (the Function imports that small file directly, never
  `site-content.json`). Unknown slug: 404 `text/plain`.
- R2 key `<slug>/<version>.pdf`: the version named by a well-formed `?v=` (12 lowercase hex), else the current
  version from the file. Missing object or no binding: 404 (and a `console.error` for the binding case).
- `ETag`: the R2 `httpEtag`. `If-None-Match` match: 304 with the ETag and cache headers.
- `Range: bytes=a-b`, `a-`, `-n`: 206 with `Content-Range`; unsatisfiable: 416 with `Content-Range: bytes */size`;
  multiple ranges: the whole file (200). `Accept-Ranges: bytes` always.
- Headers: `Content-Type: application/pdf`, `Content-Length`, `Content-Disposition: inline; filename="<file>"`
  (`attachment` with `?download=1`), `X-Content-Type-Options: nosniff`, `Cache-Control: no-transform` plus
  `public, max-age=31536000, immutable` for a well-formed `?v=` whose object exists (the bytes under a version key
  never change, so a reader opened before a deploy keeps its version), else `public, max-age=300`.
  `no-transform` keeps Cloudflare from compressing the body, which would break byte ranges.
- The Function sets `Content-Security-Policy: frame-ancestors 'none'` and `X-Content-Type-Options: nosniff` itself:
  Cloudflare Pages never applies `_headers` to Function responses, so `_headers` gets no `/api/guides/*` block (an
  earlier draft had one; it was inert and was removed). The site CSP is unchanged.

## Reader

- `openGuide(slug)` dispatches `{ type: "guide", slug }`; `DialogHost` loads `GuideDialog` lazily (like
  `CertDialog`), which fetches `/data/guides/{locale}.json` (the guide view and the `guides` strings) and renders
  the reader inside a `NextIntlClientProvider` with those strings. `Modal` width `lg`; phones get the full-screen
  sheet `Modal` already provides.
- `GuideReader` imports `pdfjs-dist` dynamically. The worker is `new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" })`
  passed as `GlobalWorkerOptions.workerPort`, so it is a hashed same-origin asset. `getDocument({ url,
  rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true, enableXfa: false, useWasm: false,
  isOffscreenCanvasSupported: false })`: range requests only, so only the pages read are fetched.
- Pages: a vertical scroll of page slots sized from page 1's viewport (all pages are A4), so the scroll height is
  known before any page renders. An `IntersectionObserver` renders the visible pages plus one before and after,
  and releases canvases more than 4 pages away (`canvas.width = 0`), so memory stays flat on phones. Canvas pixel
  ratio is `min(devicePixelRatio, 2)` and capped at 4096 px on the long side (iOS canvas limits).
- Text layer: pdf.js `TextLayer` over each rendered page, so text is selectable and searchable with the browser's
  find. Styles for the text layer live in a CSS module imported by the reader chunk (not the global stylesheet).
- Toolbar: back (close), title, page input "n / N", previous and next, zoom out, zoom in, fit width, chapters (the
  outline), Download (`<a href="/api/guides/<slug>?v=<version>&download=1" download="<file>">`).
- Desktop (width 1024 px and up): a thumbnail rail on the left (small canvases, rendered lazily, the current page
  highlighted). Tablets and phones: no rail; the chapters list opens as a popover.
- Keyboard: PageDown, PageUp, ArrowRight, ArrowLeft, Home, End, `+`, `-`, `0` (fit width); the Modal handles Esc
  and the focus trap.
- Pinch zoom on touch is the browser's own; the reader sets zoom by buttons and keys only.
- Last page: `localStorage["hq:guide:<slug>"] = page`, restored on open ("Resume at page n" is implicit: the
  reader scrolls there).
- States: loading (skeleton with the cover), error (message, Retry, Download), ready.
- Accessibility: the dialog is labelled by the guide title; page canvases carry `role="img"` and
  `aria-label="Page n of N"`; the text layer is the readable content; buttons have labels; axe clean.

### Size caps

- Reader chunk (the dynamic import of `GuideReader` with pdf.js, gzip): under 160 KB.
- pdf.js worker (gzip): under 400 KB (the pdf.js 6.4 worker alone is about 354 KB).
- Neither is on any Classic page's initial load or the 3D session; `e2e/budgets.ts` gets `GUIDE_READER` caps and
  a perf test asserts both, plus that the 3D session totals stay unchanged.

## Classic site

- `/{locale}/library` gains a section "Study guides" (`#guides`, a chip in the section nav) after Talks: one card
  per guide with the cover, exam code, title, issuer, page count, domain weights as a compact bar, and two
  actions: "Read" (opens the reader, a button) and "Download PDF" (same-origin download link).
- `CertDialog` shows "Read study guide" (primary, opens the reader in place of the cert card: the cert dialog
  closes and the reader opens through the same `DialogHost`) when `cert.guide` is set.

## 3D Study Vault (PR2)

- Placement: an alcove south-east of the end plaza, reached by a short spur road off the ring road, clear of the
  Express Return pad (south of the plaza), the archive board (east rim) and the monument (north rim). Exact
  constants are set by the layout and space tests (`expectSpaceRules`, 3 u clearance, pads off road widths).
- Its stop `L4:vault` at the mouth of the alcove; a camera zone `L4:vault` looking at the books, phone `classView`
  framing so all four spines are visible.
- Four books stand in an arc: one instanced box mesh for the bodies, one for the covers (the cover slides out along
  the book's normal and tilts as the Rover gets within 6 u, eased by `useFrame` deltas, held under reduced
  motion), holo halos only on the full tier. Spines show the exam code (`spine`) in issuer tones (Microsoft cyan,
  GitHub violet, Google amber) through the end plaza's `FloatingSigns` group so the end plaza label placement
  covers them (no overlap with the topic labels, the monument, the archive name or the count).
- Selecting a book: point-and-go registry target per book (drive to the stop, then `openGuide(slug)`); the
  vault's pad opens a chooser only when the Rover stops on the stop pad (no auto-open, like other doors).
- Budgets: at most +4 draw calls on the full tier and +3 on lite at the vault view; under 1k extra triangles;
  the L4 chunk stays under its 16 KB cap; no new shader program beyond the existing holo materials.
- Owner review: desktop (1440x900), tablet (834x1194) and phone (390x844) captures before merge.

## Error handling

- Function: missing binding, missing object or unknown slug: 404; R2 errors: 502 with no detail. Never echoes
  the request path.
- Reader: a failed data fetch or `getDocument` failure shows the error state with Retry and Download; a failed
  page render shows a per-page retry; a failed chunk import shows the error state (the next open retries).
- Offline or no Function (the static e2e server): the e2e specs route `/api/guides/*` to a small committed
  fixture PDF generated in memory by `e2e/fixtures/guide-pdf.ts` (three pages, no owner content, nothing
  committed).

## Testing

| Layer | What |
|---|---|
| Unit | dataset schema and cross checks (cert ids, covers, versions), view helpers, weight labels, `CertView.guide`, Function handler (200, HEAD, 206 forms, 416, 304, 404 unknown and missing, 405, download disposition, cache by version), Function headers (`frame-ancestors 'none'`), no `/api/*` rule in `_headers`, client namespaces |
| Unit (PR2) | vault layout, space and pad rules, clearance, stops and view zones, the L4 label sweep with the spine signs |
| e2e | Classic shelf opens the reader and renders page 1 text; page navigation and keyboard; download link is same-origin with `download` and no `target`; `CertDialog` "Read study guide"; no new page (`context.on("page")`); desktop and phone; axe on the open reader |
| e2e (PR2) | reader opens from the 3D vault on desktop and phone; label overlap specs stay clean |
| Perf | reader chunk and worker caps; the reader chunk is absent from the 3D session byte lists; floor budgets hold (PR2) |

## Out of scope

- Full-text search across guides, annotations, or Ask the HQ answering from guide text.
- Serving the PDFs to third parties (no CORS headers).
