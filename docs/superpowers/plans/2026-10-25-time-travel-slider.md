# Time Travel Slider Implementation Plan

Status: shipped in #322 (141e9c2), 2026-10-25

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Time Travel section to the Classic `/{locale}/journey` page. It is a skyline of the owner's journey (9 stops: Before 2019, then 2019 to 2026) that a visitor scrubs or plays, with an owner caption, a running tally and up to 3 highlights per stop.

**Architecture:**
- The server renders everything: one SVG skyline (one building per stop, one rect per item) and all 9 year panels, 8 of them `hidden`. The data comes from a pure selector over `content/site-content.json`.
- One small client island (`TimeTravelControls`) adds a range slider and Play. It toggles `hidden` and SVG attributes and animates with the Web Animations API.
- Colors reuse existing `ACCENT_TEXT` classes with `fill="currentColor"`, so the global stylesheet does not grow.

**Tech Stack:** Next.js 16 static export, React 19, next-intl, Zod, Vitest (jsdom for islands), Playwright, Bun.

Spec: [`docs/superpowers/specs/2026-10-25-time-travel-slider-design.md`](../specs/2026-10-25-time-travel-slider-design.md).

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits.
- No first person in titles: the section title is "Time Travel" / "Mesin Waktu". Captions are body text.
- No client company names (C3) anywhere, including captions, alt text and aria labels.
- Every user-facing string is bilingual (`messages/en.json` and `messages/id.json` with identical keys; captions are `{ en, id }` data).
- Content is data: captions and highlights live in `content/site-content.json`; counts are derived, never stored.
- Static export: no server runtime; the page pre-renders.
- Works without JS: the server view (2026, building links to `#yYYYY`) is complete; the controls render only after mount.
- Client islands import locale values only from `@/content/locales`, never values from `@/content/schema` or `@/content/load`.
- The new strings live in a new top-level `timeTravel` namespace that is in neither `CLIENT_NAMESPACES` nor `LAYOUT_NAMESPACES`. The island gets its labels as props, so `/en/quick` and every `ClientMessages` page carry 0 new bytes. This refines the spec's `journey.timeTravel.*`: `journey` is a client namespace, so strings under it would ride in every `ClientMessages` payload.
- Use only Tailwind classes that already appear in `src/` (check with `grep -rn "<class>" src` before using one). Arbitrary values must be copies of existing ones, so the global CSS grows by at most 300 B gzip.
- Budgets (spec section 7):
  - 3D: 0 B.
  - Global CSS: at most +300 B gzip.
  - Island JS: at most 4 KB gzip.
  - `/en/journey` and `/id/journey` HTML: at most +4 KB gzip each, under 82 KB.
  - `/en/quick` HTML: unchanged.
  - Any overrun stops the work and goes to the parent session with the number.
- E2E waits on state, never on time (use `page.clock` for Play).
- Commits: conventional messages, in logical steps; prefer `rtk git`. Do not push.

## File Structure

| File | Responsibility |
|---|---|
| `src/content/schema.ts` (modify) | `TimeTravelSchema` and the optional `careerArchive.timeTravel` field |
| `content/site-content.json` (modify) | The 9 owner-approved stops (captions and highlight ids) |
| `src/content/time-travel.ts` (create) | Pure derivation: item years, stops, tally, heights, highlight resolution, coverage check; `getTimeTravel()` |
| `src/components/time-travel/geometry.ts` (create) | Pure skyline layout (building and block rects in SVG units) |
| `src/components/time-travel/Skyline.tsx` (create) | Server SVG: buildings as links, outlines, year ticks |
| `src/components/time-travel/YearPanel.tsx` (create) | Server panel: year, caption, tally, highlights, see-in-full link |
| `src/components/time-travel/TimeTravel.tsx` (create) | Server section: resolves labels, composes skyline, legend, island, panels |
| `src/components/time-travel/TimeTravelControls.tsx` (create) | Client island: range, Play/Pause, building clicks, live region |
| `src/app/[locale]/journey/page.tsx` (modify) | Mounts `<TimeTravel>` between the intro and the year list |
| `messages/en.json`, `messages/id.json` (modify) | `timeTravel` namespace |
| `scripts/e2e-plan.ts` (modify) | `time-travel` in `ALL_SPECS` and an `ALSO_RULES` entry |
| Tests (create) | `tests/unit/time-travel.test.ts`, `tests/unit/time-travel-geometry.test.ts`, `tests/content/time-travel.test.ts`, `tests/hud/TimeTravelControls.test.tsx`, `e2e/time-travel.spec.ts` |
| Docs (modify/create) | `docs/features.md`, `docs/agents/page-view.md`, `docs/agents/content.md`, `docs/content.md`, `docs/decisions/2026-10-25-time-travel-slider.md`, the spec's strings note |

---

### Task 1: Baseline measurements, schema and the owner-approved stops

**Files:**
- Modify: `src/content/schema.ts` (near `SideProjectSchema` for the new schemas; line ~615 for `careerArchive`; the type exports at the end)
- Modify: `content/site-content.json` (`floors.careerArchive`)
- Test: `tests/content/time-travel.test.ts` (first part)

**Interfaces:**
- Produces: `TimeTravelSchema`, `TimeTravelStopSchema`, `TimeTravelHighlightSchema`, `TIME_TRAVEL_CAPTION_MAX = 140`, `PROLOGUE_STOP_ID = "pre-2019"`, types `TimeTravelStop`, `TimeTravelHighlightRef`; `SiteContent["floors"]["careerArchive"]["timeTravel"]` is `{ stops: TimeTravelStop[] } | undefined`.

- [ ] **Step 1: Record the baseline budgets before any change**

Run:

```bash
bun run build >/dev/null && for p in en/journey id/journey en/quick; do printf "%s html " $p; gzip -9 -c out/$p.html | wc -c; done
ls -S out/_next/static/chunks/*.css | head -1 | xargs -I{} sh -c 'printf "largest css "; gzip -9 -c {} | wc -c'
bun -e 'const h=await Bun.file("out/en/journey.html").text();const s=[...h.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);let t=0;for(const f of s){const b=await Bun.file("out"+f).arrayBuffer();t+=Bun.gzipSync(new Uint8Array(b),{level:9}).length}console.log("journey js",t)'
```

Write the numbers into `/Users/shinyq/.copilot/session-state/5ae0ac49-1374-4429-9d27-65fc87069b85/files/budget-baseline.txt` (session folder, not the repo).

- [ ] **Step 2: Write the failing content test**

Create `tests/content/time-travel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, TIME_TRAVEL_CAPTION_MAX } from "@/content/schema";

const content = SiteContentSchema.parse(data);
const stops = content.floors.careerArchive.timeTravel?.stops ?? [];

describe("time travel stops (owner approved 2026-10-25)", () => {
  it("has the prologue and one stop per year from 2019 to 2026, in order", () => {
    expect(stops.map((s) => s.id)).toEqual(["pre-2019", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
  });

  it("keeps every caption short, bilingual and free of em dashes", () => {
    for (const stop of stops) {
      for (const locale of ["en", "id"] as const) {
        const text = stop.caption[locale];
        expect(text.length, `${stop.id} ${locale}`).toBeGreaterThan(0);
        expect(text.length, `${stop.id} ${locale}`).toBeLessThanOrEqual(TIME_TRAVEL_CAPTION_MAX);
        expect(text, `${stop.id} ${locale}`).not.toContain("\u2014");
      }
    }
  });

  it("lists at most three highlights per stop", () => {
    for (const stop of stops) expect(stop.highlights.length, stop.id).toBeLessThanOrEqual(3);
  });

  it("rejects an unknown stop id and a fourth highlight", () => {
    const bad = structuredClone(data) as typeof data & { floors: { careerArchive: { timeTravel: { stops: { id: string; highlights: unknown[] }[] } } } };
    bad.floors.careerArchive.timeTravel.stops[0].id = "1999-ish";
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
    const many = structuredClone(data) as typeof bad;
    many.floors.careerArchive.timeTravel.stops[1].highlights = Array.from({ length: 4 }, () => ({ kind: "entry", id: "shumi-2019" }));
    expect(SiteContentSchema.safeParse(many).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run tests/content/time-travel.test.ts`
