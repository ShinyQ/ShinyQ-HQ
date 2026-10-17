# L4 Writing (Library)

The L4 Writing floor: the newsroom press plaza, the post timeline and its desks, timeline sign placement, and the end plaza with the Topic Constellation.
Index: [AGENTS.md](../../AGENTS.md).

Related: road kit, doors, Express Return pad, floating signs and point-and-go live in [floors.md](floors.md); the L3 Tech Reactor that shares the ring road and highlights is in [floor-l3-labs.md](floor-l3-labs.md).

## Floor overview

Design: walkable floors plan, part 3. Concept: newsroom (owner decision).

- A press plaza with a headline wall: the newest title in large type over a ticker of every title.
- The featured post on a lit stage under a turning open book.
- One timeline lane east with the other posts newest first, year marks on small low posts at the road edge.
- Desks: Research (its paper plates open the paper preview), Models and datasets, Talks and workshops.

## Layout builder

- `buildLibraryLayout(input)` (`floors/library/layout.ts`, `LIBRARY_CONCEPT`) wraps the picked builder from `concepts/`.
  - The other two concepts stay for the dev prototype only, so the 3D chunk bundles just the pick.
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
  - Zone `L4:arrival` (`arrivalOnly`, `travel` east) puts the camera behind the rover, looking east down the timeline lane at its first stations; zoom 1.12, phones 0.96 (the widest views that keep the camera east of the glass shaft).
- The layout test passes `expectSpaceRules` with the real content.

## Scene (`Library.tsx`)

- Draws `RoadMarkings` and the picked decor (`decor/`, `DecorProps`):
  - station glass and outlines, batched;
  - Neon line zone icons (`LIBRARY_ICONS`, `ZONE_TONE`).
- The turning open book over the featured stage: `FlipBooks` in `decor/BookHolograms.tsx` (shared with the Reading Room concept), placed by `stageBook` / `STAGE_BOOK` in `decor/flipBooks.ts`.
- Paper plates in front of the Research station call `openPaperFor(locale, id)` (`hud/drawer/paper.ts`, the paper preview from the drawer data).
- Reduced motion holds every animation; lite drops halos and additive glow.

## Timeline signs

- The timeline words are one `FloatingSigns` group `library-signs` (`LibrarySigns.tsx`, 2 draw calls instead of one troika `Text` per station).
  - Pure specs in `decor/signs.ts`; the other two concepts keep `ZoneSigns`.
- One height rule for every plate on the timeline: `L4_SIGN.bottom`, 5.6 u.
- Kinds of sign:
  - Section signs: one per zone (Posts, Research, Models and datasets, Talks and workshops; `zoneSignSpecs`, from messages), hanging over the back edge of the zone's first desk (`stationBackEdge`).
  - Post titles: from content, only on post stations (`stationTitleSpecs`).
    - A shelf station never repeats its zone name.
    - The featured post keeps its title on the headline wall.
  - Years: a small plate on a low post (`yearPostSpecs`, `yearPostSegments`, `YEAR_POST` in `model.ts`) at the road edge, in the gap before the first post of each year.

### Placement (decided on screen every frame)

- `useLibrarySignPlacement` projects every plate (`projectPlate`).
- `placeLibraryLabels` (`signPlacement.ts`, pure) picks what shows:
  - priority: picked titles first, then sections (at most 4), years (3) and the other post titles, nearest to the rover first;
  - at most 6 titles on desktop and 4 on phones (width < 600);
  - titles beyond `TITLE_RANGE` (28 u) never show unless picked;
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

- `useEndSignPlacement` projects each plate (yaw-facing, upright).
- `placeLabels` (`fx/labelPlacement.ts`, pure) keeps:
  - the count headline, the monument plates (stacked in one column), the archive name and the picked topic;
  - then the other topic labels by priority (hovered orb, bigger topic, nearer), up to 8 (5 on phones), where they cover nothing.
- Labels fade out when the camera is right under them.
- The result reaches `FloatingSigns` through its `visibility` prop (a per-sign opacity array).

### Topic highlights and deep link

- `TopicHighlights.tsx` lights the picked topic's stations and the timeline road through the shared `fx/FilterHighlights.tsx` (`HighlightBeacons`, `GlowStrips`, also used by the L3 Tech Reactor).
- Pure rules: `floors/library/topics.ts` (`orbSlots`, `topicLinks`, `litStations`, `topicRoadGlow`).
- Deep link `#library-topic=<slug>`: `topicHash.ts`, `createTopicHashSync` in `topicUrl.ts` on the shared `floors/filterUrl.ts`; `gateStartRoom` starts on `L4:topics`.
- Probe: `__hq.probes.topics` (`topic`, `lit`, `roads`, `orbit`, `orbs`, `monument`, `labels`: the shown signs' screen boxes and projected quads).

## Tests

- `e2e/topics.spec.ts`: includes no label overlap from the approach, the camera zones and while orbiting, desktop and phone, by `polygonOverlap` of the quads.
- `e2e/library-labels.spec.ts`:
  - timeline label overlap under 2 percent of the smaller plate over the approach, the posts, mid-timeline and each zone, at 1440x900 and 390x844, both on lite (the placement has no quality-tier input; the full-tier L4 budget is `e2e/perf/floors.spec.ts`);
  - the title caps, no duplicate text, no label on the rover;
  - each zone's sign on its approach, road or door pose;
  - opt-in `L4_SHOTS` captures and numbers.

## Budgets (measured)

| Tier | Settled scene calls | Triangles |
|---|---|---|
| full | 72 | 9157 |
| lite | 65 | 8878 |

- Floor chunk: 9.9 KB gzip.
