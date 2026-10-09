# Phase 0: Foundation and Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a statically exported, bilingual (EN/ID) Next.js site that renders the full public-safe career dataset as accessible HTML pages, with a per-locale CV PDF and CI, as the permanent no-WebGL fallback for Agent HQ.

**Architecture:** One validated content file (`content/site-content.json`) parsed by zod schemas at build time and exposed through typed accessors. Locale-prefixed App Router routes under `src/app/[locale]` are pre-rendered with `generateStaticParams`; `/` is a tiny static redirect page that picks a locale from `localStorage` or `navigator.language`. A Playwright script prints `/{locale}/cv` to PDF after `next build`.

**Tech Stack:** Next.js 16 (App Router, `output: "export"`), React 19, TypeScript strict, Tailwind CSS 4, next-intl 4, zod 4, next-mdx-remote (RSC), Vitest, Playwright, ESLint (flat config), Bun.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-09-agent-hq-design.md` plus appendices 01 to 08. Appendix wins for its topic. Appendix 07 section 7 (C1 to C9) overrides all content decisions.
- Locales `en` (default) and `id`; every user-facing content string is `{ en, id }`; natural professional Indonesian with "saya", technical terms kept in English.
- No em dashes (U+2014) anywhere: code, copy, docs, commits.
- Never publish: internal product codenames, private repo names, cloud resource names, phone, address, ID numbers, money amounts, salary or review text, the Master's degree, 2026 hackathon entries, any photo.
- Allowed: client names, freelance client names (TEMMPAT, DariOrdal, Jublia, BSSN, Shumi), employer names, pre-2026 CV metrics labelled self-reported.
- Current role: "Technical Consultant, Software & AI" at "Metrodata (PT Mitra Integrasi Informatika)", 2026-02 to present. Jenius: "Software Engineer", 2024-06 to 2025-12.
- Private evidence lives outside the repo and is never committed or copied wholesale.
- All asset `src` values point to files under `public/`.
- Production deploy and the `kurniadi.pages.dev` project are out of scope (Phase 6).

## File Structure

```
content/
  site-content.json             public-safe dataset (appendix 06 shape)
  blog/<slug>.<locale>.mdx      blog posts
  safety-blocklist.default.txt  committed minimal blocklist (generic terms)
  .safety-blocklist.local.txt   gitignored private blocklist (codenames, repo names)
messages/en.json, id.json       UI strings
src/
  app/(root)/layout.tsx, page.tsx      "/" redirect page
  app/[locale]/layout.tsx              html shell, fonts, next-intl provider, header/footer
  app/[locale]/page.tsx                Lobby summary
  app/[locale]/quick/page.tsx          Quick view
  app/[locale]/journey/page.tsx, [slug]/page.tsx
  app/[locale]/labs/page.tsx, [slug]/page.tsx
  app/[locale]/library/page.tsx
  app/[locale]/blog/[slug]/page.tsx
  app/[locale]/contact/page.tsx
  app/[locale]/cv/page.tsx
  content/schema.ts          zod schemas (types via z.infer)
  content/load.ts            getContent(), typed accessors
  content/selectors.ts       pure grouping/sorting helpers
  content/blog.ts            MDX file discovery and loading
  content/safety.ts          blocklist loading + text scanning
  i18n/routing.ts, request.ts
  components/                shared static-page UI (no 3D)
  lib/format.ts              Intl date and period formatting
