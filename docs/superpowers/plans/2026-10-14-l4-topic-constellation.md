# L4 Topic Constellation Implementation Plan

Status: shipped in #98 (f54e436), 2026-10-14

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the empty end of L4 (Writing) with a Topic Constellation (a topic filter like the L3 Tech Reactor), a research-metrics monument and an Express Return pad, and give the Classic `/library` page the same topic filter.

**Architecture:** A build-time topic index (`src/content/topic-index.ts`, explicit maps in `topic-map.ts`) feeds the 3D payload (`ExperienceData.library.topics`), the drawer view (`L4:topics`, `RoomView.topics`), the HUD index (Cmd-K "Show writing about X") and the Classic filter (`?topic=`). The Newsroom end plaza grows into a 26 u round plaza with the constellation core in its middle and a closed ring road around it (the L3 reactor pattern, factored into `nav/ringRoad.ts`), the monument docked on the north rim, the Return pad south, the archive board east. Highlights (station beacons, road glow) and the hash sync are factored out of the L3 Tech Reactor and shared.

**Tech Stack:** Next.js 16 static export, R3F, three, troika, zustand, next-intl, Vitest, Playwright.

## Global Constraints

- No em dashes anywhere (code, copy, docs, commits, PR text).
- EN and ID for every label (`messages/en.json`, `messages/id.json`, identical keys); no first person in titles.
- No new content: topic labels name existing tags (or words already in the item titles); merges only through an explicit, tested map.
- Every effect uses the shared holo program (`fx/holoFx.ts`), instanced with instance color set at creation; programs within baseline + 2.
- L4 under 150 scene calls and 30k triangles at every peak (rides included); lite simpler; reduced motion static.
- Static export: `/library?topic=` is a client island over server-rendered rows; works without JS (everything visible).
- E2E port 4458 locally (never 4173). CI is the authority for the heavy e2e.

## Topic model (decided)

Topics (orbit order), the tags that fold into them (`TOPIC_TAGS`), and the non-post items mapped by id (`ITEM_TOPICS`):

| Topic slug | EN label | ID label | Post tags | Papers, models, talks |
|---|---|---|---|---|
| `llm-evaluation` | LLM evaluation | Evaluasi LLM | llm-evaluation, evaluation, shadow-mode, testing | |
| `azure-openai` | Azure OpenAI | Azure OpenAI | azure-openai, azure-openai-realtime | |
| `voice-ai` | Voice AI | Voice AI | voice-ai, latency | |
| `llm-reliability` | LLM reliability | Keandalan LLM | llm-reliability, structured-output | |
| `fraud-detection` | Fraud detection | Deteksi fraud | fraud-detection | |
| `ai-agents` | AI agents | AI agent | ai-coding-agents, spec-driven-development, github-spec-kit, code-review | talk agent-framework-walkthrough, talk microsoft-ai-client-workshop |
| `sentiment-analysis` | Sentiment analysis | Analisis sentimen | | papers ewallet-sentiment-cnn-lstm, sentiboard-paper, thesis sentiboard-bsc-thesis, all three models |
| `forecasting` | Forecasting | Peramalan | | paper covid-19-herd-immunity-study |
| `teaching` | Teaching and mentoring | Mengajar dan mentoring | tutorial | every talk |
| `nodejs` | Node.js | Node.js | nodejs, express, mysql | |
| `ui-ux` | UI/UX | UI/UX | ui-ux, design | |
| `case-study` | Case studies | Studi kasus | case-study | |
| `personal` | Personal | Personal | personal, growth | |

`TOPIC_UNMAPPED` (items allowed without a topic) starts empty. A new tag that is in no topic fails `tests/unit/topic-index.test.ts`.

## End plaza composition (decided)

- End plaza: round, 26 u, center `end = (P.x + lastEdge + tail + 5, 0)`; core square half 1.6 (`Plaza.core`), closed 16-gon ring road radius 6.5 (`nav/ringRoad.ts`, shared with L3), the timeline road ends on the ring's west point.
- Constellation: pedestal core (holo `core`), 13 topic orbs (instanced spheres in holo `core` mode) on a slow orbit 3.2 to 5.4 u out, 3.6 to 8.4 u up, link lines between topics that share an item, each orb labelled by an orbiting floating sign. Stop: the ring's west point (`stops["L4:topics"]`), camera zone there looks east, zoomed out.
- Monument: docked north of the plaza (footprint 6 x 1.6, 6.5 u tall), a light pillar plus floating number plates (citations, h-index, source and "as of Oct 2026"), hidden without metrics. Target `L4:station:metrics`, stop on the plaza in front of it, command `open:L4:research`. Camera zone looks north.
- Return pad: south of the plaza, `(end.x - 4, end.z + 15)`.
- Archive board: east rim (unchanged rule), stop on the plaza rim.
- `FloorLayout.tall`: core (h 9), monument (h 6.5), board (h 4).

