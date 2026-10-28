# Study guides runbook

How to prepare, upload, replace, add and verify the certification study guide PDFs that the site reads in its
in-app pdf.js reader (the Study guides shelf on the Writing page, "Read study guide" in the certification card and the
books of the L4 Study Vault).
Content rules: [`content.md`](content.md#study-guides). Code rules: [`agents/content.md`](agents/content.md#study-guides).

## How it fits together

- `content/study-guides.json` lists the guides. The human fields (slug, `certId`, code, spine, issuer, title,
  summary, edition, file name, exam domains) are written by hand; `pages`, `bytes`, `version` and `cover` are
  written by `bun scripts/study-guides.ts prepare`. `bun run validate:content` and `tests/content/study-guides.test.ts`
  check the schema and that each `certId` is a certification in `site-content.json`.
- The PDFs live only in the private R2 bucket `hq-study-guides`, under `<slug>/<version>.pdf`. `version` is the
  first 12 hex characters of the prepared file's sha256, so a new PDF always gets a new key and never overwrites an
  object a browser may have cached.
- The Pages Function `functions/api/guides/[slug].ts` (`functions/_lib/guides.ts`, binding `GUIDES` in
  `wrangler.toml`) serves `/api/guides/<slug>`: single byte ranges for pdf.js, ETag revalidation and `?download=1`
  for an attachment. `?v=<version>` (12 lowercase hex) reads exactly `<slug>/<version>.pdf` (404 when that object
  is gone) with a year of immutable caching, so a reader opened before a deploy keeps reading the same bytes. With
  no `?v=` (or a malformed one) it serves the version in the deployed `content/study-guides.json` with a five
  minute cache. The site always asks with `?v=`.
- The PDFs and the prepared copies are never committed. Prepared files go to `.study-guides/` (gitignored); only the
  JSON and the page 1 covers (`public/study-guides/<slug>.webp`) are committed.
- The bucket stays private: no `r2.dev` public URL and no custom domain on it. The Function is the only way in.

## Prerequisites

- `brew install qpdf poppler webp` (`qpdf`, `pdfinfo`, `pdftotext`, `pdftoppm` and `cwebp`).
- `bunx wrangler login` with an account that can write R2 objects in the site's Cloudflare account (Workers R2
  Storage Edit). `bunx wrangler whoami` shows the account and scopes; `bunx wrangler r2 object get
  hq-study-guides/<slug>/<version>.pdf --remote --pipe | head -c 5` (prints `%PDF-`) proves read access.
- The source PDFs somewhere outside the repository (for example `~/Documents/study-guides/`).

## Prepare, upload and publish

1. Prepare one or more guides (each `<slug>` must already have an entry in `content/study-guides.json`):

   ```sh
   bun scripts/study-guides.ts prepare gh-600=~/Documents/study-guides/GH-600_Study_Guide.pdf
   ```

   For each file it runs the safety scan (below), rewrites the PDF's Info dictionary (title, subject, author),
   packs its small objects into object streams with a deterministic ID (`qpdf --object-streams=generate
   --deterministic-id`, then `qpdf --check`; never `--linearize`, see "Why object streams" below), writes
   `.study-guides/<slug>.pdf`, records `pages`, `bytes` and `version` in the JSON and renders the page 1 cover
   (480 px wide webp). The deterministic ID means preparing the same source again should give the same bytes and
   version; if the version changes anyway, treat it as a replacement (below).
2. Review what changed: `git diff content/study-guides.json public/study-guides`. Only the machine fields and the
   cover should move; open the cover to check it.
3. Upload: `bun scripts/study-guides.ts upload` (every guide) or `bun scripts/study-guides.ts upload gh-600`. It first
   runs `check` on the same guides (each prepared file must match its entry's `bytes` and `version`; only the guides
   named need a prepared file), then puts
   `hq-study-guides/<slug>/<version>.pdf` with `Content-Type: application/pdf` and an immutable `Cache-Control`.
   Re-uploading an existing version is harmless (same key, same bytes).
4. Commit `content/study-guides.json` and the covers (never a PDF), for example
   `feat(guides): update the GH-600 study guide`, and open a PR.
5. Deploy: the merge to `main` deploys as usual ([`deploy.md`](deploy.md)). Upload before the deploy that carries
   the new version: the Function answers 404 for a version whose object is not in the bucket yet.

`bun scripts/study-guides.ts check [<slug> ...]` on its own confirms that the prepared files match the JSON.

## Replace a guide

