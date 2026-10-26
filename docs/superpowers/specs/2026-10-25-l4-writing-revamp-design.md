# L4 Writing Revamp: Reader Tracks (design)

Status: in review (spec only; implementation released by the parent session, one sibling at a time).

Owner decision 2026-10-25 (to be filed as `docs/decisions/2026-10-25-l4-reader-tracks.md`).

## 1. Problem

L4 Writing docks every post as its own small station along one timeline lane, newest first, with titles that fade in
only near the rover. There are 11 posts today, 8 of them from October 2026. Each new post adds about 5 u of lane, a
station, a door and a spur. From post 13 on, older posts drop onto an archive board that only opens the command
palette. A visitor sees a long run of identical plinths and has no fast way to find the post that is worth reading
for them.

## 2. Owner decisions (approved 2026-10-25)

| # | Decision |
|---|---|
| D1 | Primary visitor outcome: find the post worth reading fast (relevance over recency). |
| D2 | The visitor picks an interest: reader tracks near the arrival, each led by its best post. |
| D3 | A new small set of 4 to 6 reader tracks, each post in exactly one track (not the 13 constellation topics). |
| D4 | The lead post is an optional owner pick per track, falling back to the newest post in the track. |
| D5 | Scale target: up to about 60 posts in-world with no archive fallback (layout tested to 120). |
| D6 | Tracks replace the timeline lane. The press plaza (headline wall, featured stage), the desks and the end plaza stay. |
| D7 | Bytes: target byte-neutral by deleting what the tracks replace; a measured gap may ask for at most +1.5 KB gzip. |
| D8 | 3D only in this PR. The track data is built so the Classic `/library` page can adopt it later (after #320). |
| D9 | Approach A, track shelves: instanced book spines per track bay, the lead face-out. |

## 3. Content model

Content is data. Nothing about tracks is hardcoded in components.

- `content/site-content.json`, `floors.library.tracks`: ordered list (the bay order) of 4 to 6 entries
  `{ slug, title: { en, id }, lead?: <post slug> }`.
- Every `floors.library.posts[]` entry gets a required `track: <track slug>`.
- Schema (`src/content/schema.ts`) and `bun run validate:content` fail when:
  - a post has no `track` or names an unknown track;
  - a track's `lead` is not a post of that track;
  - a track title has first person (`hasFirstPerson`), is not Title Case (`titleCase`), or has a client name;
  - there are fewer than 1 or more than 6 tracks, or two tracks share a slug.
- `src/content/track-index.ts` (pure, next to `topic-index.ts`): `buildTrackIndex(library)` returns, per track in
  dataset order, its posts with the lead first, then newest first. A track with no posts is kept in the index (the
  floor skips it). The lead falls back to the newest post of the track.
- 3D payload: `LibraryData.tracks: { slug: string; label: string; posts: string[] }[]` (locale-resolved label, slugs
  lead first). It travels in the per-floor `/data` JSON, not in a code chunk.
- Proposed first mapping (owner edits at spec review):

  | Track | Posts |
  |---|---|
  | AI in Production | 45-percent-of-our-llm-calls-failed, why-the-better-fraud-engine-shipped-in-shadow-mode, clearbox-inbox-cleanup-with-microsoft-decision-1, making-a-voice-agent-interruptible |
  | Cloud Platform and Security | untrusted-code-next-to-production-secrets, the-lock-that-protected-the-install-also-blocked-the-app, the-stall-that-was-never-in-the-query |
  | Engineering With AI Agents | spec-driven-development-with-ai-coding-agents |
  | Earlier Writing | the-sun-the-moon-and-the-dark-sea, crud-nodejs-express-mysql, helby-ui-ux-case-study |

  Indonesian titles follow the content style (natural, technical terms in English). Leads: owner choice, else newest.

## 4. Layout (`concepts/newsroom.ts`, `model.ts`)

- Press plaza unchanged: headline wall (newest title, ticker of every title) and the featured stage with the newest
  hosted post. The featured post also stays on its track shelf (the stage is a spotlight, the shelf is its home).
- The timeline lane docks one bay per non-empty track, in dataset order, alternating north and south (as today), then
  the Research, Models and Talks desks, then the end plaza (Topic Constellation, monument, Study Vault, Return pad)
  exactly as today.
- Bay (`LibraryZone` gains `track`; a `LibraryBay` per bay: `track`, `rect`, `center`, `door`, `facing`, `from`,
  `stop`, `rows`, `spines`, `lead`):
  - across: 6 u; along: `max(8, cols * SHELF.pitch + SHELF.leadW + 2 * SHELF.pad)`;
  - `SHELF`: spine width 0.5 u, pitch 0.65 u, 13 spines per row, up to 3 rows (39 posts) stacked vertically, then
    more columns (a longer bay); lead cover 1.6 u wide at the bay's road-facing left end;
  - `dockAlong` takes a per-item `along` (today it reads `STATION_SIZE[zone]`).
- One door pad and one stop per bay. Post rooms `L4:<slug>` keep their ids, lose their own stations, doors and spurs,
  and resolve through `floor.stops[L4:<slug>] = bay.stop`, so `/blog/<slug>` 3D deep links, missions, Cmd-K and
  `roomTarget` keep working.
- Removed: `LIBRARY_FLOOR.maxPosts`, `splitPosts`' archive, `LibraryLayout.archive` and `board`, `NEWSROOM.board`,
  the year posts (`YEAR_POST`, `extras.years`), per-post station generation. `listStop` becomes the featured stage stop
  (spawn when there is no hosted post).
- Space rules (`expectSpaceRules`), `LIBRARY_FLOOR.padZone` free, every stop reachable on the road network.

## 5. Scene (`decor/TrackShelves.tsx`, pure `decor/shelf.ts`)

- The Study Vault's instanced kit (`decor/vault.ts`, `vaultMeshes`) is generalized into a shared book kit used by both
  the vault and the shelves (shared code bytes, same instanced holo program, no new shader program).
- InstancedMeshes, each spanning every bay (draw calls independent of post and track counts):
  - shelf frames: holo `plate`;
  - spines: one instance per non-lead post, track tone, a small per-post height variation (seeded by slug);
  - lead covers: one face-out tall book per bay, held half open like a vault cover; the lead's own floating icon comes
    from the existing `HoloIcon` batch (`libraryIcons`), placed over the cover;
  - full tier only: a light pool (holo `dot`) under each lead.
- Expected cost: about +3 scene calls on full, +2 on lite, partly offset by the removed per-post station glass and
  outlines; about +1k triangles at 60 posts; programs unchanged (`e2e/perf/baseline.json` plus 0).
- One bounding sphere per mesh (union of its instances); `useDispose(kit)`; matrices and colors written only on change
  with module scratch objects; animation through `useFrame` delta, no new rAF loop.
- Spine pull: the hovered spine, else the spine nearest the rover inside a bay zone, slides out 0.3 u and brightens.
  Reduced motion snaps; lite drops pools and additive glow.
- Topic Constellation: a picked topic lights each bay holding one of its posts (existing `HighlightBeacons`), brightens
  the matching spines through instance color, and lights the lane to those bays (`topicRoadGlow`). `litArchive` and the
  archive-board strip are removed.

## 6. Interaction (point-and-go registry)

- Per post: `L4:shelf:<slug>`, kind `station`, label `hud.interact.readPost` ("Read {title}"), bounds the spine (or
  lead cover) rect, height its top; action: drive to the bay stop, then `open:L4:<slug>` (the post drawer as today).
- Per bay: `L4:track:<slug>`, kind `door`; opens the track drawer (room `L4:track:<slug>`): title, post count, and the
  posts lead first, each with date and reading time, each opening its post drawer. Built in
  `room-views/library.ts` on the existing `RoomTopics` body (one entry), so no new drawer component.
- Hints: one "!" per bay (`group: { id: "L4:track:<slug>" }`, like the Study Vault), object line
  `dialog.hints.object.track`; hover tags and clicks stay per spine. Touch: tap, then Go.
- No `onClick` on meshes; the meshes are not raycast.
- `palette:posts` (Rover "Read the writing", Cmd-K) stays as the list route.

## 7. Signs and placement

- All words ride the existing `library-signs` `FloatingSigns` group (no new draw call):
  - per bay: the track name over the bay's back edge (replaces the "Posts" section sign) and the lead title on a plate
    over the lead cover;
  - one live spine label: the hovered spine, else the nearest spine while the rover is in a bay zone, above that spine.
- `placeLibraryLabels` priority: picked, live spine, track names, lead titles, desk sections. Caps unchanged (6 desktop,
  4 phone), `TITLE_RANGE` unchanged, no overlap, nothing on the rover, fades eased (cut under reduced motion).
- Removed: per-post `stationTitleSpecs`, `yearPostSpecs`, `yearPostSegments`, the archive sign on the end plaza.

## 8. Camera

- One view zone per bay around its stop, yaw square on to the shelf, zoom so the full shelf and lead fit; a phone zoom
  through `classView.mobile`.
- The arrival zone (`L4:arrival`) still looks east down the lane, now at the first bays and their track names: the
  "pick an interest" moment. Its zooms are re-checked.
- Framing test (like the vault): at 1440x900, 1194x834, 834x1194 and 390x844 with a 39-post shelf, every spine corner,
  the lead cover and the rover stay inside the HUD-safe box.

## 9. Edge cases

- Track with no posts: no bay. External (Medium) post: a spine; its drawer opens the external link. ID-only post: the
  drawer's "written in" note. Missing or invalid lead: validate fails; runtime falls back to the newest post.
- 60+ posts: shelves add rows, then columns; the layout test covers 120.
- `#library-topic=` deep links, the Study Vault and the monument are unchanged.

## 10. Budgets

- L4 chunk cap 16 KB gzip (11.8 KB today). The 3D session total has about 58 B headroom, shared with sibling
  sessions C, D and F.
- Byte plan: delete the archive board (layout, registry, sign, highlights), the year posts, per-post station, door and
  title code and the `maxPosts` split; generalize the vault kit instead of adding a second one; put track data in the
  `/data` JSON. If a measured gap remains, the PR asks the owner for that exact number, at most +1.5 KB gzip, as an
  owner note (`e2e/budgets.ts` comment and a decision file).
- Draw calls under 150, triangles under 30k, programs at the baseline.

## 11. Tests

- Unit: `track-index` (each post in one track, lead first, fallback), schema and `validate:content` rules; layout with
  real content and synthetic 12, 39, 60 and 120 posts across 4 to 6 tracks (`expectSpaceRules`, pad zone, stops
  reachable); `shelf.ts` geometry (rows, columns, no overlapping spine rects, pull-out); registry targets and hint
  groups; the bay framing test; `library-label-sweep` and `end-plaza-label-sweep` with bay poses (archive and year
  poses removed).
- E2E: `library-labels.spec.ts` bay poses; new `library-shelves.spec.ts` (desktop full motion, phone reduced motion):
  click a spine, drive, post drawer; `/blog/<slug>` 3D deep link lands at its bay; the track drawer.
- Perf: `e2e/perf/floors.spec.ts` adds a settled bay-stop peak per tier; L4 chunk and session total gates.
- A 60-post synthetic payload fixture for the perf and look checks.

## 12. Docs (same PR)

- `docs/agents/floor-l4-library.md` rewritten for the shelves (current state only).
- `docs/features.md` L4 section and status log; `docs/content.md`: pick a track (and optionally a lead) when publishing.
- `docs/decisions/2026-10-25-l4-reader-tracks.md`.
- `tests/ask/golden.json` and the Ask pack only if track titles enter the pack.
- README L4 still refreshed (`bun scripts/readme-hero.ts`).

## 13. Out of scope

- Tracks on the Classic `/library` page (later PR, after #320 merges).
- Any change to the end plaza, the Topic Constellation layout or the Study Vault beyond the shared kit.

## Process note

After owner approval: copy this spec to the repo path, commit it (`docs:`), report the path to the parent session and
stop. No plan or code until the parent releases implementation.