Expected: FAIL (`TIME_TRAVEL_CAPTION_MAX` is not exported; `stops` is empty).

- [ ] **Step 4: Add the schema**

In `src/content/schema.ts`, after `SideProjectSchema` (line ~401 block), add:

```ts
/** Time Travel on /journey (spec 2026-10-25-time-travel-slider-design.md): one owner caption per stop. */
export const TIME_TRAVEL_CAPTION_MAX = 140;
export const PROLOGUE_STOP_ID = "pre-2019";

export const TimeTravelHighlightSchema = z.strictObject({
  kind: z.enum(["entry", "pod", "publication", "cert"]),
  id: nonEmpty,
});

export const TimeTravelStopSchema = z.strictObject({
  /** `pre-2019` (everything before FIRST_CORRIDOR_YEAR) or a four-digit year. */
  id: z.union([z.literal(PROLOGUE_STOP_ID), z.string().regex(/^20\d\d$/)]),
  caption: z.strictObject({ en: nonEmpty.max(TIME_TRAVEL_CAPTION_MAX), id: nonEmpty.max(TIME_TRAVEL_CAPTION_MAX) }),
  highlights: z.array(TimeTravelHighlightSchema).max(3),
});

export const TimeTravelSchema = z.strictObject({ stops: z.array(TimeTravelStopSchema).min(1) });
```

Change the `careerArchive` line to:

```ts
    careerArchive: z.strictObject({ entries: z.array(TimelineEntrySchema).min(1), timeTravel: TimeTravelSchema.optional() }),
```

Add to the type exports at the end of the file:

```ts
export type TimeTravelStop = z.infer<typeof TimeTravelStopSchema>;
export type TimeTravelHighlightRef = z.infer<typeof TimeTravelHighlightSchema>;
```

- [ ] **Step 5: Add the 9 owner-approved stops**

In `content/site-content.json`, inside `floors.careerArchive` after `entries`, add (exact text, approved by the owner on 2026-10-25):

```json
"timeTravel": {
  "stops": [
    { "id": "pre-2019", "caption": { "en": "Android apps at a vocational school in Malang, a GitHub account opened in 2016 and the first competition wins.", "id": "Aplikasi Android di SMK di Malang, akun GitHub pertama pada 2016, dan juara kompetisi pertama." }, "highlights": [{ "kind": "entry", "id": "prologue-2016" }] },
    { "id": "2019", "caption": { "en": "A bootcamp, the first semester at Telkom University and the first paid job: part-time e-commerce backend work.", "id": "Bootcamp, semester pertama di Telkom University, dan pekerjaan berbayar pertama: backend e-commerce paruh waktu." }, "highlights": [{ "kind": "entry", "id": "telkom-university-2019" }, { "kind": "entry", "id": "shumi-2019" }, { "kind": "pod", "id": "anime-figure-ecommerce" }] },
    { "id": "2020", "caption": { "en": "Leading a campus programming club, assisting practicums and entering competitions all year.", "id": "Memimpin klub pemrograman kampus, menjadi asisten praktikum, dan mengikuti kompetisi sepanjang tahun." }, "highlights": [{ "kind": "entry", "id": "campus-and-community-2020" }, { "kind": "entry", "id": "trophy-case-2020" }, { "kind": "entry", "id": "research-vaccination-sentiment-2020" }] },
    { "id": "2021", "caption": { "en": "Three internships, one of them remote for a team in Germany, and the first papers.", "id": "Tiga program magang, salah satunya remote untuk tim di Jerman, dan paper pertama." }, "highlights": [{ "kind": "entry", "id": "techbros-2021" }, { "kind": "publication", "id": "ewallet-sentiment-cnn-lstm" }, { "kind": "entry", "id": "trophy-case-2021" }] },
    { "id": "2022", "caption": { "en": "The first full-time engineering job, travel payments at MNC, while finishing the thesis.", "id": "Pekerjaan engineer penuh waktu pertama, pembayaran travel di MNC, sambil menyelesaikan skripsi." }, "highlights": [{ "kind": "entry", "id": "mnc-2022" }, { "kind": "pod", "id": "payments-realtime-backend" }, { "kind": "pod", "id": "university-sentiment-indobert" }] },
    { "id": "2023", "caption": { "en": "Graduated, then built multi-tenant SaaS at Jatis, with freelance backend work on the side.", "id": "Lulus, lalu membangun SaaS multi-tenant di Jatis, ditambah proyek backend freelance." }, "highlights": [{ "kind": "entry", "id": "graduation-2023" }, { "kind": "pod", "id": "multi-tenant-saas-platform" }, { "kind": "publication", "id": "sentiboard-bsc-thesis" }] },
    { "id": "2024", "caption": { "en": "Joined Jenius to build digital banking integrations, and kept shipping side projects.", "id": "Bergabung dengan Jenius untuk membangun integrasi perbankan digital, sambil terus merilis side project." }, "highlights": [{ "kind": "entry", "id": "jenius-2024" }, { "kind": "pod", "id": "digital-banking-integrations" }, { "kind": "pod", "id": "stock-allocation-optimizer" }] },
    { "id": "2025", "caption": { "en": "Freelance and agency work for several teams at once, alongside the banking role.", "id": "Proyek freelance dan agensi untuk beberapa tim sekaligus, di samping pekerjaan di bank." }, "highlights": [{ "kind": "pod", "id": "event-ticketing-platform" }, { "kind": "pod", "id": "ticket-marketplace-backend" }, { "kind": "entry", "id": "portfolio-v1-2025" }] },
    { "id": "2026", "caption": { "en": "Joined Metrodata's Microsoft AI practice: writing specs, directing AI coding agents and shipping AI to production.", "id": "Bergabung dengan praktik Microsoft AI di Metrodata: menulis spec, mengarahkan AI coding agent, dan merilis AI ke produksi." }, "highlights": [{ "kind": "entry", "id": "metrodata-2026" }, { "kind": "pod", "id": "voice-ai-contact-center" }, { "kind": "cert", "id": "ai-103" }] }
  ]
}
```

