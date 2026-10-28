# L4 Writing (Library)

The L4 Writing floor: the newsroom press plaza, the reader track shelves and the desks on the timeline lane, their sign placement, the point-and-go targets and the track drawer, and the end plaza with the Topic Constellation and the Study Vault.
Index: [AGENTS.md](../../AGENTS.md).

Related: road kit, doors, Express Return pad, floating signs and point-and-go live in [floors.md](floors.md); the L3 Tech Reactor that shares the ring road and highlights is in [floor-l3-labs.md](floor-l3-labs.md). Owner decision: [2026-10-25 reader tracks](../decisions/2026-10-25-l4-reader-tracks.md); design: [`2026-10-25-l4-writing-revamp-design.md`](../superpowers/specs/2026-10-25-l4-writing-revamp-design.md).

## Floor overview

Design: walkable floors plan, part 3. Concept: newsroom (owner decision). Reader tracks: owner decision 2026-10-25 (D1 to D9).

- A press plaza with a headline wall: the newest title in large type over a ticker of every title.
- The featured post (the newest hosted post) on a lit stage under a turning open book.
- One timeline lane east: one bookshelf bay per reader track (dataset order, alternating north and south), each led by its best post as a tall face-out book with the other posts as spines beside it.
- Then the desks: Research (its paper plates open the paper preview), Models and datasets, Talks and workshops.
- The end plaza: the Topic Constellation, the research monument, the Express Return pad and the Study Vault.
- Every post stands on its track's shelf (the layout is tested to 120 posts).

## Reader tracks (content)