---

### Task 1: Shared ring road and filter hash helpers (refactor, no behavior change)

**Files:**
- Create: `src/experience/nav/ringRoad.ts`, `src/experience/floors/filterHash.ts`
- Modify: `src/experience/floors/labs/reactor.ts`, `src/experience/floors/labs/techHash.ts`, `src/experience/floors/labs/reactorUrl.ts`
- Test: `tests/unit/ring-road.test.ts`, `tests/unit/filter-hash.test.ts`; existing `tests/unit/reactor-url.test.ts`, `tech-reactor.test.ts`, `labs-layout*.test.ts` stay green.

**Interfaces (produces):**
- `ringRoadPoints(center: Vec2, radius: number, segments: number): Vec2[]`, `ringRoadEntry(center: Vec2, from: Vec2, radius: number): Vec2`, `coreRect(center: Vec2, half: number): Rect`.
- `filterFromHash(hash: string, key: string): string | null`, `filterHash(key: string, slug: string | null): string` (no imports).
- `createFilterHashSync<V, P extends { slug: string }>({ store, env, floor, key, picked, select, fromView })` returning a disposer; `createReactorHashSync` becomes a thin wrapper.

- [x] Write tests for the new helpers (same numbers as `ringPoints`/`ringEntry` today, hash parse and build), run, see them fail.
- [x] Implement, make `reactor.ts` and `techHash.ts` delegate, run all reactor and labs tests.
- [x] Commit `refactor: shared ring road and filter hash helpers`.

### Task 2: Topic index (build time)

**Files:**
- Create: `src/content/topic-map.ts`, `src/content/topic-index.ts`
- Modify: `src/content/load.ts` (`getTopicIndex()`), `messages/en.json`, `messages/id.json` (`library.topics`)
- Test: `tests/unit/topic-index.test.ts`

**Interfaces (produces):**
```ts
export type TopicSlug = (typeof TOPICS)[number];
export interface TopicItem { kind: "post" | "research" | "model" | "talk"; id: string; room: RoomId }
export interface TopicEntry { slug: TopicSlug; items: TopicItem[] } // items: posts newest first, then research, models, talks
export interface TopicIndex { topics: TopicEntry[]; unmapped: string[] }
export function buildTopicIndex(library: Pick<Library, "posts" | "publications" | "talks">): TopicIndex;
export function topicsOfItem(index: TopicIndex, id: string): TopicSlug[];
```
Rooms: posts `L4:<slug>`, papers and theses `L4:research`, models and datasets `L4:publications`, talks `L4:talks`.

- [x] Tests: every post, paper, thesis, model and talk maps to at least one topic or is in `TOPIC_UNMAPPED`; every post tag is in a topic's `TOPIC_TAGS` or `TOPIC_SKIP_TAGS`; no stale map entries (every tag and item id exists); every topic has at least one item; every topic has EN and ID labels; slugs are kebab case; real counts (`case-study` 5 posts, `sentiment-analysis` 6 items).
- [x] Implement, run, commit `feat(library): build-time topic index`.

### Task 3: Payloads: 3D data, drawer view, HUD index, room catalog

**Files:**
- Modify: `src/experience/types.ts` (`LibraryData.topics`), `src/content/experience-floors.ts`, `src/content/room-views/types.ts` (`RoomTopics`), `src/content/room-views/library.ts` (`topicsView`), `src/experience/missions/rooms.ts` (`L4:topics`, kind `topics`), `src/hud/index-data.ts` (`HudTopic`), `src/hud/palette-types.ts`, `src/hud/search.ts`, `messages/*.json` (`hud.rooms.topics`, `library.topics.*`)
- Test: `tests/unit/room-views.test.ts`, `tests/unit/search.test.ts`, `tests/unit/topic-index.test.ts`

**Interfaces (produces):**
- `LibraryData.topics: { slug: string; label: string; count: number; rooms: RoomId[] }[]`.
- `RoomTopics { topics: { slug; label; count; items: { room: RoomId; title: string; zone: LibraryZone }[] }[] }` on `RoomView.topics`.
- `HudTopic { slug; label: LocalizedText; count; rooms: RoomId[]; title: LocalizedText }`, `HudIndex.topics`; `PaletteTarget { type: "topic"; slug }`.

- [x] Tests first (view exists with every topic and counts; Cmd-K row "Show writing about Voice AI" for a query, none for an empty query), then implement, run, commit `feat(library): topic payloads, drawer view, Cmd-K rows`.

### Task 4: Store slice and drawer body

**Files:**
- Modify: `src/store/useHQStore.ts` (`topics: { topic: TopicPick | null }`, `selectTopic`, `clearTopic`), `src/hud/drawer/bodies.tsx`
- Create: `src/hud/drawer/TopicsBody.tsx`, `src/hud/drawer/filterParts.tsx` (shared `FilterOption`, `ClearButton`; `ReactorBody` uses them)
- Test: `tests/unit/store.test.ts`, `tests/hud/TopicsBody.test.tsx`, `tests/hud/ReactorBody.test.tsx` (unchanged, still green)

