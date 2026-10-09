# AGENTS.md: conventions for ShinyQ HQ

Read this before changing anything. It applies to humans and AI agents in every build phase.

## Source of truth

- Design: `docs/superpowers/specs/2026-10-09-agent-hq-design.md` plus appendices `docs/superpowers/specs/agent-hq/01..08`. An appendix wins over the main spec for its topic.
- Owner content decisions C1 to C9 (appendix 07 section 7) override everything else about content.
- Phase plans live in `docs/superpowers/plans/`. Write one before starting a phase.

## Hard rules

- **No em dashes** (U+2014) anywhere: code, comments, copy, docs, commits, PR text. A unit test scans the repo. Use commas, colons, parentheses or "to".
- **Public repo.** Never commit private evidence, internal product codenames, private repository names, cloud resource names, phone numbers, addresses, ID numbers, money amounts, salary or review text, the Master's degree, 2026 hackathon entries or any photo. Client and freelance client names are allowed (C3, C8).
- **Content is data.** Pages, rooms, pods and missions are generated from `content/site-content.json`. Never hardcode career facts in components.
- **Bilingual.** Every user-facing content string is `{ en, id }`. Indonesian is natural and professional ("saya"), technical terms stay in English. UI strings live in `messages/en.json` and `messages/id.json` with identical keys.
- **Static export.** `output: "export"`: no server runtime, no middleware/proxy, no API routes, no `next/image` optimization. Every route must pre-render through `generateStaticParams` and set `dynamicParams = false` on dynamic segments.
- **Every route works without WebGL.** 3D (Phase 1+) mounts client-side on top of the HTML pages and must never replace their content.

## Folder layout

```
content/
  site-content.json             public dataset (validated by src/content/schema.ts)
  blog/<slug>.<locale>.mdx      blog posts, one file per language
  safety-blocklist.default.txt  committed generic blocklist
  .safety-blocklist.local.txt   PRIVATE, gitignored; real codenames and repo names
messages/{en,id}.json           UI strings (next-intl)
public/brand/                   committed brand assets (KAW monogram)
scripts/
  build-cv.ts                   prints /{locale}/cv to out/cv/*.pdf after next build
  serve-static.ts               serves out/ like Cloudflare Pages (used by e2e and CV)
  validate-fragment.ts          schema + safety check for content files
src/
  app/(root)/                   "/" language redirect (own root layout)
  app/[locale]/                 all localized routes (root layout with <html lang>)
  app/global-not-found.tsx      404.html
  components/                   static-page UI (server components unless noted)
  content/schema.ts             zod schemas, types via z.infer (appendix 06 + additions below)
  content/load.ts               getContent() and typed accessors
  content/selectors.ts          pure sorting and grouping helpers
  content/blog.ts               MDX discovery with translation fallback
  content/safety.ts             blocklist loading and forbidden patterns
  i18n/                         next-intl routing, request config, navigation, assertLocale
  lib/                          format (Intl dates), accent class maps, site metadata helpers
  experience/missions/          pure mission system: host.ts (MissionHost), rooms.ts (room catalog), runner.ts, surprise.ts, staticHost.ts
  hud/                          RoverTerminal, CommandPalette, search, MissionHud (static wiring), HudLaunchers, events
  experience/* store/           other folders reserved for Phases 1 to 5 (main spec section 4.3)
tests/unit/                     Vitest: schema, selectors, format, safety helpers, missions, search
tests/hud/                      Vitest + Testing Library (jsdom per file): terminal, palette, MissionHud
tests/content/                  Vitest: dataset, public safety, assets
e2e/                            Playwright smoke tests, missions + axe, opt-in screenshots
```

## Content access

- Import from `@/content/load`: `getContent`, `getProfile`, `getStats`, `getSkills`, `getCertifications`, `getAwards`, `getPods(wing?)` (hero, featured, listed, then `order`), `getPod(slug)`, `getTimeline()` (oldest first), `getTimelineEntry(slug)`, `getTimelineEntryById(id)`, `getYears()` (year rooms; pre-2019 entries fold into 2019 as the prologue), `getPosts()`, `getPost(slug)`, `getLibrary()`, `getRoof()`, `getContact()`, `getSideProjects()`, `getPublicRepos()`, `getMissions()`, `tr(text, locale)`.
- Types come from `@/content/schema` (`Pod`, `TimelineEntry`, `Mission`, `MissionStep`, `RoomId`, `Locale`, ...). Do not redeclare them.
- Room ids are `${FloorId}:${slug}` (`L3:voice-ai-contact-center`, `L2:jenius-2024`, `RF:contact`). `id === slug` for pods and timeline entries.
- Schema additions beyond appendix 06 (keep them documented here): `Confidence` also allows `"self-reported"` (C4); `Profile.monogram/subheadline/currentRole/timezone/story/principles`; `Certification.code`; `TimelineEntry.url/confidence`; `Pod.client`; `PostRef.url` (external posts such as Medium get no `/blog` page); `Contact.medium`; `SideProject.year`; top-level `awards[]`; mission steps `{ kind: "palette", filter }` and `{ kind: "surprise" }`.

