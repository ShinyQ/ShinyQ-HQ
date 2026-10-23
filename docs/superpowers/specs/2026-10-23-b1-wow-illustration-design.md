# B1 WOW Pass: Station Holograms and the Stack Halo

Status: in review

Owner request (verbatim): "And lastly in B1 i think we need more proper illustration inside of it (like floating logo or
something) since its currently not WOW for a hidden floor." Follow-up: "Not only the floating but illustration inside
each of the component need to be change too to be more WOW".

Builds on the B1 Engine Room and the living machine ([spec](2026-10-22-b1-living-machine-design.md), #290, #291); the
current rules are in `docs/agents/floor-b1-engine-room.md`.

## 1. Owner decisions (2026-10-23)

Chosen one question at a time over mockups composited on live B1 captures.

| # | Question | Choice |
|---|---|---|
| 1 | Which logos float | The site's build stack plus the AI coding agents, from content data |
| 2 | Where | The Stack Halo: the logos orbit the reactor crown (over an aisle constellation or bay crests) |
| 3 | Halo motion | Orbit, upright and facing the camera, a slight bob, synced to the reactor: speed follows its pulse, a deploy flash flares it white; reduced motion freezes it |
| 4 | Stations | A projector in every bay and a story hologram floating in it, as mocked |
| 5 | Hologram behaviour | Wake on approach: every bay idles dim, the bay nearest the rover powers up (about half a second) and plays its motion; reduced motion shows every bay at full glow, still |
| 6 | Data | Driven by the build story and the build-time facts |
| 7 | Marks missing from Simple Icons | Codex as a text cell; Playwright's official mark from its documentation repository |
| 8 | Delivery | One pull request |
| 9 | Budget | Stay under the 16 KB B1 chunk cap; if over, bring the measured number to the owner before any raise |

## 2. Content

- `stations.blueprint.stack` in `content/build-story.json` (schema in `src/content/build-story.ts`, 4 to 14 tech
  registry names): Next.js, React, Three.js, TypeScript, Tailwind CSS, Bun, Cloudflare Pages, Cloudflare Workers,
  GitHub Actions, Vitest, Playwright. The halo adds `stations.agents.tools` (GitHub Copilot, Claude Code, Codex).
- `public/tech/threejs.svg` (Simple Icons, CC0, drawn white) and `public/tech/playwright.svg` (playwright.dev) with
  registry entries in `src/content/tech.ts` and sources in `public/tech/README.md`. Codex stays text only.
- `RoomEngine.holo` (`{ levels, mark? }`) in `content/room-views/engine.ts`, computed on the server so the client parses
  no formatted text: Blueprint one level per public floor; Timeline pull requests per round over the busiest, `mark`
  the open round; Agents one per tool; Gates 1 CI, 0.66 nightly, 0.33 local; Dashboard the snapshot numbers, log
  scaled; Brain one per step; Rejected one per idea. It rides in the B1 drawer file (`/data/rooms/b1-<locale>.json`).

## 3. Atlas

- `scripts/engine-atlas.ts` (`bun run engine:atlas`, `--check` in `bun run build`) draws the stack and the tools into
  `public/atlas/engine.<hash>.webp` (128 px cells, lossless, the L1 atlas code: `writeAtlas` in
  `scripts/logo-atlas.ts`), a name without a logo as a text cell (`text:Codex`), and writes the B1-only manifest
  `floors/engine/engine-atlas.ts` (`ENGINE_ATLAS`: file, grid, cell count, the agents' cells) and its lock.
- The runtime reuses the L1 loader (`useLogoAtlas(file)`) and material, so the logo mesh compiles no new program.

## 4. Scene

- Pure look in `floors/engine/holo.ts`: one shape per station (`SHAPES`), a projector per bay (a flat disc on the
  table, console or floor, a light cone up to the hologram), the Stack Halo (`stackHalo`), the wake (`wakeTarget`,
  `stepWake`, `wakeGain`). Pieces go out through a callback, so a write allocates nothing.
- Shapes: Blueprint a turning tower of slabs over an amber B1 with a scan ring; Timeline bars per round with a wave and
  an amber "now"; Agents a violet core beaming to the agents' logo tiles with packets; Gates arches in depth lighting
  as a packet passes; Dashboard a turning bar skyline on a base ring under a gauge ring; Brain a gyroscope of three
  rings, one node per step and chunks streaming in; Rejected crossed red panels up a vortex, the last one amber.
- Placement: each hologram floats in its bay's front half, under the station sign (5.3) seen from the door pad, inside
  the bay walls (a unit test checks every piece of every bay).
- Renderer `floors/engine/EngineHolo.tsx`: four instanced draws on the holo program B1 already compiles (boxes
  `strip`, dots `dot`, rings `ring`, cones `core`) and one logo mesh, sized once from the data, rewritten at most 30
  times a second while the rover is on B1 or riding to it. The halo reads the reactor's `pulseHz` and flash
  (`reactorProbe`).

## 5. Budgets (measured)

- B1 chunk 16,337 B gzip under the 16,384 B cap (was 12.7 KB); the cap does not change. The main path and the
  public floors do not change beyond the loader's file parameter.
- Draw calls on B1 plus 5 (one per mesh), well under the B1 cap of 100; no new shader program; the atlas is a 15 KB
  WebP fetched only on B1.

## 6. Tests

- Unit `tests/unit/engine-holo.test.ts`: the data, every bay's pieces inside its bay and under its sign, a stable piece
  count over time, the agents' tiles, the halo's orbit, the wake, the atlas freshness.
- E2E `e2e/engine-room.spec.ts`: the holograms load, the halo turns and draws every logo, the bay the rover stops at
  wakes; memory round trips unchanged.