- [x] Tests, implement, run, commit `feat(library): topic selection store and drawer`.

### Task 5: L4 layout: end plaza, ring road, constellation stop, monument, Return pad, tall, camera zones

**Files:**
- Modify: `src/experience/floors/library/concepts/newsroom.ts`, `src/experience/floors/library/model.ts` (`LibraryLayout.end`, `libraryFloor` takes `returnPad`, `stops`, `tall`, `plazaCore`)
- Test: `tests/unit/library-layout.test.ts` (space rules), `tests/unit/floor-pads.test.ts` (L4 Return pad), new `tests/unit/library-end.test.ts`

**Interfaces (produces):**
```ts
interface LibraryEnd {
  center: Vec2; core: Rect; ringStop: Vec2;            // constellation
  monument: { rect: Rect; center: Vec2; stop: Vec2 } | null;
  returnPad: Vec2;
}
LibraryLayout.end: LibraryEnd | null   // newsroom only
```
- [x] Tests: space rules with the real content and with 20 posts (board present); routes from the elevator to every station, the monument stop and the board stop avoid the core; Return pad > 25 u from the elevator and off the ring road; monument absent without metrics.
- [x] Implement, run, commit `feat(library): end plaza with constellation core, monument, Return pad`.

### Task 6: Point-and-go targets and commands

**Files:**
- Modify: `src/experience/interact/registry.ts` (`L4:station:topics` open-room, `L4:station:metrics` command `open:L4:research`), `src/experience/interact/pick.ts` (`open:<room>` command), `src/experience/scene/Director.tsx`, `src/experience/Experience.tsx` (labels, hasPage, hash sync), `src/experience/floors/lobby/stations.ts` (`gateStartRoom` for `#library-topic=`)
- Create: `src/experience/floors/library/topicHash.ts`, `src/experience/floors/library/topicUrl.ts`
- Test: `tests/unit/interact-registry.test.ts`, `tests/unit/interact-pick.test.ts`, `tests/unit/topic-url.test.ts`

- [x] Tests, implement, run, commit `feat(library): constellation and monument targets, topic deep link`.

### Task 7: Shared highlights and the 3D constellation

**Files:**
- Create: `src/experience/fx/FilterHighlights.tsx` (`HighlightBeacons`, `GlowStrips`, pure `stripMatrix` in `fx/glowStrips.ts`)
- Modify: `src/experience/floors/labs/ReactorHighlights.tsx` (uses them), `src/experience/fx/FloatingSign.tsx` (optional `orbit` per sign), `src/experience/fx/probes.ts` (`topics`)
- Create: `src/experience/floors/library/topics.ts` (pure: orb layout, links, lit stations, road glow, count text), `src/experience/floors/library/decor/Constellation.tsx`, `src/experience/floors/library/decor/Monument.tsx`, `src/experience/floors/library/decor/TopicHighlights.tsx`
- Modify: `src/experience/floors/Library.tsx`, `src/experience/floors/library/decor/NewsroomDecor.tsx` (board stays)
- Test: `tests/unit/library-topics.test.ts`, `tests/unit/floating-sign.test.ts`

- [x] Pure tests first (orb positions inside the plaza radius and above the rover, lit stations per topic, road glow segments, frozen angle under reduced motion), implement, run unit tests, commit `feat(library): Topic Constellation, monument and topic highlights`.

### Task 8: Classic `/library` topic filter

**Files:**
- Create: `src/components/page/TopicFilter.tsx`
- Modify: `src/app/[locale]/library/page.tsx`, `src/components/LibraryBlocks.tsx` (`data-topics`, `data-topic-row`), `src/hud/MissionHud.tsx` (topic target: 3D picks and rides to `L4:topics`; Classic pushes `/library?topic=<slug>#topics`)
- Test: `tests/hud/MissionHud.test.tsx`, e2e `pageview.spec.ts` gains a filter case in `e2e/topics.spec.ts`

- [x] Implement, run, commit `feat(library): Classic topic filter and Cmd-K rows`.

### Task 9: E2E, perf and docs

**Files:**
- Create: `e2e/topics.spec.ts`
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`, `e2e/perf/baseline.json` (only if programs move), README, AGENTS.md, specs 01, 02, 08
- E2E cases: pick a topic in the drawer (probe lit rooms, roads, count sign, hash), orb click, Clear, deep link `/en/library#library-topic=voice-ai`, Cmd-K in 3D and on the Classic site, monument click opens the Research drawer, Return pad beam, reduced motion (orbit frozen), L4 render budget.

- [x] `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=4458 bun run e2e:perf`, visual gate for the unchanged parts, captures, PR.
