# Appendix 06: Data Contracts

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

TypeScript types below are the source of truth. The zod schemas in `src/content/schema.ts` must match them exactly (types are inferred from the schemas with `z.infer`).

## 1. Content

```ts
type Locale = "en" | "id";
type LocalizedText = { en: string; id: string };
type YearMonth = `${number}-${number}`;          // "2024-06"
type Confidence = "verified" | "strongly-inferred" | "self-reported"; // internal review data, never rendered
type Tier = "hero" | "featured" | "listed";
type FloorId = "L1" | "L2" | "L3" | "L4" | "RF";
type Accent = "violet" | "pink" | "green" | "amber" | "cyan" | "blue" | "white";

interface SiteContent {
  profile: Profile;
  stats: Stat[];                         // 4 to 6 items for the Lobby ring
  skills: SkillGroup[];
  certifications: Certification[];
  floors: {
    careerArchive: { entries: TimelineEntry[] };   // grouped into years at runtime
    labs: { pods: Pod[] };                // both wings; placement by Pod.wing
    library: { posts: PostRef[]; publications: Publication[]; talks: Talk[] };
    roof: { contact: Contact; availability: LocalizedText; cv: CvConfig };
  };
  sideProjects: SideProject[];
  publicRepos: RepoRef[];
  missions: Mission[];
}

interface Profile {
  name: string;                          // "Kurniadi Ahmad Wijaya"
  handle: string;                        // "ShinyQ"
  headline: LocalizedText;               // AI and Software Engineer (the CV's order, 2026-10-13)
  location: LocalizedText;
  bio: LocalizedText;                    // 2 to 3 sentences
  howIWork: LocalizedText;
  photo?: Asset;
}

interface Stat { id: string; value: string; label: LocalizedText; source: string; confidence: Confidence; }

interface SkillGroup { id: "ai" | "azure" | "languages" | "backend" | "frontend" | "data" | "devops"; label: LocalizedText; items: string[]; } // the CV's taxonomy, CV order (2026-10-13)

interface Certification {
  id: string; name: string; issuer: string; issued: YearMonth | Year; // Year ("2024") only when the CV gives no month
  credentialUrl?: string; status: "earned" | "in-progress";
}

interface TimelineEntry {
  id: string; slug: string;
  type: "job" | "freelance" | "education" | "award" | "milestone";
  org: string;                           // public-safe
  role: LocalizedText;
  start: YearMonth; end: YearMonth | "present";
  summary: LocalizedText;
  highlights: LocalizedText[];           // max 4
  stack: string[];
  discipline: "software" | "ai" | "data" | "other";
  podRef?: string;                       // Pod.id on L3 with the full case study
  logo?: Asset;
}

interface Pod {
  id: string; slug: string; order: number; tier: Tier; accent: Accent;
  wing: "software" | "ai";               // L3 wing placement
  timelineRef?: string;                  // TimelineEntry.id on L2 that this case study belongs to
  title: LocalizedText; tagline: LocalizedText;
  period: { start: YearMonth; end: YearMonth | "present" };
  role: LocalizedText;
  problem: LocalizedText;
  approach: LocalizedText[];             // 2 to 5 bullets
  architecture?: Architecture;           // required when tier === "hero"
  results: Result[];                     // 1 to 4
  stack: string[];
  hologram: "waveform" | "shield" | "documents" | "graph" | "chart" | "template" | "pipeline";
  assets: Asset[];
  liveUrl?: string;                      // public live site (R4-J): https, site root, host in PUBLIC_LIVE_HOSTS
}

interface Result { value: string; label: LocalizedText; context?: LocalizedText; confidence: Confidence; } // context: how it was measured, omitted when there is nothing to add

interface Architecture {
  nodes: { id: string; label: string; sublabel?: LocalizedText; layer: number; row: number; kind: "client" | "service" | "ai" | "data" | "human" | "external" }[];
  edges: { from: string; to: string; label?: string; async?: boolean }[];
}

interface Asset { src: string; alt: LocalizedText; width: number; height: number; redacted: boolean; }

interface PostRef { slug: string; title: LocalizedText; date: string; tags: string[]; languages: Locale[]; excerpt: LocalizedText; }
interface Publication { id: string; title: string; venue?: string; year: number; url?: string; kind: "paper" | "thesis" | "model" | "dataset"; }
interface Talk { id: string; title: LocalizedText; event: string; date: YearMonth; role: "speaker" | "author" | "trainer"; }
interface Contact { email: string; linkedin: string; github: string; huggingface?: string; }
interface CvConfig { fileName: string; } // the owner's PDF, committed as-is at public/cv/{fileName}.pdf (one file for both locales)
interface SideProject { id: string; title: string; summary: LocalizedText; stack: string[]; url?: string; repo?: string; }
interface RepoRef { name: string; url: string; description: LocalizedText; language: string; stars: number; }

interface Mission {
  id: string; order: number; label: LocalizedText;
  steps: MissionStep[];                  // see appendix 02
}
```

