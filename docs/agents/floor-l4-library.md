# L4 Writing (Library)

The L4 Writing floor: the newsroom press plaza, the post timeline and its desks, timeline sign placement, and the end plaza with the Topic Constellation and the Study Vault.
Index: [AGENTS.md](../../AGENTS.md).

Related: road kit, doors, Express Return pad, floating signs and point-and-go live in [floors.md](floors.md); the L3 Tech Reactor that shares the ring road and highlights is in [floor-l3-labs.md](floor-l3-labs.md).

## Floor overview

Design: walkable floors plan, part 3. Concept: newsroom (owner decision).

- A press plaza with a headline wall: the newest title in large type over a ticker of every title.
- The featured post on a lit stage under a turning open book.
- One timeline lane east with the other posts newest first, year marks on small low posts at the road edge.
- Desks: Research (its paper plates open the paper preview), Models and datasets, Talks and workshops.

## Layout builder

- `buildLibraryLayout(input)` (`floors/library/layout.ts`, `LIBRARY_CONCEPT`) wraps the picked builder, `concepts/newsroom.ts` (the only concept left).
- It returns a `LibraryLayout` (`model.ts`):

  | Field | Contents |
  |---|---|
  | `floor` | road, doors, obstacles, spawn and arrival, view zones, `listStop` |
  | `stations` | docked posts newest first, then Research, Models, Talks |
  | `archive` and `board` | posts beyond `LIBRARY_FLOOR.maxPosts` = 12; `listStop` is the board stop |
  | `signs` | |
  | `centerpiece` | |
  | `links` | posts sharing a tag |
  | `extras` | concept extras |

