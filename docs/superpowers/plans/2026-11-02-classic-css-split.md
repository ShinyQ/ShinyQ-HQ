# Classic CSS Split (CL-1) Implementation Plan

Status: shipped in #392 (7ea0eab4), 2026-11-02

Owner request: the blog reading revamp needs room in the Classic stylesheet (61 B left under its 20,480 B Lighthouse
cap), so the owner chose to free room first with CL-1 from the Phase 1 performance report: move the styles only the
lazy client UI uses (3D HUD, dialogs, palette, Rover menu, Ask chat) out of the render-blocking Classic sheet into a
second sheet that loads with those chunks. No visible change; no cap moves (the freed bytes are reported to the owner).

**Goal:** Classic CSS drops by about 5 KB gzip on every page; the 3D, dialog, palette and Ask chat first opens look
pixel-identical, with no flash and no cascade change.

**Architecture:** One Tailwind source of truth, two outputs.

- `bun scripts/client-sheet.ts` (run by `build` and `dev`, like `build-shapes.ts`) walks the import graph
  (`importClosure` from `scripts/ci-plan.ts`): the Classic set is everything `src/app/**` reaches through static and
  dynamic imports without entering a client entry; the lazy-only files are the rest of what the client entries reach.
  It writes `src/app/lazy-sources.css` (gitignored): one `@source not` per lazy-only file or fully lazy folder.
- `globals.css` imports `lazy-sources.css`, so Tailwind builds the Classic sheet (C) without the lazy-only utilities.
- The client entries (`Experience`, `PaletteHost`, `RoverTerminal`, `AskChat`, `CvDialog`, `PaperDialog`,
  `CertDialog`) import `src/app/client-sheet.css`. A Turbopack loader (`scripts/client-sheet/loader.mjs`) builds it:
  it runs the Tailwind loader on `globals.css` twice (as is: C; without the `lazy-sources.css` import: the full sheet
  F) and keeps from F what C lacks (`scripts/client-sheet/split.mjs`).
- Cascade order: the client sheet loads after C (Turbopack appends the chunk's `<link>` and resolves `import()` on its
  `load`, so no first-open flash). Utilities are order-sensitive, so the split also copies every C rule that F orders
  after a client-only rule it can conflict with (same property family, same specificity), closed transitively. Proof
  sketch: for any element and property, the F winner either lives in the copied tail (it wins there, as in F) or no
  copied rule before it touches that property (so nothing after C can beat it). Theme variables, `@property`, the
  `@layer properties` fallback and keyframes add only what C lacks.

**Tech Stack:** Next.js 16 (Turbopack loaders), Tailwind 4 (`@tailwindcss/turbopack`), PostCSS, Vitest, Playwright.

## Global Constraints

- No em dashes anywhere. Bun; git via `rtk`; conventional commits.
- No cap changes (`lighthouserc.json`, `e2e/budgets.ts`). Report Classic CSS before and after, and the client sheet.
- Pixel-identical: the strict visual gate (3D poses) and a Classic page and overlay comparison against `main`.

## Tasks

- [x] **1. Split algorithm** (`scripts/client-sheet/split.mjs`): `splitClientSheet(full, classic)` returns the client
  sheet. Unit tests (`tests/unit/client-sheet.test.ts`): client-only rules kept, C rules dropped, order-restoring copies
  (a client `p-[13px]` before a C `sm:p-4`), transitive closure, theme and `@property` diffs, keyframes.
- [x] **2. Lazy sources** (`scripts/client-sheet.ts`): the closure walk, the folder compression, the writer; `build`
  and `dev` run it; `.gitignore` the output. Tests: the Classic closure keeps every page, layout and their islands; no
  Classic file is excluded; every entry imports `client-sheet.css` and no Classic file does.
- [x] **3. Loader and wiring**: `next.config.ts` rules (Tailwind for every non-module sheet but the client sheet; the
  split loader for it), `client-sheet.css`, the seven entry imports, `globals.css` import.
- [x] **4. Verify**: `verify:quick`; Classic pages and overlays pixel-identical against `out-main` (desktop, tablet,
  phone; the palette, Rover menu, Ask chat, CV, paper and cert dialogs opened on a Classic page); the strict visual
  gate; `e2e:changed`; the perf lane bytes gate (JS totals under caps; the client sheet reported as CSS); Lighthouse.
- [x] **5. Docs**: `docs/agents/performance.md` and `docs/agents/styling-and-i18n.md` (the two sheets and the rule
  for new lazy UI), `DESIGN.md` budget line, `docs/agents/folder-layout.md`.