All asset `src` paths point to files committed under `public/` (no remote or expiring URLs). Assets with `redacted: false` that come from client work fail the build.

## 2. Runtime store (zustand)

```ts
interface HQState {
  phase: "boot" | "intro" | "explore" | "terminal" | "palette" | "autopilot" | "elevator" | "room" | "hologram" | "quick" | "static";
  tier: "full" | "lite" | "static";
  locale: Locale;
  sound: boolean;
  floor: FloorId;
  rover: { x: number; z: number; heading: number; speed: number; face: RoverFace; status?: string };
  activeRoom: RoomId | null;
  drawerTab: "overview" | "architecture" | "results" | "stack";
  mission: { id: string; step: number; status: "idle" | "running" | "done" | "cancelled" } | null;
  visited: RoomId[];                     // persisted
  firstVisit: boolean;                   // persisted
}
```

Actions: `setPhase`, `goToFloor`, `openRoom`, `closeRoom`, `startMission`, `cancelMission`, `markVisited`, `setLocale`, `toggleSound`, `setTier`. Only `visited`, `firstVisit`, `locale`, `motion` and `sound` persist (`localStorage`, key `hq:v1`, version 2 since `motion`, the Motion setting `system | full | reduced`, was added, version 3 since Full became the default (owner decision 2026-10-14: older payloads migrate a stored or missing `system` to `full` and keep `reduced`); `reducedMotion` is resolved from it and the OS flag, AGENTS.md "Motion setting").

Update rate (round 5): per-frame state (rover pose, ride and beam progress) lives in runtime objects mutated in `useFrame`; the store mirrors the rover at most every 100 ms and only when a value changed (tolerance 1e-4), and stores the ride and the beam only when a stage starts or ends. `persist` writes `localStorage` only when a persisted key changed; `sound` is persisted by the audio engine (`localStorage["hq:sound"]`), not by the store.

## 3. Room IDs and URL scheme

`RoomId` = `${FloorId}:${slug}` (e.g. `L3:voice-ai`, `L2:jenius-2024`, `RF:contact`).

| State | URL |
|---|---|
| Lobby | `/{locale}` |
| Floor without room | `/{locale}/journey`, `/{locale}/labs`, `/{locale}/library`, `/{locale}/contact` |
| Career room | `/{locale}/journey/{slug}` |
| Pod | `/{locale}/labs/{slug}` |
| Hologram | `/{locale}/labs/{slug}?view=architecture` |
| Post | `/{locale}/blog/{slug}` |
| Quick view | `/{locale}/quick` |
| CV | `/{locale}/cv` (download plus inline preview), PDF at `/cv/kurniadi-ahmad-wijaya-cv.pdf` for both locales; `/cv.pdf`, `/{locale}/cv.pdf` and `/cv/kurniadi-ahmad-wijaya-cv-{locale}.pdf` 301 to it |