- `floors.library.tracks` in `content/site-content.json`: 1 to 6 tracks in bay order, `{ slug, title: { en, id }, lead? }`; every post has a required `track` ([content.md](../content.md#reader-tracks), schema in [content.md](content.md)).
- `buildTrackIndex` (`src/content/track-index.ts`, pure; `getTrackIndex()` in `@/content/load`): per track in dataset order, its posts with the lead first (the owner's `lead`, else the newest), then newest first (same date: slug order). A track without posts stays in the index; the floor skips it.
- 3D payload: `LibraryData.tracks` (`buildLibraryData` in `src/content/experience-floors.ts`: `slug`, the locale-resolved `label`, `posts` lead first; tracks without posts dropped), in the per-floor `/data` JSON, not in a code chunk. `libraryLayoutInput` passes it through as `LibraryLayoutInput.tracks`.
- Real content: 11 posts on 4 tracks (AI in Production 4 with an owner lead, Cloud Platform and Security 3, Engineering with AI Agents 1, Earlier Writing 3).

## Layout builder

- `buildLibraryLayout(input)` (`floors/library/layout.ts`, `LIBRARY_CONCEPT`) wraps the picked builder, `concepts/newsroom.ts` (the only concept left), and sets `floor.listStop`: the featured stage's door, or the spawn without a hosted post (a post on no track parks there).
- It returns a `LibraryLayout` (`model.ts`):

  | Field | Contents |
  |---|---|
  | `floor` | road, doors, obstacles, spawn and arrival, view zones, stops, `listStop` |
  | `stations` | the featured stage (zone `blog`, when there is a hosted post), then Research, Models, Talks; never a bay |
  | `bays` | one `LibraryBay` per track with posts, in dataset order |
  | `centerpiece`, `extras.wall` | the headline wall |
  | `end` | the end plaza (`LibraryEnd`) |

- `LibraryBay`: `track`, `room` (`L4:track:<slug>`, `trackRoom`), `rect`, `center`, `door`, `facing` (pad into the bay), `from` (spur start), `stop` (the door), `posts` (lead first). The layout carries no shelf slots: the lazy L4 chunk builds them (`baySlots`).
- Docking: `dockAlong` over one item list (the bays, then the desks), even indexes north from `NEWSROOM.northStart` 14 u, odd ones south from `southStart` 16 u, `DOCK.gap` 6 u apart, `forecourt` 3 u, the pad 1.1 u in front, a spur from the road. A `DockItem` may carry its own `along` (a bay's `shelfSize(...).along`), else `STATION_SIZE[zone].along`; a bay is `SHELF.across` 6 u deep.
- The featured stage docks south of the plaza (`featuredStart` 2). The featured post also keeps its slot on its track's shelf; its room keeps the stage door (doors win over stops).
- Shelf geometry (`shelf.ts`, pure, on the main 3D path; the slots in `slots.ts`, pure, only in the lazy L4 chunk):

  | `SHELF` | Value | Meaning |
  |---|---|---|
  | `spine` | w 0.5, pitch 0.65, d 1.4, h 1.6, dh 0.3 | spine thickness, slot pitch, depth, tallest height, the height range a slug hash (FNV-1a) takes off |
  | `perRow`, `maxRows` | 13, 3 | spines per row, rows before the bay grows longer |
  | `rowH` | 1.9 | row `r` stands at `r * rowH` |
  | `lead` | w 1.6, d 2.4, h 3.6 | the lead's tall book |
  | `pad`, `minAlong` | 1, 8 | clear gap at the bay ends and after the lead; shortest bay |

  - `shelfSize(count)`: `rows` = min(3, ceil(spines / 13)) (at least 1), `cols` = ceil(spines / rows), `along` = max(8, 2 * pad + lead.w + pad + cols * pitch). Real content: every bay is 8 u long, one row.
  - `baySlots(bay)` (`slots.ts`): one slot per post in `bay.posts` order (slot 0 is the lead), the lead at the bay's left end as seen from the road, the spines to its right, row 0 at the bottom filled first; each slot has `at`, `y` (its row), `w`, `d`, `h` and its axis-aligned `rect`. `SHELF_PLINTH` 0.24: every slot stands on a board that high.
- Stops: `floor.stops["L4:<slug>"]` is the post's bay door for every post but the featured one, so `/blog/<slug>` 3D deep links, missions, Cmd-K and `roomTarget` drive to the bay. Plus `L4:topics` and `L4:vault`.
- Doors: the stage, one per bay (room `L4:track:<slug>`), the three desks. No post has a door or station of its own.
- Real content (`facing` z -1 north, +1 south): bays at x 16 (north), 18 (south), 30 (north), 32 (south), doors at z -5.9 / 5.9; the desks at x 45, 46, 60; the end plaza center (79, 0); slab x -24 to 108.7, z -23.5 to 29.6.
- `LIBRARY_FLOOR.padZone` stays free for the elevator call pad.
- Spawn and arrival are one point (`NEWSROOM.arrival`, (-4, 0)) on the plaza axis, west of its center: deep links spawn there and elevator arrivals roll on to it.
- Tests: `tests/unit/library-layout.test.ts` (real content: space rules, every catalog room has a door or a stop, bays in order, post stops, `listStop`), `tests/unit/library-concepts.test.ts` (real content and synthetic 1, 12, 39, 60 and 120 posts over 4 to 6 tracks: `expectSpaceRules`, the pad zone, one bay per track, every post room reachable), `tests/unit/library-shelf.test.ts` (`shelfSize`, `baySlots`), `tests/unit/track-index.test.ts`.

## Camera

- Zone `L4:arrival` (`arrivalOnly`, `travel` east) puts the camera behind the rover and 35 degrees to its right (the elevator diagonal, owner decision 2026-10-23), looking down the timeline lane at its first bays: zoom `arrivalZoom` 1.16, phones `arrivalZoomPhone` 0.96 (both under `shaftClearZoom`, the camera east of the glass shaft).
  - Only the first bay's track sign is whole in the arrival view (desktop 1.12 cut its top corner). The second bay stands south of the lane beside the camera, so no zoom brings its sign in; two signs would need another arrival yaw or layout (an owner composition).
- Bay zones (`stationViewZones` in `model.ts`, `SHELF_VIEW` in `shelf.ts`): one per bay door, id the bay room, `SHELF_VIEW.zone` 2.5 u around the door (other doors 2.2), yaw `stationYaw(facing)`, zoom 1.15, phones (`classView.mobile`, portrait tablets too) 1.35. No other zone overlaps a bay zone.
  - The phone zoom is larger than the desktop one: the follow yaw sees a north bay diagonally, and 1.35 is what keeps a 40-post bay's far end inside 390 px (1.3 passes at the edge, lower zooms cut a south bay's lead).
- Other zones: `L4:headlines` (look north at the wall, zoom 1.4, phones 0.95 so the ticker reads), the end plaza's (below).
- Phone reading rule ([floors.md](floors.md#arrival)): on portrait phones track names are 0.7 wrapped at 14 characters and post titles 0.76 wrapped at 16 (`ZONE_SIGN.phone`, `TITLE_SIGN.phone` in `decor/signs.ts`); topic names 0.5 (picked 0.6), vault spines 0.68, standing alternately low and high so neighbouring plates clear each other (`SPINE` in `decor/EndPlaza.tsx`), and the vault title 0.6 (`VAULT_TITLE.phone`), read from the vault stop at its phone zoom of 1.15.
- `tests/unit/library-shelf-framing.test.ts` (real content and a synthetic 40-post bay): the bay zone's id, yaw, zooms and area; the follow camera settled as `CameraDirector` does (`tests/helpers/follow-frame.ts`, shared with the vault) keeps the rover and all 8 corners of every slot inside the HUD-safe box at 1440x900, 1194x834, 834x1194 and 390x844; from `L4:arrival` the first bay's track sign projects whole at the four sizes.

## Scene (`Library.tsx`, `decor/NewsroomDecor.tsx`)

- Draws `RoadMarkings` and the picked decor (`decor/`, `DecorProps`):
  - the stage and desk glass and outlines, batched (`StationShells`; bays have none);
  - Neon line icons in their zone tone (`ZONE_TONE`, `track` `#22d3ee`), one `HoloIcon` batch (one draw call, two on full): the zone icons first; after the floor's first frame one icon over each bay's lead (the lead post's own icon, track tone) and one per item over the Research, Models and Talks desks (`deskSlots` in `floors/library/icons.ts`: one row of up to 4 low over the desk, 2.4 u apart, two rows from 5 items), placed at build into `public/shapes/L4.<hash>.json` (`libraryIcons`; [floors.md](floors.md#floating-hologram-icons)).
- The turning open book over the featured stage: `FlipBooks` in `decor/BookHolograms.tsx`, placed by `stageBook` / `STAGE_BOOK` in `decor/flipBooks.ts`.
- Paper plates in front of the Research station call `openPaperFor(locale, id)` (`hud/drawer/paper.ts`, the paper preview from the drawer data).

### Track shelves (`decor/TrackShelves.tsx`, pure `decor/shelf3d.ts`)

- Mounted by `NewsroomDecor` when there is a bay. Group `library-shelves` at the center of all the bays.
- The shared book kit (`decor/bookKit.ts`, also behind the Study Vault): `kitBox` (the unit box with the holo plate's `aAlpha`), `kitBodies` (holo `plate`, depth write, `renderOrder` -2), `kitCovers` (holo `core`, `renderOrder` -1, additive on full only), `kitPools` (holo `dot`, full only; the vault's pools), and `bookKit(parts, origin)`: one `InstancedMesh` per part, instance color tone times brightness, one bounding sphere shared by every mesh, never raycast, one `dispose`.
- `shelfMeshes(bays, tier)` builds the meshes once, each spanning every bay, so draw calls do not grow with posts or tracks:
  - bodies (1 call): the spines, then the leads' bodies, then each bay's frame (`frameMatrices`: a board under each row, row 0 under the lead too, and one back panel `SHELF.lead.d` behind the slots, as tall as the lead or the rows);
  - covers (1 call): each lead's cover held half open (`leadMatrix`, the vault's `openCover`: on the book's right as seen from the road, hinged on the spine edge).
  - No light pools under the leads and no topic brightening on the spines (owner decision 2026-10-25, bytes): a picked topic lights its bays through `TopicHighlights`.
- A spine stands on its row's board with its face toward the road (`spineMatrix`), in the track tone (brightness 1.15, frames 0.6).
- Pull: `pickSpine` takes the hovered spine (`L4:shelf:<slug>`), else the spine nearest the rover within 6 u while the rover is inside that spine's `bayZone` (the bay, its forecourt and the near half of the road); only on L4. The pulled spine slides out `SHELF_SCENE.pull` 0.3 u toward the road at `rate` 1.6 of the travel a second and brightens by 0.45. Leads never pull.
- `useFrame` writes instance matrices and colors only on change (module scratch objects, plain `for` loops); `useDispose(kit)`, `useUniformTime(kit.materials)`.
- Reduced motion snaps the pull; lite drops additive blending.
- Probe `__hq.probes.shelves`: `bays` (track slugs), `spines` (posts minus leads), `pulled` (the pulled spine's post room, or null), written every frame.
- Tests: `tests/unit/library-shelf-scene.test.ts` (`spineMatrix`, `leadMatrix`, `frameMatrices`, `bayZone`, `pickSpine`, `shelfMeshes` per tier).

## Timeline signs

- The timeline words are one `FloatingSigns` group `library-signs` (`LibrarySigns.tsx`, 2 draw calls).
  - Pure specs in `decor/signs.ts`; `librarySigns` lists every sign with its `LibrarySignMeta` (`kind`, `room`), building each bay's slots once; post titles come by post slug (`postTitles` in `decor/common.tsx`).
- Section and track names share one height: `L4_SIGN.bottom`, 5.6 u, upper case in the zone sign type (`ZONE_SIGN`: 0.6, letter spacing 0.12).
- Kinds of sign (`LibrarySignKind`):
  - `section`: one per zone with a station (Posts over the featured stage, Research, Models and datasets, Talks and workshops; `zoneSignSpecs`, from messages), hanging over the back edge of the zone's first station (`stationBackEdge`).
  - `track`: each bay's track name over the bay's back edge (from content); `room` is the bay room `L4:track:<slug>`.
  - `lead`: each bay's lead title over the lead cover, plate bottom `L4_SIGN.bottom - SHELF_SIGN.leadDrop` (5.6 - 1.6 = 4.0 u); `room` is the post room.
  - `spine`: one title per spine (every slot but the lead), plate bottom `SHELF_SIGN.lift` 0.9 u over the spine top (0.9 keeps it clear of the rover's screen box at a bay door on a desktop, 0.6 sat inside `LABEL_GAP`); it shows only while its spine is live (pulled) or its topic picked.
  - Titles wrap at `TITLE_SIGN.wrap` (22 characters, 0.4 type, track tone). The featured post keeps its title on the headline wall (no lead sign over the stage).

### Placement (decided on screen every frame)

- `useLibrarySignPlacement` calls the pure frame `libraryLabelFrame` (`decor/signFrame.ts`), which projects every plate (`projectPlate`).
- The live spine: `TrackShelves` writes the pulled spine's post room to `sceneProbes.shelves.pulled` every frame; `useLibrarySignPlacement` passes it to the frame as `live`.
- `placeLibraryLabels` (`signPlacement.ts`, pure) picks what shows:
  - priority: picked (lead and spine titles whose post room is in the picked topic), the live spine, track names, lead titles, then sections, nearest to the rover first within a tier (ties keep input order);
  - caps (`LIBRARY_LABEL_MAX`): sections 4, track names 4, lead titles 4 on desktop and 2 on phones (width < 600), spines 1 (picked or live);
  - a spine that is neither live nor picked is never a candidate (the frame skips its projection);
  - lead and spine titles beyond `TITLE_RANGE` (28 u) never show unless picked;
  - nothing overlaps (`LABEL_GAP`).
- Fixed obstacles: the rover's screen box and the end plaza's shown signs (`endPlazaScreen.boxes`, published by `useEndSignPlacement`).
- Signs closer than 6 u to the camera hide.
- Fades ease (a cut under reduced motion).
- The result reaches `FloatingSigns` through `visibility`, with `dropHidden` 30, so hidden signs cost no glyph triangles.
- Probe: `__hq.probes.library.labels`.
- Tests: `tests/unit/floor-signs.test.ts` (sign specs), `tests/unit/library-sign-placement.test.ts` (tiers and caps).

## Targets, hints and the track drawer

- Spines and covers (`shelfTargets` in `floors/library/slots.ts`, registered by `Library` with `registerExtraInteractables("L4", ...)` while the floor is mounted, so they stay off the main 3D path): one target per post on its bay, id `L4:shelf:<post slug>`, kind `station`, label `hud.interact.readPostTitle` ("Read {title}"), `at` the bay stop, `bounds` the slot rect, `base` the row height, `height` the slot top; action command `open:L4:<slug>`: the rover drives to the bay door, then the post drawer opens there. No `onClick` on the meshes.
- Bay doors: the ordinary door target `L4:door:track:<slug>` (kind `door`, label the track title, the pad volume rather than the bay's, which would shadow its spines); it opens the track drawer.
- Hint group: the door and the spines of a bay share `group: { id: "L4:track:<slug>", label: <track title> }`. `hintTargets` folds them into one "!" per bay at the door with the object line `dialog.hints.object.track` ("A shelf of posts on one theme, the best one first."); the door comes first, so the bubble's Go opens the track drawer ([Hint bubbles](hud-and-drawer.md#hint-bubbles)). Hover tags and clicks stay per spine; touch: tap, then Go.
- Track drawer (`trackViews` in `content/room-views/library.ts`): room `L4:track:<slug>`, kind `shelf`, the track title, subtitle `library.tracks.count` ("N posts"), one section with the posts lead first, each with its date; each item is a `RoomLinkItem.room` button that rides to its post drawer (`goToRoom`). Catalog entry (`missions/rooms.ts`): kind `shelf`, path `/library#posts`, Cmd-K keywords "reader track", "rak", "shelf" and the post titles. Tracks without posts have no view and no entry.
  - Room links (track drawer, Cmd-K and deep links) take the featured post to its stage door and ordinary posts to their bay door. Clicking a shelf object instead always opens at that shelf's bay, including the featured post's shelf copy.
  - `e2e/library-shelves.spec.ts` covers both track-drawer destinations and selects ordinary posts by excluding the newest hosted post, never by assuming a fixed track index is not featured.
- `palette:posts` (Rover's "Read the writing", Cmd-K) stays the list route.
- Door latch: a room opened while the rover stands on another pad (a post opened at its bay door) consumes that pad too, so closing the post before the next frame never opens the track drawer (`stepDoorLatch`, [floors.md](floors.md#doors)).
- Tests: `tests/unit/interact-registry.test.ts` (shelf targets, bay groups), `tests/unit/hint-select.test.ts` (a bay door before its spines keeps its room for Go), `tests/unit/hint-lines.test.ts`, `tests/unit/doors.test.ts` (the latch), `tests/hud/LibraryRoofRooms.test.tsx` (the track drawer).

## End plaza and Topic Constellation

Code: `LibraryLayout.end`, `NEWSROOM.end`, scene `EndPlaza.tsx`.

### Layout

- The timeline lane ends on a closed ring road (`nav/ringRoad.ts`, shared with the L3 reactor) around the Topic Constellation pedestal.
  - The pedestal is a `Plaza.core` obstacle and tall column.
  - Stop: `stops["L4:topics"]`, on the ring's west point.
  - Camera zone `L4:topics` (look east, zoom 1.35; phones 1 aimed 3 u up, so the topic names read and the pieces count stays in frame): any heading within 2.5 u of the stop, plus the last `NEWSROOM.end.approach` (8 u) of the timeline for eastbound rovers (`travel`), so a rover approaching the plaza already sees the whole cloud and the topic count above it. Both parts share the id, and the approach clears every door zone.
- The research monument stands north of the plaza: only with `researchMetrics`, `L4:station:metrics`, command `open:L4:research`.
- The Express Return pad is south of it.

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

- `TopicHighlights.tsx` lights, through the shared `fx/FilterHighlights.tsx` (`HighlightBeacons`, `GlowStrips`, also used by the L3 Tech Reactor):
  - a beacon on each lit station (the featured stage, the desks) and on each bay holding one of the topic's posts (`litStations`);
  - the timeline from the ring stop west to the westmost lit spur, then each lit spur (`topicRoadGlow`).
- Pure rules: `floors/library/topics.ts` (`orbSlots`, `topicLinks`, `litStations`, `topicRoadGlow`); `tests/unit/library-topics.test.ts`.
- Deep link `#library-topic=<slug>`: `topicHash.ts`, `createTopicHashSync` in `topicUrl.ts` on the shared `floors/filterUrl.ts`; `gateStartRoom` starts on `L4:topics`.
- Probe: `__hq.probes.topics` (`topic`, `lit` (station and bay rooms), `roads`, `orbit`, `orbs`, `monument`, `labels`: the shown signs' screen boxes and projected quads).

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
| `stopInset` | 0.5 | the stop, from the vault plaza center toward the ring, on the road (close to the center, so five books stay inside the plaza and clear of the road's end) |
| `arc`, `spacing` | 8, 3 | the books on an arc of radius 8 around the stop, centered due east, 3 u apart along it |
| `book` | w 1.2, d 2.6, h 4.2 | spine thickness along the arc, depth toward the stop, height |
| `zone`, `zoom`, `zoomPhone` | 2.5, 1.15, 1.15 | camera zone half size around the stop and its zooms |

- Road `vault` (width `LIBRARY_FLOOR.road`, 8) from the ring vertex to the vault plaza center; plaza `vault`, round, no core.
- Stop `stops["L4:vault"]` (`VAULT_ROOM`): a stop with a view, no catalog room and no drawer.
- Books in file order north to south (left to right on screen), each turned with its spine toward the stop (`VaultBook.facing`).
- Real content (end plaza center (79, 0), five books): stop (94.2, 15.2), vault plaza center (94.6, 15.6), book centers x 100.1 to 102.2, z 9.7 to 20.7. The end plaza moves east as the bays grow, and the vault moves with it.
- Obstacle: one `LibraryVault.shelf`, the bounds of the book rects (a thin strip, about 4.8 x 13.6 u, x 98.7 to 103.5). One obstacle per book cannot pass the space rules: books 3 u apart leave gaps under the 6 u clear floor.
- Each `VaultBook.rect` (the axis-aligned bound of the turned footprint; rects never overlap) is a tall camera column (h 4.2) and the book's pick bounds.
- The slab grows east and south only: floor bounds x -24 to 109.5, z -23.5 to 29.6 with real content.
- `tests/unit/library-vault.test.ts` (real content, crowded with 60 posts on 6 tracks, no metrics): the space and pad rules, the road and stop on the diagonal, the stop reachable, books 8 u from the stop and inside the plaza, the shelf and every book rect at least 3 u from the Return pad, the monument, the pedestal, the ring road edge and the slab edge.

### Camera

- Zone `L4:vault`: 2.5 u around the stop at any heading, yaw `lookEast` (like the arrival and constellation views), zoom 1.15, phones (`classView.mobile`) 1.15; no other zone overlaps it.
- Phone view (zoom 1.15): the five books and the sign above them sit mid-screen with the rover below, clear of the corner controls and the joystick.
- The framing test settles the follow camera (look-ahead, offset scale, `clampCamera`; `tests/helpers/follow-frame.ts`) at 1440x900, 1194x834, 834x1194 and 390x844: the rover and all 8 corners of every book (floor and 4.2 u) stay inside the HUD-safe box.

### Scene (`decor/StudyVault.tsx`, pure helpers in `decor/vault.ts`)

- `Library.tsx` mounts it when `layout.end.vault` exists. Group `library-vault` at the vault plaza center (so transparent sorting sees the vault where it is).
- `vaultMeshes` builds every `InstancedMesh` once on the shared book kit (`decor/bookKit.ts`, also behind the track shelves; rendered as primitives, disposed through one `useDispose(kit)`). One draw call each, all on the shared instanced holo program (no new shader program):
  - books and plinths: 2 per book (10 with five guides), holo `plate` with depth write, `renderOrder` -2; issuer tones `ISSUER_TONE` (Microsoft `#22d3ee`, GitHub `#a78bfa`, Google `#fbbf24`, the Classic shelf's dots);
  - covers: 1 per book, holo `core` (sharing the books' box), `renderOrder` -1, so the spine plates draw over the covers in front of them;
  - the floor track: a dashed `RingGeometry` arc around the stop under the plinths, holo `ring` (the outer books' backs stand about 1 u past the plaza rim, on the track);
  - full tier only: light pools, holo `dot`, one under each book and a wide dim one under the middle of the arc.
- Culling: one bounding sphere, the union of every instance of every mesh (open covers included), shared by all meshes (`bookKit`), so the vault culls as one at any book count.
- Covers: `coverOpen(distance)` is 1 minus smoothstep between `VAULT_SCENE.near` 4 u and `far` 12 u from the rover to the book's center. From the stop (8 u from every book) each cover stands half open; it opens fully as the rover drives up to its book and is shut from the ring road. A book hovered through point-and-go opens fully; off L4 every cover shuts.
  - Each cover lies on the book's right as seen from the stop, hinged on the spine edge; open, it slides out 0.6 u, swings its far edge 35 degrees outward and brightens.
  - `useFrame` moves each cover toward its target at 1.6 of the travel a second and writes instance matrices and colors only on change (module scratch objects).
- Reduced motion snaps the covers to their target and holds the bands, the dashes and the pool pulse (`useUniformTime`). Lite drops the pools and additive blending.
- The meshes are not raycast: the books are point-and-go targets.

### Signs and placement

- The words ride the end plaza's `FloatingSigns` group (`endPlazaSigns` in `EndPlaza.tsx`), so they cost no new draw call; that group's 2 calls draw at the vault only because its signs show there.
  - One spine sign per book: `wrapSign(spine, 8)`, issuer tone, `FONTS.monoBold` 0.36, 3.1 u up (every other book `SPINE_STAGGER` 0.5 u higher: the arc's outer neighbors close up on screen), 0.6 u in front of the spine face (`EndSignMeta.kind` `guide`, with the slug).
  - A `STUDY VAULT` sign (`hud.interact.studyVault`, upper case, 0.5): 5.9 u up, 1.2 u behind the middle of the arc (`kind` `vault`).
- `vaultZone(rover, vault)` (`signFrame.ts`): `inside` the vault plaza, `near` on its road or within 2 u past its start on the ring, else `far`. `useEndSignPlacement` passes it to `endPlazaFrame` (`vault`):
  - inside: the spines, then the vault sign, outrank every topic label (`VAULT_PRIORITY`);
  - near: they come after the topics;
  - far: they never show, so the constellation view stays as it was.
- `END_SIGN_NEAR.guide` and `vault` are 0. Inside the vault the cap is `END_LABEL_MAX` or the number of vault signs, whichever is larger, so a phone (cap 5) still shows all 5 spines plus the sign. No label covers another.

### Targets, hint and probe

- `vaultItems` (`interact/registry.ts`), one per book after the end items (the last L4 targets):
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
  - each bay's track name and its live spine's title at its stop (the title of `__hq.probes.shelves.pulled`; the unit sweep sets `live` to the spine nearest the stop, as `TrackShelves` pulls it);
  - each zone's sign on its approach, road or door pose;
  - opt-in `L4_SHOTS` captures and numbers.
- Track shelves (unit tests per area are listed in the sections above):
  - `e2e/library-shelves.spec.ts` (lite; desktop with full motion and a phone with reduced motion): the shelves probe lists every bay and spine; at a bay's door the spine nearest the rover pulls (`__hq.probes.shelves.pulled`) and its title shows, on the lane none pulls; the pointed (or tapped) spine pulls and shows only its title; a click (or Go) drives to the bay's door and opens the post (its `/blog` URL), Esc gives the floor back;
  - desktop only: the bay's door opens the track drawer (posts lead first) and an item opens its post at the door; a post opened from Cmd-K parks the rover at its bay's door (`stops["L4:<slug>"]` is the bay's door);
  - `e2e/perf/floors.spec.ts`: L4 per tier at the largest track's bay door, the drawer closed and a spine pulled (peak `settled-L4-shelf`), same caps and program baseline.
- `e2e/topics.spec.ts`: a topic lights its non-bay doors plus the bay of each of its posts (computed from the post tracks, as `litStations` does), roads = lit + 1.

## Budgets (measured)

Settled, `e2e/perf/floors.spec.ts` (SwiftShader). Programs within `e2e/perf/baseline.json` (L4 lite 43, full 77) plus 2.

| Pose | Tier | Scene calls | Post passes | Triangles | Programs |
|---|---|---:|---:|---:|---:|
| arrival | full | 59 | 17 | 10,869 | 74 |
| arrival | lite | 56 | 0 | 9,950 | 43 |
| bay door (`settled-L4-shelf`) | full | 68 | 17 | 11,345 | 75 |
| bay door (`settled-L4-shelf`) | lite | 65 | 0 | 10,426 | 43 |
| Study Vault stop (`settled-L4-vault`) | full | 47 | 17 | 10,743 | 76 |
| Study Vault stop (`settled-L4-vault`) | lite | 43 | 0 | 9,814 | 43 |

- The shelves draw 2 calls on both tiers (bodies, covers), at any post or track count; the vault's own meshes 4 on full and 3 on lite.
- Ride peak `ride-L1-L4` lite: 101 scene calls, 20,114 triangles.
- Floor chunk: 13,519 B gzip on both tiers (with the shelf slots and the spine targets, `slots.ts`) (cap 16 KB, 16,384 B). The chunk also counts in the 3D session total ([performance.md](performance.md#bytes-3d)).