scripts/build-cv.ts          Playwright PDF per locale
scripts/serve-static.ts      zero-dependency static server for out/
tests/content/*.test.ts      Vitest content tests
tests/unit/*.test.ts         Vitest selector and format tests
e2e/*.spec.ts                Playwright smoke and screenshots
.github/workflows/ci.yml
```

---

### Task 1: Scaffold

**Files:** `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `src/app/globals.css`, `.gitignore`.

- [ ] Run `bunx create-next-app@latest` into a temp dir (TypeScript, Tailwind, ESLint, App Router, `src/`, alias `@/*`, Bun), move files in, keep the existing `docs/`, `README.md`, `.gitignore`.
- [ ] `next.config.ts`: `output: "export"`, `images.unoptimized: true`, next-intl plugin.
- [ ] Add deps: `next-intl zod next-mdx-remote`; dev deps: `vitest @playwright/test`.
- [ ] Scripts: `dev`, `build` (`next build && bun scripts/build-cv.ts`), `build:web`, `typecheck` (`tsc --noEmit`), `lint`, `test` (`vitest run`), `e2e` (`playwright test`), `serve` (`bun scripts/serve-static.ts`).
- [ ] Verify `bun run typecheck && bun run lint && bun run build:web`. Commit `chore: scaffold Next.js static export with Bun`.

### Task 2: Content schema, accessors and safety tooling

**Files:** `src/content/schema.ts`, `src/content/load.ts`, `src/content/selectors.ts`, `src/content/safety.ts`, `content/safety-blocklist.default.txt`, `tests/content/schema.test.ts`.

**Interfaces (produces):**
- `SiteContentSchema`, `LocalizedTextSchema`, `PodSchema`, `TimelineEntrySchema`, etc.; `type SiteContent = z.infer<typeof SiteContentSchema>` and one exported type per schema (`Pod`, `TimelineEntry`, `Locale`, `LocalizedText`, ...).
- `getContent(): SiteContent` (parsed once, throws on invalid data at build time).
- `getPods(wing?)` sorted by tier then order; `getPod(slug)`, `getTimeline()` newest first, `getTimelineEntry(slug)`, `getYears()` (entries grouped by start year), `getPosts()`, `tr(text, locale)`.
- `loadBlocklist(): string[]` merges the committed default, `content/.safety-blocklist.local.txt` and `SAFETY_BLOCKLIST` (comma or newline separated); `findBlockedTerms(text, terms)`; `collectStrings(value)` yields `{ path, value }`.

Schema matches appendix 06, with these documented additions: `PostRef.url?` (external canonical URL for Medium posts), `Confidence` also accepts `"self-reported"` (C4), `Profile.currentRole` `{ title, org, since }`, `Contact.medium?`, `Mission.steps` typed per appendix 02.

- [ ] Write `tests/content/schema.test.ts` that parses a minimal fixture and rejects a missing `id` translation; run, see it fail.
- [ ] Implement schema, accessors, selectors; run tests to pass.
- [ ] Commit `feat(content): zod schema, typed accessors and safety helpers`.

### Task 3: Public-safe dataset (parallel agents)

**Files:** `content/site-content.json`, `content/.safety-blocklist.local.txt` (gitignored), `public/brand/kaw-monogram.svg`.

- [ ] Agent A writes Software Wing pods; agent B writes AI Wing pods; agent C writes profile, stats, skills, certifications, career archive, library, roof, side projects, public repos, missions and the local blocklist. Each validates its fragment against the zod schema.
- [ ] Merge fragments into `content/site-content.json`; review against C1 to C9 and main spec section 3.2.
- [ ] Commit `feat(content): public-safe bilingual dataset`.

### Task 4: Content tests

**Files:** `tests/content/dataset.test.ts`, `tests/content/safety.test.ts`, `tests/content/assets.test.ts`.

- [ ] Dataset validates; every `LocalizedText.id` is non-empty; ids and slugs unique; `podRef` and `timelineRef` resolve; hero pods have an architecture with at least 3 nodes; 3 hero pods per wing.
- [ ] Safety: no blocklisted term, no em dash in JSON, MDX or `messages/*.json`; no money pattern; no phone pattern; no Master's degree; no 2026 hackathon entry; no photo assets.
- [ ] Assets: every `Asset.src` exists in `public/`, no remote URLs.
- [ ] Run `bun run test`. Commit `test(content): schema, translation, safety and asset checks`.

### Task 5: i18n and layout shell

**Files:** `src/i18n/*`, `messages/*.json`, `src/app/(root)/*`, `src/app/[locale]/layout.tsx`, `src/components/SiteHeader.tsx`, `SiteFooter.tsx`, `LocaleSwitch.tsx`, `src/app/globals.css` (Neon Grid tokens from appendix 05 as CSS variables and Tailwind theme).

- [ ] Root redirect page: inline script reads `localStorage["hq:locale"]` then `navigator.language` (`id*` to `id`, else `en`), `location.replace`; `<noscript>` and link fallback to `/en`.
- [ ] Layout: Inter + JetBrains Mono via `next/font/google`, `setRequestLocale`, `hreflang` alternates, skip link, header with "Back to HQ" brand link, nav, EN/ID switch preserving the path.
- [ ] Commit `feat(web): i18n routing and Neon Grid shell`.

### Task 6: Static pages

**Files:** pages listed in File Structure plus shared components, `src/lib/format.ts`, `tests/unit/format.test.ts`, `tests/unit/selectors.test.ts`.

- [ ] TDD `formatYearMonth("2024-06", "id")` gives `Jun 2024`, `formatPeriod` handles `present`.
- [ ] Build each page from accessors only; `generateStaticParams` for locale x slug; `generateMetadata` with localized title and description.
- [ ] Blog: MDX via `next-mdx-remote/rsc`; missing translation shows the original with a language note.
- [ ] Commit per page group.

### Task 7: CV PDF

**Files:** `src/app/[locale]/cv/page.tsx` (print CSS), `scripts/serve-static.ts`, `scripts/build-cv.ts`.

- [ ] Serve `out/` on a free port, open `/{locale}/cv` in Chromium, `page.pdf({ format: "A4", printBackground: true })` to `out/cv/kurniadi-ahmad-wijaya-cv-{locale}.pdf`. `SKIP_CV=1` skips.
- [ ] Commit `feat(cv): build-time PDF per locale`.

### Task 8: E2E smoke and CI

**Files:** `playwright.config.ts`, `e2e/static-routes.spec.ts`, `e2e/screenshots.spec.ts`, `.github/workflows/ci.yml`.

- [ ] Smoke: each route returns 200 with an `h1` and real content in both locales; `/` redirects; CV PDFs exist.
- [ ] Screenshots (opt-in via `SCREENSHOTS=1`): `/en`, `/en/quick`, `/en/labs/<hero>` at 1440x900 and 390x844.
- [ ] CI: `check` job (install, typecheck, lint, unit), `build` job (Playwright Chromium, `bun run build`, e2e, upload `out/`), `preview` job that deploys `out/` to a separate Cloudflare Pages project `shinyq-hq` as a branch preview only when both secrets exist.
- [ ] Commit `ci: typecheck, lint, test, build, e2e and preview deploy`.

### Task 9: Docs and PR

**Files:** `README.md`, `AGENTS.md`.

- [ ] README: setup, scripts, structure, content workflow, safety blocklist. AGENTS.md: conventions for later phases.
- [ ] Final verification: `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`.
- [ ] Push, open PR "Phase 0: foundation and content" with screenshots, report to the creator session.
