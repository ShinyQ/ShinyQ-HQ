# L4 Study Guides, PR1: R2 Function, Data, Reader, Classic Shelf and CertDialog Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors read the owner's four certification study guides inside the site (no new tab) from the Classic
`/library` shelf and from `CertDialog`, streamed from a private R2 bucket through a same-origin Pages Function.

**Architecture:** `content/study-guides.json` (already committed with real `pages`, `bytes`, `version`) feeds a zod
loader and pure view helpers. `functions/api/guides/[slug].ts` proxies R2 with Range, ETag and versioned immutable
caching. A `{ type: "guide" }` `hq:hud` command opens a lazy `GuideDialog` in `DialogHost`; it fetches
`/data/guides/{locale}.json` (views plus the `guides` strings, so no reader text rides in every page's HTML) and
lazily loads `GuideReader` (pdf.js with a same-origin module worker).

**Tech Stack:** Next.js 16 static export, React 19, next-intl, Tailwind 4, `pdfjs-dist` 6.4.x, Cloudflare Pages
Functions with R2, Vitest, Playwright, axe.

Spec: [`docs/superpowers/specs/2026-10-19-l4-study-vault-design.md`](../specs/2026-10-19-l4-study-vault-design.md).
PR2 (the 3D Study Vault) gets its own plan after this PR is in review.

## Global Constraints

- No em dash (U+2014) anywhere (code, comments, copy, docs, commit and PR text). Use commas, colons, parentheses.
- Bun only (`bun add`, `bun run`, `bunx`). Commits: conventional (`feat:`, `test:`, `docs:`), via `rtk git`.
- Bilingual: every user-facing string has `en` and `id`; `messages/en.json` and `messages/id.json` keep identical
  keys. Indonesian is natural and professional; technical terms stay English.
- Static export: no API routes in `src/app`; `/api/guides/*` exists only as a Pages Function.
- CSP unchanged (`tests/unit/csp.test.ts` asserts the exact `/*` value). No `target="_blank"`, no `window.open`,
  no inline handlers.
- Client code imports locale values from `@/content/locales`, never values from `@/content/schema` or
  `@/content/load` (`bun run build` fails otherwise).
- Layout HTML budget: nothing new in `LAYOUT_NAMESPACES` except one short key under `certs` (the CertDialog
  button). Reader strings reach the reader through `/data/guides/{locale}.json`.
- Classic CSS budget 20,480 B (gzip transfer of the global stylesheet): prefer existing classes (`pv-btn`,
  `pv-btn-primary`, `chip`, `label`, `glass`, tokens); reader-only styles go in a CSS module imported by the reader
  chunk.
- Reader chunk (dynamic import of `GuideReader` plus pdf.js, gzip) under 160 KB; worker (gzip) under 360 KB.
  Neither may be reachable from `src/experience/Experience.tsx`.
- PDFs are never committed. R2 bucket `hq-study-guides` (private), keys `<slug>/<version>.pdf` (already uploaded).
- Before pushing: `bun run verify:quick`, then `bun run e2e:changed`. At most 2 CI runs in flight.

## File map

| File | Responsibility |
|---|---|
| `src/content/schema.ts` | `StudyGuideSchema`, `StudyGuidesFileSchema`, types `StudyGuide`, `StudyGuidesFile` |
| `src/content/load.ts` | `getStudyGuides()` (parse and cache `content/study-guides.json`) |
| `src/content/guides.ts` | Pure client-safe helpers and `GuideView` type (no zod, React or three) |
| `src/content/guide-views.ts` | Server: `guideViews(locale)`, `guideForCert(certId)` |
| `src/content/cert-views.ts`, `src/content/certs.ts` | `CertView.guide: string | null` |
| `functions/_lib/guides.ts` | `createGuidesHandler()`: allowlist, Range, 304, headers |
| `functions/_lib/types.ts` | `GuidesEnv`, minimal `R2Bucket` types |
| `functions/api/guides/[slug].ts` | Pages Function entry |
| `wrangler.toml` | `[[r2_buckets]] binding = "GUIDES"`, `bucket_name = "hq-study-guides"` |
| `public/_headers` | `/api/guides/*` block (detach page CSP, `frame-ancestors 'none'`) |
| `src/app/data/[...path]/route.ts`, `src/components/guides/data-path.ts` | `/data/guides/{locale}.json` |
| `messages/en.json`, `messages/id.json` | `guides` namespace; `certs.preview.readGuide`; `library.guides*` |
| `src/i18n/client-messages.ts` | `guides` in `CLIENT_NAMESPACES` (not `LAYOUT_NAMESPACES`) |
| `src/hud/events.ts` | `{ type: "guide"; slug: string }`, `openGuide(slug)` |
| `src/components/DialogHost.tsx`, `src/components/dialog-loaders.ts` | guide kind, `loadGuideDialog`, opener kept across a dialog swap |
| `src/components/guides/GuideDialog.tsx` | Lazy: fetch data, intl provider, Modal, loading and error states, lazy reader |
| `src/components/guides/GuideReader.tsx` | pdf.js reader UI |
| `src/components/guides/pdf.ts` | pdf.js loader (`loadPdfjs`, worker port) |
| `src/components/guides/reader-model.ts` | Pure reader math (render window, zoom steps, page clamp, storage key, keyboard map) |
| `src/components/guides/GuideReader.module.css` | Text layer and page styles |
| `src/components/guides/GuideShelf.tsx`, `GuideActions.tsx` | Classic `/library` section and its client buttons |
| `src/components/certs/CertDialog.tsx` | "Read study guide" action |
| `src/app/[locale]/library/page.tsx` | `#guides` section and nav chip |
| `e2e/fixtures/guide-pdf.ts`, `e2e/guides.spec.ts` | Generated 3-page fixture PDF, reader e2e |
| `e2e/budgets.ts`, `e2e/perf/guide-reader.spec.ts` | `GUIDE_READER_BUDGET`, chunk and worker caps |
| `tests/content/study-guides.test.ts`, `tests/unit/guides-function.test.ts`, `tests/unit/guide-reader-model.test.ts`, `tests/unit/guide-chunks-graph.test.ts` | Unit tests |
| Docs | `docs/study-guides-runbook.md`, `docs/content.md`, `docs/features.md`, `docs/agents/content.md`, `docs/agents/floor-l4-library.md`, `docs/agents/folder-layout.md`, `docs/agents/performance.md`, `docs/decisions/2026-10-19-l4-study-guides-reader-r2.md` |

---

### Task 1: Dataset schema, loader, views and CertView.guide

**Files:**
- Modify: `src/content/schema.ts`, `src/content/load.ts`, `src/content/certs.ts`, `src/content/cert-views.ts`
- Create: `src/content/guides.ts`, `src/content/guide-views.ts`
- Test: `tests/content/study-guides.test.ts`

**Interfaces (produces):**

```ts
// src/content/guides.ts (client-safe, pure)
export interface GuideDomainView { label: string; weight: readonly [number, number]; weightLabel: string }
export interface GuideView {
  slug: string; certId: string; code: string | null; spine: string; issuer: string;
  title: string; summary: string; edition: string; editionLabel: string; file: string;
  pages: number; bytes: number; sizeLabel: string; version: string; cover: string;
  url: string;          // `/api/guides/${slug}?v=${version}`
  downloadUrl: string;  // `/api/guides/${slug}?v=${version}&download=1`
  domains: GuideDomainView[];
}
export const guideUrl = (slug: string, version: string) => `/api/guides/${slug}?v=${version}`;
export const guideDownloadUrl = (slug: string, version: string) => `${guideUrl(slug, version)}&download=1`;
export function weightLabel([min, max]: readonly [number, number]): string; // "25-30%" for a range, "~30%" when min === max
export function sizeLabel(bytes: number): string; // "4.4 MB" (1 decimal, 1_000_000 base)
export const GUIDE_PAGE_KEY = (slug: string) => `hq:guide:${slug}`;
export const GUIDE_SLUG = /^[a-z0-9-]{2,40}$/;

// src/content/guide-views.ts (server)
export function guideViews(locale: Locale): GuideView[];       // file order
export function guideForCert(certId: string): string | null;   // slug or null

// src/content/load.ts
export function getStudyGuides(): StudyGuidesFile;             // cached zod parse of content/study-guides.json

// src/content/certs.ts: CertView gains `guide: string | null`
```

Schema (strict objects): `slug` matches `GUIDE_SLUG`; `certId` string; `code` string or null; `spine` 1 to 14 chars;
`issuer`; `title` and `summary` `LocalizedText`; `edition` `YYYY-MM`; `file` matches `/^[A-Za-z0-9_.-]+\.pdf$/`;
`pages` and `bytes` positive ints; `version` `/^[0-9a-f]{12}$/`; `cover` `/^\/study-guides\/[a-z0-9-]+\.webp$/`;
`domains` 1 to 8 of `{ weight: [int 1..100, int 1..100] with min <= max, label: LocalizedText }`; `$comment`
optional on the file.

- [ ] Step 1: Write `tests/content/study-guides.test.ts`: parses; four guides; slugs unique; every `certId` is a
  certification id in `getContent().certifications`; every `cover` file exists under `public/`; versions are 12 hex;
  titles pass `titleCase` (`expect(titleCase(t)).toBe(t)` for en) and `hasFirstPerson` is false for titles; no em
  dash in any string (`collectStrings`); `weightLabel([25,30]) === "25-30%"`, `weightLabel([30,30]) === "~30%"`;
  `sizeLabel(4448335) === "4.4 MB"`; `guideViews("id")` returns Indonesian summaries and the same slugs;
  `guideForCert("ai-103") === "ai-103"`, `guideForCert("az-900") === null`; `toCertViews` sets `guide` for the four
  and null for the rest.
- [ ] Step 2: Run `bunx vitest run tests/content/study-guides.test.ts`, expect failures (missing modules).
- [ ] Step 3: Implement the schema, loader, helpers and views; `toCertViews` sets `guide: guideForCert(c.id)`.
  `editionLabel` uses `formatYearMonth(edition, locale)` from `@/lib/format`.
- [ ] Step 4: Run the test, then `bun run typecheck` (other `CertView` literals in tests and fixtures need
  `guide: null`; fix every compile error).
- [ ] Step 5: Commit `feat(guides): study guide schema, loader and views`.

### Task 2: Pages Function `/api/guides/[slug]`, R2 binding and headers

**Files:**
- Create: `functions/_lib/guides.ts`, `functions/api/guides/[slug].ts`, `tests/unit/guides-function.test.ts`
- Modify: `functions/_lib/types.ts`, `wrangler.toml`, `public/_headers`, `tests/unit/csp.test.ts` (only if it
  enumerates header blocks)

**Interfaces (produces):**

```ts
// functions/_lib/types.ts
export interface R2Range { offset?: number; length?: number; suffix?: number }
export interface R2ObjectBody { size: number; httpEtag: string; body: ReadableStream; range?: R2Range }
export interface R2ObjectHead { size: number; httpEtag: string }
export interface R2Bucket {
  head(key: string): Promise<R2ObjectHead | null>;
  get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBody | null>;
}
export interface GuidesEnv { GUIDES?: R2Bucket }

// functions/_lib/guides.ts
export interface GuideEntry { slug: string; version: string; file: string; bytes: number }
export function parseRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null;
export function createGuidesHandler(guides?: readonly GuideEntry[]): (context: PagesContext<GuidesEnv>) => Promise<Response>;
```

Behaviour (exact):
- Slug: last path segment of `new URL(request.url).pathname` under `/api/guides/`; not in the allowlist: 404
  `text/plain` "Not found".
- Method not GET or HEAD: 405 with `Allow: GET, HEAD`.
- `env.GUIDES` missing: `console.error("GUIDES binding missing")`, 404.
- `head(key)` null: 404. Key `${slug}/${version}.pdf`.
- `If-None-Match` contains the `httpEtag` (or `*`): 304 with `ETag`, `Cache-Control`.
- `parseRange`: `bytes=a-b` (b clamped to size-1), `bytes=a-`, `bytes=-n` (last n, n clamped to size); a > end or
  a >= size: `"unsatisfiable"`; multiple ranges or malformed: `null` (serve 200 full).
- 206: `get(key, { range: { offset: start, length: end - start + 1 } })`, `Content-Range: bytes start-end/size`,
  `Content-Length: end-start+1`. 416: `Content-Range: bytes */size`, empty body.
- 200: full `get(key)`; HEAD returns headers only (from `head`).
- Every success response: `Content-Type: application/pdf`, `Accept-Ranges: bytes`, `ETag`,
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="<file>"` or `attachment; ...` when
  `?download=1`, `Cache-Control: public, max-age=31536000, immutable, no-transform` when `?v=` equals the version,
  else `public, max-age=300, no-transform`.
- R2 throws: 502 `text/plain` "Upstream error".

```ts
// functions/api/guides/[slug].ts
import { createGuidesHandler } from "../../_lib/guides";
import type { GuidesEnv, PagesContext } from "../../_lib/types";
/** Study guide PDFs (L4 Study Vault, Classic shelf, CertDialog): R2 bucket hq-study-guides behind GUIDES. */
const handler = createGuidesHandler();
export const onRequest = (context: PagesContext<GuidesEnv>) => handler(context);
```

`createGuidesHandler()` default reads `content/study-guides.json` via a static JSON import
(`import data from "../../content/study-guides.json"`) mapped to `GuideEntry[]`.

`wrangler.toml` addition (after the KV blocks):

```toml
# R2 bucket "hq-study-guides" (private, no r2.dev URL): the study guide PDFs served by /api/guides/<slug>
# (functions/api/guides/[slug].ts). Keys are <slug>/<version>.pdf; upload with scripts/study-guides.ts
# (docs/study-guides-runbook.md).
[[r2_buckets]]
binding = "GUIDES"
bucket_name = "hq-study-guides"
```

`public/_headers` addition (after `/papers/*`):

```
# Study guide PDFs (Pages Function, R2): read in the in-app pdf.js reader, never framed. The site CSP is
# detached like /papers/* so a direct visit opens in the browser PDF viewer.
/api/guides/*
  ! Content-Security-Policy
  Content-Security-Policy: frame-ancestors 'none'
```

- [ ] Step 1: Write `tests/unit/guides-function.test.ts` with a fake bucket over a 1000-byte buffer (`head`, `get`
  honoring `range.offset/length`). Cases: 200 full with all headers; HEAD has no body; `bytes=0-99` 206 with
  `Content-Range: bytes 0-99/1000` and 100-byte body; `bytes=900-` 206 `900-999`; `bytes=-50` 206 `950-999`;
  `bytes=2000-` 416; `bytes=0-1,5-6` 200 full; `If-None-Match` 304; unknown slug 404; known slug with missing object
  404; missing binding 404; POST 405 with `Allow`; `?download=1` attachment; `?v=<version>` immutable and stale `v`
  300 s; R2 throws 502. Also `parseRange` table tests.
- [ ] Step 2: Run `bunx vitest run tests/unit/guides-function.test.ts`, expect failures.
- [ ] Step 3: Implement types, handler and entry; add the toml and headers blocks.
- [ ] Step 4: Run the test plus `bunx vitest run tests/unit/csp.test.ts` (adjust only if it lists header paths).
- [ ] Step 5: Commit `feat(guides): R2 Pages Function with Range, ETag and versioned caching`.

### Task 3: Guide data route, strings, hud command and DialogHost wiring

**Files:**
- Create: `src/components/guides/data-path.ts`
- Modify: `src/app/data/[...path]/route.ts`, `messages/en.json`, `messages/id.json`, `src/i18n/client-messages.ts`,
  `src/hud/events.ts`, `src/components/DialogHost.tsx`, `src/components/dialog-loaders.ts`
- Test: extend `tests/unit/client-namespaces.test.ts` expectations if it pins the list; new
  `tests/unit/guide-data.test.ts`

**Interfaces (produces):**

```ts
// src/components/guides/data-path.ts
export const GUIDES_FILE = (locale: string) => `${locale}.json`;
export const guidesDataUrl = (locale: string) => `/data/guides/${GUIDES_FILE(locale)}`;
export interface GuidesData { guides: GuideView[]; messages: Record<string, unknown> } // messages = { guides: <namespace> }

// src/hud/events.ts
| { type: "guide"; slug: string }
export const openGuide = (slug: string) => sendHudCommand({ type: "guide", slug });

// src/components/dialog-loaders.ts
export const loadGuideDialog = () => import("./guides/GuideDialog");
export function preloadGuideDialog(): void;
```

`guides` namespace keys (en; write natural id equivalents):

```json
"guides": {
  "eyebrow": "Study guide",
  "pages": "{count} pages",
  "read": "Read",
  "readGuide": "Read the study guide",
  "download": "Download PDF",
  "downloadHint": "PDF, {size}",
  "close": "Close the reader",
  "loading": "Opening the study guide",
  "error": "The study guide could not be opened.",
  "retry": "Try again",
  "page": "Page",
  "pageOf": "Page {page} of {count}",
  "pageInput": "Go to page",
  "prev": "Previous page",
  "next": "Next page",
  "zoomIn": "Zoom in",
  "zoomOut": "Zoom out",
  "fitWidth": "Fit width",
  "chapters": "Chapters",
  "thumbnails": "Page thumbnails",
  "domains": "Exam domains",
  "edition": "Edition {date}",
  "pageFailed": "This page could not be drawn.",
  "independent": "Independent study material, not an official exam guide."
}
```

Also `certs.preview.readGuide`: "Read study guide" / "Baca panduan belajar"; `library.guides`: "Study guides" /
"Panduan belajar"; `library.guidesIntro`: "The study guides written while preparing each certification exam,
readable right here." / "Panduan belajar yang saya tulis saat menyiapkan tiap ujian sertifikasi, bisa dibaca
langsung di sini."

Data route: add `...LOCALES.map((locale) => ({ path: ["guides", GUIDES_FILE(locale)] }))` to
`generateStaticParams`, and in `GET`: `kind === "guides"` returns `Response.json({ guides: guideViews(locale),
messages: { guides: messagesFor(locale).guides } })` where messages are imported from `messages/<locale>.json`
(follow how other server code reads messages; `import en from "../../../../messages/en.json"` is acceptable).

DialogHost: `Open` gains `{ kind: "guide"; slug: string }`. When a command arrives while a dialog is already open,
keep the existing `opener.current` (the cert dialog's button is about to unmount; focus must return to the
element that opened the first dialog). Render `<GuideDialog key={open.slug} slug={open.slug} onClose={close} />`
via `dynamic(loadGuideDialog, { ssr: false })`.

- [ ] Step 1: Write `tests/unit/guide-data.test.ts`: `GET` on `["guides","en.json"]` and `["guides","id.json"]`
  returns four guides and a `messages.guides` object whose keys equal the en keys; en and id key sets equal.
- [ ] Step 2: Run, expect failure.
- [ ] Step 3: Implement the route branch, strings, namespace, hud command, loaders and DialogHost changes
  (`GuideDialog` can be a stub that renders `Modal` with the title until Task 4).
- [ ] Step 4: `bunx vitest run tests/unit/guide-data.test.ts tests/unit/client-namespaces.test.ts` and the messages
  parity test (`grep -rl "messages/en.json" tests/unit` to find it).
- [ ] Step 5: Commit `feat(guides): guide data file, strings and the guide dialog command`.

### Task 4: The pdf.js reader

**Files:**
- Create: `src/components/guides/GuideDialog.tsx`, `GuideReader.tsx`, `pdf.ts`, `reader-model.ts`,
  `GuideReader.module.css`
- Modify: `package.json` / `bun.lock` (`bun add pdfjs-dist@6.4.299`)
- Test: `tests/unit/guide-reader-model.test.ts`, `tests/unit/guide-chunks-graph.test.ts`

**Interfaces:**

```ts
// reader-model.ts (pure)
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export function nextZoom(current: number, dir: 1 | -1): number;              // snap to the next step
export function clampPage(page: number, count: number): number;              // 1..count, NaN -> 1
export function renderWindow(visible: readonly number[], count: number, margin = 1): number[]; // sorted unique pages to keep drawn
export function releasable(drawn: readonly number[], current: number, keep = 4): number[];      // pages farther than `keep`
export function canvasScale(cssWidth: number, pageWidthPt: number, dpr: number, maxSide = 4096, pageHeightPt = 842): { scale: number; ratio: number };
export function readerKey(key: string, shift: boolean): "next" | "prev" | "first" | "last" | "zoomIn" | "zoomOut" | "fit" | null;
export function savedPage(storage: Pick<Storage, "getItem"> | null, slug: string, count: number): number; // 1 when missing or blocked
export function savePage(storage: Pick<Storage, "setItem"> | null, slug: string, page: number): void;  // swallows errors

// pdf.ts
export async function loadPdfjs(): Promise<typeof import("pdfjs-dist")>; // sets GlobalWorkerOptions.workerPort once
```

`pdf.ts`:

```ts
let ready: Promise<typeof import("pdfjs-dist")> | undefined;
export function loadPdfjs() {
  ready ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    }
    return pdfjs;
  });
  return ready;
}
```

If Turbopack does not emit the worker as a same-origin asset with that pattern, fall back to copying
`node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to `public/vendor/pdf.worker.<version>.min.mjs` in a build step
(`scripts/pdf-worker.ts`, run from `build`) and `GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.<version>.min.mjs"`;
check the built `out/` and the browser network log, not assumptions.

`getDocument({ url: view.url, rangeChunkSize: 65536, disableAutoFetch: true, isEvalSupported: false,
enableXfa: false })`.

`GuideDialog` (default export, lazy chunk): props `{ slug: string; onClose: () => void }`. Fetches
`guidesDataUrl(locale)` (locale from `useLocale()`), finds the view, wraps children in
`NextIntlClientProvider locale={locale} messages={data.messages}`, and renders `Modal width="lg"
testId="guide-dialog" labelledBy={titleId}`. While loading: a header with Close and a skeleton; error: message,
Retry, Download link. Ready: `GuideReader` through `dynamic(() => import("./GuideReader"), { ssr: false })`,
preloaded as soon as `GuideDialog` mounts.

`GuideReader` props `{ view: GuideView; titleId: string; onClose: () => void }`:
- Toolbar (sticky top, wraps on phones): Close (`data-autofocus`, `data-testid="guide-close"`), title (`h2` with
  `id={titleId}`), page input (`data-testid="guide-page-input"`, `inputMode="numeric"`) with "/ N", Prev
  (`guide-prev`), Next (`guide-next`), Zoom out (`guide-zoom-out`), Zoom in (`guide-zoom-in`), Fit width
  (`guide-fit`), Chapters (`guide-chapters`, shown when the outline is non-empty: a list of buttons that
  `pdf.getDestination` / `getPageIndex` and scroll), Download (`<a data-testid="guide-download" href={view.downloadUrl}
  download={view.file}>`), all at least 44 px targets.
- Body: `data-testid="guide-pages"` scroll container; one slot per page (`data-page={n}`,
  `data-testid="guide-page"`), height from page 1's viewport at the current scale; `IntersectionObserver`
  (root = container, rootMargin 100%) feeds `renderWindow`; drawn pages beyond `releasable` get `canvas.width = 0`
  and drop their text layer. Each drawn page: `<canvas role="img" aria-label={t("pageOf", ...)}>` plus a text layer
  div (`new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container, viewport }).render()`),
  `data-rendered="true"` on the slot when done. Cancel in-flight render tasks on zoom and unmount
  (`renderTask.cancel()`); destroy the loading task on unmount.
- Current page = the slot nearest the container's top third; updates the input and `savePage` (throttled to scroll
  end). On ready, scroll to `savedPage`.
- Desktop rail (`lg:` and up, `data-testid="guide-thumbs"`): small canvases rendered lazily by their own
  `IntersectionObserver` at scale 0.18; the current page has `aria-current="page"`.
- Keyboard on the panel: `readerKey` actions, ignored while the page input is focused (except Enter there jumps).
- Fit width default; zoom via buttons and keys only.
- Expose `data-page-count` and `data-current-page` on the root (`data-testid="guide-reader"`) for e2e.

CSS module: the pdf.js text layer essentials (absolute container, `color: transparent`, spans
`position: absolute; white-space: pre; transform-origin: 0 0; cursor: text`, `::selection` tint, `--scale-factor`
and `--total-scale-factor` set inline on the container as pdf.js 6 expects), the page slot background white with a
shadow token.

Chunk graph test: using `tests/helpers/import-graph.ts` (see `tests/unit/floor-chunks-graph.test.ts`), assert the
static closure of `src/experience/Experience.tsx` and of `src/app/[locale]/layout.tsx` contains neither
`pdfjs-dist` nor `src/components/guides/GuideReader.tsx`.

- [ ] Step 1: Write `tests/unit/guide-reader-model.test.ts` (each helper: steps snap, clamp NaN and bounds, window
  merges and pads, releasable distance, canvasScale caps the long side at 4096 and the ratio at 2, key map
  includes PageDown, ArrowRight, Home, End, `+`, `=`, `-`, `0`, storage blocked returns 1) and the chunk graph test.
- [ ] Step 2: Run them, expect failures.
- [ ] Step 3: `bun add pdfjs-dist@6.4.299`; implement `reader-model.ts`, `pdf.ts`, `GuideDialog.tsx`,
  `GuideReader.tsx`, the CSS module.
- [ ] Step 4: Run the unit tests, `bun run typecheck`, `bun run lint`, `bun run build`; then serve `out/` and check
  in a browser with `/api/guides/*` routed to the fixture (Task 6 helper) or a local prepared file that the worker
  loads from the site origin and pages render.
- [ ] Step 5: Commit `feat(guides): in-app pdf.js study guide reader`.

### Task 5: Classic shelf on /library and CertDialog action

**Files:**
- Create: `src/components/guides/GuideShelf.tsx` (server), `src/components/guides/GuideActions.tsx` (client)
- Modify: `src/app/[locale]/library/page.tsx`, `src/components/certs/CertDialog.tsx`
- Test: extend an existing library page test if one exists, else `tests/unit/guide-shelf.test.tsx` (jsdom render of
  `GuideActions` and `CertDialog` with `guide` set)

`GuideShelf({ locale })`: a `SectionSplit id="guides" title={t("guides")} intro={t("guidesIntro")}`; a list
(`ul`, 1 column on phones, 2 from `md`) of cards: cover `<img src={view.cover} width={240} height={340}
loading="lazy" decoding="async" alt="">` (decorative: the title is text), issuer and exam code (`pv-data`), title
(`h3`), summary, `{pages} pages · {size}`, domain bars (a flex row of segments whose `flex-grow` is the midpoint
weight, each with `title` and an `sr-only` list of "label weight"), and `GuideActions`.
`GuideActions({ slug, downloadUrl, file })`: a "Read" button (`pv-btn pv-btn-primary`, `data-testid="guide-read"`,
`onPointerEnter`/`onFocus` call `preloadGuideDialog`, `onClick` calls `openGuide(slug)`) and the download anchor
(`pv-btn`, `download={file}`, same-origin `href`, no `target`). Add `{ id: "guides", label: t("guides"), count:
guides.length }` to the page's `sections` and render the shelf after Talks, outside `TopicFilter` (guides have no
topics).

CertDialog: when `cert.guide` is set, a primary button "Read study guide" (`data-testid="cert-read-guide"`)
before the credential link, whose click calls `openGuide(cert.guide)` (DialogHost swaps the dialog). The
credential link becomes `pv-btn` (secondary) in that case.

- [ ] Step 1: Write the jsdom tests: `GuideActions` renders a same-origin download link with `download` and no
  `target`, and clicking Read dispatches an `hq:hud` event `{ type: "guide", slug }`; `CertDialog` with `guide`
  renders `cert-read-guide` and dispatches the command, without it renders nothing extra.
- [ ] Step 2: Run, expect failures.
- [ ] Step 3: Implement.
- [ ] Step 4: Run the tests, `bun run build`, and check `out/en/library.html` contains `id="guides"` and four
  `guide-read` buttons; check CSS size: `ls -la out/_next/static/**/*.css` gzip under 20,480 B
  (`gzip -c file | wc -c`).
- [ ] Step 5: Commit `feat(guides): study guide shelf on the Writing page and CertDialog reader action`.

### Task 6: e2e and perf

**Files:**
- Create: `e2e/fixtures/guide-pdf.ts`, `e2e/guides.spec.ts`, `e2e/perf/guide-reader.spec.ts`
- Modify: `e2e/budgets.ts`, `scripts/ci-plan.ts` mapping (add `src/components/guides/**`, `content/study-guides.json`,
  `functions/_lib/guides.ts` to the guides spec; follow how other specs map paths), `e2e/durations.json` only if
  the planner requires an entry

`e2e/fixtures/guide-pdf.ts`: `export function guidePdf(pages = 3): Uint8Array` writing a minimal valid PDF
(catalog, pages, N page objects A4 595x842 with a content stream `BT /F1 24 Tf 72 760 Td (Fixture page n) Tj ET`,
a Helvetica Type1 font, an outline with one entry per page titled "Chapter n", correct xref offsets), and
`export async function routeGuides(page: Page)` that fulfils `**/api/guides/**` with that PDF honoring `Range`
(206 with `Content-Range`, `Accept-Ranges: bytes`, `Content-Type: application/pdf`).

`e2e/guides.spec.ts` (desktop 1440x900 and phone 390x844 projects or `test.use({ viewport })` blocks):
1. `/en/library#guides`: four cards; Read on the first opens `guide-dialog`; `guide-page` 1 gets
   `data-rendered="true"`; the text layer contains "Fixture page 1"; Next moves `data-current-page` to 2; typing 3 +
   Enter moves to 3; End and Home keys; Esc closes and focus returns to the Read button.
2. No new page: `context.on("page", ...)` count stays 0 through open, chapters, download click.
3. Download: the anchor has `download` and a same-origin `href` with `download=1` and no `target`; clicking it fires
   a Playwright `download` event (`page.waitForEvent("download")`) whose `suggestedFilename()` ends with `.pdf`.
4. CertDialog path: on `/en/contact` (or wherever `Certifications` renders; check `CertIndex`), open the GH-600
   cert, click `cert-read-guide`, the reader opens with the GH-600 title.
5. Reopen the same guide: it resumes at the last page.
6. axe on the open reader (`@axe-core/playwright`, same tags as other axe specs): no violations.
7. Phone: the dialog fills the viewport (bounding box equals the viewport), thumbnails rail hidden.

`e2e/budgets.ts`: `export const GUIDE_READER_BUDGET = { chunk: 160 * 1024, worker: 360 * 1024 } as const;` (gzip
bytes). `e2e/perf/guide-reader.spec.ts`: on `/en/library`, record JS responses (`page.on("response")`) after the
Read click until the first page renders; gzip-size each body (`zlib.gzipSync`), the worker is the response whose
URL contains `pdf.worker`; assert both caps, and that no response before the click contains `pdfjs` (the reader is
not on the page's initial load).

- [ ] Step 1: Write the fixture and specs.
- [ ] Step 2: `bun run build`, then `bunx playwright test e2e/guides.spec.ts` and `PERF=1 bunx playwright test
  e2e/perf/guide-reader.spec.ts`; fix failures in the code (not by loosening assertions).
- [ ] Step 3: `bun run e2e:changed --dry` shows the new specs for the changed paths.
- [ ] Step 4: Commit `test(guides): reader e2e, download, no new tab, axe and chunk caps`.

### Task 7: Docs and decision

**Files:**
- Create: `docs/study-guides-runbook.md`, `docs/decisions/2026-10-19-l4-study-guides-reader-r2.md`
- Modify: `docs/content.md` (a "Study guides" section: dataset fields, the prepare and upload script, covers, never
  commit PDFs), `docs/features.md` (L4 and Classic: shelf, CertDialog, reader; status log line), `docs/agents/content.md`
  (loader, views, `CertView.guide`), `docs/agents/floor-l4-library.md` (a short "Study guides" note pointing to PR2
  for the vault), `docs/agents/folder-layout.md` (new paths), `docs/agents/performance.md` (reader caps),
  `docs/agents/ask.md` or `docs/deploy.md` (the R2 binding beside the other bindings), `README.md` only if its
  routes or budgets tables change (they do not: skip), plan Status line.

Runbook content: prerequisites (qpdf, poppler, cwebp, `bunx wrangler login` with R2 write), steps (`prepare`,
review `git diff content/study-guides.json public/study-guides`, `upload`, commit, deploy), replacing a guide (new
version key, old object deleted only after the deploy is live: `bunx wrangler r2 object delete
hq-study-guides/<slug>/<old>.pdf --remote`), adding a guide (human fields first, then `prepare`), verifying
(`curl -sI https://kurniadi.dev/api/guides/<slug>?v=<version>`, `curl -s -r 0-99 -o /dev/null -w "%{http_code}"`),
the safety scan and its `BENIGN_PHRASES` list, the bucket stays private (no r2.dev URL, no custom domain).

Decision file:

```markdown
# L4 Writing: study guides

- Date: 2026-10-19

The owner's four certification study guides (AI-103, AI-901, GH-600, Google Generative AI Leader) are readable in
the site: a pdf.js reader in a lazy chunk, streamed by HTTP Range from the private R2 bucket hq-study-guides
through the same-origin Pages Function /api/guides/<slug> (versioned immutable URLs), with a same-origin Download.
They appear as a Study guides shelf on the Writing page, a Read study guide action in the certification card and
(PR2) a Study Vault alcove off the L4 end plaza. The PDFs are never committed; page 1 covers are.
```

- [ ] Step 1: Write the docs; run `bunx vitest run tests/unit/docs-index.test.ts tests/unit/agents-md.test.ts` and
  the em dash scan test (`grep -rl "em dash" tests/unit | head -1`).
- [ ] Step 2: Commit `docs(guides): runbook, content, features, decision`.

### Final: verify and open PR1

- [ ] `bun run verify:quick`, `bun run e2e:changed`.
- [ ] Check CI in flight (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`); push only when at most
  one other PR run is in flight and no `main` run.
- [ ] Open a ready-for-review PR "feat(guides): read the certification study guides in the site (R2, reader,
  Writing shelf, CertDialog)"; fill the decision file's `- PR:` line in a follow-up commit on the branch.
