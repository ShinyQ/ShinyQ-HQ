# Launch Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the launch plumbing for ShinyQ HQ: SEO (sitemap, robots, canonical, hreflang, JSON-LD, OG/Twitter), build-time OG images, a procedural audio engine, Cloudflare Web Analytics, a gated production deploy with Pages headers and redirects, and non-blocking Lighthouse CI.

**Architecture:** Everything stays static-export compatible. Metadata routes (`sitemap.ts`, `robots.ts`) and one catch-all route handler (`src/app/og/[...path]/route.tsx`) are `force-static` and pre-render to `out/`. OG images are rendered by `next/og` (satori) with fonts read from `@fontsource` WOFF files and written as real `.png` files so Cloudflare serves `image/png`. The audio engine is a framework-free module with dependency injection for tests, plus a thin React hook. Deploys are GitHub Actions jobs that no-op until secrets and a repository variable exist.

**Tech Stack:** Next.js 16 (App Router, `output: "export"`), next-intl, `next/og`, Web Audio API, Vitest, Playwright, Wrangler 3, `@lhci/cli` 0.15.

## Global Constraints

- No em dashes (U+2014) anywhere; a unit test scans the repo.
- Content is data: no career facts hardcoded in components (names, monogram, headline come from `site-content.json`).
- Static export only: no server runtime, every dynamic segment has `generateStaticParams` and `dynamicParams = false`.
- Canonical origin `https://kurniadi.pages.dev`, overridable at build time with `NEXT_PUBLIC_SITE_URL` (empty means default).
- Budgets (appendix 08): LCP < 2.5 s, CLS < 0.05, TBT < 300 ms, initial JS < 350 KB gzip, on `/en`, `/en/quick`, `/en/labs/{hero}`.
- Audio: muted by default, lazy `AudioContext` on first unmute, suspended when hidden, setting persisted in `localStorage`, all sounds procedural (owner decision overrides the audio-file note in appendix 05).
- Analytics: Cloudflare Web Analytics only, cookieless, no banner, omitted when the token is unset.
- Nothing deploys to production until the owner sets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CF_PAGES_PROJECT`.
- Out of scope: wiring audio into 3D/HUD components (owned by other sessions).

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/site.ts` | `SITE_URL` (`resolveSiteUrl`), `CF_BEACON_TOKEN` (`resolveBeaconToken`), `localePath`, `absoluteUrl`, `languageAlternates`, `ogImagePath`, `OG_IMAGE_SIZE`, `pageMetadata` (canonical, hreflang, OG, Twitter, article fields, image) |
| `src/lib/routes.ts` | `allPagePaths()`: every locale-relative page path (sitemap source) |
| `src/app/sitemap.ts`, `src/app/robots.ts` | Static metadata routes |
| `src/lib/jsonld.ts`, `src/components/JsonLd.tsx` | `Person`, `WebSite`, `CreativeWork` (pods), `BlogPosting` (posts), escaped serialization |
| `src/lib/og.tsx` | Neon Grid card renderer `renderOgImage(card)` |
| `src/lib/og-cards.ts` | `allOgTargets`, `ogSegments`, `parseOgSegments`, `ogCard(target)` |
| `src/app/og/[...path]/route.tsx` | Pre-renders `out/og/{locale}.png`, `out/og/{locale}/labs/{slug}.png`, `out/og/{locale}/blog/{slug}.png` |
| `src/components/Analytics.tsx` | Beacon script when a token is configured |
| `src/lib/audio/*` | Engine, synth voices, singleton, `useAudio`, README |
| `public/_headers`, `public/_redirects` | Cloudflare Pages headers and redirects |
| `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `lighthouserc.json` | Production deploy, preview deploy, Lighthouse |
| `docs/deploy.md` | Owner setup runbook |
| `tests/unit/seo.test.ts`, `tests/unit/audio.test.ts`, `e2e/seo.spec.ts`, `e2e/deploy.spec.ts` | Tests |

### Task 1: SEO metadata, sitemap, robots, JSON-LD

**Interfaces produced:** `pageMetadata({ locale, path, title?, description?, type?, publishedTime?, tags?, image?, imageAlt? }): Metadata`; `ogImagePath(target: OgTarget): string`; `allPagePaths(): string[]`; `personJsonLd(locale)`, `websiteJsonLd(locale)`, `podJsonLd(pod, locale)`, `postJsonLd(post, locale, contentLocale)`, `serializeJsonLd(data)`.

- [ ] Write `tests/unit/seo.test.ts` (site config fallbacks, `pageMetadata` canonical/hreflang/OG/Twitter, sitemap entry count and alternates, robots, JSON-LD shapes and `<` escaping). Run `bunx vitest run tests/unit/seo.test.ts`, expect failures.
- [ ] Implement `site.ts` helpers, `routes.ts`, `sitemap.ts`, `robots.ts` (both `export const dynamic = "force-static"`), `jsonld.ts`, `JsonLd.tsx`.
- [ ] Render `Person` + `WebSite` in `src/app/[locale]/layout.tsx`, `CreativeWork` on `labs/[slug]`, `BlogPosting` on `blog/[slug]`; pass `type: "article"` and the pod/post OG image to `pageMetadata`. Give the `(root)` layout `metadataBase` and the default card.
- [ ] Run the unit test, expect PASS. Commit `feat: add sitemap, robots, JSON-LD and complete share metadata`.

### Task 2: Build-time OG images

- [ ] Add dev dependencies `@fontsource/inter` and `@fontsource/jetbrains-mono` (satori needs WOFF or TTF, not WOFF2).
- [ ] Implement `og.tsx` (1200x630, void background, vignette, 60 px grid drawn as 1 px lines since satori does not tile gradients, glass card, accent bar, mono eyebrow, Inter 800 title with length-based size, clamped subtitle, monogram footer from profile) and `og-cards.ts`.
- [ ] Implement the `og/[...path]` route with `force-static`, `dynamicParams = false` and `generateStaticParams` from `allOgTargets()`.
- [ ] Extend `seo.test.ts` with target count (2 x (1 + pods + hosted posts)) and segment round-trip. Run, expect PASS.
- [ ] `bun run build:web`, then `file out/og/en.png` must report `PNG image data, 1200 x 630`. Inspect a long Indonesian card visually.
- [ ] Commit `feat: generate Neon Grid OG images at build time`.

Decision note: `opengraph-image.tsx` file conventions were tried first; the static export writes them as extensionless files (`out/en/opengraph-image`), which Cloudflare Pages would serve as `application/octet-stream`. The route-handler approach emits `.png` files instead.

### Task 3: Analytics beacon

- [ ] `Analytics.tsx` renders `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"...","spa":true}'>` only when `NEXT_PUBLIC_CF_BEACON_TOKEN` passes `resolveBeaconToken` (alphanumeric, 16 to 64 chars). Mount at the end of the locale layout body.
- [ ] Tests in `seo.test.ts`: null without token, correct attributes with token. Commit `feat: add optional Cloudflare Web Analytics beacon`.

