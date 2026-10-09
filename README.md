# ShinyQ HQ

The portfolio of **Kurniadi Ahmad Wijaya**, Software Engineer and AI Engineer (Azure).

ShinyQ HQ is an explorable 3D neon tower ("Agent HQ"): pilot a small Screen Rover through five floors, ride the elevator, walk a 2019 to 2026 career corridor and open case-study pods in the Software Wing and the AI Wing. Every piece of content is also a normal, accessible, bilingual (EN / ID) HTML page, and those pages are the permanent no-WebGL fallback.

- Design spec: [`docs/superpowers/specs/2026-10-09-agent-hq-design.md`](docs/superpowers/specs/2026-10-09-agent-hq-design.md)
- Phase plans: [`docs/superpowers/plans/`](docs/superpowers/plans/)
- Repo conventions for contributors and agents: [`AGENTS.md`](AGENTS.md)

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, content schema, public-safe dataset, static pages, CV PDF, CI | Done |
| 1 | Tower shell: five floors, glass elevator, camera rigs, input intents, store, GPU tiers | Done |
| 2 | Screen Rover (keyboard, click/tap-to-move, joystick) and the L1 Lobby | Done |
| 3 to 6 | Career corridor, Labs, Library and Roof, missions, polish and launch | Planned |

Try it: open `/en`, press **Boot rover**, drive with WASD or the arrow keys (or click the floor), and change floors with the elevator panel, the mouse wheel or PageUp/PageDown. Add `?tier=lite` or `?tier=static` to force a tier, and use **Page view** to read the page without 3D.

## Stack

Next.js 16 (App Router, static export) · React 19 · TypeScript strict · three.js with React Three Fiber, drei and postprocessing · zustand · Tailwind CSS 4 · next-intl · zod · MDX (next-mdx-remote) · Vitest · Playwright · Bun · Cloudflare Pages.

## Getting started

```bash
bun install
bunx playwright install chromium   # needed for the CV PDF and e2e tests
bun run dev                        # http://localhost:3000/en
```

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Next.js dev server |
| `bun run build` | Static export to `out/` plus CV PDFs (`out/cv/kurniadi-ahmad-wijaya-cv-{en,id}.pdf`) |
| `bun run build:web` | Static export only (set `SKIP_CV=1` on `build` for the same effect) |
| `bun run serve` | Serve `out/` on http://127.0.0.1:4173 with Cloudflare Pages style resolution |
| `bun run typecheck` | Generate route types and run `tsc` |
| `bun run lint` | ESLint |
| `bun run test` | Vitest: content, safety lint, store, intents, navgrid A*, rover movement, camera rigs, URL sync, GPU tier |
| `bun run e2e` | Playwright against `out/` (run a build first): static routes plus the 3D experience on SwiftShader WebGL (tests force `?tier=`, since software WebGL alone maps to static) |
| `bun run screenshots` | HTML pages and 3D captures (boot, Lobby, L2 rail) at 1440x900, 1024x1366 and 390x844 into `screenshots/` |
| `bun run validate:content` | Schema and safety check for `content/site-content.json` |

## Routes

All routes are locale-prefixed (`/en/...`, `/id/...`). `/` redirects by the remembered or browser language.

| Route | Content |
|---|---|
| `/{locale}` | Lobby: profile, stats, both wings' hero pods, latest journey, skills, certifications. Mounts the 3D tower on top when WebGL is available. |
| `/{locale}/quick` | Quick view: everything on one page |
| `/{locale}/journey`, `/{locale}/journey/{slug}` | Career Archive 2019 to 2026 and the Workshop annex |
| `/{locale}/labs`, `/{locale}/labs/{slug}` | Software Wing and AI Wing case studies |
| `/{locale}/library`, `/{locale}/blog/{slug}` | Blog, publications, models, talks |
| `/{locale}/contact` | Roof: beacon, channels, CV kiosk |
| `/{locale}/cv` | Printable CV (source of the PDFs) |

## Content

- `content/site-content.json` is the single public dataset. It is validated by the zod schemas in `src/content/schema.ts` at build time and by the tests. All text is `{ en, id }`.
- Blog posts are MDX files in `content/blog/<slug>.<locale>.mdx`. A missing translation falls back to the original with a note.
- Private evidence never enters the repo. The public-safety lint blocks internal codenames and private repository names using `content/.safety-blocklist.local.txt` (gitignored) and the `SAFETY_BLOCKLIST` env var / CI secret, on top of the committed default list.

## Structure

```
content/      dataset, blog MDX, blocklists
messages/     UI strings (en, id)
scripts/      CV PDF builder, static server, content validator
src/app/      routes ([locale] pages, "/" redirect, 404)
src/components/  static-page UI
src/content/  schema, accessors, selectors, blog loader, safety lint
src/i18n/     next-intl routing and helpers
src/lib/      formatting, accents, metadata, GPU tier, URL sync, viewport
src/experience/  3D tower: canvas, scene, tower, rover, camera rigs, input intents, navgrid
src/hud/      HTML HUD over the canvas
src/store/    zustand store
tests/        Vitest unit and content tests
e2e/          Playwright tests
```

## CI and deploys

GitHub Actions runs typecheck, lint, unit tests, the full build (including the CV PDFs), Playwright smoke tests and screenshots on every PR. If the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets exist, PRs also deploy a preview to the separate Cloudflare Pages project `shinyq-hq`. Production on `kurniadi.pages.dev` is switched over in Phase 6.