- Stations dock with `dockAlong`: 6 u apart, 3 u forecourt, pad 1.1 u in front, spur from the road.
- Every post has its own door.
- `LIBRARY_FLOOR.padZone` stays free for the elevator call pad.
- Spawn and arrival are one point (`NEWSROOM.arrival`, (-4, 0)) on the plaza axis, west of its center: deep links spawn there and elevator arrivals roll on to it.
  - Zone `L4:arrival` (`arrivalOnly`, `travel` east) puts the camera behind the rover and 35 degrees to its right (the elevator diagonal, owner decision 2026-10-23), looking down the timeline lane at its first stations; zoom 1.16 (the first bay's track sign whole on desktops), phones 0.96 (the camera east of the glass shaft).
- The layout test passes `expectSpaceRules` with the real content.

## Scene (`Library.tsx`)

- Draws `RoadMarkings` and the picked decor (`decor/`, `DecorProps`):
  - station glass and outlines, batched;
  - Neon line icons in their zone tone (`ZONE_TONE`), one `HoloIcon` batch (one draw call, two on full): the zone icons (`LIBRARY_ICONS`) first; after the floor's first frame each post station shows its post's own icon and the Research, Models and Talks desks one icon per item (`deskSlots` in `floors/library/icons.ts`: one row of up to 4 low over the desk, 2.4 u apart, two rows from 5 items), placed at build into `public/shapes/L4.<hash>.json` (`libraryIcons`; [floors.md](floors.md#floating-hologram-icons)).
- The turning open book over the featured stage: `FlipBooks` in `decor/BookHolograms.tsx` (shared with the Reading Room concept), placed by `stageBook` / `STAGE_BOOK` in `decor/flipBooks.ts`.
- Paper plates in front of the Research station call `openPaperFor(locale, id)` (`hud/drawer/paper.ts`, the paper preview from the drawer data).
- Reduced motion holds every animation; lite drops halos and additive glow.

## Timeline signs

- The timeline words are one `FloatingSigns` group `library-signs` (`LibrarySigns.tsx`, 2 draw calls instead of one troika `Text` per station).
  - Pure specs in `decor/signs.ts`.
- Section and track names share one height: `L4_SIGN.bottom`, 5.6 u, in the zone sign type (`ZONE_SIGN`).
- Kinds of sign (`LibrarySignMeta`: `kind`, `zone`, `room`, `bay`):
  - `section`: one per zone with a station (Posts over the featured stage, Research, Models and datasets, Talks and workshops; `zoneSignSpecs`, from messages), hanging over the back edge of the zone's first station (`stationBackEdge`).
  - `track`: each bay's track name in upper case over the bay's back edge (`trackSignSpecs`, from content); `room` is the bay room `L4:track:<slug>`.
  - `lead`: each bay's lead title over the lead cover, plate bottom `L4_SIGN.bottom - 1.6` (`leadSignSpecs`); `room` is the post room.
  - `spine`: one title per spine (every slot but the lead), plate bottom 0.6 u over the spine (`spineSignSpecs`); it shows only while its spine is live (pulled) or its topic picked.
  - Titles wrap at `TITLE_SIGN.wrap` (22 characters). The featured post keeps its title on the headline wall (no lead sign over the stage).

### Placement (decided on screen every frame)

- `useLibrarySignPlacement` calls the pure frame `libraryLabelFrame` (`decor/signFrame.ts`), which projects every plate (`projectPlate`).
- The live spine: `TrackShelves` writes the pulled spine's post room to `sceneProbes.shelves.pulled` every frame (the hovered spine, else the nearest one while the rover is in a bay zone); `useLibrarySignPlacement` passes it to the frame as `live`.
- `placeLibraryLabels` (`signPlacement.ts`, pure) picks what shows:
  - priority: picked (lead and spine titles whose post room is in the picked topic), the live spine, track names, lead titles, then sections, nearest to the rover first within a tier;
  - caps (`LIBRARY_LABEL_MAX`): sections 4, track names 4, lead titles 4 on desktop and 2 on phones (width < 600), spines 1 (picked or live);
  - a spine that is neither live nor picked is never a candidate (the frame skips its projection);
  - lead and spine titles beyond `TITLE_RANGE` (28 u) never show unless picked;
  - nothing overlaps.
- Fixed obstacles: the rover's screen box and the end plaza's shown signs (`endPlazaScreen.boxes`, published by `useEndSignPlacement`).
- Signs closer than 6 u to the camera hide.
- Fades ease (a cut under reduced motion).
- The result reaches `FloatingSigns` through `visibility`, with `dropHidden` 30, so hidden signs cost no glyph triangles.
- Probe: `__hq.probes.library.labels`.

## End plaza and Topic Constellation

Code: `LibraryLayout.end`, `NEWSROOM.end`, scene `EndPlaza.tsx`.

### Layout

- The timeline ends on a closed ring road (`nav/ringRoad.ts`, shared with the L3 reactor) around the Topic Constellation pedestal.
  - The pedestal is a `Plaza.core` obstacle and tall column.
  - Stop: `stops["L4:topics"]`, on the ring's west point.
  - Camera zone `L4:topics` (look east, zoom 1.35): any heading within 2.5 u of the stop, plus the last `NEWSROOM.end.approach` (8 u) of the timeline for eastbound rovers (`travel`), so a rover approaching the plaza already sees the whole cloud and the topic count above it. Both parts share the id, and the approach clears every station door zone.
- The research monument stands north of the plaza: only with `researchMetrics`, `L4:station:metrics`, command `open:L4:research`.
- The Express Return pad is south of it.
- The archive board is on its east rim, drawn: its name is on the end plaza's sign group.

### Scene (`EndPlaza.tsx`)

- Pedestal and monument columns: one instanced holo `core` mesh.
- Topic orbs: holo `dot` quads turned to the camera, halos on full; a click picks or clears the topic, no drive.
- The links: full tier only.
- One `FloatingSigns` group whose topic labels ride the orbit (`SignSpec.orbit`, `FloatingSigns orbit`).

### Sign placement (decided on screen every frame)

No label may cover another (owner decision).

- `useEndSignPlacement` calls the pure frame `endPlazaFrame` (`decor/signFrame.ts`), which projects each plate (yaw-facing, upright).
- `placeLabels` (`fx/labelPlacement.ts`, pure) keeps:
  - the count headline, the monument plates (stacked in one column) and the picked topic;
  - then the other topic labels by priority (hovered orb, bigger topic, nearer), up to 8 (5 on phones), where they cover nothing.
- Labels fade out when the camera is right under them.
- The result reaches `FloatingSigns` through its `visibility` prop (a per-sign opacity array).

### Topic highlights and deep link

- `TopicHighlights.tsx` lights the picked topic's stations and the timeline road through the shared `fx/FilterHighlights.tsx` (`HighlightBeacons`, `GlowStrips`, also used by the L3 Tech Reactor).
- Pure rules: `floors/library/topics.ts` (`orbSlots`, `topicLinks`, `litStations`, `topicRoadGlow`).
- Deep link `#library-topic=<slug>`: `topicHash.ts`, `createTopicHashSync` in `topicUrl.ts` on the shared `floors/filterUrl.ts`; `gateStartRoom` starts on `L4:topics`.
- Probe: `__hq.probes.topics` (`topic`, `lit`, `roads`, `orbit`, `orbs`, `monument`, `labels`: the shown signs' screen boxes and projected quads).

## Study Vault

Owner decision: [2026-10-19](../decisions/2026-10-19-l4-study-vault.md). Design: [`2026-10-19-l4-study-vault-design.md`](../superpowers/specs/2026-10-19-l4-study-vault-design.md#3d-study-vault-pr2).

- The certification study guides stand as tall holo books off the end plaza; a book opens the same pdf.js reader as the Classic `/library#guides` shelf and the certification card ([content.md](content.md#study-guides)), in this tab.
- Only with guides: `buildLibraryData` fills `LibraryData.guides` (`slug`, `spine`, `issuer`, `code`, `title`, file order) from `guideViews(locale)`. With none, `LibraryEnd.vault` is null and the layout is exactly the one built without the field.

### Layout (`NEWSROOM.end.vault`, `studyVault` in `concepts/newsroom.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `entryVertex` | 6 | ring road vertex (of 16) the vault road starts on: 135 degrees, south-east |
| `distance` | 22 | vault plaza center from the end plaza center along that diagonal (the two rims stay 1 u apart) |
| `plaza` | 16 | round plaza diameter (`ROAD.minPlaza`); `LibraryVault.radius` 8 |
| `stopInset` | 1.5 | the stop, from the vault plaza center toward the ring, on the road |
| `arc`, `spacing` | 8, 3 | the books on an arc of radius 8 around the stop, centered due east, 3 u apart along it |
| `book` | w 1.2, d 2.6, h 4.2 | spine thickness along the arc, depth toward the stop, height |
| `zone`, `zoom`, `zoomPhone` | 2.5, 1.15, 0.95 | camera zone half size around the stop and its zooms |

- Road `vault` (width `LIBRARY_FLOOR.road`, 8) from the ring vertex to the vault plaza center; plaza `vault`, round, no core.
- Stop `stops["L4:vault"]` (`VAULT_ROOM`): a stop with a view, no catalog room and no drawer.
- Books in file order north to south (left to right on screen), each turned with its spine toward the stop (`VaultBook.facing`).
- Real content (end plaza center (83, 0)): stop (97.5, 14.5), vault plaza center (98.6, 15.6), book centers x 104.3 to 105.4, z 10.2 to 18.8. With the archive board the end plaza sits at (103, 0) and the vault moves with it.
- Obstacle: one `LibraryVault.shelf`, the bounds of the four book rects (a thin strip, about 3.9 x 10.9 u, x 102.8 to 106.7). One obstacle per book cannot pass the space rules: books 3 u apart leave gaps under the 6 u clear floor.
- Each `VaultBook.rect` (the axis-aligned bound of the turned footprint; rects never overlap) is a tall camera column (h 4.2) and the book's pick bounds.
- The slab grows east and south only: floor bounds x -24 to 112.7, z -23.5 to 29.6 (from 102 and 22.5).
- `tests/unit/library-vault.test.ts` (real, crowded with the board, no metrics): the space and pad rules, the road and stop on the diagonal, the stop reachable, books 8 u from the stop and inside the plaza, the shelf and every book rect at least 3 u from the Return pad, the board, the monument, the pedestal, the ring road edge and the slab edge.

### Camera

- Zone `L4:vault`: 2.5 u around the stop at any heading, yaw `lookEast` (like the arrival, constellation and board views), zoom 1.15, phones (`classView.mobile`) 0.95; no other zone overlaps it.
- Phone view (zoom 0.95): the four books and the sign above them sit mid-screen with the rover below, clear of the corner controls and the joystick.
- The framing test settles the follow camera (look-ahead, offset scale, `clampCamera`) at 1440x900, 1194x834, 834x1194 and 390x844: the rover and all 8 corners of every book (floor and 4.2 u) stay inside the HUD-safe box.

### Scene (`decor/StudyVault.tsx`, pure helpers in `decor/vault.ts`)

- `Library.tsx` mounts it when `layout.end.vault` exists. Group `library-vault` at the vault plaza center (so transparent sorting sees the vault where it is).
- `vaultMeshes` builds every `InstancedMesh` once (rendered as primitives, disposed through one `useDispose(kit)`). One draw call each, all on the shared instanced holo program (no new shader program):
  - books and plinths: 8 instances, holo `plate` with depth write, `renderOrder` -2; issuer tones `ISSUER_TONE` (Microsoft `#22d3ee`, GitHub `#a78bfa`, Google `#fbbf24`, the Classic shelf's dots);
  - covers: 4 instances, holo `core` (sharing the books' box), `renderOrder` -1, so the spine plates draw over the covers in front of them;
  - the floor track: a dashed `RingGeometry` arc around the stop under the plinths, holo `ring` (the outer books' backs stand about 1 u past the plaza rim, on the track);
  - full tier only: light pools, holo `dot`, one under each book and a wide dim one under the middle of the arc.
- Culling: one bounding sphere, the union of every instance of every mesh (open covers included), shared by all meshes, so the vault culls as one at any book count.
- Covers: `coverOpen(distance)` is 1 minus smoothstep between `VAULT_SCENE.near` 4 u and `far` 12 u from the rover to the book's center. From the stop (8 u from every book) each cover stands half open; it opens fully as the rover drives up to its book and is shut from the ring road. A book hovered through point-and-go opens fully; off L4 every cover shuts.
  - Each cover lies on the book's right as seen from the stop, hinged on the spine edge; open, it slides out 0.6 u, swings its far edge 35 degrees outward and brightens.
  - `useFrame` moves each cover toward its target at 1.6 of the travel a second and writes instance matrices and colors only on change (module scratch objects).
- Reduced motion snaps the covers to their target and holds the bands, the dashes and the pool pulse (`useUniformTime`). Lite drops the pools and additive blending.
- The meshes are not raycast: the books are point-and-go targets.

### Signs and placement

- The words ride the end plaza's `FloatingSigns` group (`endPlazaSigns` in `EndPlaza.tsx`), so they cost no new draw call; that group's 2 calls draw at the vault only because its signs show there.
  - One spine sign per book: `wrapSign(spine, 8)`, issuer tone, `FONTS.monoBold` 0.36, 3.1 u up, 0.6 u in front of the spine face (`EndSignMeta.kind` `guide`, with the slug).
  - A `STUDY VAULT` sign (`hud.interact.studyVault`, upper case, 0.5): 5.9 u up, 1.2 u behind the middle of the arc (`kind` `vault`).
- `vaultZone(rover, vault)` (`signFrame.ts`): `inside` the vault plaza, `near` on its road or within 2 u past its start on the ring, else `far`. `useEndSignPlacement` passes it to `endPlazaFrame` (`vault`):
  - inside: the spines, then the vault sign, outrank every topic label (`VAULT_PRIORITY`);
  - near: they come after the topics;
  - far: they never show, so the constellation view stays as it was.
- `END_SIGN_NEAR.guide` and `vault` are 0; `END_LABEL_MAX` is unchanged (at the vault a phone shows the 4 spines plus the sign, its cap of 5). No label covers another.

### Targets, hint and probe

- `vaultItems` (`interact/registry.ts`), one per book after the end items and before the archive board:
  - id `L4:vault:<slug>`, kind `station`, label `hud.interact.studyGuide` ("Read the {code} study guide", the spine when there is no code);
  - `at` the vault stop, `bounds` the book rect, height 4.2;
  - action command `guide:<slug>`, never `open-room` (the vault has no catalog room);
  - `group` `{ id: "L4:vault", label: studyVault }`.
- `guide:<slug>` (`parseCommand`, `/^guide:([a-z0-9-]{2,40})$/`): the rover drives to the vault stop, then `Director` sends `sendHudCommand({ type: "guide", slug })` and `DialogHost` opens the reader. The hint Go label for it is "Open".
- One hint bubble for the whole vault: `hintTargets` folds the group into `L4:vault` with the object line `dialog.hints.object.vault`; its Go only drives to the stop ([Hint bubbles](hud-and-drawer.md#hint-bubbles)). Hover tags and clicks stay per book.
- Probe `__hq.probes.vault`: `books` (slugs, file order), `open` (each cover, 0 to 1), `spines` (spine signs shown this frame, written by `useEndSignPlacement`).

## Tests

- `tests/unit/end-plaza-label-sweep.test.ts` (every PR): no end plaza label overlap (`polygonOverlap` of the quads, over 2 percent of the smaller) from the approach, the constellation stop (idle, a topic picked, the camera turned a little), the monument stop and the vault stop, at 8 orbit angles of the topic labels, desktop and phone, without a renderer; the bigger topics, the picked topic and its count, the 5 monument plates, every spine and the vault sign show.
  - Known overlap, left out of the check until a placement fix (it breaks the owner rule that no end plaza label covers another): the picked topic's label crosses the always-shown count headline for part of every orbit (about a quarter on a phone, almost half on a desktop); neither plate is placed, so only a placement change can fix it. The fix removes `knownOverlap` from the sweep.
- `tests/unit/library-label-sweep.test.ts` (every PR, about 1 s): the same sweep and assertions as `e2e/library-labels.spec.ts`, without a renderer.
  - The real layout and signs, the scene's own per-frame placement (`signFrame.ts`) and the follow camera as `CameraDirector` settles it (the autopilot route by `roadRoute`, view zones, look-ahead, offset scale, camera collision).
  - Each pose is checked at 8 orbit angles of the end plaza's topic labels.
  - A change to the camera rig, the view zones or the placement that the sweep does not follow shows as a gap between the two; the rendered spec stays the reference.
- Study Vault:
  - `tests/unit/library-vault.test.ts` (layout, space rules, framing) and `tests/unit/library-vault-scene.test.ts` (`coverOpen`, the book, plinth and cover matrices, tones, sign positions, `vaultZone` and priorities);
  - the label sweep's `vault` pose: all 4 spines and the `STUDY VAULT` sign show at each of the 8 orbit angles, desktop and phone, with no overlap;
  - `e2e/guides-vault.spec.ts` (lite, the fixture PDF from `e2e/fixtures/guide-pdf.ts`; desktop with full motion and a phone with reduced motion): covers follow `coverOpen` at the stop, the pointed book opens fully (snapped under reduced motion), a click (desktop) or tap then Go (phone) opens the reader in this tab, Esc gives the 3D view back; a book clicked from the constellation stop drives to the vault first;
  - `vault` poses in `tests/unit/end-plaza-label-sweep.test.ts` (every PR) and `e2e/library-labels.spec.ts` (`@nightly`);
  - `e2e/perf/floors.spec.ts`: L4 per tier at the vault stop (peak `settled-L4-vault`), same caps and program baseline.
- `e2e/library-labels.spec.ts`:
  - timeline label overlap under 2 percent of the smaller plate over the arrival, each bay's stop (its drawer closed), mid-lane between bays and each desk, at 1440x900 and 390x844, both on lite (the placement has no quality-tier input; the full-tier L4 budget is `e2e/perf/floors.spec.ts`);
  - the caps per kind, no duplicate text, no label on the rover;
  - each bay's track name and its live spine's title at its stop (the unit sweep sets `live` to the spine nearest the stop, as `TrackShelves` pulls it);
  - each zone's sign on its approach, road or door pose;
  - opt-in `L4_SHOTS` captures and numbers.

## Budgets (measured)

Settled, `e2e/perf/floors.spec.ts` (SwiftShader). Programs within `e2e/perf/baseline.json` (L4 lite 43, full 77) plus 2.

| Pose | Tier | Scene calls | Post passes | Triangles | Programs |
|---|---|---:|---:|---:|---:|
| arrival | full | 65 | 17 | 9383 | 73 |
| arrival | lite | 58 | 0 | 9080 | 43 |
| Study Vault stop | full | 55 | 17 | 9467 | 74 |
| Study Vault stop | lite | 47 | 0 | 9154 | 43 |

- The vault's own meshes draw 4 calls on full and 3 on lite (about 234 triangles plus the spine glyphs); the vault view draws fewer calls than the arrival because the timeline is behind the camera.
- Floor chunk: 11.8 KB gzip (cap 16 KB).
