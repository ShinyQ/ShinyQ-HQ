# L4 Writing Revamp: Reader Tracks Implementation Plan

Status: shipped in #327 (6397c62), 2026-10-26

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the L4 Writing timeline lane (one station per post, archive board past 12) with one instanced book-shelf bay per reader track, so a visitor picks an interest at the arrival and every post (60 and more) stays in-world.

**Design:** `docs/superpowers/specs/2026-10-25-l4-writing-revamp-design.md` (owner decisions D1 to D9, approved 2026-10-25).

**Architecture:** Tracks are content (`floors.library.tracks`, a required `track` on each post), indexed by a pure `src/content/track-index.ts` and shipped to the 3D floor in `LibraryData.tracks` (per-floor `/data` JSON). The newsroom layout docks one `LibraryBay` per non-empty track; pure shelf geometry (`floors/library/shelf.ts`) gives every spine a rect, so the layout (post stops), the registry (one target per spine), the signs and the scene read the same numbers. The scene reuses the Study Vault's instanced holo kit: a fixed number of draw calls at any post count.

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js InstancedMesh with the shared holo shader (`fx/holoFx.ts`), zod content schema, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere, including commits and PR text (`tests/unit/ascii.test.ts`).
- Every user-facing string is `{ en, id }` (content) or a key in both `messages/en.json` and `messages/id.json`.
- No first person in track titles (`hasFirstPerson`), Title Case (`titleCase`), no client names.
- Content is data: no track name, track membership or lead hardcoded in components.
- Floor chunks: never import `Library` or its decor statically from the `Experience.tsx` closure. `registry.ts` and the layout builders are on the main 3D path: keep them small.
- No words painted on the floor: words ride `FloatingSigns`. In-world targets go through the point-and-go registry: no navigation `onClick` on meshes.
- `useDispose(value)` after every memoized geometry, texture, material or kit; animate with `useFrame` deltas; no new rAF loop.
- Reduce-motion CSS as `@variant motion-reduce` (no CSS expected here).
- Budgets: L4 chunk 16 KB gzip; 3D session total full 529.7 KB, lite 513.9 KB with about 58 B headroom; `failAt` 466.4 KB; scene calls under 150; triangles under 30k; programs at `e2e/perf/baseline.json` plus 2 (target plus 0). Never raise a cap: if a measured gap remains after the deletions, STOP and report the exact byte number.
- Do not touch Classic `/library` (`src/app/[locale]/library`, `src/components/page/*`).
- Git through `rtk git`; conventional commit messages; commit per task.
- Run tests with `bun run vitest run <files>`; typecheck `bun run typecheck`; lint `bun run lint`.

## File map

| File | Change |
|---|---|
| `src/content/schema.ts` | `TrackSchema`, `PostRef.track`, `library.tracks`, cross checks |
| `content/site-content.json` | `floors.library.tracks` and `track` on every post |
| `src/content/track-index.ts` | new: `buildTrackIndex`, `trackOfPost` |
| `src/content/load.ts` | `getTrackIndex()` |
| `src/content/experience-floors.ts` | `LibraryData.tracks` payload |
| `src/experience/types.ts` | `LibraryData.tracks`, `LibraryTrack` |
| `src/experience/floors/library/shelf.ts` | new, pure: `SHELF`, `shelfSize`, `shelfSlots` |
| `src/experience/floors/library/model.ts` | `LibraryLayoutInput.tracks`, `LibraryBay`, bays in `LibraryLayout`; remove `maxPosts`, `splitPosts`, `archive`, `board`, `YEAR_POST`, `tagLinks` |
| `src/experience/floors/library/concepts/newsroom.ts` | bays on the lane, post stops, bay view zones; remove board and years |
| `src/experience/floors/library/layout.ts` | `listStop` = featured stage door or spawn |
| `src/experience/floors/library/icons.ts` | lead icons over bays, `featuredStation` unchanged |
| `src/content/shapes.ts` | `libraryIcons` caller (if its signature changes) |
| `src/experience/floors/library/decor/bookKit.ts` | new: shared instanced book kit (from `StudyVault.vaultMeshes`) |
| `src/experience/floors/library/decor/StudyVault.tsx` | uses `bookKit` |
| `src/experience/floors/library/decor/TrackShelves.tsx` | new scene |
| `src/experience/floors/library/decor/NewsroomDecor.tsx`, `common.tsx` | no post stations except the featured stage; no year posts |
| `src/experience/floors/library/decor/signs.ts`, `signPlacement.ts`, `signFrame.ts`, `LibrarySigns.tsx`, `useLibrarySignPlacement.ts` | track, lead and spine signs; remove years and per-station titles |
| `src/experience/floors/library/decor/EndPlaza.tsx`, `useEndSignPlacement.ts` | remove the archive sign and `archive` kind |
| `src/experience/floors/library/topics.ts`, `decor/TopicHighlights.tsx` | light bays and spines; remove `litArchive` |
| `src/experience/interact/registry.ts` | spine and bay targets; remove `archiveBoard` and `labels.archive` |
| `src/experience/Experience.tsx` | labels: drop `archive`, add `readPost`, `track` |
| `src/content/room-views/library.ts`, `types.ts` | track drawer views; `RoomLinkItem.room` |
| drawer item renderer (where `RoomLinkItem` renders) | `goToRoom(item.room)` when `room` is set |
| `messages/en.json`, `messages/id.json` | `hud.interact.readPostTitle`, `dialog.hints.object.track`, `library.tracks.*`; drop `interact.archive` |
| `src/experience/fx/probes.ts` | `probes.shelves` |
| tests and e2e listed per task | |
| docs listed in Task 9 | |