1. Prepare the new source under the same slug: it gets a new `version`.
2. Upload it, commit, open the PR and let the merge deploy.
3. Keep the old object in the bucket at least a day after the deploy (and until `main` CI is green): pages and
   `/data/guides/{locale}.json` cached before the deploy (an hour for the data file), a reader left open and an
   automatic rollback (`rollback.yml`) still ask for the old `?v=`, and the Function answers 404 once its object
   is gone.
4. Then delete the old object:

   ```sh
   bunx wrangler r2 object delete hq-study-guides/<slug>/<old-version>.pdf --remote
   ```

   The old version is in `git log -p content/study-guides.json`.

## Add a guide

1. Add the certification to `site-content.json` first if it is not there (the guide's `certId` must match a
   `certifications[].id`; that is how the certification card gets "Read study guide"). An exam not passed yet may be
   listed as `in-progress` with the owner's approval ([content.md](content.md#certifications)).
2. Add the entry to `content/study-guides.json` with the human fields: `slug` (lowercase, 2 to 40 characters),
   `certId`, `code` (the exam code, or `null`), `spine` (at most 14 characters, the label on the book's spine in the
   L4 Study Vault), `issuer`, `title` and `summary` (`{ en, id }`, titles in Title Case with no first person),
   `edition` (`YYYY-MM`), `file` (the download file name, `Name_Like_This.pdf`) and 1 to 8 `domains` (`weight` as
   `[min, max]` percent and a `{ en, id }` label). Fill the machine fields with placeholders that pass the schema
   (`"pages": 1`, `"bytes": 1`, `"version": "000000000000"`, `"cover": "/study-guides/<slug>.webp"`).
3. Run `prepare`, review, `upload`, then commit as above. `tests/content/study-guides.test.ts` pins the slugs in
   file order (`SLUGS`), which also drive the `CertView.guide` links: update it in the same PR. The L4 Study Vault adds
   a book per guide from the real content, so `tests/unit/library-vault.test.ts` (space rules, every book framed) and
   `tests/unit/library-label-sweep.test.ts` must pass with the new book. Five books 3 u apart fill the vault plaza
   ([floor-l4-library.md](agents/floor-l4-library.md#study-vault)); a sixth needs a layout change, not a constant tweak.

## Verify

After a deploy (production is `https://kurniadi.pages.dev`; use `https://kurniadi.dev` once the custom domain
serves the site):

```sh
SITE=https://kurniadi.pages.dev
curl -sI "$SITE/api/guides/<slug>?v=<version>"
curl -s -r 0-99 -o /dev/null -w "%{http_code}\n" "$SITE/api/guides/<slug>?v=<version>"
curl -s -D - -o /dev/null -H 'Accept-Encoding: br, gzip' "$SITE/api/guides/<slug>?v=<version>"
```

- The first prints `200`, `content-type: application/pdf`, `accept-ranges: bytes`, an `etag`,
  `cache-control: public, max-age=31536000, immutable, no-transform`, `content-security-policy:
  frame-ancestors 'none'` and `content-disposition: inline; filename="<file>"`.
- The second prints `206` (a byte range, which pdf.js relies on).
- The third (a full GET that offers compression) prints `200` with a `content-length` equal to the guide's
  `bytes` and no `content-encoding` header (`no-transform` keeps Cloudflare from compressing the PDF, which would
  break byte ranges).
- `?download=1` switches the disposition to `attachment`. A wrong slug, a version missing from the bucket or a
  missing `GUIDES` binding answers 404 (the last logs "GUIDES binding missing"); an R2 error answers 502 (the
  Function logs "GUIDES read failed").
- Open the Writing page's Study guides shelf (`/en/library#guides`), read a guide and download it.

## Safety scan

`prepare` refuses a PDF whose text (`pdftotext -layout`) contains an Indonesian phone number. There is no term
blocklist (owner decision 2026-10-22), so read the guide yourself before preparing it: no client company names (C3),
private repository or cloud resource names, or other private data.

## Why object streams, not linearization

qpdf flattens the page tree when it linearizes, and pdf.js then reads every page object to open the file: on a
linearized guide that was 51 range requests and 3.3 MB of 4.4 MB before page 1 (8.9 s on production). With the page
dictionaries and outline items packed in object streams, pdf.js opens each guide in 3 or 4 range requests and
draws page 1 after about 0.2 MB. Re-check with a range probe (`pdfjs-dist` `PDFDataRangeTransport` counting
`requestDataRange` calls) after changing how the files are prepared.