## Missions and HUD

- The runner (`createMissionRunner`) is framework-free and talks to the world only through `MissionHost` (`src/experience/missions/host.ts`). The static tier uses `createStaticHost` (route navigation, one page load per mission); the 3D tier implements the same interface on top of the store. Never import React, the store or three.js into `experience/missions/`.
- Rooms come from `buildRoomCatalog` (`rooms.ts`). Room ids beyond pods, career entries and posts: `L1:profile`, `L1:stats`, `L1:skills`, `L1:certifications`, `L2:workshop`, `L4:publications`, `L4:talks`, `RF:contact`, `RF:cv`. Every room has a static `path` (open) and `floorPath` (drive).
- The layout builds a serializable `HudIndex` on the server (`src/hud/index-data.ts`) so zod and the dataset never ship to the client. HUD components get data through props.
- Open HUD overlays from anywhere with `openPalette(filter?)` / `openTerminal()` from `src/hud/events.ts` (window `hq:hud` events).
- localStorage keys owned by the HUD: `hq:terminal-seen` (first-visit auto-open, Lobby only), `hq:recent` (recent rooms on the static tier), `hq:visits` (alternates best-swe and best-ai). Tests and screenshots that must not see the auto-open terminal set `hq:terminal-seen`.

## i18n

- Locales `en` (default) and `id`, always prefixed. `/` is a static page that redirects using `localStorage["hq:locale"]`, then `navigator.language`.
- In server components call `assertLocale((await params).locale)` then `setRequestLocale(locale)`, and use `getTranslations({ locale, namespace })`.
- Use `Link` from `@/i18n/navigation` for internal links (it adds the locale prefix). Dates go through `src/lib/format.ts` (`formatYearMonth`, `formatPeriod`, `formatDate`); ranges are written "X to Y" / "X hingga Y", never with dashes.
- Metadata: `pageMetadata({ locale, path, title, description })` from `src/lib/site.ts` adds canonical and `hreflang` alternates.

## Styling

- Neon Grid tokens from appendix 05 live in `src/app/globals.css` (`@theme`): `void`, `glass`, `glass-border`, `ink`, `ink-2`, `ink-3`, accents `cyan violet pink green amber blue white`. `ink-3` is `#8b8b94` (not `#71717a`) to keep AA contrast on the void.
- Utility classes: `.glass`, `.label` (mono uppercase metadata), `.link`, `.prose-hq` (MDX). Accent classes must come from the static maps in `src/lib/accent.ts` so Tailwind can see them.
- Fonts: Inter and JetBrains Mono via `next/font/google` (`src/app/fonts.ts`). Touch targets at least 44 px (`min-h-11`).

## Public-safety lint

- `tests/content/safety.test.ts` scans `site-content.json`, MDX and messages with the merged blocklist (committed default + `content/.safety-blocklist.local.txt` + `SAFETY_BLOCKLIST` env var, which CI reads from a repository secret) and forbidden patterns (em dash, money, phone numbers, Azure hostnames, Master's degree).
- Blocklist format: one term per line or comma separated, `#` comments. Plain terms match case-insensitively on word boundaries; `/regex/` terms are case-sensitive.
- Validate content edits quickly with `bun run validate:content`.

## Workflow

- Package manager: Bun. Scripts: `dev`, `build` (export + CV PDFs), `build:web`, `typecheck` (`next typegen && tsc`), `lint`, `test`, `e2e`, `screenshots`, `serve`, `validate:content`.
- Before pushing: `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`.
- Commit in logical steps with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`). Prefer the `rtk` git wrapper. One PR per phase; do not merge without the owner.
- CI (`.github/workflows/ci.yml`) runs check, build + e2e, and a Cloudflare Pages preview to the separate `shinyq-hq` project only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist. Production (`kurniadi.pages.dev`) is Phase 6 only.

## Next.js version notes

This repo uses Next.js 16, which differs from older training data (async `params`, global `PageProps`/`LayoutProps` types from `next typegen`, `proxy` instead of `middleware`, `global-not-found`). Read the bundled docs in `node_modules/next/dist/docs/` before using an unfamiliar API. `agentRules: false` in `next.config.ts` stops `next dev` from injecting its own block into this file.
