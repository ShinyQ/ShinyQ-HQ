# Tech Logos and Project Galleries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show tech stack logos everywhere a stack or skill appears (static pages, Glass Drawer, L1 skills wall in 3D), add company logos to career entries and ship reviewed image galleries for the owner's pods.

**Architecture:** A pure, client-safe registry (`src/content/tech.ts`) maps content names to committed icons. Gallery images are committed under `public/media/<pod-slug>/` and referenced from `pod.assets` (appendix 06). A reusable `Gallery` + `Lightbox` pair renders them on pod pages and inside the Glass Drawer; room-view builders resolve logos on the server so the drawer JSON stays serializable.

**Tech Stack:** Next.js 16 static export, React 19, next-intl, React Three Fiber (three 0.186), Vitest, Playwright. Icons: Simple Icons (CC0), Azure architecture icons V24, owner's R2 rasters.

## Global Constraints

- No em dashes anywhere. Public repo: no internal codenames in file names, alt text or images; no personal data in images; no photo of the owner (C9); client names allowed (C3).
- Assets are committed under `public/` (no remote or expiring URLs); every `Asset` has localized `alt`, `width`, `height`, `redacted`.
- Static export only; every route works without WebGL; the 3D Lobby stays under 150 draw calls (appendix 08).
- Committed media under about 25 MB.
- Sources are read-only: R2 bucket `shinyq` (`cf r2 objects get`), Azure Blob `project-media` (`az storage blob download --auth-mode key`), local project screenshots under the owner's work folder.

---

### Task 1: Tech logo registry

**Files:** Create `src/content/tech.ts`, `public/tech/*`, `public/tech/README.md`, `tests/unit/tech.test.ts`.

**Produces:** `getTechLogo(name: string): { src: string; label: string } | null`, `normalizeTech(name)`, `isTextOnlyTech(name)`, `TEXT_ONLY_TECH`, `allTechLogos()`.

- [x] Collect every stack and skill name from pods, timeline, skills and side projects.
- [x] Build icons: R2 `icons/*.webp` (trimmed, 96 x 96 webp), Simple Icons paths (dark brand colors lightened for the void), Azure architecture icons for Azure services, Agent Framework artwork. 106 icons, 440 KB.
- [x] Registry with aliases ("Express.js", "Durable Functions" to Azure Functions, "Next.js 14", "Node.js / Express").
- [x] Test: every content name resolves or is allowlisted as text-only; allowlist has no names that resolve; every file exists.

### Task 2: Gallery and Lightbox

**Files:** Create `src/content/media.ts`, `src/components/Gallery.tsx`, `src/components/Lightbox.tsx`, `tests/hud/Gallery.test.tsx`; add `gallery` messages (en, id).

**Produces:** `GalleryImage { src, thumb, alt, width, height }`, `toGalleryImages(assets, locale)`, `coverImage(assets, locale)`, `thumbSrc(src)`, `<Gallery images label? layout?="grid"|"strip" />`, `<Lightbox images index onIndexChange onClose />`.

- [x] Lightbox: portal, `role="dialog" aria-modal`, focus on close button, Tab trap, Esc, arrows (wrap), Home/End, swipe, backdrop close, neighbour preload, body scroll lock; keys captured at window level so the rover and drawer ignore them.
- [x] Gallery restores focus to the opening thumbnail.
- [x] jsdom tests for all of the above.

### Task 3: Media pipeline and content

**Files:** `public/media/<pod-slug>/*`, `public/logos/*`, `content/site-content.json`, `tests/content/assets.test.ts`.

- [x] Map sources to pods by product, not codename (realtime voice AI, AI code security, fraud review, CV screening, credit scoring, AI app accelerator, ticketing assistant, chart-of-accounts assistant, solutions marketing site, anime e-commerce, university platforms, vulnerability scanning).
- [x] Prefer the latest captures from the owner's project folders (synthetic demo data) over older blob screenshots.
- [x] Crop tall captures to the first 16:10 fold; OCR (tesseract) and blur codename branding and non-example emails; manual masks for brand marks OCR missed; resize to 1600 px max plus 480 px thumbnails; webp q80, metadata stripped.
- [x] Visual review of every output image; record exclusions in the PR.
- [x] Fill `pod.assets` (localized alt) and `TimelineEntry.logo` (Shumi, Jatis, BSSN, Jublia, MNC, Jenius, Telkom University).
- [x] Tests: assets reviewed, under `/media/<pod-slug>/`, thumbnail exists, media under 25 MB.

### Task 4: Static pages

**Files:** `src/components/Chip.tsx`, `PodCard.tsx`, `TimelineItem.tsx`, `OrgLogo.tsx`, `ProfileBlocks.tsx`, `WorkshopAnnex.tsx`, `src/app/[locale]/labs/[slug]/page.tsx`, `src/app/[locale]/journey/[slug]/page.tsx`, `src/lib/jsonld.ts`.

- [x] `ChipList logos` and `TechLogoRow`; logo chips on pod, journey, Lobby skills and Workshop.
- [x] Pod cards: cover thumbnail and stack logo row (Labs, Lobby, Quick view).
- [x] Timeline items and journey pages: org logo on a light tile.
- [x] Pod page: Gallery section; CreativeWork JSON-LD `image`.

### Task 5: Glass Drawer integration

**Files:** `src/content/room-views/{types,shared,lobby}.ts`, `src/hud/drawer/RoomDrawer.tsx`, `tests/unit/room-views.test.ts`.

- [x] `stackItems` resolves logos; `RoomImage` gains `thumb`; Lobby skills sections carry `chipLogos`.
- [x] Drawer gallery uses `Gallery layout="strip"` and the Lightbox (Esc closes the Lightbox first, then the drawer).

### Task 6: L1 skills wall logos in 3D

**Files:** `src/content/experience.ts`, `src/experience/types.ts`, `src/experience/floors/lobby/{logoAtlas.ts,LogoQuads.tsx,SkillsWall.tsx}`, `tests/unit/logo-atlas.test.ts`.

- [x] `ExperienceData.skills[].logos` resolved on the server.
- [x] Runtime canvas atlas plus one merged indexed quad geometry: one draw call for all logos; Lobby measured at 66 draw calls.

### Task 7: Verification and PR

- [x] e2e `e2e/gallery.spec.ts`: pod gallery and lightbox (keyboard, focus restore, axe), logos on pages, drawer stack logos and lightbox over the drawer.
- [x] `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`.
- [x] Screenshots in the PR; draft PR opened early for the Phase 4 drawer.