Keep the file's existing formatting style (run `bunx prettier --check content/site-content.json`; if the repo formats JSON with prettier, run `bunx prettier --write content/site-content.json`).

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run tests/content/ && bun run validate:content`
Expected: PASS (the new test plus the existing dataset, safety and Title Case checks).

- [ ] **Step 7: Commit**

```bash
rtk git add src/content/schema.ts content/site-content.json tests/content/time-travel.test.ts
rtk git commit -m "feat(content): time travel stops with the owner-approved captions"
```

### Task 2: The derivation selector

**Files:**
- Create: `src/content/time-travel.ts`
- Test: `tests/unit/time-travel.test.ts`; extend `tests/content/time-travel.test.ts`

**Interfaces:**
- Consumes: `SiteContent`, `TimeTravelHighlightRef`, `PROLOGUE_STOP_ID` from `@/content/schema`; `FIRST_CORRIDOR_YEAR`, `isResearch` from `@/content/selectors`; `getContent` from `@/content/load`.
- Produces:

```ts
export const TT_KINDS: readonly ["roles", "study", "projects", "awards", "writing", "certs"];
export type TtKind = (typeof TT_KINDS)[number];
export const TALLY_KEYS: readonly ["roles", "projects", "awards", "papers", "certs"];
export type TallyKey = (typeof TALLY_KEYS)[number];
export interface TtHighlight { kind: TimeTravelHighlightRef["kind"]; label: LocalizedText; href: string }
export interface TtStop {
  id: string;               // "pre-2019" | "2019" ...
  year: number | null;      // null for the prologue
  anchor: string;           // "y2019" ... (the prologue uses "y2019")
  caption: LocalizedText;
  counts: Record<TtKind, number>;
  size: number;             // items in this stop
  height: number;           // 0..1, sqrt(size) / sqrt(max size)
  tally: Record<TallyKey, { total: number; added: number }>;
  highlights: TtHighlight[];
}
export function stopIdOf(year: number): string;
export function expectedStopIds(content: SiteContent): string[];
export function buildTimeTravel(content: SiteContent): TtStop[];   // [] when the field is absent; throws on an unknown highlight
export function getTimeTravel(): TtStop[];
```

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/time-travel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, type SiteContent } from "@/content/schema";
import { buildTimeTravel, expectedStopIds, stopIdOf, TALLY_KEYS } from "@/content/time-travel";

const real = SiteContentSchema.parse(data);

function withStops(content: SiteContent, ids: string[]): SiteContent {
  const copy = structuredClone(content);
  copy.floors.careerArchive.timeTravel = { stops: ids.map((id) => ({ id, caption: { en: `c ${id}`, id: `c ${id}` }, highlights: [] })) };
  return copy;
}

describe("time travel derivation", () => {
  it("puts years before 2019 in the prologue", () => {
    expect(stopIdOf(2016)).toBe("pre-2019");
    expect(stopIdOf(2018)).toBe("pre-2019");
    expect(stopIdOf(2019)).toBe("2019");
  });

  it("expects the prologue and every year from 2019 to the latest item", () => {
    expect(expectedStopIds(real)).toEqual(["pre-2019", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
  });

  it("returns nothing without a timeTravel field", () => {
    const copy = structuredClone(real);
    delete copy.floors.careerArchive.timeTravel;
    expect(buildTimeTravel(copy)).toEqual([]);
  });

  it("counts awards from the awards list only, never the award entries", () => {
    const stops = buildTimeTravel(real);
    const awardsTotal = stops.reduce((sum, s) => sum + s.counts.awards, 0);
    expect(awardsTotal).toBe(real.awards.length);
    const entryAwards = real.floors.careerArchive.entries.filter((e) => e.type === "award").length;
    const allRoleStudy = stops.reduce((sum, s) => sum + s.counts.roles + s.counts.study, 0);
    expect(allRoleStudy).toBe(real.floors.careerArchive.entries.length - entryAwards);
  });

  it("accumulates the tally with what each stop added", () => {
    const stops = buildTimeTravel(real);
    for (const key of TALLY_KEYS) {
      let running = 0;
      for (const stop of stops) {
        running += stop.tally[key].added;
        expect(stop.tally[key].total, `${stop.id} ${key}`).toBe(running);
      }
    }
    const last = stops.at(-1)!;
    expect(last.tally.projects.total).toBe(real.floors.labs.pods.length + real.sideProjects.length);
    expect(last.tally.certs.total).toBe(real.certifications.length);
  });

  it("scales building heights by the square root, the largest at 1", () => {
    const stops = buildTimeTravel(real);
    const max = Math.max(...stops.map((s) => s.size));
    for (const s of stops) expect(s.height).toBeCloseTo(Math.sqrt(s.size) / Math.sqrt(max), 6);
    expect(Math.max(...stops.map((s) => s.height))).toBe(1);
  });

  it("links the prologue to the 2019 rows and each year to its own", () => {
    const stops = buildTimeTravel(real);
    expect(stops[0]).toMatchObject({ id: "pre-2019", year: null, anchor: "y2019" });
    expect(stops[3]).toMatchObject({ id: "2021", year: 2021, anchor: "y2021" });
  });

  it("resolves highlights to labels and hrefs", () => {
    const byId = Object.fromEntries(buildTimeTravel(real).map((s) => [s.id, s]));
    expect(byId["2019"].highlights[1]).toEqual({ kind: "entry", label: real.floors.careerArchive.entries.find((e) => e.id === "shumi-2019")!.role, href: "/journey/shumi-2019" });
    expect(byId["2022"].highlights[1].href).toBe("/labs/payments-realtime-backend");
    expect(byId["2021"].highlights[1].href).toBe("/library#research");
    expect(byId["2026"].highlights[2]).toMatchObject({ kind: "cert", href: "/contact#certifications" });
  });

  it("throws on an unknown highlight id", () => {
    const copy = withStops(real, expectedStopIds(real));
    copy.floors.careerArchive.timeTravel!.stops[2].highlights = [{ kind: "pod", id: "no-such-pod" }];
    expect(() => buildTimeTravel(copy)).toThrow(/no-such-pod/);
  });
});
```

Notes for the implementer:
- Check how entry and pod slugs relate to ids before finalizing the expected hrefs. Entries use `entry.slug`, pods use `pod.slug`, and the href uses the slug. If `shumi-2019`'s slug differs from its id, assert `/journey/${entry.slug}`.
- Same for `payments-realtime-backend`: look up `pod.slug`.

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/time-travel.test.ts`
Expected: FAIL ("Cannot find module '@/content/time-travel'").

- [ ] **Step 3: Implement the selector**

Create `src/content/time-travel.ts`:

```ts
import { getContent } from "./load";
import { PROLOGUE_STOP_ID, type LocalizedText, type SiteContent, type TimeTravelHighlightRef } from "./schema";
import { FIRST_CORRIDOR_YEAR, isResearch } from "./selectors";

/** Block kinds of a skyline building, bottom to top (spec section 3.2). */
export const TT_KINDS = ["roles", "study", "projects", "awards", "writing", "certs"] as const;
export type TtKind = (typeof TT_KINDS)[number];

/** The running tally under the skyline. */
export const TALLY_KEYS = ["roles", "projects", "awards", "papers", "certs"] as const;
export type TallyKey = (typeof TALLY_KEYS)[number];

export interface TtHighlight {
  kind: TimeTravelHighlightRef["kind"];
  label: LocalizedText;
  href: string;
}

export interface TtStop {
  id: string;
  year: number | null;
  anchor: string;
  caption: LocalizedText;
  counts: Record<TtKind, number>;
  size: number;
  height: number;
  tally: Record<TallyKey, { total: number; added: number }>;
  highlights: TtHighlight[];
}

interface DatedItem {
  year: number;
  kind: TtKind;
  tally?: TallyKey;
}

const yearOf = (value: string | number) => Number(String(value).slice(0, 4));

/** The stop a year belongs to: everything before the first corridor year is the prologue. */
export function stopIdOf(year: number): string {
  return year < FIRST_CORRIDOR_YEAR ? PROLOGUE_STOP_ID : String(year);
}

/** Every dated item of the dataset with its block kind and tally key. Award entries are skipped: `awards` counts them. */
function datedItems(content: SiteContent): DatedItem[] {
  const { careerArchive, labs, library } = content.floors;
  const items: DatedItem[] = [];
  for (const e of careerArchive.entries) {
    if (e.type === "job" || e.type === "freelance") items.push({ year: yearOf(e.start), kind: "roles", tally: "roles" });
    else if (e.type === "education" || e.type === "milestone") items.push({ year: yearOf(e.start), kind: "study" });
  }
  for (const p of labs.pods) items.push({ year: yearOf(p.period.start), kind: "projects", tally: "projects" });
  for (const s of content.sideProjects) items.push({ year: yearOf(s.year), kind: "projects", tally: "projects" });
  for (const a of content.awards) items.push({ year: yearOf(a.date), kind: "awards", tally: "awards" });
  for (const p of library.publications) items.push({ year: yearOf(p.year), kind: "writing", tally: isResearch(p.kind) ? "papers" : undefined });
  for (const t of library.talks) items.push({ year: yearOf(t.date), kind: "writing" });
  for (const p of library.posts) items.push({ year: yearOf(p.date), kind: "writing" });
  for (const c of content.certifications) items.push({ year: yearOf(c.issued), kind: "certs", tally: "certs" });
  return items;
}

/** The stop ids the dataset needs, in order: the prologue when it has items, then every year to the latest item. */
export function expectedStopIds(content: SiteContent): string[] {
  const years = datedItems(content).map((i) => i.year);
  const ids = years.some((y) => y < FIRST_CORRIDOR_YEAR) ? [PROLOGUE_STOP_ID] : [];
  for (let y = FIRST_CORRIDOR_YEAR; y <= Math.max(FIRST_CORRIDOR_YEAR, ...years); y++) ids.push(String(y));
  return ids;
}