Rooms without a route of their own keep the floor URL and live in the history entry (`hqRoom`): the Highlights Hall stations, the L3 Tech Reactor and Ops Control Room, and the Visitor Observatory `L1:visits` (`/{locale}#visits` and the old `/{locale}/contact#visits` open it; the Classic site keeps its "Visits" section at `/{locale}/contact#visits`). Moved rooms keep working under their old id through `canonicalRoom` (`src/experience/missions/roomAliases.ts`: `RF:visits` to `L1:visits`), which `openRoom`, `goToRoom` and the history sync apply.

The store updates the URL with `history.pushState` (room open/close) or `replaceState` (floor changes during autopilot). On load, the URL is parsed into `{ floor, activeRoom, view }` and the experience starts at that state, skipping the intro.

## 4. Analytics

Four channels, all Cloudflare or first party, none with cookies, identifiers or a consent banner (amended 2026-10-13, owner approval of the performance beacon; amended 2026-10-14, owner approval of the public visit stats, channel 4):

1. **Cloudflare Web Analytics** (production builds only, never after "Don't count my visits", see 4.1). It records page views, including SPA route changes made with the History API, so room and floor URLs act as events, plus Core Web Vitals per path.
2. **Ask the HQ events**: Analytics Engine dataset `ask_events`, written by `functions/api/ask.ts` (design: `docs/superpowers/specs/2026-10-11-ask-hq-design.md`). Blobs `[outcome, locale, model source, gap question (unknown only), pack version, reason, entry point, topic, chip]`, doubles `[latencyMs, 1]`. blob8 `topic` (`work`, `ai`, `career`, `contact`, `perspectives` or empty) is the curated chip's topic, else the topic most of the answer's allowlisted tags map to (`topicOfTags` in `functions/_lib/askStats.ts`); blob9 `chip` is a curated question id from `content/ask/suggestions.json`, kept only when the question is that chip's text (`chipFor`). Ids only: the question text never reaches these two fields.
3. **Performance beacon (RUM)**: 25% of 3D sessions send one data point per browser session with `navigator.sendBeacon` to the same-origin Pages Function `POST /api/rum`, which writes it to the Analytics Engine dataset `perf_events` (binding `PERF_EVENTS`). The CSP is unchanged (`connect-src 'self'`). Contract: `src/lib/rum/protocol.ts`; client: `src/experience/perf/`; Function: `functions/api/rum.ts`.

| Field | Values | Analytics Engine |
|---|---|---|
| `v` | `1` | blob1 |
| `tier` | `full`, `lite` | blob2, index1 |
| `path` | `cover` (game-first boot cover), `enter` (Enter the 3D HQ from the Page View), `deeplink` (a floor or room route) | blob3 |
| `fps50`, `fps10` | median and 10th percentile FPS over up to 600 visible frames from 2 s after explore: `na`, `lt15`, `15-24`, `25-29`, `30-44`, `45-54`, `55+` | blob4, blob5 |
| `explore` | navigation start to the first interactive phase: `na`, `lt3s`, `3-5s`, `5-8s`, `8-12s`, `12-20s`, `20s+` | blob6 |
| `lost` | 1 when the WebGL context was lost | double1 |
| `timeout` | 1 when the 8 s boot timeout revealed the page | double2 |
| count | always 1 | double3 |

The beacon leaves on the first of: tab hidden, page left, 3D view closed (Page View), WebGL context lost. The Function accepts only that exact object (at most 512 bytes, same Origin, `RUM_ENABLED = "true"`), answers 204 and caps points per isolate and minute.

### Privacy note

