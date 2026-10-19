# Study guides runbook

How to prepare, upload, replace, add and verify the certification study guide PDFs that the site reads in its
in-app pdf.js reader (the Study guides shelf on the Writing page and "Read study guide" in the certification card).
Content rules: [`content.md`](content.md#study-guides). Code rules: [`agents/content.md`](agents/content.md#study-guides).

## How it fits together

- `content/study-guides.json` lists the guides. The human fields (slug, `certId`, code, spine, issuer, title,
  summary, edition, file name, exam domains) are written by hand; `pages`, `bytes`, `version` and `cover` are
  written by `bun scripts/study-guides.ts prepare`.
- The PDFs live only in the private R2 bucket `hq-study-guides`, under `<slug>/<version>.pdf`. `version` is the
  first 12 hex characters of the prepared file's sha256, so a new PDF always gets a new key and never overwrites an
  object a browser may have cached.
- The Pages Function `functions/api/guides/[slug].ts` (`functions/_lib/guides.ts`, binding `GUIDES` in
  `wrangler.toml`) serves `/api/guides/<slug>` from the key named by the deployed `content/study-guides.json`:
  single byte ranges for pdf.js, ETag revalidation, `?download=1` for an attachment, and a year of immutable
  caching when `?v=` matches the current version (five minutes otherwise).
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
   linearizes it with a deterministic ID (`qpdf --linearize --deterministic-id`, then `--check-linearization`), writes
   `.study-guides/<slug>.pdf`, records `pages`, `bytes` and `version` in the JSON and renders the page 1 cover
   (480 px wide webp). The deterministic ID means preparing the same source again should give the same bytes and
   version; if the version changes anyway, treat it as a replacement (below).
2. Review what changed: `git diff content/study-guides.json public/study-guides`. Only the machine fields and the
   cover should move; open the cover to check it.
3. Upload: `bun scripts/study-guides.ts upload` (every guide) or `bun scripts/study-guides.ts upload gh-600`. It first
   runs `check` (each prepared file must match its entry's `bytes` and `version`), then puts
   `hq-study-guides/<slug>/<version>.pdf` with `Content-Type: application/pdf` and an immutable `Cache-Control`.
   Re-uploading an existing version is harmless (same key, same bytes).
4. Commit `content/study-guides.json` and the covers (never a PDF), for example
   `feat(guides): update the GH-600 study guide`, and open a PR.
5. Deploy: the merge to `main` deploys as usual ([`deploy.md`](deploy.md)). Upload before the deploy that carries
   the new version: the Function answers 404 for a version whose object is not in the bucket yet.

`bun scripts/study-guides.ts check` on its own confirms that the prepared files match the JSON.

## Replace a guide

1. Prepare the new source under the same slug: it gets a new `version`.
2. Upload it, commit, open the PR and let the merge deploy.
3. The old object stays in the bucket until the new deploy is live and `main` CI is green: the live site, any
   cached page and an automatic rollback (`rollback.yml`) still point to the old version until then.
4. Then delete the old object:

   ```sh
   bunx wrangler r2 object delete hq-study-guides/<slug>/<old-version>.pdf --remote
   ```

   The old version is in `git log -p content/study-guides.json`.

## Add a guide

1. Add the certification to `site-content.json` first if it is not there (the guide's `certId` must match a
   `certifications[].id`; that is how the certification card gets "Read study guide").
2. Add the entry to `content/study-guides.json` with the human fields: `slug` (lowercase, 2 to 40 characters),
   `certId`, `code` (the exam code, or `null`), `spine` (at most 14 characters, the label on the book's spine in the
   planned 3D vault), `issuer`, `title` and `summary` (`{ en, id }`, titles in Title Case with no first person),
   `edition` (`YYYY-MM`), `file` (the download file name, `Name_Like_This.pdf`) and 1 to 8 `domains` (`weight` as
   `[min, max]` percent and a `{ en, id }` label). Fill the machine fields with placeholders that pass the schema
   (`"pages": 1`, `"bytes": 1`, `"version": "000000000000"`, `"cover": "/study-guides/<slug>.webp"`).
3. Run `prepare`, review, `upload`, then commit as above. `tests/content/study-guides.test.ts` counts the guides:
   update its expected count in the same PR.

## Verify

After a deploy (production is `https://kurniadi.pages.dev`; use `https://kurniadi.dev` once the custom domain
serves the site):

```sh
SITE=https://kurniadi.pages.dev
curl -sI "$SITE/api/guides/<slug>?v=<version>"
curl -s -r 0-99 -o /dev/null -w "%{http_code}\n" "$SITE/api/guides/<slug>?v=<version>"
```

- The first prints `200`, `content-type: application/pdf`, `accept-ranges: bytes`, an `etag`,
  `cache-control: public, max-age=31536000, immutable, no-transform`, `content-security-policy:
  frame-ancestors 'none'` and `content-disposition: inline; filename="<file>"`.
- The second prints `206` (a byte range, which pdf.js relies on).
- `?download=1` switches the disposition to `attachment`. A wrong slug or a version missing from the bucket
  answers 404; an R2 error answers 502 (the Function logs "GUIDES read failed" or "GUIDES binding missing").
- Open the Writing page's Study guides shelf (`/en/library#guides`), read a guide and download it.

## Safety scan

`prepare` refuses a PDF whose text (`pdftotext -layout`) contains a term from the public-safety blocklist (the
committed default list plus `content/.safety-blocklist.local.txt` or `SAFETY_BLOCKLIST`, minus the allowlist; the
same `loadBlocklist` the content tests use) or an Indonesian phone number. Run it with the private list present.

Textbook examples that trip the blocklist but carry no owner data are listed in `BENIGN_PHRASES` in
`scripts/study-guides.ts` and are removed from the text before the scan. Add a phrase there only after reading it
in context, quote it exactly (as short as it can be and still unique) and note the review date in the comment;
never add a bare blocklist term.