function resolveHighlight(content: SiteContent, ref: TimeTravelHighlightRef): TtHighlight {
  const { careerArchive, labs, library } = content.floors;
  const fail = () => new Error(`Unknown time travel highlight ${ref.kind} "${ref.id}"`);
  switch (ref.kind) {
    case "entry": {
      const e = careerArchive.entries.find((x) => x.id === ref.id);
      if (!e) throw fail();
      return { kind: ref.kind, label: e.role, href: `/journey/${e.slug}` };
    }
    case "pod": {
      const p = labs.pods.find((x) => x.id === ref.id);
      if (!p) throw fail();
      return { kind: ref.kind, label: p.title, href: `/labs/${p.slug}` };
    }
    case "publication": {
      const p = library.publications.find((x) => x.id === ref.id);
      if (!p) throw fail();
      return { kind: ref.kind, label: { en: p.title, id: p.title }, href: isResearch(p.kind) ? "/library#research" : "/library#publications" };
    }
    case "cert": {
      const c = content.certifications.find((x) => x.id === ref.id);
      if (!c) throw fail();
      return { kind: ref.kind, label: { en: c.name, id: c.name }, href: "/contact#certifications" };
    }
  }
}

/** The Time Travel stops in order, with derived counts, heights and tally. Empty when the dataset has no stops. */
export function buildTimeTravel(content: SiteContent): TtStop[] {
  const records = content.floors.careerArchive.timeTravel?.stops ?? [];
  if (records.length === 0) return [];
  const items = datedItems(content);
  const inStop = (id: string) => items.filter((i) => stopIdOf(i.year) === id);
  const maxRoot = Math.sqrt(Math.max(1, ...records.map((r) => inStop(r.id).length)));
  const running = Object.fromEntries(TALLY_KEYS.map((k) => [k, 0])) as Record<TallyKey, number>;
  return records.map((record) => {
    const mine = inStop(record.id);
    const counts = Object.fromEntries(TT_KINDS.map((k) => [k, mine.filter((i) => i.kind === k).length])) as Record<TtKind, number>;
    const tally = Object.fromEntries(
      TALLY_KEYS.map((k) => {
        const added = mine.filter((i) => i.tally === k).length;
        running[k] += added;
        return [k, { total: running[k], added }];
      }),
    ) as TtStop["tally"];
    const year = record.id === PROLOGUE_STOP_ID ? null : Number(record.id);
    return {
      id: record.id,
      year,
      anchor: `y${year ?? FIRST_CORRIDOR_YEAR}`,
      caption: record.caption,
      counts,
      size: mine.length,
      height: Math.sqrt(mine.length) / maxRoot,
      tally,
      highlights: record.highlights.map((h) => resolveHighlight(content, h)),
    };
  });
}

let cached: TtStop[] | undefined;

/** The dataset's stops (server only: it reads the whole dataset). */
export function getTimeTravel(): TtStop[] {
  cached ??= buildTimeTravel(getContent());
  return cached;
}
```

Check: `sideProjects[].year` and `publications[].year` are numbers in the schema (use `yearOf` anyway). `certifications[].issued` can be `"2024"` or `"2026-09"`; `yearOf` handles both.

- [ ] **Step 4: Extend the content test with coverage and highlight resolution**

Append to `tests/content/time-travel.test.ts`:

```ts
import { buildTimeTravel, expectedStopIds } from "@/content/time-travel";

describe("time travel coverage", () => {
  it("has a stop for every year with items, so no year shows without its caption", () => {
    expect(stops.map((s) => s.id)).toEqual(expectedStopIds(content));
  });

  it("resolves every highlight", () => {
    expect(() => buildTimeTravel(content)).not.toThrow();
  });
});
```

(Move the new import to the top of the file with the others.)

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/unit/time-travel.test.ts tests/content/time-travel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/content/time-travel.ts tests/unit/time-travel.test.ts tests/content/time-travel.test.ts
rtk git commit -m "feat(journey): derive time travel stops, tally and building heights"
```

### Task 3: Skyline geometry and the server components

**Files:**
- Create: `src/components/time-travel/geometry.ts`, `Skyline.tsx`, `YearPanel.tsx`, `TimeTravel.tsx`
- Modify: `messages/en.json`, `messages/id.json` (new top-level `timeTravel` namespace)
- Modify: `src/app/[locale]/journey/page.tsx`
- Test: `tests/unit/time-travel-geometry.test.ts`

**Interfaces:**
- Consumes: `TtStop`, `TT_KINDS`, `TALLY_KEYS`, `getTimeTravel` (Task 2); `TimeTravelControls` and `TimeTravelLabels` from Task 4 (create a stub first, see Step 6).
- Produces:

```ts
// geometry.ts
export const SKY: { slot: 100; building: 60; base: 220; maxHeight: 200; height: 250; gap: 1; outline: 3 };
export const KIND_TONE: Record<TtKind, Accent>;   // roles cyan, study amber, projects violet, awards pink, writing green, certs blue
export interface BlockRect { kind: TtKind; x: number; y: number; width: number; height: number }
export interface BuildingLayout { x: number; top: number; height: number; centerX: number; blocks: BlockRect[] }
export function skylineLayout(stops: readonly Pick<TtStop, "counts" | "size" | "height">[]): BuildingLayout[];
export function viewBoxOf(count: number): string;   // `0 0 ${count * SKY.slot} ${SKY.height}`
// DOM contract the island relies on (rendered by Skyline/YearPanel):
//   [data-tt-stop="<index>"] on each building <g> (opacity attribute "1" or "0.15")
//   [data-tt-outline="<index>"] on each outline <rect> (visibility attribute)
//   [data-tt-link="<index>"] on each building <a>
//   [data-tt-panel] with data-stop="<id>" on each panel, in stop order
```

- [ ] **Step 1: Write the failing geometry test**

Create `tests/unit/time-travel-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SKY, skylineLayout, viewBoxOf } from "@/components/time-travel/geometry";
import { TT_KINDS, type TtKind } from "@/content/time-travel";

const counts = (partial: Partial<Record<TtKind, number>>) => Object.fromEntries(TT_KINDS.map((k) => [k, partial[k] ?? 0])) as Record<TtKind, number>;

describe("skyline layout", () => {
  const stops = [
    { counts: counts({ roles: 1, awards: 3 }), size: 4, height: 0.5 },
    { counts: counts({ projects: 16 }), size: 16, height: 1 },
    { counts: counts({}), size: 0, height: 0 },
  ];
  const layout = skylineLayout(stops);

  it("centers one building per slot on a shared base", () => {
    expect(layout.map((b) => b.x)).toEqual([20, 120, 220]);
    expect(layout.map((b) => b.centerX)).toEqual([50, 150, 250]);
    expect(layout[1]).toMatchObject({ height: SKY.maxHeight, top: SKY.base - SKY.maxHeight });
  });

  it("draws one block per item, bottom up in kind order", () => {
    expect(layout[0].blocks.map((b) => b.kind)).toEqual(["roles", "awards", "awards", "awards"]);
    expect(layout[0].blocks[0].y + layout[0].blocks[0].height).toBeLessThanOrEqual(SKY.base);
    expect(layout[0].blocks[3].y).toBeCloseTo(layout[0].top, 1);
    expect(layout[1].blocks).toHaveLength(16);
  });

  it("draws an empty stop as no blocks", () => {
    expect(layout[2].blocks).toEqual([]);
    expect(layout[2].height).toBe(0);
  });

  it("sizes the view box to the stop count", () => {
    expect(viewBoxOf(9)).toBe("0 0 900 250");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/time-travel-geometry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the geometry**

Create `src/components/time-travel/geometry.ts`:

```ts
import type { Accent } from "@/content/schema";
import { TT_KINDS, type TtKind, type TtStop } from "@/content/time-travel";

/** Skyline units (SVG user space): one 100-wide slot per stop, buildings 60 wide on a base line at y 220. */
export const SKY = { slot: 100, building: 60, base: 220, maxHeight: 200, height: 250, gap: 1, outline: 3 } as const;

