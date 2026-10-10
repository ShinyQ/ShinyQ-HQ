# Appendix 06: Data Contracts

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

TypeScript types below are the source of truth. The zod schemas in `src/content/schema.ts` must match them exactly (types are inferred from the schemas with `z.infer`).

## 1. Content

```ts
type Locale = "en" | "id";
type LocalizedText = { en: string; id: string };
type YearMonth = `${number}-${number}`;          // "2024-06"
type Confidence = "verified" | "strongly-inferred";
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
  headline: LocalizedText;               // Software Engineer and AI Engineer (Azure)
  location: LocalizedText;
  bio: LocalizedText;                    // 2 to 3 sentences
  howIWork: LocalizedText;
  photo?: Asset;
}

interface Stat { id: string; value: string; label: LocalizedText; source: string; confidence: Confidence; }

interface SkillGroup { id: "software" | "ai" | "cloud" | "data"; label: LocalizedText; items: string[]; }

interface Certification {
  id: string; name: string; issuer: string; issued: YearMonth;
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
}

interface Result { value: string; label: LocalizedText; context: LocalizedText; confidence: Confidence; }

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

Cloudflare Web Analytics (cookieless). It records page views, including SPA route changes made with the History API, so room and floor URLs act as events. No custom event API or third-party scripts are used.