- No cookies, identifiers, IP address, user agent, renderer string, URL or free text: every field is one of the fixed values above, and the Function reads no other header into the point.
- Sampling is decided once per browser session (`sessionStorage["hq:rum"]`); at most one point per session.
- Never sampled: browser automation (`navigator.webdriver`), Do Not Track, Global Privacy Control, and every visit that never opens the 3D view (Page View, static tier, crawlers). `?rum=0` opts a session out; `?rum=1` forces it (preview checks), except under Do Not Track or Global Privacy Control, which always win.
- Retention: Analytics Engine keeps points for 3 months (Cloudflare limit), then drops them.
- Kill switch: `RUM_ENABLED` in `wrangler.toml` (anything but `"true"` drops every point).
- The Classic site footer no longer carries a privacy line (owner request 2026-10-15); this section and the Ask AI panel note (`ask.privacy`) document the promise.
- "Don't count my visits" (`localStorage["hq:stats-optout"] = "1"`, see 4.1, now offered in the L1:visits drawer only) also turns the performance beacon off.

### 4.1 Public visit stats (Layer 1)

4. **Visit beacon**: one data point per page lifetime, sent with `navigator.sendBeacon` to the same-origin Pages Function `POST /api/visit`, which writes it to the Analytics Engine dataset `visit_events` (binding `VISIT_EVENTS`). Contract: `src/lib/stats/visit.ts`; client: `src/lib/stats/visitClient.ts` (mounted by `src/components/VisitBeacon.tsx` in the locale layout); Function: `functions/api/visit.ts`.

| Field | Values | Analytics Engine |
|---|---|---|
| `v` | `1` | blob1 |
| `mode` | `3d` (the 3D tower was open, `html[data-hq]`), `classic` (the Classic site stayed on screen at least 3 s), `both` | blob2 |
| count | always 1 | double1 |
| index | the constant `visit` (never per visitor) | index1 |

The point leaves on the first `pagehide` or tab hide after a mode is known. De-duplication is in memory only (no storage). The Function accepts only that exact object (at most 128 bytes, same Origin, `STATS_ENABLED = "true"`), answers 204 and caps points per isolate and minute (600). It reads no other header.

**Rollup every 4 hours**: the Cron Worker `hq-stats` (`workers/stats/`, cron `17 */4 * * *` UTC, scheduled handler only, no route) reads Web Analytics through the GraphQL API (`rumPageloadEventsAdaptiveGroups`: visits, page views, countries, paths; siteTag, `bot: 0` and the production hosts only) and Analytics Engine through the SQL API (`ask_events` without Turnstile rejects, `visit_events`, `perf_events`), appends one rollup per finalized UTC day (a day that ended at least one hour ago, `SETTLE_MS`) to the KV ledger `stats:days:v1` (never recomputing a stored day, so a day is stored only from an exact Web Analytics answer: every row unsampled and the totals, countries and paths groups adding up; otherwise it stays provisional for up to 3 days) and writes the public snapshot `stats:v1` to KV `STATS_KV` on every run. Each run also rolls up the provisional days after the ledger (yesterday during the 00:00 run, and today so far) from the same queries and adds them to the snapshot without storing them; the next run recomputes them. `updatedAt` is the run time. A routine run makes 1 GraphQL request, 3 SQL queries (plus one perf backfill query at most) and 2 KV reads (the ledger and the optional extra rows of a retired Web Analytics site, `stats:wa-extra:v1`), and writes the snapshot every run and the ledger only when a day finalizes or perf is filled (at most 2 KV writes per run, 12 a day). `GET /api/stats` (`functions/api/stats.ts`) serves it: `StatsSnapshotV1` in `src/lib/stats/protocol.ts`, periods `d30` (the 30 days ending today, today partial) and `all` (since the first rollup day, today included). Paths map to floors with the site's own route parser (`floorOfPath`).