/** One hue per block kind, from the accent tokens (spec section 3.2). */
export const KIND_TONE: Record<TtKind, Accent> = { roles: "cyan", study: "amber", projects: "violet", awards: "pink", writing: "green", certs: "blue" };

export interface BlockRect {
  kind: TtKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BuildingLayout {
  x: number;
  top: number;
  height: number;
  centerX: number;
  blocks: BlockRect[];
}

const round = (n: number) => Math.round(n * 10) / 10;

export function viewBoxOf(count: number): string {
  return `0 0 ${count * SKY.slot} ${SKY.height}`;
}

export function skylineLayout(stops: readonly Pick<TtStop, "counts" | "size" | "height">[]): BuildingLayout[] {
  return stops.map((stop, i) => {
    const x = i * SKY.slot + (SKY.slot - SKY.building) / 2;
    const height = stop.size > 0 ? round(stop.height * SKY.maxHeight) : 0;
    const step = stop.size > 0 ? height / stop.size : 0;
    const blocks: BlockRect[] = [];
    let n = 0;
    for (const kind of TT_KINDS) {
      for (let k = 0; k < stop.counts[kind]; k++, n++) {
        blocks.push({ kind, x, y: round(SKY.base - (n + 1) * step), width: SKY.building, height: round(Math.max(0.5, step - SKY.gap)) });
      }
    }
    return { x, top: round(SKY.base - height), height, centerX: i * SKY.slot + SKY.slot / 2, blocks };
  });
}
```

- [ ] **Step 4: Run the geometry test**

Run: `bunx vitest run tests/unit/time-travel-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the strings**

Add a new top-level `"timeTravel"` object to `messages/en.json` (after `"journey"`):

```json
"timeTravel": {
  "title": "Time Travel",
  "lead": "Each building is a year of the journey, from the first school projects to today. Pick a year, or play the whole journey.",
  "skyline": "The journey as a skyline, one building per year",
  "slider": "Year",
  "play": "Play the journey",
  "pause": "Pause",
  "prologue": "Before 2019",
  "building": "{label}: {count, plural, one {# item} other {# items}}",
  "seeYear": "See {label} in full",
  "seePrologue": "See the early years",
  "added": "+{count} new",
  "highlights": "Highlights",
  "tally": { "roles": "Roles", "projects": "Projects", "awards": "Awards", "papers": "Papers", "certs": "Certifications" },
  "kinds": { "roles": "Roles", "study": "Study and milestones", "projects": "Projects", "awards": "Awards", "writing": "Writing and research", "certs": "Certifications" }
}
```

And to `messages/id.json`:

```json
"timeTravel": {
  "title": "Mesin Waktu",
  "lead": "Setiap gedung adalah satu tahun perjalanan, dari proyek sekolah pertama hingga hari ini. Pilih satu tahun, atau putar seluruh perjalanan.",
  "skyline": "Perjalanan sebagai cakrawala, satu gedung per tahun",
  "slider": "Tahun",
  "play": "Putar perjalanan",
  "pause": "Jeda",
  "prologue": "Sebelum 2019",
  "building": "{label}: {count} item",
  "seeYear": "Lihat {label} selengkapnya",
  "seePrologue": "Lihat tahun-tahun awal",
  "added": "+{count} baru",
  "highlights": "Sorotan",
  "tally": { "roles": "Peran", "projects": "Proyek", "awards": "Penghargaan", "papers": "Paper", "certs": "Sertifikasi" },
  "kinds": { "roles": "Peran", "study": "Studi dan pencapaian", "projects": "Proyek", "awards": "Penghargaan", "writing": "Tulisan dan riset", "certs": "Sertifikasi" }
}
```

Match the files' existing indentation. Do not add `timeTravel` to `CLIENT_NAMESPACES` or `LAYOUT_NAMESPACES`.

- [ ] **Step 6: Create a stub island so the server components compile**

Create `src/components/time-travel/TimeTravelControls.tsx` (Task 4 replaces the body):

```tsx
"use client";

export interface TimeTravelLabels {
  slider: string;
  play: string;
  pause: string;
  stops: readonly string[];
}

export function TimeTravelControls(_props: { rootId: string; labels: TimeTravelLabels }) {
  return null;
}
```

- [ ] **Step 7: Implement `Skyline.tsx`**

```tsx
import { ACCENT_TEXT } from "@/lib/accent";
import { TT_KINDS, type TtStop } from "@/content/time-travel";
import { KIND_TONE, SKY, skylineLayout, viewBoxOf } from "./geometry";

/** Ghost opacity of buildings after the selected stop (the island writes the same values). */
export const GHOST_OPACITY = "0.15";

/**
 * The journey skyline: one building per stop, one block per item, colors from the accent classes through
 * `currentColor` (no new CSS). Server rendered on "now" (every building lit, the last outlined). Each building is a
 * link to its year's rows, so it works without JS; the island turns the links into stop pickers.
 */
export function Skyline({ stops, labels, names, title }: { stops: readonly TtStop[]; labels: readonly string[]; names: readonly string[]; title: string }) {
  const layout = skylineLayout(stops);
  const last = stops.length - 1;
  return (
    <svg viewBox={viewBoxOf(stops.length)} role="group" aria-label={title} className="block h-auto w-full" preserveAspectRatio="xMidYMax meet">
      {layout.map((b, i) => (
        <a key={stops[i].id} href={`#${stops[i].anchor}`} data-tt-link={i} aria-label={names[i]}>
          <rect x={i * SKY.slot} y={0} width={SKY.slot} height={SKY.height} fill="transparent" />
          <g data-tt-stop={i} opacity="1" style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
            {TT_KINDS.map((kind) => {
              const blocks = b.blocks.filter((r) => r.kind === kind);
              if (blocks.length === 0) return null;
              return (
                <g key={kind} className={ACCENT_TEXT[KIND_TONE[kind]]} fill="currentColor">
                  {blocks.map((r) => (
                    <rect key={`${r.y}`} x={r.x} y={r.y} width={r.width} height={r.height} rx={0.5} />
                  ))}
                </g>
              );
            })}
          </g>
          <rect
            data-tt-outline={i}
            x={b.x - SKY.outline}
            y={b.top - SKY.outline}
            width={SKY.building + SKY.outline * 2}
            height={b.height + SKY.outline}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-ink"
            visibility={i === last ? "visible" : "hidden"}
          />
          <text x={b.centerX} y={SKY.base + 22} textAnchor="middle" fill="currentColor" className="pv-data" aria-hidden="true">
            {labels[i]}
          </text>
        </a>
      ))}
    </svg>
  );
}
```

`GHOST_OPACITY` lives here, and the island repeats the literal `"0.15"` so it never imports a server module. Before finishing, check that every class used here already exists in `src/` (`block`, `h-auto`, `w-full`, `text-ink`, `pv-data`); drop any that do not.

- [ ] **Step 8: Implement `YearPanel.tsx`**

```tsx
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/content/schema";
import { TALLY_KEYS, type TallyKey, type TtStop } from "@/content/time-travel";

export interface YearPanelText {
  tally: Record<TallyKey, string>;
  added: (count: number) => string;
  highlights: string;
  see: string;
}