---

### Task 1: Tracks in content, index and payload

**Files:**
- Modify: `src/content/schema.ts` (around `PostRefSchema` line 301 and `floors.library` line 617, the `SiteContentSchema.superRefine`)
- Modify: `content/site-content.json` (`floors.library`)
- Create: `src/content/track-index.ts`
- Modify: `src/content/load.ts` (next to `getTopicIndex`)
- Modify: `src/content/experience-floors.ts` (`buildLibraryData`), `src/experience/types.ts` (`LibraryData`)
- Test: `tests/unit/track-index.test.ts` (new), `tests/content/dataset.test.ts` (extend), `tests/unit/topic-payloads.test.ts` if it snapshots `LibraryData`

**Interfaces:**
- Produces:
  - `TrackSchema = z.strictObject({ slug: SlugSchema, title: LocalizedTextSchema, lead: SlugSchema.optional() })`; `type Track`.
  - `PostRef.track: string` (required).
  - `buildTrackIndex(library: { tracks: readonly Track[]; posts: readonly Pick<PostRef, "slug" | "date" | "track">[] }): TrackEntry[]` where `TrackEntry = { slug: string; posts: string[] }` (dataset order; posts lead first then newest first; empty tracks kept).
  - `getTrackIndex(): TrackEntry[]` (memoized like `getTopicIndex`).
  - `LibraryData.tracks: LibraryTrack[]`, `LibraryTrack = { slug: string; label: string; posts: string[] }` (label locale-resolved; tracks with no posts dropped).

- [ ] **Step 1: Write the failing index test** `tests/unit/track-index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTrackIndex } from "@/content/track-index";

const t = (slug: string, lead?: string) => ({ slug, title: { en: slug, id: slug }, ...(lead ? { lead } : {}) });
const p = (slug: string, date: string, track: string) => ({ slug, date, track });

describe("buildTrackIndex", () => {
  it("keeps dataset order, puts the lead first, then newest first", () => {
    const index = buildTrackIndex({
      tracks: [t("b", "b-old"), t("a")],
      posts: [p("a-new", "2026-10-02", "a"), p("b-old", "2025-01-01", "b"), p("b-new", "2026-10-01", "b"), p("a-old", "2024-01-01", "a")],
    });
    expect(index).toEqual([
      { slug: "b", posts: ["b-old", "b-new"] },
      { slug: "a", posts: ["a-new", "a-old"] },
    ]);
  });
  it("falls back to the newest post without a lead and keeps empty tracks", () => {
    expect(buildTrackIndex({ tracks: [t("a"), t("e")], posts: [p("x", "2026-01-01", "a"), p("y", "2026-02-01", "a")] })).toEqual([
      { slug: "a", posts: ["y", "x"] },
      { slug: "e", posts: [] },
    ]);
  });
  it("is stable for posts on the same date (slug order)", () => {
    const index = buildTrackIndex({ tracks: [t("a")], posts: [p("b", "2026-10-09", "a"), p("a", "2026-10-09", "a")] });
    expect(index[0].posts).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run** `bun run vitest run tests/unit/track-index.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/content/track-index.ts`:

```ts
import type { PostRef, Track } from "./schema";

/**
 * L4 reader tracks (owner decision 2026-10-25): each post sits on exactly one track; a track lists its lead
 * first (the owner's pick, else the newest), then the rest newest first. Built at build time: the 3D payload
 * and, later, the Classic Writing page read it. Pure.
 */
export interface TrackEntry {
  slug: string;
  posts: string[];
}