| Snapshot field | Source | Notes |
|---|---|---|
| `visits`, `pageViews` | Web Analytics | sampled estimates (steps of 10 at low traffic) |
| `countries` | Web Analytics | ISO alpha-2 only (no `XX`, no `T1`), alphabetical, no counts (dots only) |
| `topFloor` | Web Analytics paths | most page views; null without any |
| `mode` | `visit_events` | page lifetimes per view; `both` counts on both sides; a day whose points exceed `max(30, 3 x page views)` keeps zero (abuse cross-check) |
| `asks` | `ask_events` | total questions, per topic, per curated chip (ids only) |
| `perf` (optional) | `perf_events` | RUM beacon (section 4): `sessions`, `measured`, `fps55`, `explore`, see below |

**Perf block** (owner request 2026-10-14, a live panel of the site's own telemetry): `perf?: Record<StatsPeriod, StatsPerf>` with `StatsPerf = { sessions, measured, fps55, explore }`. `sessions` counts sampled 3D sessions (one beacon point each, 25% of 3D sessions), `measured` the sessions whose median FPS bucket (`fps50`) is not `na`, `fps55` those whose `fps50` is `55+`, and `explore` is the median explore time bucket among sessions with an explore time (`STATS_EXPLORE`: `RUM_TIMES` without `na`), or null without any. Counts are whole numbers with `fps55 <= measured <= sessions`.

- Source query, per UTC day (finalized or provisional): `SELECT toDate(timestamp) AS day, blob4 AS fps50, blob6 AS explore, SUM(_sample_interval) AS n FROM perf_events WHERE ... AND blob1 = '1' GROUP BY day, fps50, explore`. Every count is weighted by `_sample_interval`; rows whose buckets are not in `RUM_FPS` and `RUM_TIMES` are ignored. Each day rollup keeps `perf: { sessions, measured, fps55, explore: { bucket: n } }`.
- Period values sum the days of the period; days without `perf` count as no data. The median is weighted over the summed explore histogram: the first bucket in `STATS_EXPLORE` order whose running count reaches half the total (`running x 2 >= total`).
- Backfill: days stored before `perf` existed and inside the Analytics Engine retention (90 days) get `perf` once from one extra query (zeros when there were no points); nothing else of those days is recomputed. Older days stay without it.
- Backward compatible, still `v: 1`: the Worker writes `perf` only when at least one ledger day has it, and `parseStatsSnapshot` accepts snapshots with or without it. An invalid `perf` block (extra or missing keys, a bad count, broken invariants, an unknown bucket) is dropped on its own, so the visit stats keep working; the Worker refuses to write a snapshot whose `perf` would be dropped.
- Hidden rules: the display reads it through `perfView(snapshot, period)` (`src/lib/visits/model.ts`), which returns null without a `perf` block or without sessions in the period (`fpsShare = fps55 / measured`, null without measured sessions); the snapshot freshness rules (delayed after 12 hours, hidden after 7 days) apply as for the visit stats.

Owner decisions (2026-10-13/14): numbers are public with no minimum thresholds; the snapshot updates every 4 hours and includes today so far (owner 2026-10-16; was daily from complete UTC days); countries show as dots only; the label is "visits" ("kunjungan"), never visitors (Web Analytics has no unique visitors).

**Opt-out**: "Don't count my visits" stores `localStorage["hq:stats-optout"] = "1"` (only the visitor's choice; S2 writes it and dispatches `hq:stats-optout`). It stops the visit beacon (checked at start, on the event and again at send), the performance beacon, and the Cloudflare Web Analytics beacon, which `src/components/Analytics.tsx` now injects from an inline guard instead of a static tag (the CSP is unchanged). Do Not Track and Global Privacy Control stop the visit beacon too; automation and crawlers never send (`?visit=1` forces it in tests and previews, `?visit=0` opts out).

**Retention**: `visit_events`, `ask_events` and `perf_events` 3 months (Analytics Engine), Web Analytics about 6 months; the KV ledger keeps only daily aggregates (no per-visitor data) for as long as the site runs.

**Kill switch**: `STATS_ENABLED` in `wrangler.toml` (anything but `"true"` drops visit points and makes `/api/stats` answer 204, which hides every stats view).
