# Performance Assessment Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: in review (owner request 2026-10-19; five PRs, A to E).

**Goal:** Fix the twelve findings of the 2026-10-19 performance assessment (measured on main 633750e) without any visible change: same layout, typography, colors, motion, 3D visuals and copy.

**Architecture:** Five small PRs grouped by risk. A: Classic quick wins (nav prefetch on intent, font preload check, CV images, lazy HUD pieces, deferred analytics beacon). B: the game-first LCP candidate. C: bytes (a tiny floor-order module for the store, the 3D page data as static versioned JSON, plain `postprocessing` instead of `@react-three/postprocessing`). D: 3D assets (one prebuilt logo atlas, room data split per floor with a build hash). E: runtime (idle frame cadence, weak-GPU tier list). Each PR reports before and after numbers from the same local harness and passes the visual gate.

**Tech Stack:** Next.js 16 static export, React 19, next-intl 4, three.js 0.186, React Three Fiber 9, postprocessing 6, Zustand 5, sharp, Vitest, Playwright, Lighthouse 12, Bun.

## Global Constraints

- Owner request (verbatim): "Fix all but make sure its not impacting the estetics and good design".
- Each fix keeps the look exactly: same layout, typography, colors, motion, 3D visuals, copy. Verify with the visual gate (`bun scripts/visual-gate.ts --base origin/main --profile strict`) and captures at 390x844 and 1440x900, Classic and 3D. Anything with a visible change needs the owner's OK first (send captures, then wait).
- Do not raise any budget (`e2e/budgets.ts`, `lighthouserc.json`, `e2e/perf/baseline.json`) without asking the owner. Moving bytes from Classic into the 3D path is allowed if the 3D session caps still pass (full 470 KB, lite 446.4 KB, first frame under 450 KB gzip).
- No em dashes (U+2014) anywhere. EN and ID for any copy. Bun, conventional commits.
- Docs in the same PR: `docs/agents/performance.md` plus the area doc a change touches; owner decisions as one new file each under `docs/decisions/` (never edit `docs/decisions.md` rows).
- CI: at most 2 runs in flight (both pull_request, at most one full; a `main` run stays alone). Check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` before every push.
- Do not touch `workers/office` or the Agent Office files (branch `feat/agent-office-l1`). Rebase when another PR merges first.
- Out of scope: three.js tree-shaking via explicit `extend`, precompressed brotli via a Worker.
- Each PR body lists before and after: Lighthouse on the affected pages (median of 3, mobile and desktop), 3D first-frame and session bytes, request counts, budget percentages, and the visual-gate result.

## Measurement harness (Task 0, not committed)

Scripts live in the session folder (`files/measure/`), never in the repo. Baseline export: `files/base-out` (main 633750e build).

- `lh.sh <outDir> <label>`: serves `<outDir>` with `bun scripts/serve-static.ts`, runs `npx -y lighthouse@12` 3 times per page and preset (mobile, desktop) on `/en /id /en/quick /en/cv /en/build /en/labs/voice-ai-contact-center /en/journey`, writes JSON, prints medians (score, FCP, LCP, TBT, CLS, script bytes and `script` budget %, requests, fetch count).
- `p3d.mjs <base> <tier> <prefetch>`: the assessment's `run3d.mjs` pointed at a local server: first-frame ms, requests and bytes by type to the first frame, 20 s session bytes.
- `mob3d.mjs <base>`: the assessment's mobile LCP probe (Pixel 7, slow 4G, 4x CPU, returning visitor): LCP entries with element and size.
- `shots.mjs <base> <dir>`: captures Classic (`?view=classic`) and 3D (`?tier=lite` and `?tier=full`, returning visitor, settled) at 390x844 and 1440x900 for `/en`, `/en/labs`, `/en/cv`, `/en/journey`; compare with `bun scripts/shot-diff.ts`.

---

## PR A: Classic quick wins (items 2, 6, 8, 9, 10)

### Task A1: Nav links prefetch on intent, not on viewport (item 2)

**Files:**
- Modify: `src/components/QuietLink.tsx`, `src/i18n/navigation.ts` (export `useRouter`)
- Test: `tests/unit/quiet-link.test.tsx` (new)
- Docs: `docs/agents/page-view.md` (navigation section), `docs/agents/performance.md`

**Interfaces:**
- Produces: `QuietLink` renders `<Link prefetch={false}>` by default and calls `router.prefetch(href)` once on `pointerenter`, `focus` or `touchstart` (never while `useQuietNav()` is true). An explicit `prefetch` prop other than `undefined` keeps today's behavior for that link.

- [ ] **Step 1: Write the failing test**: render `QuietLink href="/labs"` with a mocked `@/i18n/navigation` (`Link` passes props to `<a>`, `useRouter` returns `{ prefetch: vi.fn() }`); assert the rendered link has prefetch disabled (inspect the props passed to `Link`), `fireEvent.pointerEnter` calls `prefetch("/labs")` once, a second `focus` does not call it again, and with `html[data-hq-boot]` set no call happens.
- [ ] **Step 2: Run** `bunx vitest run tests/unit/quiet-link.test.tsx`: expect FAIL.
- [ ] **Step 3: Implement**:

```tsx
export function QuietLink({ prefetch, onPointerEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const quiet = useQuietNav();
  const router = useRouter();
  const done = useRef(false);
  const intent = prefetch === undefined && !quiet;
  const warm = () => {
    if (!intent || done.current || typeof props.href !== "string") return;
    done.current = true;
    router.prefetch(props.href);
  };
  return (
    <Link
      {...props}
      prefetch={quiet ? false : (prefetch ?? false)}
      onPointerEnter={(e) => (warm(), onPointerEnter?.(e))}
      onFocus={(e) => (warm(), onFocus?.(e))}
      onTouchStart={(e) => (warm(), onTouchStart?.(e))}
    />
  );
}
```

  Object hrefs (`{ pathname, query }`) skip intent prefetch unless trivially stringifiable; check the callers (`grep -rn "QuietLink" src`) and keep their behavior.
- [ ] **Step 4: Run** the unit test (PASS), then `bun run build`, serve `out`, and count `?_rsc=` requests on `/en` at 1440x900 with no interaction (expect 0, was 19) and after hovering the Work nav link (expect the route's RSC fetch). Click-through still navigates client-side (no full reload).
- [ ] **Step 5: Commit** `perf(nav): prefetch Classic links on hover, focus or touch instead of in the viewport`.

### Task A2: JetBrains Mono preload check (item 6)

**Files:** `src/app/fonts.ts`, `docs/agents/performance.md`

- [ ] **Step 1:** List above-the-fold mono text at 390x844 and 1440x900 on `/en`, `/en/labs`, `/en/cv`, `/en/quick` and on the boot cover (`.hq-boot-log` uses `var(--font-mono)`; the header site name and nav floor labels use `font-mono`). Use Playwright: for each element in the first viewport with computed `font-family` containing the JetBrains variable, record it.
- [ ] **Step 2:** If any mono text is in the first viewport on any of those pages (expected: the boot cover log and the desktop header), keep the preload, and record the finding in `docs/agents/performance.md` ("JetBrains Mono stays preloaded: the boot log and the desktop header paint it at first paint"). Otherwise set `preload: false` on `jetbrains` and confirm with captures that the first paint does not change (no FOUT difference in a 4x CPU, slow 4G filmstrip).
- [ ] **Step 3: Commit** (`docs(perf): ...` or `perf(fonts): ...`).

### Task A3: CV page images (item 8)

**Files:** `scripts/cv-pages.ts`, `scripts/pdf-pages.ts` (encoder quality), `public/cv/pages/*`, `content/generated/cv-pages.json`, `src/components/cv/*` (the page `<img>`/`<picture>`), `tests/content/cv.test.ts`, `docs/content.md`, `docs/agents/content.md`

- [ ] **Step 1:** Read how the CV viewer renders the pages (`grep -rn "srcSmall\|cv-pages" src`). Note the `sizes`/`srcset` and whether page 2 is below the fold at 390x844 and 1440x900.
- [ ] **Step 2:** Re-encode each width with a better encoder setting and pick the smallest that is visually identical: try WebP `-q` sweep with `-m 6 -sharp_yuv` and AVIF via sharp (`avif({ quality, effort: 9, chromaSubsampling: "4:4:4" })`). Acceptance: SSIM >= 0.995 against the current committed image at the same width (compute with sharp: grayscale raw buffers, windowed SSIM in a small script) and no visible difference in a 2x zoom crop of text. If AVIF wins by more than 15%, ship `<picture>` with an AVIF `<source>` and the WebP `<img>` fallback; else ship the re-encoded WebP.
- [ ] **Step 3:** Page 2 (and later pages) get `loading="lazy"` and `decoding="async"`; page 1 keeps eager (`fetchPriority="high"` if it is the LCP).
- [ ] **Step 4:** Update `scripts/cv-pages.ts` so a rerun reproduces the committed files; update the manifest; run `bunx vitest run tests/content/cv.test.ts`.
- [ ] **Step 5:** Lighthouse `/en/cv` mobile and desktop before and after (image bytes, LCP). **Commit** `perf(cv): smaller page images, lazy pages after the first`.

### Task A4: Lazy HUD pieces, Ask status and HUD index on demand (item 9)

**Files:** `src/hud/MissionHud.tsx`, `src/hud/CommandPalette.tsx`, `src/hud/RoverTerminal.tsx`, `src/hud/search.ts`, `src/lib/audio/*`, `src/hud/ask/availability.ts`, `src/hud/ask/AskDock.tsx`, `src/hud/index-client.ts`, tests under `tests/hud/`, `docs/agents/hud-and-drawer.md`, `docs/agents/ask.md`, `docs/agents/performance.md`

**Interfaces:**
- Produces: `CommandPalette`, `RoverTerminal` and `buildPaletteEntries` load through `import()` on first open (`openPalette`/`openTerminal` events or the hotkeys), with a prefetch on hover/focus of the launchers. The audio engine (`src/lib/audio/engine.ts`, `synth.ts`, `music.ts`) loads on the first call that needs sound (keep the `audio` facade API identical: calls before load are queued or are no-ops that the engine replays, e.g. mute state). `GET /api/ask` runs when the Ask dock or pill opens (and when something needs `isAskEnabled` to render), not on every page view; the HUD index loads on palette or terminal open, or at idle after load (`requestIdleCallback`, 2 s timeout).

- [ ] **Step 1:** Map today's eager callers: `grep -rn "requestAskStatus\|useAskStatus\|loadHudIndex\|useHudIndex\|from \"@/lib/audio\"" src`. Record which run on page load in a Classic page view and what UI depends on them at first paint (for example the hero Ask bar showing or hiding: if its visibility depends on the status, it must not flash or shift; keep a check at idle for that surface only if needed and document it).
- [ ] **Step 2:** Write failing tests: (a) rendering `MissionHud` does not import `CommandPalette` until `openPalette()` is dispatched (mock the dynamic module and assert the loader is called on open, not on mount); (b) `availability` does not fetch on mount, fetches on the first `openAsk`; (c) the audio facade queues `setMuted`/`play` before the engine loads and applies them after.
- [ ] **Step 3:** Implement with `React.lazy` + `Suspense fallback={null}` (the palette and terminal render nothing when closed today, so the closed state is pixel-identical); the first open awaits the chunk (prefetch on launcher hover/focus keeps it instant). Keyboard shortcuts must still work on the first press (the open event sets state; the lazy component mounts open).
- [ ] **Step 4:** Try next-intl `experimental.messages.precompile` (Next config plugin option): build, compare the Classic JS bytes and TBT; keep it only if it measurably helps (more than 2 KB gz or TBT down) and `bunx vitest run tests/unit/i18n*` plus the e2e i18n specs pass; else revert and note the result in `docs/agents/performance.md`.
- [ ] **Step 5:** Run `bunx vitest run tests/hud tests/ask`, `bun run e2e:changed`. **Commit** in two steps: `perf(hud): load the palette, terminal and search on first open` and `perf(ask): check Ask status when the dock opens`.

### Task A5: Analytics beacon after load (item 10)

**Files:** `src/components/Analytics.tsx`, `tests/unit/analytics*.test.ts` (find with `grep -rln cfBeaconScript tests`), `docs/agents/stats.md`, `docs/agents/performance.md`

- [ ] **Step 1: Write the failing test**: `cfBeaconScript("abc")` contains `addEventListener("load"` and the `readyState` check, and still contains the opt-out guard and `spa:true` config.
- [ ] **Step 2: Implement**: wrap the inject in `function go(){...}` and run `if(document.readyState==="complete")idle();else addEventListener("load",idle,{once:true})` where `idle` uses `requestIdleCallback(go,{timeout:2000})` when available, else `setTimeout(go,0)`. The beacon uses the Navigation Timing entry and records the page view when it loads, and `spa:true` still records later History navigations, so no page view is lost except visits that leave before `load`. `scripts/csp-hashes.ts` recomputes the hash at build.
- [ ] **Step 3:** Build, serve, confirm in a Playwright trace that `beacon.min.js` starts after the `load` event and after the app chunks; `tests/unit/csp.test.ts` passes. **Commit** `perf(analytics): load the Cloudflare beacon after the page loads`.

### Task A6: Dev-only `braces` advisory (optional)

- [ ] If `bun pm why braces` shows a dev-only chain and a patched version satisfies the ranges, bump it in `bun.lock` (`bun update braces` or an `overrides` entry) and confirm `bun audit` (or `npm audit --omit=optional`) no longer lists it. Skip if it needs a major bump of a parent. **Commit** `chore(deps): bump braces (dev-only advisory)`.

### PR A wrap-up

- [ ] `bun run verify:quick`, `bun run e2e:changed`, Lighthouse harness before/after, shot-diff Classic and 3D at 390x844 and 1440x900 (no pixel change), visual gate strict. Update `docs/agents/performance.md`; decision file `docs/decisions/2026-10-19-classic-links-prefetch-on-intent.md`. Open the PR (ready for review), report numbers to the owner.

---

## PR B: Game-first LCP (item 1)

### Task B1: An early LCP candidate without a visible change

**Files:** `src/hud/Hud.tsx` (`HintBar`), `src/components/BootCard.tsx`, `src/components/BootCover.tsx`, `src/app/globals.css`, `e2e/` (an LCP check), `docs/agents/performance.md`, `docs/agents/hud-and-drawer.md`

Facts: on a returning mobile visitor (Pixel 7, slow 4G, 4x CPU) the LCP moved from a boot card log line (972 ms) to the HUD hint `<p data-testid="hint">` (17,400 px2, 5,324 ms) once the HUD mounted. Chrome records a text block once, at its first paint, sized by its text; a later, larger block replaces the candidate until the first input. Opacity-0 paints do not count; occluded paints do count. The Classic page under the cover is `visibility: hidden` on purpose (no late page candidate).

- [ ] **Step 1:** Reproduce with `files/measure/mob3d.mjs` against a local build (`?tier=lite`, returning visitor); record the LCP entries (element, size, time) for 390x844, 412x915 and 1440x900. Also record the hint's first paint relative to the HUD mount.
- [ ] **Step 2:** Try, in this order, measuring each with Step 1, and keep the first that makes the final LCP land at the boot card time (within 100 ms of the cover's first paint) with zero pixel change in captures of the boot cover, the boot overlay and the settled HUD:
  1. Mount `HintBar` with the HUD during the boot phase behind the boot overlay (same element; hidden only by the overlay above it, not by opacity or visibility), so its first paint happens while the cover is up and later reveals are not new paints. Verify the HUD does not show through the overlay (the overlay is opaque where the hint sits) and that the reveal timing is unchanged.
  2. Render a boot-card text block that is already on screen as one block: for example the owner block (name, headline, motto, role) as one text container with block-level line breaks (`<br>` or `display: block` spans inside one block) so its first paint is one larger candidate. Must produce identical pixels (same fonts, sizes, margins; compare captures).
  3. If neither works without a visible change, stop and send captures of the smallest visible change to the owner before going on.
- [ ] **Step 3:** Add an e2e check (lite, returning visitor, the mobile device profile) that reads `largest-contentful-paint` entries and asserts the last entry's `startTime` is not later than the boot cover's first paint plus 1,000 ms and its element is not `[data-testid=hint]`. Tag `@nightly` if it is slow.
- [ ] **Step 4:** Shot-diff boot cover, boot overlay, settled HUD at 390x844 and 1440x900 (no change), visual gate strict. **Commit** `perf(lcp): ...`; PR B with before and after LCP from `mob3d.mjs` and Lighthouse on `/en` with the 3D tier forced where possible.

---

## PR C: Bytes (items 3, 4, 7)

### Task C1: A tiny floor-order module for the store (item 3)

**Files:**
- Create: `src/experience/floorOrder.ts` (`FLOOR_IDS`, `floorIndex`), `src/experience/floors/lobby/spawn.ts` (the kiosk axis math, `LOBBY_SPAWN`, `LOBBY_SPAWN_HEADING`, plus the constants they need: `LOBBY_HOLOGRAM`, `LOBBY_OBSERVATORY`, `KIOSK_AXIS`, `KIOSK_RADIUS`, `KIOSK_DEPTH`, `KIOSK_WIDTH`, `KIOSK_STOP_GAP`, `KIOSK_CENTER`)
- Modify: `src/experience/config.ts` (import and re-export; `LOBBY` uses the spawn module), `src/store/useHQStore.ts` (import from the new modules), any other Classic-reachable importer of `@/experience/config` (for example `src/hud/drawer/DrawerHost.tsx` `READY_FLOORS`: import `FLOOR_IDS` from `floorOrder` instead)
- Modify: `scripts/check-client-chunks.ts` (fail the build when a Page View chunk contains a floor layout module; see Step 4)
- Test: `tests/unit/floor-order.test.ts` (new), existing `tests/unit/lobby-layout.test.ts`

**Interfaces:**
- Produces: `FLOOR_IDS`, `floorIndex(id)` from `@/experience/floorOrder`; `LOBBY_SPAWN: Vec2`, `LOBBY_SPAWN_HEADING: number` from `@/experience/floors/lobby/spawn`. Both modules import only `@/lib/floors` and types. `config.ts` keeps exporting the same names and values (`LOBBY.spawn === LOBBY_SPAWN`).

- [ ] **Step 1: Write the failing test**: `floorOrder.FLOOR_IDS` equals `config.FLOOR_IDS`; `LOBBY_SPAWN` and `LOBBY_SPAWN_HEADING` equal `LOBBY.spawn` and `LOBBY.spawnHeading`; and a source check: `floorOrder.ts` and `spawn.ts` have no import except `@/lib/floors`, `@/content/schema` types and `../types` types.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Move the code (pure move, values unchanged). **Step 4:** Find every Classic-reachable import of `config.ts` with the assessment's attribution method: build, then map `/en` chunks back to sources with their source maps (`productionBrowserSourceMaps` temporarily, or `files/measure/attrib.mjs`); repeat until no `src/experience/floors/*/layout.ts`, `hallGallery.ts` or `nav/road.ts` remains in a Classic chunk. Add that rule to `scripts/check-client-chunks.ts` (scan the chunks referenced by `out/en.html` for a marker string unique to the floor layouts, for example a constant name that survives minification, or the module ids if the chunk keeps them).
- [ ] **Step 5:** Classic `/en` JS bytes before and after (expect about 25 KB gz less); 3D first-frame and session bytes (the 3D path may grow; must stay under the caps). Run `bunx vitest run tests/unit`. **Commit** `perf(store): keep floor layouts out of the Classic bundle`.

### Task C2: 3D page data as static versioned JSON (item 4)

**Files:**
- Modify: `src/app/data/[...path]/route.ts` (add `experience/{locale}.json`), `src/experience/gate-data.ts` (shared builder stays), `src/experience/ExperienceGate.tsx` (no `data` prop; fetch the JSON alongside the 3D chunk), the five gated pages (`src/app/[locale]/page.tsx`, `labs/page.tsx`, `labs/[slug]/page.tsx`, `journey/page.tsx`, `library/page.tsx`, `contact/page.tsx`, and any other `ExperienceGate` caller), `public/_headers` if `/data/*` caching needs a note
- Create: `src/experience/data-client.ts` (`loadExperienceData(locale, version)`), a build-time version (content hash of the JSON, like `hudIndexVersion`)
- Test: `tests/unit/experience-data-route.test.ts`, existing gate tests

**Interfaces:**
- Produces: `GET /data/experience/{locale}.json?v=<hash>` returns exactly `await experienceDataFor(locale)`; `ExperienceGate({ locale, version, startFloor, startRoom })`; `loadExperienceData(locale, version): Promise<ExperienceData>` (cached per locale, retried after a failure).

- [ ] **Step 1: Failing tests**: the route's static params include `experience/en.json` and `experience/id.json`; its JSON deep-equals `experienceDataFor(locale)`; the gate does not render `Experience` before the data resolves, and a failed fetch takes the same path as a failed chunk (static page plus the existing notice).
- [ ] **Step 2:** Implement. Start the fetch where the 3D chunk starts (`loadExperience` and the boot-first early load) so it runs in parallel; the hash comes from the server component (`experienceDataVersion(locale)`), so the HTML carries only the short version string. Keep the floor names localized (they come from `messages`).
- [ ] **Step 3:** Check the RSC payload of `/en` no longer contains the data (grep `out/en.html` and the `.txt`/RSC files for a key like `"floors":{"L1"`); expect about 8.9 KB br less per gated page. 3D first frame time unchanged within noise (the fetch is parallel). Visual gate strict. **Commit** `perf(3d): serve the 3D page data as static versioned JSON`.

### Task C3: Plain `postprocessing` composer (item 7)

**Files:** `src/experience/scene/Effects.tsx`, `src/experience/prototype/certs/CertsWorld.tsx` (dev prototype: migrate or drop its bloom to the same component), `package.json` / `bun.lock` (remove `@react-three/postprocessing` when nothing imports it), `docs/agents/3d-experience.md`, `docs/agents/performance.md`

**Interfaces:**
- Consumes: `postHandle.set({ composer, bloom })` (unchanged), `sceneTarget()` (composer `inputBuffer`), `sceneSettings("full").bloom`.
- Produces: `Effects({ multisampling, levels })` default export with the same output.

- [ ] **Step 1:** Read `node_modules/@react-three/postprocessing/dist/*` `EffectComposer` to copy its exact setup: `new EffectComposer(gl, { depthBuffer, stencilBuffer, multisampling, frameBufferType: HalfFloatType })`, the `RenderPass`, the merged `EffectPass(camera, ...effects)`, how it disables renderer tone mapping, the render priority (`useFrame(..., 1)`), `setSize` on resize and DPR changes, `autoClear` handling, and `NormalPass`/`DepthDownsamplingPass` only when enabled (they are not today). Also the `Bloom` wrapper defaults (`mipmapBlur`, `levels`, `luminanceThreshold`, `luminanceSmoothing`, `intensity`, `radius`, blend function) and the `ToneMapping` defaults (`mode`, `resolution`, `whitePoint`, `middleGrey`, `minLuminance`, `averageLuminance`, `adaptationRate`).
- [ ] **Step 2:** Rewrite `Effects` with `useThree` + `useMemo` (+ `useDispose` for the composer, passes and effects) + `useFrame(() => composer.render(delta), 1)`, matching every default above. Keep `postHandle` wiring and the `multisampling`/`levels` starting values.
- [ ] **Step 3:** Remove `@react-three/postprocessing` from `package.json` if no import remains (`bun remove @react-three/postprocessing`); confirm `n8ao` and `maath` are no longer in the full-tier chunks (search the `out/_next/static/chunks` files for `N8AO` and `maath`).
- [ ] **Step 4:** Visual gate strict (full tier poses must be pixel-equal within the strict tolerance), perf lane `E2E_PORT=4500 bun run e2e:perf` (draw calls, post passes, programs, memory). 3D full first-frame and session bytes before and after. **Commit** `perf(3d): build the full-tier composer with postprocessing directly`.

### PR C wrap-up

- [ ] Totals: Classic `/en` script bytes and budget %, 3D first frame and session per tier versus caps. Decision file `docs/decisions/2026-10-19-floor-order-out-of-classic.md` (owner: moving bytes to the 3D path is fine if caps pass). `verify:quick`, `e2e:changed`, perf lane.

---

## PR D: 3D assets (item 5)

### Task D1: One prebuilt logo atlas

**Files:**
- Create: `scripts/logo-atlas.ts` (build step, sharp), output `public/atlas/` is generated (gitignored) or written straight into `out/` after `next build` (choose the one `scripts/check-client-chunks.ts`, the static export and the dev server all serve; the dev server needs it too, so prefer generating into `public/atlas/` before `next build` and in `predev`-like flow via `bun scripts/logo-atlas.ts` inside `build`, `build:web` and `dev`)
- Modify: `src/experience/floors/lobby/logoAtlas.ts` and its callers (`LogoQuads.tsx`, `CertWall.tsx`, `scene/sharedResources.ts`): load one image instead of drawing each logo into a canvas
- Test: `tests/unit/logo-atlas.test.ts`

- [ ] **Step 1:** Read how the runtime atlas is drawn today (cell size, padding, background, color space, mipmaps, `flipY`, premultiplied alpha, anisotropy) for both walls. Record per-logo pixel size in the runtime canvas.
- [ ] **Step 2:** Write the build script: same `atlasLayout(srcs)` order (import the pure function), same cell size or larger (a 2x cell is allowed: same padding ratio, higher resolution), rasterize each logo (SVG via sharp at the cell size, PNG resized with the same fit), composite into one transparent WebP (lossless or `nearLossless`), write `public/atlas/logos-<hash>.webp` and `public/atlas/logos.json` (`{ file, cols, rows, cell, srcs }`). The client reads the manifest at build (import the JSON) so no extra request.
- [ ] **Step 3:** Client: `TextureLoader` (or `ImageBitmapLoader`) on the one file with the same texture settings; UVs from the same layout. Failing test: the manifest `srcs` equal the runtime `atlasLayout` order for today's content.
- [ ] **Step 4:** Visual gate strict on the L1 poses (skills wall and cert wall must match), requests and bytes for the Lobby (52 files, 116.5 KB before). **Commit** `perf(lobby): one prebuilt logo atlas for the skills and cert walls`.

### Task D2: Room data per floor with a build hash

**Files:** `src/app/data/[...path]/route.ts`, `src/hud/drawer/data-path.ts`, `src/hud/drawer/data.ts`, `src/hud/drawer/DrawerHost.tsx`, `src/hud/HologramOverlay.tsx`, `src/experience/Experience.tsx` (reactor and topics loads), `src/experience/floors/labs/HologramStage.tsx`, `src/hud/drawer/paper.ts`, `src/experience/floors/filterUrl.ts`, `src/experience/floors/labs/reactorUrl.ts`, tests in `tests/hud/` and `tests/unit/`

**Interfaces:**
- Produces: files `/data/rooms/{locale}-{floor}.json?v=<hash>` (`floor` in L1, L2, L3, L4, RF; B1 stays `b1-{locale}.json`, now with `?v=`), `loadFloorViews(locale, floor): Promise<RoomViews>`, `loadRoomView(locale, roomId)` (routes to the room's floor file). `loadRoomViews(locale)` stays only if a caller truly needs every floor (search); otherwise remove it.

- [ ] **Step 1:** Map every consumer and what it reads (room ids per floor; cross-floor lookups such as search or deep links). Failing tests: the split files together deep-equal today's single file; each room lands in its floor's file; the loader requests only the floor of the room asked for; the URL carries `?v=`.
- [ ] **Step 2:** Implement. Idle prefetch loads the current floor's file first, then the others only when the rover heads to them (elevator target or floor-chunk prefetch hook), not all floors at idle. Version: a content hash computed at build (same helper as C2).
- [ ] **Step 3:** E2E: deep links (`/en/labs/<slug>`, `#labs-tech=`, `#highlights-*`, `/en/contact#visits`, `#production`), drawer open on every floor, language switch. `bun run e2e:changed`. Bytes on idle for a Lobby session before and after (67 KB br before). **Commit** `perf(drawer): room data per floor with a build version`.

---

## PR E: Runtime (items 11, 12)

### Task E1: Idle frame cadence (item 11)

**Files:** `src/experience/scene/framePacer.ts`, `src/experience/scene/FrameLoop.tsx`, a new `src/experience/scene/idle.ts` (idle detector), tests `tests/unit/frame-pacer.test.ts`, `docs/agents/3d-experience.md` (Frame loop), `docs/agents/performance.md`

**Interfaces:**
- Produces: `setPacerCadence(p, fps: 60 | 30 | 0)` where 0 is on demand (render on the next `invalidateFrames()` only); `idleState()` true when the rover speed is 0, no input is held, the camera target, zoom and orbit did not change for 1 s, no ride, autopilot, intro, beam, drawer animation or hover change, and no in-world animation is required to look smooth.

- [ ] **Step 1:** Inventory what animates while parked on each floor in full motion and in reduced motion (ambient packets, sky cycle, stars, globe, holograms, reactor). Record a 2 s capture per floor at 60 fps and at 30 fps (`files/measure/` video or frame strip) and check whether each animation still looks smooth at 30 fps.
- [ ] **Step 2:** Pacer tests first (cadence 30 skips every other 60 Hz refresh; cadence 0 renders only after `invalidateFrames()`; a change back to 60 renders on the next tick; the clock delta stays rendered time). Implement.
- [ ] **Step 3:** Policy: reduced motion (store `reducedMotion`) and idle: on demand (render on any store change, input, resize, or a 1 s heartbeat for the sky). Full motion and idle: 30 fps only if Step 1 shows every running idle animation still looks smooth at 30 fps on that floor; otherwise keep 60 fps on that floor. Any input or state change returns to 60 fps on the same frame.
- [ ] **Step 4:** E2E and perf: `bun run e2e:changed`, perf lane (frames-based waits must still pass; `BUDGET_WINDOW` counts frames, so check it does not time out), visual gate strict. Measure GPU and CPU use while parked (Chrome tracing, frames per second via `__hq.frames()` over 5 s) before and after. **Commit** `perf(3d): idle cadence when nothing moves`.

### Task E2: Weak integrated GPUs start on lite (item 12)

**Files:** `src/lib/gpu-tier.ts`, `tests/unit/gpu-tier.test.ts`, `docs/agents/3d-experience.md` (Gate and tiers)

- [ ] **Step 1: Failing tests** (`decideTier` with `coarse: false`, 8 GB, 8 cores): lite for `ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)`, `Intel(R) HD Graphics 520`, `ANGLE (Intel Inc., Intel(R) HD Graphics 6000, OpenGL 4.1)`, `Mali-G52`, `Mali-T860`, `Mali-400 MP`, `Adreno (TM) 506`, `Adreno (TM) 418`; full for `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ...)`, `Intel(R) Arc(TM) A770`, `ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)`, `Mali-G710`, `Adreno (TM) 650`, `NVIDIA GeForce RTX 3060`; static still wins for SwiftShader; an override still wins.
- [ ] **Step 2: Implement**: `export const WEAK_GPU = /\bIntel\b.*\b(?:U?HD) Graphics\b|\bMali-(?:4\d\d|T\d+|G[35][0-2])\b|\bAdreno \(TM\) [1-5]\d\d\b/i;` and in `decideTier` after the software check: `if (i.renderer && WEAK_GPU.test(i.renderer)) return "lite";`. The boot-first inline probe keeps deciding static only (no change).
- [ ] **Step 3:** `bunx vitest run tests/unit/gpu-tier.test.ts`. **Commit** `perf(tier): start known-weak integrated GPUs on lite`. Decision file `docs/decisions/2026-10-19-weak-gpus-start-on-lite.md`.

### PR E wrap-up

- [ ] `verify:quick`, `e2e:changed`, perf lane, visual gate strict, captures. Report idle fps and CPU numbers.