export function buildTrackIndex(library: { tracks: readonly Track[]; posts: readonly Pick<PostRef, "slug" | "date" | "track">[] }): TrackEntry[] {
  const newest = [...library.posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return library.tracks.map((track) => {
    const posts = newest.filter((p) => p.track === track.slug).map((p) => p.slug);
    const lead = track.lead && posts.includes(track.lead) ? track.lead : posts[0];
    return { slug: track.slug, posts: lead ? [lead, ...posts.filter((s) => s !== lead)] : [] };
  });
}
```

- [ ] **Step 4: Schema.** Add `TrackSchema` (export `type Track = z.infer<typeof TrackSchema>`), `track: SlugSchema` on `PostRefSchema`, and `tracks: z.array(TrackSchema).min(1).max(6)` in `floors.library`. In `SiteContentSchema.superRefine` add issues for: duplicate track slug; a post whose `track` is not a track slug; a `lead` that is not a post of that track. Add the track titles to the Title Case and first-person checks wherever post titles are checked (search `hasFirstPerson` and `titleCase` usage in `src/content/` and `scripts/validate-content*.ts`).

- [ ] **Step 5: Dataset.** Add to `content/site-content.json` `floors.library` (before `posts`):

```json
"tracks": [
  { "slug": "ai-in-production", "title": { "en": "AI in Production", "id": "AI di Produksi" }, "lead": "45-percent-of-our-llm-calls-failed" },
  { "slug": "cloud-platform-and-security", "title": { "en": "Cloud Platform and Security", "id": "Platform Cloud dan Keamanan" } },
  { "slug": "engineering-with-ai-agents", "title": { "en": "Engineering With AI Agents", "id": "Rekayasa dengan AI Agent" } },
  { "slug": "earlier-writing", "title": { "en": "Earlier Writing", "id": "Tulisan Terdahulu" } }
]
```

and `"track"` on each post: `ai-in-production` for 45-percent-of-our-llm-calls-failed, why-the-better-fraud-engine-shipped-in-shadow-mode, clearbox-inbox-cleanup-with-microsoft-decision-1, making-a-voice-agent-interruptible; `cloud-platform-and-security` for untrusted-code-next-to-production-secrets, the-lock-that-protected-the-install-also-blocked-the-app, the-stall-that-was-never-in-the-query; `engineering-with-ai-agents` for spec-driven-development-with-ai-coding-agents; `earlier-writing` for the-sun-the-moon-and-the-dark-sea, crud-nodejs-express-mysql, helby-ui-ux-case-study. Run `bun run validate:content` (Title Case may want a different casing of the ID titles; follow its output, never disable the check).

- [ ] **Step 6: Dataset test.** In `tests/content/dataset.test.ts` add: every post's track exists; every track has at least one post; the leads belong to their tracks; `buildTrackIndex` covers every post exactly once. Add a schema test that a post with an unknown track and a foreign lead fail `SiteContentSchema.safeParse`.

- [ ] **Step 7: Payload.** `getTrackIndex()` in `load.ts`. In `buildLibraryData` add `tracks: getTrackIndex().filter((t) => t.posts.length).map((t) => ({ slug: t.slug, label: library.tracks.find((x) => x.slug === t.slug)!.title[locale], posts: t.posts }))`. Add `tracks` to `LibraryData` in `types.ts` with a doc comment. Fix every `LibraryData` fixture the typecheck flags (`tests/helpers/*`, e2e fixtures) with a `tracks` array that covers its posts.

- [ ] **Step 8: Ask.** Run `bun run vitest run tests/ask` . If the pack or golden tests change because `site-content.json` changed, update `tests/ask/golden.json` per `docs/agents/ask.md` (no `PROMPT_VERSION` bump: the prompt does not change).

- [ ] **Step 9: Verify and commit.** `bun run typecheck && bun run vitest run tests/unit/track-index.test.ts tests/content tests/unit/topic-payloads.test.ts && bun run validate:content`. Commit `feat(content): reader tracks for the L4 Writing floor`.

---

### Task 2: Shelf geometry and the bay layout

**Files:**
- Create: `src/experience/floors/library/shelf.ts`
- Modify: `src/experience/floors/library/model.ts`, `concepts/newsroom.ts`, `layout.ts`
- Modify: `src/experience/missions/host3d.ts` comment (listStop wording), `src/experience/types.ts` comment on `listStop`
- Test: `tests/unit/library-shelf.test.ts` (new); update `tests/unit/library-layout.test.ts`, `library-concepts.test.ts`, `library-end.test.ts`, `library-vault.test.ts`, `tests/helpers/l4-drive.ts`, `tests/unit/missions-host3d.test.ts`, `tests/unit/arrivals.test.ts` where they read `board`, `archive`, `years`, `maxPosts` or per-post stations

**Interfaces:**
- Consumes: `LibraryData.tracks` (Task 1).
- Produces:
  - `LibraryLayoutInput.tracks: { slug: string; posts: string[] }[]` (from `libraryLayoutInput`, empty tracks dropped).
  - `LibraryZone` gains `"track"`; `STATION_SIZE` is no longer used for bays.
  - `SHELF = { across: 6, spine: { w: 0.5, pitch: 0.65, d: 1.4, h: 1.6, dh: 0.3 }, perRow: 13, maxRows: 3, rowH: 1.9, lead: { w: 1.6, d: 2.4, h: 3.6 }, pad: 1, minAlong: 8 } as const`.
  - `shelfSize(count: number): { along: number; rows: number; cols: number }` where `count` includes the lead; spines are `count - 1`; `rows = min(maxRows, max(1, ceil(spines / perRow)))`, `cols = max(1, ceil(spines / rows))`, `along = max(minAlong, pad * 2 + lead.w + pad + cols * pitch)`.
  - `ShelfSlot = { slug: string; lead: boolean; at: Vec2; y: number; w: number; d: number; h: number; rect: Rect }` (floor-local; `y` the base height; `rect` the axis-aligned footprint).
  - `shelfSlots(bay: Pick<LibraryBay, "center" | "facing" | "rect">, posts: readonly string[]): ShelfSlot[]` (lead at the road-facing left end as seen from the road; spines left to right, top row first is not needed: row 0 is the bottom row, filled first, newest first).
  - `interface LibraryBay { track: string; room: RoomId /* L4:track:<slug> */; rect: Rect; center: Vec2; door: Vec2; facing: Vec2; from: Vec2; stop: Vec2 /* = door */; posts: string[]; slots: ShelfSlot[] }`.
  - `LibraryLayout.bays: LibraryBay[]`; `LibraryLayout.stations` = featured stage (if any) then the desks; `archive` and `board` removed; `extras.years` removed; `links` removed if no reader remains (`tagLinks` is read by no decor).
  - `trackRoom(slug: string): RoomId` = `` `L4:track:${slug}` ``.
  - `floor.stops`: every post room `L4:<slug>` maps to its bay's door (the featured post maps to its stage door through `doors`, so skip it in `stops`), plus `TOPICS_ROOM` and `VAULT_ROOM` as today.
  - `floor.doors`: the stage, every bay (room `L4:track:<slug>`) and the desks.
  - `floor.listStop`: the featured stage door, else spawn.

- [ ] **Step 1: Failing shelf tests** `tests/unit/library-shelf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHELF, shelfSize, shelfSlots } from "@/experience/floors/library/shelf";