### Task 4: Audio engine

**Interfaces produced (consumed by the 3D and HUD sessions):** `import { audio, useAudio, createAudioEngine, type SoundName } from "@/lib/audio"`; `audio.play(name: "beep" | "ding" | "whoosh" | "click")`, `audio.setRumble(speed: number)`, `audio.setMuted(muted: boolean)`, `audio.toggleMuted()`, `audio.isMuted()`, `audio.subscribe(listener)`, `audio.dispose()`; `useAudio(engine?) => { muted, setMuted, toggleMuted, play, setRumble }`.

- [ ] Write `tests/unit/audio.test.ts` with a fake `AudioContext` (muted default, lazy context, persistence key `hq:sound`, click rate limit 20/s, rumble threshold 1 u/s and clamp 12, visibility suspend/resume, subscribe, dispose, SSR safety). Expect failures.
- [ ] Implement `types.ts`, `synth.ts`, `engine.ts`, `singleton.ts`, `useAudio.ts`, `index.ts`, `README.md`. Run tests, expect PASS. Commit `feat: add procedural Web Audio engine`.

### Task 5: Deploy pipeline, Pages config, Lighthouse CI

- [ ] `public/_headers`: security headers and CSP (allows `static.cloudflareinsights.com` script and `cloudflareinsights.com` connect), immutable cache for `/_next/static/*`, day cache for `/og/*`.
- [ ] `public/_redirects`: `/cv.pdf` (and `/en/cv.pdf`, `/id/cv.pdf`) 301 to the generated CV PDFs.
- [ ] `scripts/serve-static.ts`: honor simple `_redirects` rules so e2e can verify them. `e2e/deploy.spec.ts`: redirect status and Location, exported `_headers`.
- [ ] `.github/workflows/deploy.yml`: build + e2e on `main`, deploy with `wrangler pages deploy out --branch=main` only when both secrets and `vars.CF_PAGES_PROJECT` exist. `ci.yml`: pass `vars.CF_BEACON_TOKEN` / `vars.SITE_URL`, preview project from `vars.CF_PREVIEW_PROJECT` (default `shinyq-hq`), non-blocking `lighthouse` job.
- [ ] `lighthouserc.json`: three URLs, 3 runs, error assertions for LCP/CLS/TBT budgets, warn for script size (358400 bytes), performance, accessibility, SEO.
- [ ] `docs/deploy.md`: owner runbook. Commit `ci: add production deploy, Pages headers and redirects, Lighthouse CI`.

### Task 6: Docs and verification

- [ ] Update `AGENTS.md` (folder layout, env vars, audio, OG, deploy).
- [ ] Add `e2e/seo.spec.ts` (sitemap/robots served, canonical, hreflang, Twitter card, OG PNG served as `image/png`, JSON-LD types, blog post card, root default card).
- [ ] Run `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`. Push and open the PR "Launch infra: SEO, OG images, audio engine, deploy".
