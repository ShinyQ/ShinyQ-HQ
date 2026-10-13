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

Actions: `setPhase`, `goToFloor`, `openRoom`, `closeRoom`, `startMission`, `cancelMission`, `markVisited`, `setLocale`, `toggleSound`, `setTier`. Only `visited`, `firstVisit`, `locale` and `sound` persist (`localStorage`, key `hq:v1`).

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

The store updates the URL with `history.pushState` (room open/close) or `replaceState` (floor changes during autopilot). On load, the URL is parsed into `{ floor, activeRoom, view }` and the experience starts at that state, skipping the intro.

## 4. Analytics

Three channels, all Cloudflare or first party, none with cookies, identifiers or a consent banner (amended 2026-10-13, owner approval of the performance beacon):

1. **Cloudflare Web Analytics** (production builds only). It records page views, including SPA route changes made with the History API, so room and floor URLs act as events, plus Core Web Vitals per path.
2. **Ask the HQ events**: Analytics Engine dataset `ask_events`, written by `functions/api/ask.ts` (design: `docs/superpowers/specs/2026-10-11-ask-hq-design.md`).
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
- Visitors see the same promise in one footer line (`footer.privacy`, EN and ID).