/** One stop: the year, the owner's caption, the running tally and the highlights. Hidden unless it is the shown stop. */
export function YearPanel({ stop, label, hidden, locale, text }: { stop: TtStop; label: string; hidden: boolean; locale: Locale; text: YearPanelText }) {
  return (
    <div data-tt-panel="" data-stop={stop.id} hidden={hidden} className="grid gap-x-6 gap-y-6 lg:grid-cols-12">
      <h3 className="pv-num text-[48px] leading-[0.9] lg:col-span-3 lg:text-[64px]">{label}</h3>
      <div className="min-w-0 lg:col-span-9">
        <p className="pv-lead">{stop.caption[locale]}</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
          {TALLY_KEYS.map((key) => (
            <div key={key}>
              <dt className="pv-data">{text.tally[key]}</dt>
              <dd className="pv-num mt-1 text-[28px] leading-none">{stop.tally[key].total}</dd>
              {stop.tally[key].added > 0 && <dd className="pv-small mt-1">{text.added(stop.tally[key].added)}</dd>}
            </div>
          ))}
        </dl>
        {stop.highlights.length > 0 && (
          <>
            <h4 className="pv-data mt-6">{text.highlights}</h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {stop.highlights.map((h) => (
                <li key={h.href + h.label.en}>
                  <Link href={h.href} className="pv-uline inline-flex min-h-11 items-center text-sm font-semibold text-ink hover:text-cyan">
                    {h.label[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4">
          <a href={`#${stop.anchor}`} className="pv-go">
            {text.see}
          </a>
        </p>
      </div>
    </div>
  );
}
```

Check that every class exists in `src/` (`text-[28px]`, `sm:grid-cols-5`, `gap-y-4` and so on). Replace any missing one with an existing equivalent, for example `text-[32px]`, if that one already exists.

- [ ] **Step 9: Implement `TimeTravel.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import { AccentDot } from "@/components/AccentDot";
import { SectionWide } from "@/components/page/Layout";
import type { Locale } from "@/content/schema";
import { TALLY_KEYS, TT_KINDS, type TtStop } from "@/content/time-travel";
import { KIND_TONE } from "./geometry";
import { Skyline } from "./Skyline";
import { TimeTravelControls } from "./TimeTravelControls";
import { YearPanel } from "./YearPanel";

export const TIME_TRAVEL_ID = "time-travel";

/** Time Travel (spec 2026-10-25): the journey as a skyline, opened on now. Server rendered; the island only enhances it. */
export async function TimeTravel({ locale, stops }: { locale: Locale; stops: readonly TtStop[] }) {
  if (stops.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "timeTravel" });
  const labels = stops.map((s) => (s.year === null ? t("prologue") : String(s.year)));
  const names = stops.map((s, i) => t("building", { label: labels[i], count: s.size }));
  const last = stops.length - 1;
  const tally = Object.fromEntries(TALLY_KEYS.map((k) => [k, t(`tally.${k}`)])) as Record<(typeof TALLY_KEYS)[number], string>;

  return (
    <SectionWide id={TIME_TRAVEL_ID} title={t("title")}>
      <p className="pv-lead">{t("lead")}</p>
      <div className="mt-8">
        <Skyline stops={stops} labels={labels} names={names} title={t("skyline")} />
      </div>
      <ul className="pv-small mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {TT_KINDS.map((kind) => (
          <li key={kind} className="inline-flex items-center gap-2">
            <AccentDot tone={KIND_TONE[kind]} />
            {t(`kinds.${kind}`)}
          </li>
        ))}
      </ul>
      <div className="mt-6 min-h-11">
        <TimeTravelControls rootId={TIME_TRAVEL_ID} labels={{ slider: t("slider"), play: t("play"), pause: t("pause"), stops: labels }} />
      </div>
      <div className="mt-8">
        {stops.map((stop, i) => (
          <YearPanel
            key={stop.id}
            stop={stop}
            label={labels[i]}
            hidden={i !== last}
            locale={locale}
            text={{ tally, added: (count) => t("added", { count }), highlights: t("highlights"), see: stop.year === null ? t("seePrologue") : t("seeYear", { label: labels[i] }) }}
          />
        ))}
      </div>
    </SectionWide>
  );
}
```

Check `SectionWide`'s props in `src/components/page/Layout.tsx` (`id`, `title`, `more?`, `note?`, `children`, `className?`) and `AccentDot`'s (`tone`, `size?`, `glow?`).

- [ ] **Step 10: Mount it on `/journey`**

In `src/app/[locale]/journey/page.tsx`, add the imports:

```tsx
import { TimeTravel } from "@/components/time-travel/TimeTravel";
import { getTimeTravel } from "@/content/time-travel";
```

Insert the section between `<PageIntro ... />` and `<JourneyFilter ...>`:

```tsx
      <TimeTravel locale={locale} stops={getTimeTravel()} />
```

- [ ] **Step 11: Typecheck, lint and the namespace tests**

Run: `bun run typecheck && bun run lint && bunx vitest run tests/unit/client-namespaces.test.ts tests/unit/ui-copy.test.ts tests/unit/time-travel-geometry.test.ts`
Expected: PASS. If the namespace test complains that `timeTravel` is unread or unknown, follow its message. A server-only namespace read through `getTranslations` should need no list change. If a messages-key parity test flags a key, keep `en` and `id` identical.

- [ ] **Step 12: Build and eyeball**

Run: `bun run build`, then `bunx serve out -l 4320` (or the repo's preview command in `package.json`). Open `http://localhost:4320/en/journey?tier=static&view=classic`, check the section renders above the year list on desktop and at 390 px, and stop the server.

- [ ] **Step 13: Commit**

```bash
rtk git add src/components/time-travel messages/en.json messages/id.json "src/app/[locale]/journey/page.tsx" tests/unit/time-travel-geometry.test.ts
rtk git commit -m "feat(journey): time travel skyline and year panels, server rendered"
```

### Task 4: The client island

**Files:**
- Modify: `src/components/time-travel/TimeTravelControls.tsx` (replace the stub)
- Test: `tests/hud/TimeTravelControls.test.tsx`

**Interfaces:**
- Consumes: the DOM contract from Task 3 (`[data-tt-panel]`, `[data-tt-stop]`, `[data-tt-outline]`, `[data-tt-link]` under `#time-travel`).
- Produces: `TimeTravelControls({ rootId, labels })`, `TimeTravelLabels`, `STEP_MS = 2500`, `RISE_MS = 600`, `FADE_MS = 400`, `animationsOff(html?: HTMLElement): boolean`, `showStop(root: HTMLElement, index: number, animate: boolean): void`.

- [ ] **Step 1: Write the failing island test**

Create `tests/hud/TimeTravelControls.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_MS, TimeTravelControls } from "@/components/time-travel/TimeTravelControls";

const STOPS = ["Before 2019", "2019", "2020", "2021"];

function mount() {
  document.body.innerHTML = `
    <section id="tt">
      <svg>${STOPS.map((_, i) => `<a href="#y${2019 + i}" data-tt-link="${i}"><g data-tt-stop="${i}" opacity="1"></g><rect data-tt-outline="${i}" visibility="${i === STOPS.length - 1 ? "visible" : "hidden"}"></rect></a>`).join("")}</svg>
      ${STOPS.map((s, i) => `<div data-tt-panel data-stop="${s}" ${i === STOPS.length - 1 ? "" : "hidden"}>${s} panel</div>`).join("")}
      <div id="controls"></div>
    </section>`;
  return render(<TimeTravelControls rootId="tt" labels={{ slider: "Year", play: "Play the journey", pause: "Pause", stops: STOPS }} />, { container: document.getElementById("controls")! });
}

const visiblePanel = () => document.querySelector<HTMLElement>("[data-tt-panel]:not([hidden])")?.dataset.stop;
const opacity = (i: number) => document.querySelector(`[data-tt-stop="${i}"]`)?.getAttribute("opacity");
const outline = (i: number) => document.querySelector(`[data-tt-outline="${i}"]`)?.getAttribute("visibility");

let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  animate = vi.fn();
  (Element.prototype as unknown as { animate: unknown }).animate = animate;
  document.documentElement.setAttribute("data-motion", "full");
  document.documentElement.removeAttribute("data-hq-still");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("TimeTravelControls", () => {
  it("opens on the last stop with a labelled slider", () => {
    mount();
    const slider = screen.getByRole("slider", { name: "Year" });
    expect(slider).toHaveValue("3");
    expect(slider).toHaveAttribute("aria-valuetext", "2021");
    expect(visiblePanel()).toBe("2021");
  });

  it("scrubs to a stop: panels, ghosts and the outline follow", () => {
    mount();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(visiblePanel()).toBe("2019");
    expect([opacity(0), opacity(1), opacity(2), opacity(3)]).toEqual(["1", "1", "0.15", "0.15"]);
    expect([outline(1), outline(3)]).toEqual(["visible", "hidden"]);
    expect(screen.getByText("2019", { selector: "[aria-live]" })).toBeInTheDocument();
  });

  it("selects a stop when a building is clicked instead of jumping", () => {
    mount();
    const link = document.querySelector<HTMLAnchorElement>('[data-tt-link="2"]')!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.querySelector("g")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(visiblePanel()).toBe("2020");
  });

  it("plays from the prologue to now, one stop per step, then offers Play again", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    expect(visiblePanel()).toBe("Before 2019");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(visiblePanel()).toBe("2019");
    act(() => vi.advanceTimersByTime(STEP_MS * 2));
    expect(visiblePanel()).toBe("2021");
    expect(screen.getByRole("button", { name: "Play the journey" })).toBeInTheDocument();
  });

  it("pauses and resumes from the held stop; input stops play", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    act(() => vi.advanceTimersByTime(STEP_MS));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(visiblePanel()).toBe("2019");
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(visiblePanel()).toBe("2020");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(visiblePanel()).toBe("Before 2019");
  });

  it("animates the rise under full motion only", () => {
    mount();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    document.documentElement.setAttribute("data-motion", "reduced");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(animate).not.toHaveBeenCalled();
    document.documentElement.setAttribute("data-motion", "full");
    document.documentElement.setAttribute("data-hq-still", "");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(animate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/hud/TimeTravelControls.test.tsx`
Expected: FAIL (`STEP_MS` is not exported; the stub renders nothing).

- [ ] **Step 3: Implement the island**

Replace `src/components/time-travel/TimeTravelControls.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STILL_ATTR } from "@/lib/boot-first";
import { MOTION_ATTR } from "@/lib/motion";
import { prefersReducedMotion } from "@/lib/reduced-motion";

export interface TimeTravelLabels {
  slider: string;
  play: string;
  pause: string;
  /** One label per stop, in order ("Before 2019", "2019", ...). */
  stops: readonly string[];
}

/** Time per stop while playing, the building rise and the panel fade (spec section 5). */
export const STEP_MS = 2500;
export const RISE_MS = 600;
export const FADE_MS = 400;
const GHOST = "0.15";

/** True under the reduced Motion setting (or the OS setting when the site has none) and under automation. */
export function animationsOff(html: HTMLElement = document.documentElement): boolean {
  if (html.hasAttribute(STILL_ATTR)) return true;
  const motion = html.getAttribute(MOTION_ATTR);
  if (motion === "reduced") return true;
  if (motion === "full") return false;
  return prefersReducedMotion();
}

/** Shows one stop: its panel, lit buildings up to it, ghosts after it, its outline; the rise and fade when animated. */
export function showStop(root: HTMLElement, index: number, animate: boolean) {
  root.querySelectorAll<HTMLElement>("[data-tt-panel]").forEach((panel, i) => {
    panel.hidden = i !== index;
    if (i === index && animate) panel.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
  });
  root.querySelectorAll<SVGGElement>("[data-tt-stop]").forEach((g, i) => {
    g.setAttribute("opacity", i <= index ? "1" : GHOST);
    if (i === index && animate) g.animate?.([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: RISE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  });
  root.querySelectorAll<SVGRectElement>("[data-tt-outline]").forEach((r, i) => r.setAttribute("visibility", i === index ? "visible" : "hidden"));
}

/**
 * The Time Travel controls: a range over the stops and Play. Renders nothing until mounted, so a visitor without JS
 * never sees dead controls (the server view stays on now, with building links to the year rows).
 */
export function TimeTravelControls({ rootId, labels }: { rootId: string; labels: TimeTravelLabels }) {
  const last = labels.stops.length - 1;
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [announce, setAnnounce] = useState("");
  const root = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const select = useCallback(
    (next: number, animate: boolean) => {
      const el = root.current;
      if (!el) return;
      setIndex(next);
      setAnnounce(labels.stops[next]);
      showStop(el, next, animate && !animationsOff());
    },
    [labels.stops],
  );

  const halt = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setPlaying(false);
  }, []);

  useEffect(() => {
    root.current = document.getElementById(rootId);
    setMounted(true);
    return () => window.clearTimeout(timer.current);
  }, [rootId]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("[data-tt-link]");
      if (!link || !el.contains(link)) return;
      event.preventDefault();
      halt();
      select(Number(link.getAttribute("data-tt-link")), true);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [mounted, halt, select]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    timer.current = window.setTimeout(() => select(index + 1, true), STEP_MS);
    return () => window.clearTimeout(timer.current);
  }, [playing, index, last, select]);

  const togglePlay = () => {
    if (playing) return halt();
    if (index >= last) select(0, true);
    setPlaying(true);
  };

  if (!mounted) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" className="chip min-h-11" onClick={togglePlay}>
        {playing ? labels.pause : labels.play}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        aria-label={labels.slider}
        aria-valuetext={labels.stops[index]}
        onChange={(event) => {
          halt();
          select(Number(event.currentTarget.value), true);
        }}
        className="min-h-11 min-w-0 flex-1"
      />
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
```

Notes:
- `Play` resumes from the held stop, and restarts from the prologue only when the current stop is the last one.
- Check that `@/lib/boot-first` is safe to import in a client module. It is imported for one string constant; if the client-chunk check or the bundle grows by more than the constant, inline `"data-hq-still"` with a comment naming `STILL_ATTR`.
- Check that every class exists in `src/` (`flex-1`, `min-w-0`, `sr-only`, `chip`).

- [ ] **Step 4: Run the island tests**

Run: `bunx vitest run tests/hud/TimeTravelControls.test.tsx`
Expected: PASS. If `fireEvent.change` on a range does not fire React's `onChange` in jsdom, keep `fireEvent.change(el, { target: { value } })`. This is the pattern React Testing Library documents for range inputs.

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/components/time-travel/TimeTravelControls.tsx tests/hud/TimeTravelControls.test.tsx
rtk git commit -m "feat(journey): time travel slider and Play island"
```

### Task 5: End-to-end spec and the e2e plan mapping

**Files:**
- Create: `e2e/time-travel.spec.ts`
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS`, `ALSO_RULES`)
- Modify: `tests/unit/e2e-plan.test.ts` (one mapping assertion)

**Interfaces:**
- Consumes: the rendered section (`#time-travel`), labels from `messages/en.json`, captions from `content/site-content.json`.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/time-travel.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import { openPage } from "./hq";

const URL = "/en/journey?tier=static";
const stops = content.floors.careerArchive.timeTravel.stops;
const caption = (id: string) => stops.find((s) => s.id === id)!.caption.en;
const STEP_MS = 2500;

test.describe("Time Travel on /journey", () => {
  test("opens on now and scrubs with the keyboard", async ({ page }) => {
    await openPage(page, URL);
    const section = page.locator("#time-travel");
    await expect(section.getByText(caption("2026"))).toBeVisible();
    const slider = section.getByRole("slider", { name: en.timeTravel.slider });
    await expect(slider).toHaveAttribute("aria-valuetext", "2026");
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(section.getByText(caption("pre-2019"))).toBeVisible();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuetext", "2021");
    await expect(section.getByText(caption("2021"))).toBeVisible();
    await expect(section.getByText(caption("2026"))).toBeHidden();
    await expect(section.locator('[data-tt-stop="4"]')).toHaveAttribute("opacity", "0.15");
  });

  test("Play walks from the prologue to now", async ({ page }) => {
    await page.clock.install();
    await openPage(page, URL);
    const section = page.locator("#time-travel");
    await section.getByRole("button", { name: en.timeTravel.play }).click();
    await expect(section.getByText(caption("pre-2019"))).toBeVisible();
    await page.clock.runFor(STEP_MS);
    await expect(section.getByText(caption("2019"))).toBeVisible();
    await page.clock.runFor(STEP_MS * (stops.length - 2));
    await expect(section.getByText(caption("2026"))).toBeVisible();
    await expect(section.getByRole("button", { name: en.timeTravel.play })).toBeVisible();
  });

  test("a building selects its year and keeps the URL", async ({ page }) => {
    await openPage(page, URL);
    const section = page.locator("#time-travel");
    await section.getByRole("link", { name: /^2022:/ }).click();
    await expect(section.getByText(caption("2022"))).toBeVisible();
    expect(new globalThis.URL(page.url()).hash).toBe("");
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await openPage(page, URL);
    const results = await new AxeBuilder({ page }).include("#time-travel").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test.describe("Time Travel without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("shows now, no controls, and each building links to its year", async ({ page }) => {
    await page.goto(URL);
    const section = page.locator("#time-travel");
    await expect(section.getByText(caption("2026"))).toBeVisible();
    await expect(section.getByRole("slider")).toHaveCount(0);
    await section.getByRole("link", { name: /^2021:/ }).click();
    await expect(page).toHaveURL(/#y2021$/);
  });
});
```

- [ ] **Step 2: Map the spec in the e2e plan**

In `scripts/e2e-plan.ts`, add `"time-travel",` to `ALL_SPECS` in alphabetical order (after `"static-routes"`, before `"topics"`). In `ALSO_RULES` add:

```ts
  // Time Travel on /journey: the section, its selector and island, the page that mounts it and the captions it reads.
  { test: /^src\/components\/time-travel\/|^src\/content\/time-travel\.ts$|^src\/app\/\[locale\]\/journey\/page\.tsx$|^content\/site-content\.json$/, specs: ["time-travel"] },
```

In `tests/unit/e2e-plan.test.ts`, add:

```ts
  it("runs the Time Travel spec for its section, selector, page and captions", () => {
    for (const file of ["src/components/time-travel/Skyline.tsx", "src/content/time-travel.ts", "src/app/[locale]/journey/page.tsx", "content/site-content.json"]) {
      expect(specsForChanges([file]).specs, file).toContain("time-travel");
    }
  });
```

Check how a changed spec file maps itself (for example, `e2e/time-travel.spec.ts` should map to `["time-travel"]` through the existing generic rule). If no generic rule covers it, add `^e2e\/time-travel\.spec\.ts$` to the same `ALSO_RULES` entry.

- [ ] **Step 3: Run the plan test**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: PASS. If "knows every spec in e2e/" fails, the `ALL_SPECS` entry is missing or misspelled.

- [ ] **Step 4: Run the e2e spec**

Run: `bun run build && bunx playwright test e2e/time-travel.spec.ts`. If the repo serves `out/` through `playwright.config.ts`'s `webServer`, the build is enough.
Expected: 5 passed. If `page.clock.install()` interferes with `openPage`'s hydration wait, install the clock after `openPage` and before the Play click.

- [ ] **Step 5: Commit**

```bash
rtk git add e2e/time-travel.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "test(journey): time travel e2e and its e2e plan mapping"
```

### Task 6: Docs, the decision file and the budget check

**Files:**
- Modify: `docs/features.md` (the `/journey` Classic route bullet and the status log table)
- Modify: `docs/agents/page-view.md` (new `### Time Travel (/journey)` subsection under Layout)
- Modify: `docs/agents/content.md` (the schema additions list: `careerArchive.timeTravel`)
- Modify: `docs/content.md` (a "Time Travel stops" subsection)
- Modify: `docs/superpowers/specs/2026-10-25-time-travel-slider-design.md` (strings note and status)
- Create: `docs/decisions/2026-10-25-time-travel-slider.md`
- Modify: this plan's `Status:` line stays `in review` until it ships

- [ ] **Step 1: Measure the budgets after the change**

Rerun Task 1 Step 1's commands. Compare against `budget-baseline.txt` and check:
- the largest CSS chunk grew by at most 300 B;
- `/en/journey` and `/id/journey` HTML grew by at most 4096 B each and are under 83,968 B;
- `/en/quick` did not change;
- the journey page JS grew by at most 4096 B.

If any number is over, stop and report the exact figures to the parent session before changing anything else.

- [ ] **Step 2: Write the decision file**

Create `docs/decisions/2026-10-25-time-travel-slider.md`:

```markdown
# Classic site: Time Travel

- Date: 2026-10-25

`/journey` opens with Time Travel: the owner's journey as a skyline of 9 stops (Before 2019, then 2019 to 2026), each building made of one block per item (roles, study and milestones, projects, awards, writing and research, certifications), opened on now with a Play button that sweeps from the prologue to now. Owner choices: what it scrubs (the journey, not the site's build history), Classic only (no 3D bytes), the skyline centerpiece, accumulating stops, curated highlights and one caption per stop in the owner's voice. The owner approved all 9 captions as written, in English and Indonesian, on 2026-10-25. Delegated to the parent session: highlights are career entries, projects, papers and certifications (awards through their year's trophy case entry), the URL never changes while scrubbing, and the captions stay out of the Ask pack. Budgets: 0 3D bytes; global CSS +N B, journey HTML +N B, island JS N B gzip (measured in this PR).
```

Replace each `N` with the measured figure from Step 1.

- [ ] **Step 3: Update the docs**

- `docs/features.md`, in the `/{locale}/journey` route bullet: append "opens with Time Travel: the journey as a skyline of years with a slider and Play, the owner's caption, a running tally and highlights per year".
- `docs/features.md`, in the status log table: add a row `| Time Travel | 2026-10-25: /journey opens with a skyline of the journey (Before 2019 to 2026), a slider and Play, the owner's caption, running tally and highlights per year; Classic only | In review |`. Follow the table's existing column layout.
- `docs/agents/page-view.md`, a `### Time Travel (/journey)` subsection after `### Case study`, with these bullets:
  - Placement: `#time-travel` between the intro and the year filter.
  - Server-rendered SVG plus `TimeTravelControls`.
  - The DOM contract (`data-tt-panel`, `data-tt-stop`, `data-tt-outline`, `data-tt-link`).
  - The labels come as props from the server-only `timeTravel` namespace, which is in neither namespace list.
  - Colors use the `ACCENT_TEXT` classes with `currentColor`.
  - Motion follows `html[data-motion]` and `html[data-hq-still]`, with WAAPI on transform and opacity only.
  - Without JS, building links go to `#yYYYY`.
  - Tests: `e2e/time-travel.spec.ts`, `tests/hud/TimeTravelControls.test.tsx`.
- `docs/agents/content.md`, schema additions: `floors.careerArchive.timeTravel.stops` holds the stop id, the caption `{ en, id }` (at most 140 characters) and up to 3 `{ kind, id }` highlights. Counts are derived by `src/content/time-travel.ts`. A year with items needs a stop (`tests/content/time-travel.test.ts`).
- `docs/content.md`, a "Time Travel stops" subsection: add a stop when a new year gets its first item; captions are the owner's words, approved before merge; highlights point at entries, pods, publications or certifications; run `bunx vitest run tests/content/time-travel.test.ts`.
- The spec, section 4 "Strings" bullet: change `journey.timeTravel.*` to the server-only top-level `timeTravel` namespace, with labels passed as props. Change its `Status:` line to `approved; implementation in review`.

- [ ] **Step 4: Run the docs tests**

Run: `bunx vitest run tests/unit/docs-index.test.ts tests/unit/agents-md.test.ts tests/unit/ascii.test.ts tests/unit/safety.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add docs
rtk git commit -m "docs: time travel slider (features, page view, content, decision)"
```

### Task 7: Full local verification and report

- [ ] **Step 1:** `bun run verify:quick`. Expected: green.
- [ ] **Step 2:** `bun run e2e:changed`. Expected: green, including `time-travel`, `pageview`, `static-routes` and `seo`.
- [ ] **Step 3:** If anything fails, use superpowers:systematic-debugging, fix, commit and rerun both commands.
- [ ] **Step 4:** Do not push. Send the parent session (`b819ac3a-f7ac-417b-a233-965c0fd98e54`): the branch, the head sha, the measured budget deltas, the `verify:quick` and `e2e:changed` results. Wait for a CI slot.