const bay = (along: number) => ({ center: { x: 0, z: -10 }, facing: { x: 0, z: -1 }, rect: { minX: -along / 2, maxX: along / 2, minZ: -13, maxZ: -7 } });
const posts = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const overlap = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: typeof a) => a.minX < b.maxX - 1e-6 && b.minX < a.maxX - 1e-6 && a.minZ < b.maxZ - 1e-6 && b.minZ < a.maxZ - 1e-6;

describe("shelf", () => {
  it("sizes rows and columns", () => {
    expect(shelfSize(1)).toMatchObject({ rows: 1, cols: 1, along: SHELF.minAlong });
    expect(shelfSize(14)).toMatchObject({ rows: 1, cols: 13 });
    expect(shelfSize(15)).toMatchObject({ rows: 2, cols: 7 });
    expect(shelfSize(40)).toMatchObject({ rows: 3, cols: 13 });
    expect(shelfSize(61)).toMatchObject({ rows: 3, cols: 20 });
  });
  it("places the lead first and every spine inside the bay without overlap per row", () => {
    for (const n of [1, 4, 14, 40, 61]) {
      const { along } = shelfSize(n);
      const b = bay(along);
      const slots = shelfSlots(b, posts(n));
      expect(slots).toHaveLength(n);
      expect(slots[0]).toMatchObject({ slug: "p0", lead: true });
      for (const s of slots) {
        expect(s.rect.minX).toBeGreaterThanOrEqual(b.rect.minX - 1e-6);
        expect(s.rect.maxX).toBeLessThanOrEqual(b.rect.maxX + 1e-6);
        expect(s.rect.minZ).toBeGreaterThanOrEqual(b.rect.minZ - 1e-6);
        expect(s.rect.maxZ).toBeLessThanOrEqual(b.rect.maxZ + 1e-6);
      }
      const byRow = new Map<number, typeof slots>();
      for (const s of slots.slice(1)) byRow.set(s.y, [...(byRow.get(s.y) ?? []), s]);
      for (const row of byRow.values()) for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) expect(overlap(row[i].rect, row[j].rect)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `shelf.ts` (pure, no React or three) to the interfaces above. Spines face the road (`-facing`): the lead stands at the bay end that is on the left as seen from the road (left of a viewer looking along `facing` is `(facing.z, -facing.x)`), spines continue to the right, row `r` base `y = r * SHELF.rowH`, spine height `spine.h - spine.dh * hash01(slug)` (a tiny string hash, deterministic), slot center at `pad + lead.w + pad + (c + 0.5) * pitch` from the left end along the bay, depth centered on the bay's mid line across.

- [ ] **Step 4: Layout tests first.** Update `tests/unit/library-layout.test.ts` and `library-concepts.test.ts` to the new contract: with real content one bay per track in dataset order alternating north and south after the stage; no `board`, no `archive`, no `extras.years`; `expectSpaceRules` passes; `padZone` free; every post room resolves through `floor.stops` or a door; with synthetic inputs of 12, 39, 60 and 120 posts over 4, 5 and 6 tracks the same rules pass and every stop is reachable on `layout.network` (reuse the existing reachability helper in those tests). Remove assertions on `maxPosts` and the board. Run: FAIL.

- [ ] **Step 5: Implement the layout.** In `model.ts`: add `tracks` to `LibraryLayoutInput` and `libraryLayoutInput`; add `LibraryBay`, `trackRoom`; give `dockAlong` an optional per-item `along` (`DockItem.along?: number`, default `STATION_SIZE[zone].along`, across `SHELF.across` for `track`); add `"track"` to `ZONE_TONE` (`"#22d3ee"`, the blog cyan) and `STATION_SIZE` (`{ along: SHELF.minAlong, across: SHELF.across }`); delete `maxPosts`, `splitPosts`, `YEAR_POST`, `tagLinks`, `archive`, `board`, `links`. In `newsroom.ts`: featured = newest hosted post (as today, from `input.posts`); timeline items = one bay per track (`zone: "track"`, `along: shelfSize(posts.length).along`), then `shelfItems(input)`; build `LibraryBay`s from the docked track stations with `shelfSlots`; delete the board, the year marks and `N.board`; `stops` adds every non-featured post room to its bay door. Keep the end plaza, monument, return pad and vault code unchanged. In `layout.ts` set `listStop` to the stage door (`layout.stations[0]?.zone === "blog" ? layout.stations[0].door : layout.floor.spawn`).

- [ ] **Step 6: Run** `bun run vitest run tests/unit/library-shelf.test.ts tests/unit/library-layout.test.ts tests/unit/library-concepts.test.ts tests/unit/library-end.test.ts tests/unit/library-vault.test.ts tests/unit/missions-host3d.test.ts tests/unit/arrivals.test.ts`. Fix the vault and end tests only where positions moved because the lane length changed (the vault rules stay). Expected: PASS.

- [ ] **Step 7: Commit** `feat(l4): reader track bays replace the post timeline (layout)`. The typecheck may still fail in decor and registry files; Tasks 3 to 6 fix them. Do not commit broken tests: if a decor test fails to compile, leave its fix to the task that owns it and say so in the report.

---

### Task 3: Shared book kit and the shelf scene

**Files:**
- Create: `src/experience/floors/library/decor/bookKit.ts`, `src/experience/floors/library/decor/TrackShelves.tsx`
- Modify: `decor/StudyVault.tsx`, `decor/vault.ts`, `decor/NewsroomDecor.tsx`, `decor/common.tsx`, `Library.tsx`, `src/experience/fx/probes.ts`
- Modify: `icons.ts`, `src/content/shapes.ts` (lead icons over bays)
- Test: `tests/unit/library-shelf-scene.test.ts` (new), `tests/unit/library-vault-scene.test.ts`, `tests/unit/library-decor.test.ts`

**Interfaces:**
- Consumes: `LibraryBay`, `ShelfSlot`, `SHELF` (Task 2).
- Produces:
  - `bookKit(items: KitMesh[], origin: Vec2)` returning `{ meshes: InstancedMesh[]; materials: ShaderMaterial[]; shift: Matrix4; dispose(): void }`, where `KitMesh = { geometry: BufferGeometry; material: ShaderMaterial; items: [Matrix4, string, number][]; order?: number }`; all meshes share one union bounding sphere and `raycast = () => null`. `vaultMeshes` becomes a thin caller of it (no behavior change: `library-vault-scene.test.ts` stays green).
  - `spineMatrix(slot: ShelfSlot, pull: number, facing: Vec2, out: Matrix4): Matrix4` and `leadMatrix(slot, open, facing, out)` in `decor/shelf3d.ts` (pure three math), `SHELF_SCENE = { pull: 0.3, rate: 1.6 }`.
  - `sceneProbes.shelves: { bays: string[]; spines: number; pulled: string | null }`.

- [ ] **Step 1: Failing pure tests** in `tests/unit/library-shelf-scene.test.ts`: `spineMatrix` at pull 0 puts the spine's base center at `(slot.at.x, slot.y + SHELF_PLINTH, slot.at.z)` and scales to `(w, h, d)` turned so local +z faces the road (`-facing`); at pull 1 the center moves `SHELF_SCENE.pull` toward the road; `leadMatrix` at open 0.5 matches `coverMatrix` conventions of the vault (hinge on the spine edge). Run: FAIL.

- [ ] **Step 2: Extract the kit.** Move the generic part of `vaultMeshes` (instancing, color times level, the shift to the group origin, the union sphere, the `aAlpha` attribute on the shared box, dispose) into `bookKit.ts`; `vaultMeshes` keeps its vault-specific items. Run `bun run vitest run tests/unit/library-vault-scene.test.ts`: PASS unchanged.

- [ ] **Step 3: Implement `shelf3d.ts`** to pass Step 1.

- [ ] **Step 4: `TrackShelves.tsx`.** Group `library-shelves` at the lane's middle (origin for transparent sorting). Meshes through `bookKit`, one `InstancedMesh` each, spanning every bay:
  1. shelf frames: holo `plate` with `depthWrite`, one instance per bay row (a thin board under each row) plus one back panel per bay, track tone at 0.6;
  2. spines: holo `plate`, one instance per non-lead slot, track tone at 1.15, `renderOrder` -2;
  3. lead covers: holo `core`, one per bay, `open` held at 0.5 (`leadMatrix`), track tone, additive on full only;
  4. full tier only: light pools, holo `dot`, one under each lead.
  `useFrame` (delta based): the pulled spine is the hovered target's slot (`getHQStore().getState().hover?.item.id === "L4:shelf:<slug>"`), else the slot nearest the rover within its bay zone (`Math.hypot` from `roverRuntime` to the slot, under 6 u, rover inside the bay's view-zone rect); pull eases toward 1 at `SHELF_SCENE.rate` per second, others toward 0; reduced motion snaps; write matrices and colors only on change (module scratch `Matrix4`/`Color`); off L4 nothing is pulled. `useDispose(kit)`, `useUniformTime(kit.materials)`. Write `sceneProbes.shelves` on mount and on pull change; clear on unmount. Picked topic: spines of `topics.topic.rooms` posts brighten (color level 1.6) through the same change-only write.

- [ ] **Step 5: Decor wiring.** `NewsroomDecor`: `StationShells` and `ZoneIcons` get only `layout.stations` (stage and desks), the year post segments go, `TrackShelves` mounts with `layout.bays`. `Library.tsx` passes `data.library.tracks` labels through as needed. `icons.ts` `libraryIcons`: post icons now float over each bay's lead slot (`x, z` of the lead, `y = lead.h + SHELF_PLINTH + ZONE_ICON.lift`, `face` toward the road); non-lead posts get no icon (their key is unused); `shapes.ts` keeps building `L4.<hash>.json` from the same layout. Update `tests/unit/library-decor.test.ts` expectations. Add `shelves` to `probes.ts`.

- [ ] **Step 6: Run** `bun run vitest run tests/unit/library-shelf-scene.test.ts tests/unit/library-vault-scene.test.ts tests/unit/library-decor.test.ts && bun run typecheck`. Expected: PASS (or only registry and sign errors that Tasks 4 and 5 own; list them).

- [ ] **Step 7: Commit** `feat(l4): instanced track shelves on the shared book kit`.

---

### Task 4: Signs and placement

**Files:**
- Modify: `decor/signs.ts`, `signPlacement.ts`, `decor/signFrame.ts`, `decor/LibrarySigns.tsx`, `decor/useLibrarySignPlacement.ts`, `decor/NewsroomDecor.tsx` (props), `decor/EndPlaza.tsx`, `decor/useEndSignPlacement.ts`
- Test: `tests/unit/library-sign-placement.test.ts`, `tests/unit/floor-signs.test.ts`, `tests/unit/library-label-sweep.test.ts`, `tests/unit/end-plaza-label-sweep.test.ts`, `e2e/library-labels.spec.ts`

**Interfaces:**
- Consumes: `LibraryBay.slots`, `LibraryData.tracks` labels and post titles.
- Produces:
  - `LibrarySignKind = "section" | "track" | "lead" | "spine"` (`title` and `year` removed); `LibrarySignMeta = { kind; zone; room?: RoomId; bay?: number }`.
  - `trackSignSpecs(layout, labels: Map<string, string>)`: the track name upper case over each bay's back edge (`stationBackEdge` of the bay), `L4_SIGN.bottom`, `ZONE_SIGN` type.
  - `leadSignSpecs(layout, titles)`: the lead title wrapped at `TITLE_SIGN.wrap` over the lead slot, bottom `L4_SIGN.bottom - 1.6`.
  - `spineSignSpecs(layout, titles)`: one title per non-lead slot, wrapped at 22, bottom `slot.y + slot.h + 0.6`.
  - `LIBRARY_LABEL_MAX = { section: 4, track: 4, lead: { wide: 4, narrow: 2 }, spine: 1 }`; priority: picked (spine or lead whose room is in the picked topic, cap still applies), spine, track, lead, section; spines show only when `live` (see below).
  - `libraryLabelFrame` input gains `live: string | null` (the pulled spine's room): a spine label is a candidate only when its room equals `live` or it is picked.
  - `EndSignMeta.kind` loses `archive`.

- [ ] **Step 1: Update `library-sign-placement.test.ts`** to the new kinds: a live spine places before track signs; no more than one spine; lead caps 4 desktop and 2 phone; a non-live, non-picked spine never shows; no overlap and the rover box stays free (keep the existing helper cases, renamed). Run: FAIL.
- [ ] **Step 2: Implement** `signs.ts`, `signPlacement.ts`, `signFrame.ts` changes; remove `stationTitleSpecs`, `yearPostSpecs`, `yearPostSegments`, `YEAR_POST` re-export; `useLibrarySignPlacement` reads `sceneProbes.shelves.pulled` (written by `TrackShelves`) as `live`. `LibrarySigns` keeps one `FloatingSigns` group with `dropHidden={30}`.
- [ ] **Step 3: End plaza.** Remove the archive sign from `endPlazaSigns` and the `archive` kind from `END_SIGN_NEAR`, priorities and the sweep's expected sets.
- [ ] **Step 4: Sweeps.** `library-label-sweep.test.ts`: replace post and year poses by: the arrival, each bay stop (with the nearest spine live), mid-lane between bays, each desk; assert no overlap above 2 percent, the caps, no duplicate text, nothing on the rover, each bay's track sign shows at its stop. `end-plaza-label-sweep.test.ts`: drop the archive expectations. Mirror the poses in `e2e/library-labels.spec.ts` (it stays the rendered reference).
- [ ] **Step 5: Run** `bun run vitest run tests/unit/library-sign-placement.test.ts tests/unit/floor-signs.test.ts tests/unit/library-label-sweep.test.ts tests/unit/end-plaza-label-sweep.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(l4): track, lead and live spine signs`.

---

### Task 5: Point-and-go, hints and the track drawer

**Files:**
- Modify: `src/experience/interact/registry.ts`, `src/experience/interact/pick.ts` (if it names the board), `src/experience/Experience.tsx` (labels), `src/hud/dialog/hintLines.ts` and `src/hud/hints/select.ts` (if groups need a line), `src/content/room-views/library.ts`, `src/content/room-views/types.ts`, the drawer component that renders `RoomLinkItem` (find with `grep -rn "items.map" src/hud/drawer`), `src/hud/search.ts`, `src/hud/CommandPalette.tsx`, `src/hud/palette-types.ts` (only if they reference the archive board), `src/experience/floors/library/topics.ts`, `decor/TopicHighlights.tsx`, `messages/en.json`, `messages/id.json`
- Test: `tests/unit/interact-registry.test.ts`, `tests/unit/interact-pick.test.ts`, `tests/unit/library-topics.test.ts`, `tests/hud/LibraryRoofRooms.test.tsx`, `tests/unit/ui-copy.test.ts`, `tests/unit/search.test.ts`

**Interfaces:**
- Consumes: `LibraryBay`, `ShelfSlot`, `trackRoom` (Task 2), `LibraryData.tracks`.
- Produces:
  - Targets `L4:shelf:<slug>` (kind `station`, label `labels.readPost(title)`, `at` bay door, `bounds` slot rect, `base` slot.y, `height` slot.y + slot.h, action `{ type: "command", command: "open:L4:<slug>" }`, `group: { id: trackRoom(slug), label: trackLabel }`).
  - Bay door items come from `doorItems` (room `L4:track:<slug>`); `roomLabel` resolves `L4:track:` rooms to the track label.
  - `InteractLabels.readPost: (title: string) => string` (`hud.interact.readPostTitle`, "Read {title}" / "Baca {title}"); `archive` removed.
  - Room views `L4:track:<slug>`: `kind: "shelf"`, title = track title, subtitle = `library.tracks.count` ("{count} posts"), one section whose items are the posts (lead first) with `meta` = date and reading time when known, `room: L4:<slug>`; `page: "/library"`.
  - `RoomLinkItem.room?: RoomId`: the renderer calls `goToRoom(room)` instead of following `href` when set.
  - `litStations` lights bays whose posts are on the topic; `litArchive` removed; `TopicHighlights` drops the archive strip; probe `topics.lit` lists `L4:track:<slug>` rooms.
  - `dialog.hints.object.track` hint line for the bay group.

- [ ] **Step 1: Tests first.** `interact-registry.test.ts`: with real content, one `L4:shelf:` target per post, each inside its bay's rect and grouped by its bay; one door per bay; no `L4:board:archive`; `open:L4:<slug>` commands parse. `library-topics.test.ts`: a topic lights the bays holding its posts and the desks; no archive. `LibraryRoofRooms.test.tsx`: a track drawer lists its posts lead first and clicking one calls `goToRoom`. Run: FAIL.
- [ ] **Step 2: Implement** registry, labels, room views, `RoomLinkItem.room`, topics and highlights, messages (both locales, identical keys; remove `interact.archive` if no reader remains). Check `open:L4:<slug>` is already a known command (`parseCommand`); if not, use `{ type: "open-room", room }` with `at` overridden by the bay door through `floor.stops` instead.
- [ ] **Step 3: Run** `bun run vitest run tests/unit/interact-registry.test.ts tests/unit/interact-pick.test.ts tests/unit/library-topics.test.ts tests/hud/LibraryRoofRooms.test.tsx tests/unit/ui-copy.test.ts tests/unit/search.test.ts && bun run typecheck && bun run lint`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(l4): spine and bay targets and the track drawer`.

---

### Task 6: Camera zones and framing

**Files:**
- Modify: `concepts/newsroom.ts` (bay view zones), `model.ts` (`stationViewZones` skips bays), arrival zooms if the framing test needs it
- Test: `tests/unit/library-shelf-framing.test.ts` (new, modeled on the vault framing block in `tests/unit/library-vault.test.ts`)

**Interfaces:**
- Produces: one view zone per bay, id `L4:track:<slug>`, `area` 2.5 u around the bay door, `yaw` `stationYaw(bay.facing)`, `zoom` `SHELF_VIEW.zoom` and `classView.mobile.zoom` `SHELF_VIEW.zoomPhone` (start 1.15 and 0.95, tune to pass).

- [ ] **Step 1: Failing framing test**: for a 40-post bay (synthetic) and every real bay, settle the follow camera as the vault test does at 1440x900, 1194x834, 834x1194 and 390x844; every slot's 8 corners, the lead and the rover stay inside the HUD-safe box. Also: the arrival pose sees the first two bays' track signs on screen (projected inside the viewport).
- [ ] **Step 2: Implement** zones and tune zooms until it passes.
- [ ] **Step 3: Run** `bun run vitest run tests/unit/library-shelf-framing.test.ts tests/unit/library-label-sweep.test.ts tests/unit/arrivals.test.ts`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(l4): bay camera views`.

---

### Task 7: E2E, perf and fixtures

**Files:**
- Create: `e2e/library-shelves.spec.ts`; a synthetic 60-post L4 payload helper in `e2e/fixtures/` if the perf lane needs one (follow how other fixtures intercept `/data/*`)
- Modify: `e2e/library-labels.spec.ts`, `e2e/library-roof.spec.ts`, `e2e/topics.spec.ts`, `e2e/interact.spec.ts`, `e2e/perf/floors.spec.ts`, `e2e/perf/peaks.spec.ts`, `scripts/perf-plan.ts`, `scripts/perf-gpu.ts` (archive or board references), `scripts/ci-plan.ts` mapping for the new spec

- [ ] **Step 1:** `library-shelves.spec.ts` (lite; desktop full motion, phone reduced motion), using `e2e/hq.ts` helpers and waiting on state only: hover a spine (desktop) and see the live label and `__hq.probes.shelves.pulled`; click it, the rover drives to the bay and the post drawer opens; Esc returns; the bay door opens the track drawer and an item opens its post; `/en/blog/<slug>` 3D link lands at its bay; phone: tap, Go.
- [ ] **Step 2:** update the listed specs (no archive board, no year plates, bay poses), add `settled-L4-shelf` peaks per tier in `floors.spec.ts`.
- [ ] **Step 3: Run** `bun run build` then `bun run e2e:changed`. Expected: PASS.
- [ ] **Step 4: Commit** `test(l4): shelves e2e and perf poses`.

---

### Task 8: Bytes, perf lane and visual gate

- [ ] **Step 1:** `bun run build`, then `E2E_PORT=<free port> bun run e2e:perf`. Record: L4 chunk bytes, session total per tier, `failAt` path, scene calls, triangles, programs at arrival, bay stop and vault stop.
- [ ] **Step 2:** If any byte cap fails: trim (dead helpers, inlined constants, shared kit), re-measure. If a gap remains, STOP and report the exact bytes over each cap to the parent session. Never edit `e2e/budgets.ts` caps.
- [ ] **Step 3:** If the perf baselines need the documented update (programs plus 0 expected), follow `docs/agents/performance.md`.
- [ ] **Step 4:** `bun scripts/visual-gate.ts --base HEAD --profile strict`. L4 changes on purpose: confirm the diff is only L4 (other floors identical) and record it for the PR.

---

### Task 9: Docs and PR

**Files:**
- Modify: `docs/agents/floor-l4-library.md` (rewrite: shelves, tracks, signs, targets, camera, tests, measured budgets; drop board and years), `docs/features.md` (L4 section and status log row "L4 reader tracks"), `docs/content.md` (pick a track and optionally a lead when publishing), `docs/agents/content.md` if it lists the library schema, `docs/agents/folder-layout.md` (new files)
- Create: `docs/decisions/2026-10-25-l4-reader-tracks.md` (format from `docs/decisions.md`)
- Modify: this plan's `Status:` line; the spec's `Status:` line
- README: `bun scripts/readme-hero.ts` to refresh `docs/readme/floor-L4.jpg` (L4 changed visibly)

- [ ] **Step 1:** write the docs; `bun run vitest run tests/unit/docs-index.test.ts tests/unit/agents-md.test.ts tests/unit/ascii.test.ts`.
- [ ] **Step 2:** `bun run verify:quick`, `bun run e2e:changed` (both green).
- [ ] **Step 3:** check CI load: `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` (at most 2 runs in flight, at most one full). Push, open the PR ready for review with the measured numbers table, report the link to the parent session.
