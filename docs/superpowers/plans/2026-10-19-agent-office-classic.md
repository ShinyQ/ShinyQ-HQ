# Agent Office, part 4: Classic Card and Ask Note Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Live Agent Office" section to the Classic home page (EN and ID) that shows the office counts, the agents at work with their activity, the latest public GitHub events, today's numbers and the privacy note from `GET /api/office`, and teach Ask Rover Assistant what the Agent Office is and whether it is live.

**Architecture:** A server-rendered `SectionSplit` (`#office`) holds a tiny client shell (`OfficeLazy`) that imports the panel chunk only when the section nears the viewport (the `VisitsLazy` pattern), so the home page's initial JS barely grows. The panel reuses part 3's `createOfficePoller` and `officeCounts` from `src/lib/office/`, polls only while the section is on screen and the tab is visible, and hides the whole section when the office is disabled. Strings are resolved on the server and passed as props (no client namespace). Ask learns from one paragraph in `content/ask/site-build.json` plus a scope pattern and two golden questions.

**Tech Stack:** Next.js 16 static export (server components, `next-intl`), React 19 client components, Tailwind tokens and `pv-*` classes, Vitest with jsdom, Playwright with `page.route` mocks.

Spec: [`docs/superpowers/specs/2026-10-18-agent-office-design.md`](../specs/2026-10-18-agent-office-design.md) sections 4.2, 4.3, 6 and 8. Depends on parts 1 and 3 ([part 1 plan](2026-10-19-agent-office-worker.md), [part 3 plan](2026-10-19-agent-office-3d.md)): `src/lib/office/protocol.ts`, `fixtures.ts`, `poll.ts`, `model.ts`, and the `office` messages (`office.state.*`, `office.activity.*`, `office.agent.*`, `office.clientProject`, `office.privacy`).

## Global Constraints

- No em dashes (U+2014) anywhere; no first person in titles; no client names (the card shows "Client project" / "Proyek klien" for anything not public).
- Every string in `messages/en.json` and `messages/id.json` with identical keys, under `office.classic.*` (plus part 3's shared `office.*` keys).
- Classic JS budget 240 KB per page (`lighthouserc.json` `resource-summary:script:size` 245,760 B) and HTML 83,968 B with at least 4 KB of headroom per page: the always-loaded shell adds under 1 KB gzip; the panel is a lazy chunk; the measured `/en` and `/id` numbers go into the PR body.
- Lighthouse LCP 2 s, CLS 0.01 (the section reserves its height while loading), TBT 200 ms.
- Poll only while the section is within one screen of the viewport and the tab is visible (part 3's poller handles visibility, backoff and the 10 minute idle stop); never under the 3D tower (`content-visibility: hidden` never intersects).
- Failure: keep the last snapshot for 60 s, then show "Offline" with the last GitHub events; `{"v":1,"enabled":false}` hides the section.
- Ask: no live data in the pack; no prompt change (no `PROMPT_VERSION` bump); `tests/ask/golden.json` gains q77 and q78 in the same PR.
- Captures before merge: 1440x900 and 390x844, EN, for busy, rough, quiet, semi-live, off and offline.
- CI: at most 2 CI runs in flight; this PR merges only after the owner reviews the captures.

## File Structure

| Path | Responsibility |
|---|---|
| `src/components/office/OfficeSection.tsx` (new) | Server component: translations to props, `SectionSplit id="office"` |
| `src/components/office/OfficeLazy.tsx` (new) | Client shell: hide context, viewport trigger, lazy panel import |
| `src/components/office/OfficePanel.tsx` (new) | Client panel (lazy chunk): poller, counts, agents, GitHub, today, privacy |
| `src/components/office/labels.ts` (new) | `OfficeCardLabels` type and `fill(template, values)` |
| `src/app/[locale]/page.tsx` | Mount `OfficeSection` after `#intro` |
| `messages/en.json`, `messages/id.json` | `office.classic.*` |
| `content/ask/site-build.json` | Agent Office paragraph, keywords, `asOf` |
| `functions/_lib/scope.ts` | "Agent Office" questions are site questions |
| `tests/ask/golden.json`, `tests/ask/scope.test.ts` | q77, q78 |
| `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | `office-classic` spec registered and mapped |
| `tests/hud/OfficePanel.test.tsx` (new), `e2e/office-classic.spec.ts` (new) | Tests and captures |
| `docs/agents/office.md`, `docs/agents/page-view.md`, `docs/features.md` | Docs |

---

### Task 1: Card copy and the server section

**Files:**
- Create: `src/components/office/labels.ts`, `src/components/office/OfficeSection.tsx`
- Modify: `messages/en.json`, `messages/id.json` (inside the existing `office` object from part 3, add `classic`)
- Test: `tests/unit/office-card-labels.test.ts`

**Interfaces:**
- Consumes: part 3's `office.state.*`, `office.activity.*`, `office.agent.*`, `office.clientProject`, `office.privacy`; part 1's `OFFICE_STATES`, `OFFICE_ACTIVITIES`, `OFFICE_AGENTS`, `OfficeGithubStatus`.
- Produces: `interface OfficeCardLabels { title; intro; loading; live; semiLive; resting; offline; updated; counts: Record<"active" | "thinking" | "waiting" | "asleep", string>; agents; noAgents; extra; github; noGithub; today; status: Record<OfficeGithubStatus, string>; clientProject; privacy; states: Record<OfficeState, string>; activities: Record<OfficeActivity, string>; agentNames: Record<OfficeAgent, string> }` (all `string`); `fill(template: string, values: Record<string, string | number>): string`; `officeCardLabels(locale: Locale): Promise<OfficeCardLabels>`; `OfficeSection({ locale }: { locale: Locale }): Promise<JSX.Element>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/office-card-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { fill } from "@/components/office/labels";
import { hasFirstPerson } from "@/lib/first-person";

describe("office card copy", () => {
  it("has the same classic keys in EN and ID, no em dash, no first person in the title", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v).map((s) => `${k}.${s}`) : [k]));
    expect(keys(id.office.classic)).toEqual(keys(en.office.classic));
    for (const text of [JSON.stringify(en.office.classic), JSON.stringify(id.office.classic)]) expect(text).not.toContain("\u2014");
    expect(hasFirstPerson(en.office.classic.title, "en")).toBe(false);
    expect(hasFirstPerson(id.office.classic.title, "id")).toBe(false);
  });

  it("fills named placeholders and leaves unknown ones", () => {
    expect(fill("Today: {tasks} tasks, {prs} PRs", { tasks: 9, prs: 7 })).toBe("Today: 9 tasks, 7 PRs");
    expect(fill("{a} and {b}", { a: "x" })).toBe("x and {b}");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/office-card-labels.test.ts`
Expected: FAIL with "Failed to resolve import "@/components/office/labels"".

- [ ] **Step 3: Add the copy, the labels module and the section**

In `messages/en.json`, inside `"office": { ... }` (added by part 3), add:

```json
"classic": {
  "title": "Live Agent Office",
  "intro": "The AI coding agents Kurniadi works with, shown live: what each one is doing right now, plus public GitHub activity. The same office stands in the 3D Lobby.",
  "loading": "Opening the office...",
  "live": "Live",
  "semiLive": "Semi-live: no agent is reporting, public GitHub activity only",
  "resting": "Resting: the office is not reporting right now",
  "offline": "Offline: showing the last known activity",
  "updated": "updated {time}",
  "counts": { "active": "Active", "thinking": "Thinking", "waiting": "Waiting", "asleep": "Asleep" },
  "agents": "At the desks",
  "noAgents": "Every Rover is asleep.",
  "extra": "+{count} more sessions",
  "github": "Latest on GitHub",
  "noGithub": "No public activity yet today.",
  "today": "Today: {tasks} tasks done, {prs} PRs merged, {green} of {runs} CI runs green",
  "status": { "running": "Running", "success": "Passed", "failure": "Failed", "merged": "Merged", "opened": "Opened", "pushed": "Pushed" }
}
```

In `messages/id.json`, inside `"office": { ... }`, add:

```json
"classic": {
  "title": "Kantor Agen Langsung",
  "intro": "Agen AI coding yang bekerja bersama Kurniadi, ditampilkan langsung: apa yang sedang dikerjakan masing-masing saat ini, ditambah aktivitas GitHub publik. Kantor yang sama ada di Lobi 3D.",
  "loading": "Membuka kantor...",
  "live": "Langsung",
  "semiLive": "Semi-langsung: tidak ada agen yang melapor, hanya aktivitas GitHub publik",
  "resting": "Istirahat: kantor sedang tidak melapor",
  "offline": "Offline: menampilkan aktivitas terakhir yang diketahui",
  "updated": "diperbarui {time}",
  "counts": { "active": "Aktif", "thinking": "Berpikir", "waiting": "Menunggu", "asleep": "Tidur" },
  "agents": "Di meja",
  "noAgents": "Semua Rover sedang tidur.",
  "extra": "+{count} sesi lainnya",
  "github": "Terbaru di GitHub",
  "noGithub": "Belum ada aktivitas publik hari ini.",
  "today": "Hari ini: {tasks} tugas selesai, {prs} PR di-merge, {green} dari {runs} CI run hijau",
  "status": { "running": "Berjalan", "success": "Lulus", "failure": "Gagal", "merged": "Di-merge", "opened": "Dibuka", "pushed": "Di-push" }
}
```

Create `src/components/office/labels.ts`:

```ts
import type { OfficeActivity, OfficeAgent, OfficeGithubStatus, OfficeState } from "@/lib/office/protocol";

/** Every string the Classic office card renders, resolved on the server (no client namespace). */
export interface OfficeCardLabels {
  title: string;
  intro: string;
  loading: string;
  live: string;
  semiLive: string;
  resting: string;
  offline: string;
  updated: string;
  counts: Record<"active" | "thinking" | "waiting" | "asleep", string>;
  agents: string;
  noAgents: string;
  extra: string;
  github: string;
  noGithub: string;
  today: string;
  status: Record<OfficeGithubStatus, string>;
  clientProject: string;
  privacy: string;
  states: Record<OfficeState, string>;
  activities: Record<OfficeActivity, string>;
  agentNames: Record<OfficeAgent, string>;
}

/** `{name}` placeholders of a raw message (next-intl formatters cannot cross into a client component). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
```

Create `src/components/office/OfficeSection.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { SectionSplit } from "@/components/page/Layout";
import type { Locale } from "@/content/locales";
import { OFFICE_ACTIVITIES, OFFICE_AGENTS, OFFICE_STATES, type OfficeGithubStatus } from "@/lib/office/protocol";
import type { OfficeCardLabels } from "./labels";
import { OfficeLazy, OfficeShell } from "./OfficeLazy";

const STATUSES: readonly OfficeGithubStatus[] = ["running", "success", "failure", "merged", "opened", "pushed"];

export async function officeCardLabels(locale: Locale): Promise<OfficeCardLabels> {
  const t = await getTranslations({ locale, namespace: "office" });
  const c = (key: string) => t.raw(`classic.${key}`) as string;
  return {
    title: c("title"),
    intro: c("intro"),
    loading: c("loading"),
    live: c("live"),
    semiLive: c("semiLive"),
    resting: c("resting"),
    offline: c("offline"),
    updated: c("updated"),
    counts: { active: c("counts.active"), thinking: c("counts.thinking"), waiting: c("counts.waiting"), asleep: c("counts.asleep") },
    agents: c("agents"),
    noAgents: c("noAgents"),
    extra: c("extra"),
    github: c("github"),
    noGithub: c("noGithub"),
    today: c("today"),
    status: Object.fromEntries(STATUSES.map((s) => [s, c(`status.${s}`)])) as OfficeCardLabels["status"],
    clientProject: t("clientProject"),
    privacy: t("privacy"),
    states: Object.fromEntries(OFFICE_STATES.map((s) => [s, t(`state.${s}`)])) as OfficeCardLabels["states"],
    activities: Object.fromEntries(OFFICE_ACTIVITIES.map((a) => [a, t(`activity.${a}`)])) as OfficeCardLabels["activities"],
    agentNames: Object.fromEntries(OFFICE_AGENTS.map((a) => [a, t(`agent.${a}`)])) as OfficeCardLabels["agentNames"],
  };
}

/** "Live Agent Office" on the Classic home page (`#office`): the L1 office's data as a card (spec section 4.2). */
export async function OfficeSection({ locale }: { locale: Locale }) {
  const labels = await officeCardLabels(locale);
  return (
    <OfficeShell>
      <SectionSplit id="office" title={labels.title} intro={labels.intro}>
        <OfficeLazy locale={locale} labels={labels} />
      </SectionSplit>
    </OfficeShell>
  );
}
```

Note: `OfficeLazy` and `OfficeShell` come in Task 2; this task's test does not import `OfficeSection`, so it passes before Task 2.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/unit/office-card-labels.test.ts tests/unit/client-namespaces.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/id.json src/components/office/labels.ts src/components/office/OfficeSection.tsx tests/unit/office-card-labels.test.ts
git commit -m "feat(office): Classic card copy (EN, ID) and the server section"
```

### Task 2: Lazy shell and the live panel

**Files:**
- Create: `src/components/office/OfficeLazy.tsx`, `src/components/office/OfficePanel.tsx`
- Test: `tests/hud/OfficePanel.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`OfficeCardLabels`, `fill`); part 3's `createOfficePoller`, `POLL`, `OfficeFeed` (`src/lib/office/poll.ts`) and `officeCounts`, `deskTitle`, `STATE_TONE`, `sinceLabel` (`src/lib/office/model.ts`); part 1's fixtures.
- Produces: `OfficeShell({ children })` (renders `<div data-testid="office-section" data-status hidden>`), `OfficeLazy({ locale, labels })`, `OfficePanel({ locale, labels, onStatus, poller? }: OfficePanelProps)`, `interface OfficePanelProps { locale: Locale; labels: OfficeCardLabels; onStatus?: (status: OfficeFeedStatus) => void; poller?: OfficePoller }`. Test ids: `office-live`, `office-count-<key>`, `office-desk`, `office-github`, `office-today`, `office-privacy`.

- [ ] **Step 1: Write the failing test**

Create `tests/hud/OfficePanel.test.tsx` (same jsdom header as `tests/hud/VisitsPanel.test.tsx`):

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfficePanel } from "@/components/office/OfficePanel";
import type { OfficeCardLabels } from "@/components/office/labels";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES } from "@/lib/office/fixtures";
import type { OfficeFeed, OfficePoller } from "@/lib/office/poll";
import type { OfficeSnapshotV1 } from "@/lib/office/protocol";
import en from "../../messages/en.json";

const c = en.office.classic;
const labels: OfficeCardLabels = {
  ...c,
  clientProject: en.office.clientProject,
  privacy: en.office.privacy,
  states: en.office.state,
  activities: en.office.activity,
  agentNames: en.office.agent,
} as OfficeCardLabels;

function fakePoller(feed: OfficeFeed) {
  let listener: ((f: OfficeFeed) => void) | null = null;
  const calls: string[] = [];
  const poller: OfficePoller = {
    start: () => void calls.push("start"),
    stop: () => void calls.push("stop"),
    touch: () => void calls.push("touch"),
    feed: () => feed,
    subscribe: (l) => {
      listener = l;
      return () => (listener = null);
    },
  };
  return { poller, calls, push: (f: OfficeFeed) => act(() => listener?.(f)) };
}

const ready = (snapshot: OfficeSnapshotV1): OfficeFeed => ({ status: "ready", snapshot, fetchedAt: OFFICE_FIXTURE_NOW });

afterEach(() => cleanup());

describe("OfficePanel", () => {
  it("shows counts, desks with titles or Client project, GitHub items, today and the privacy note", () => {
    const { poller, calls } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW + 4000} />);
    expect(calls).toContain("start");
    expect(screen.getByTestId("office-live").textContent).toContain("Live");
    expect(screen.getByTestId("office-count-active").textContent).toContain("2");
    const desks = screen.getAllByTestId("office-desk");
    expect(desks).toHaveLength(5);
    expect(desks[0].textContent).toContain("Narrower 3D perf selection");
    expect(desks[1].textContent).toContain(labels.clientProject);
    expect(screen.getByText("+1 more sessions")).toBeTruthy();
    expect(screen.getAllByTestId("office-github")).toHaveLength(4);
    expect(screen.getByTestId("office-today").textContent).toBe("Today: 9 tasks done, 7 PRs merged, 13 of 14 CI runs green");
    expect(screen.getByTestId("office-privacy").textContent).toBe(labels.privacy);
  });

  it("reports the status so the shell can hide a disabled office, and shows semi-live and offline lines", () => {
    const statuses: string[] = [];
    const { poller, push } = fakePoller({ status: "loading", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="en" labels={labels} poller={poller} onStatus={(s) => statuses.push(s)} now={() => OFFICE_FIXTURE_NOW} />);
    push(ready(OFFICE_FIXTURES.semiLive as OfficeSnapshotV1));
    expect(screen.getByTestId("office-live").textContent).toContain(labels.semiLive);
    push({ status: "offline", snapshot: OFFICE_FIXTURES.semiLive as OfficeSnapshotV1, fetchedAt: OFFICE_FIXTURE_NOW });
    expect(screen.getByTestId("office-live").textContent).toContain(labels.offline);
    expect(screen.getAllByTestId("office-github").length).toBeGreaterThan(0);
    push({ status: "disabled", snapshot: null, fetchedAt: OFFICE_FIXTURE_NOW });
    expect(statuses).toEqual(["loading", "ready", "offline", "disabled"]);
  });

  it("stops the poller on unmount", () => {
    const { poller, calls } = fakePoller(ready(OFFICE_FIXTURES.quiet as OfficeSnapshotV1));
    const { unmount } = render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    unmount();
    expect(calls.at(-1)).toBe("stop");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/hud/OfficePanel.test.tsx`
Expected: FAIL with "Failed to resolve import "@/components/office/OfficePanel"".

- [ ] **Step 3: Write the shell and the panel**

Create `src/components/office/OfficeLazy.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Locale } from "@/content/locales";
import type { OfficeFeedStatus } from "@/lib/office/poll";
import type { OfficeCardLabels } from "./labels";
import type { OfficePanelProps } from "./OfficePanel";

const loadPanel = () => import("./OfficePanel").then((m) => m.OfficePanel);
const StatusContext = createContext<(status: OfficeFeedStatus) => void>(() => undefined);

/** The home page's office section wrapper: hidden when the office is switched off (`{"v":1,"enabled":false}`). */
export function OfficeShell({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OfficeFeedStatus>("idle");
  return (
    <StatusContext.Provider value={setStatus}>
      <div hidden={status === "disabled"} data-testid="office-section" data-status={status}>
        {children}
      </div>
    </StatusContext.Provider>
  );
}

/**
 * Loads the panel chunk once the section comes within a screen of the viewport, like VisitsLazy, so the panel and
 * the polling never weigh on the page's first load or run under the 3D tower.
 */
export function OfficeLazy({ locale, labels }: { locale: Locale; labels: OfficeCardLabels }) {
  const onStatus = useContext(StatusContext);
  const [Panel, setPanel] = useState<ComponentType<OfficePanelProps> | null>(null);
  const anchor = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void loadPanel().then((p) => alive && setPanel(() => p));
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);
  if (!Panel)
    return (
      <p ref={anchor} className="pv-data min-h-[320px] text-ink-3">
        {labels.loading}
      </p>
    );
  return <Panel locale={locale} labels={labels} onStatus={onStatus} />;
}
```

Create `src/components/office/OfficePanel.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/content/locales";
import { officeCounts, deskTitle, sinceLabel, STATE_TONE } from "@/lib/office/model";
import { createOfficePoller, type OfficeFeed, type OfficeFeedStatus, type OfficePoller } from "@/lib/office/poll";
import type { OfficeGithubItem } from "@/lib/office/protocol";
import { fill, type OfficeCardLabels } from "./labels";

export interface OfficePanelProps {
  locale: Locale;
  labels: OfficeCardLabels;
  onStatus?: (status: OfficeFeedStatus) => void;
  /** Tests inject a poller and a clock. */
  poller?: OfficePoller;
  now?: () => number;
}

const GITHUB_SHOWN = 4;
const ICON: Record<OfficeGithubItem["status"], string> = { running: "\u25cc", success: "\u2713", failure: "\u2715", merged: "\u2713", opened: "\u25cb", pushed: "\u2191" };
const ICON_TONE: Record<OfficeGithubItem["status"], string> = { running: "text-cyan", success: "text-emerald-300", failure: "text-rose-300", merged: "text-violet-300", opened: "text-ink-2", pushed: "text-ink-2" };

/** The local time of the last good fetch, for "updated 15:04". */
function clock(locale: Locale, at: number): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(at);
}

function Dot({ tone }: { tone: string }) {
  return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: tone }} />;
}

/** The live card: counts, the desks, the GitHub board, today and the privacy note (spec section 4.2). */
export function OfficePanel({ locale, labels, onStatus, poller: injected, now = Date.now }: OfficePanelProps) {
  const poller = useMemo(() => injected ?? createOfficePoller(), [injected]);
  const [feed, setFeed] = useState<OfficeFeed>(() => poller.feed());
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = poller.subscribe(setFeed);
    const touch = () => poller.touch();
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    window.addEventListener("scroll", touch, { passive: true });
    const el = root.current;
    const observer =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => (entries.some((e) => e.isIntersecting) ? poller.start() : poller.stop()), { rootMargin: "50% 0px" })
        : null;
    if (observer && el) observer.observe(el);
    else poller.start();
    return () => {
      off();
      observer?.disconnect();
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("scroll", touch);
      poller.stop();
    };
  }, [poller]);

  useEffect(() => onStatus?.(feed.status), [feed.status, onStatus]);

  const snap = feed.snapshot;
  const desks = snap?.desks ?? [];
  const counts = officeCounts(desks);
  const t = now();
  const line =
    feed.status === "offline"
      ? labels.offline
      : snap?.mode === "semi-live"
        ? labels.semiLive
        : snap?.mode === "off"
          ? labels.resting
          : `${labels.live} \u00b7 ${fill(labels.updated, { time: clock(locale, feed.fetchedAt) })}`;

  return (
    <div ref={root} className="min-h-[320px]" aria-live="polite">
      <p data-testid="office-live" className="pv-data flex items-center gap-2">
        <Dot tone={feed.status === "ready" && snap?.mode === "live" ? STATE_TONE.done : STATE_TONE.asleep} />
        {snap ? line : labels.loading}
      </p>
      {snap && (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["active", "thinking", "waiting", "asleep"] as const).map((key) => (
              <div key={key} data-testid={`office-count-${key}`} className="border border-line px-4 py-3">
                <dt className="pv-data">{labels.counts[key]}</dt>
                <dd className="pv-num text-[28px] leading-none text-ink">{counts[key]}</dd>
              </div>
            ))}
          </dl>

          <h3 className="pv-data mt-8">{labels.agents}</h3>
          {desks.length === 0 ? (
            <p className="mt-3 text-ink-2">{labels.noAgents}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {desks.map((d) => (
                <li key={d.slot} data-testid="office-desk" className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-3">
                  <Dot tone={STATE_TONE[d.state]} />
                  <span className="min-w-0">
                    <span className="text-ink">
                      {labels.agentNames[d.agent]} {"\u00b7"} {labels.activities[d.activity]}
                    </span>
                    <span className="block truncate text-sm text-ink-2">{deskTitle(d) ?? labels.clientProject}</span>
                  </span>
                  <span className="pv-data text-ink-3">{labels.states[d.state]}</span>
                </li>
              ))}
            </ul>
          )}
          {snap.extra > 0 && <p className="pv-data mt-2 text-ink-3">{fill(labels.extra, { count: snap.extra })}</p>}

          <h3 className="pv-data mt-8">{labels.github}</h3>
          {snap.github.length === 0 ? (
            <p className="mt-3 text-ink-2">{labels.noGithub}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {snap.github.slice(0, GITHUB_SHOWN).map((g) => (
                <li key={`${g.kind}-${g.url}-${g.at}`} data-testid="office-github" className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-3">
                  <span aria-hidden="true" className={ICON_TONE[g.status]}>
                    {ICON[g.status]}
                  </span>
                  <a href={g.url} rel="noopener noreferrer" target="_blank" className="min-w-0 truncate text-ink hover:text-cyan">
                    {g.title}
                  </a>
                  <span className="pv-data text-ink-3">
                    {labels.status[g.status]} {"\u00b7"} {sinceLabel(t - g.at, locale, t)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p data-testid="office-today" className="mt-6 text-sm text-ink-2">
            {fill(labels.today, { tasks: snap.today.tasksDone, prs: snap.today.prsMerged, green: snap.today.ciGreen, runs: snap.today.ciRuns })}
          </p>
        </>
      )}
      <p data-testid="office-privacy" className="mt-6 text-sm text-ink-3">
        {labels.privacy}
      </p>
    </div>
  );
}
```

Before writing the colours, check `src/app/globals.css` and `src/app/landing.css` for the palette utilities that exist (`text-cyan` is used by `Layout.tsx`); replace `text-emerald-300`, `text-rose-300` and `text-violet-300` with the project's green, red and violet token classes if they exist, otherwise keep Tailwind's palette classes (they compile to CSS variables in Tailwind 4). No coloured edge stripes: the tiles use `border border-line` all around.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/hud/OfficePanel.test.tsx`
Expected: PASS (3 tests). If the active count differs, read part 3's `officeCounts` rule (done and failed count as active): with the busy fixture (working, thinking, ci, input, done) active is 2 (working, done), thinking 1, waiting 2, asleep 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/office/OfficeLazy.tsx src/components/office/OfficePanel.tsx tests/hud/OfficePanel.test.tsx
git commit -m "feat(office): lazy Classic office panel with live polling"
```

### Task 3: Mount on the home page, e2e, budgets and captures

**Files:**
- Modify: `src/app/[locale]/page.tsx` (import and mount after `#intro`), `scripts/e2e-plan.ts` (`ALL_SPECS` gains `"office-classic"`; a rule for `src/components/office/`; the `src/lib/office/` rule gains `"office-classic"`), `tests/unit/e2e-plan.test.ts` (a pin)
- Create: `e2e/office-classic.spec.ts`
- Test: `e2e/office-classic.spec.ts`, `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2, part 1 fixtures.
- Produces: `#office` on `/en` and `/id`; captures written to `$OFFICE_SHOTS` when set.

- [ ] **Step 1: Write the failing e2e test**

Create `e2e/office-classic.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { OFFICE_FIXTURES } from "../src/lib/office/fixtures";

async function mockOffice(page: Page, body: unknown | number) {
  let calls = 0;
  await page.route("**/api/office", (route) => {
    calls += 1;
    return typeof body === "number" ? route.fulfill({ status: body }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return () => calls;
}

const open = async (page: Page, path = "/en?view=classic") => {
  await page.goto(path);
  await page.locator("#office").scrollIntoViewIfNeeded();
};

test.describe("Classic: Live Agent Office", () => {
  test("shows the busy office with Client project for private work", async ({ page }) => {
    await mockOffice(page, OFFICE_FIXTURES.busy);
    await open(page);
    await expect(page.getByTestId("office-desk")).toHaveCount(5);
    await expect(page.getByTestId("office-desk").nth(1)).toContainText("Client project");
    await expect(page.getByTestId("office-github").first()).toContainText("CI");
    await expect(page.getByTestId("office-privacy")).toBeVisible();
  });

  test("hides the section when the office is disabled", async ({ page }) => {
    await mockOffice(page, OFFICE_FIXTURES.disabled);
    await open(page);
    await expect(page.getByTestId("office-section")).toHaveAttribute("data-status", "disabled");
    await expect(page.locator("#office")).toBeHidden();
  });

  test("does not fetch before the section nears the viewport", async ({ page }) => {
    const calls = await mockOffice(page, OFFICE_FIXTURES.busy);
    await page.goto("/en?view=classic");
    await page.waitForLoadState("networkidle");
    expect(calls()).toBe(0);
    await page.locator("#office").scrollIntoViewIfNeeded();
    await expect.poll(calls).toBeGreaterThan(0);
  });

  test("Indonesian copy", async ({ page }) => {
    await mockOffice(page, OFFICE_FIXTURES.quiet);
    await open(page, "/id?view=classic");
    await expect(page.locator("#office-title")).toHaveText("Kantor Agen Langsung");
  });

  test("captures for the owner", async ({ page }) => {
    const dir = process.env.OFFICE_SHOTS;
    test.skip(!dir, "set OFFICE_SHOTS=<dir> to write the review captures");
    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      for (const name of ["busy", "rough", "quiet", "semiLive", "off"] as const) {
        await page.unrouteAll();
        await mockOffice(page, OFFICE_FIXTURES[name]);
        await open(page);
        await expect(page.getByTestId("office-section")).toHaveAttribute("data-status", /ready|offline/);
        await page.locator("#office").screenshot({ path: `${dir}/classic-${name}-${size.width}.png` });
      }
      await page.unrouteAll();
      await mockOffice(page, 500);
      await open(page);
      await page.locator("#office").screenshot({ path: `${dir}/classic-error-${size.width}.png` });
    }
  });
});
```

In `scripts/e2e-plan.ts`, add `"office-classic",` to `ALL_SPECS` in alphabetical order, add a rule

```ts
  { test: /^src\/components\/office\//, specs: ["office-classic", "pageview"] },
```

and add `"office-classic"` to the specs of the existing `src/lib/office/` rule (part 3 may have split it; add it wherever `src/lib/office/` maps). In `tests/unit/e2e-plan.test.ts`, add:

```ts
  it("runs the Classic office spec for the card", () => {
    expect(specsForChanges(["src/components/office/OfficePanel.tsx"]).specs).toEqual(["office-classic", "pageview"]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run build && E2E_PORT=4430 bunx playwright test e2e/office-classic.spec.ts --retries 0`
Expected: FAIL: `#office` does not exist on the page.

- [ ] **Step 3: Mount the section**

In `src/app/[locale]/page.tsx`, add `import { OfficeSection } from "@/components/office/OfficeSection";` with the other component imports, and insert after the closing `</SectionSplit>` of `id="intro"`:

```tsx
      <OfficeSection locale={locale} />
```

- [ ] **Step 4: Run tests, budgets and captures**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts && bun run build && E2E_PORT=4430 bunx playwright test e2e/office-classic.spec.ts e2e/pageview.spec.ts --retries 0`
Expected: PASS (the capture test is skipped).

Then measure the budgets: `bun scripts/serve-static.ts --port 4320 --dir out &` and `bunx lhci autorun --collect.url=http://127.0.0.1:4320/en --collect.url=http://127.0.0.1:4320/id` (or `bun run e2e:changed`, which runs the Lighthouse URLs the plan maps), and record `/en` and `/id` script bytes and document bytes against `main` (`git stash`-free: build `main` into `out-main` with the existing look tooling, or read the main CI Lighthouse summary). Expected: script growth under 1 KB gzip, document growth under 2 KB, at least 4 KB of HTML headroom left. If the document headroom drops under 4 KB, pass only the 9 state, 12 activity and 3 agent labels plus the strings the card renders (already the case) and shorten `intro`.

Write the captures: `mkdir -p "$TMPDIR/office-shots" && OFFICE_SHOTS="$TMPDIR/office-shots" E2E_PORT=4430 bunx playwright test e2e/office-classic.spec.ts -g "captures" --retries 0` and list the 12 PNGs for the PR body (do not commit them).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/page.tsx" e2e/office-classic.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
git commit -m "feat(office): Live Agent Office section on the Classic home page"
```

### Task 4: Ask Rover Assistant note

**Files:**
- Modify: `content/ask/site-build.json` (`$comment` topic list, `asOf`, `text.en`, `text.id`, `keywords`), `functions/_lib/scope.ts:30-39` (one `SITE` pattern), `tests/ask/golden.json` (`$comment`, `passThreshold`, q77, q78), `tests/ask/scope.test.ts:239` (the site set)
- Test: `tests/ask/scope.test.ts`, `tests/ask/golden-facts.test.ts`, `tests/ask/pack.test.ts`, `tests/content/safety.test.ts`

**Interfaces:**
- Consumes: nothing from the UI tasks.
- Produces: `isSiteQuestion("What is the Agent Office?") === true`; the `site-build` chunk mentions "Agent Office".

- [ ] **Step 1: Write the failing tests**

In `tests/ask/scope.test.ts`, change the site set on line 239 to:

```ts
    const site = new Set(["q45", "q46", "q47", "q69", "q70", "q76", "q77", "q78"]);
```

and add in the same `describe`:

```ts
  it.each(["What is the Agent Office?", "Is the agent office live?", "Apa itu Agent Office?", "Apakah kantor agen itu langsung?"])("treats %s as a site question", (q) => {
    expect(isSiteQuestion(q)).toBe(true);
  });
```

In `tests/ask/golden.json`, append to `items`:

```json
    {"id": "q77", "lang": "en", "q": "What is the Agent Office in the Lobby?", "facts": ["Agent Office"], "expect": {"any": ["agent", "rover", "copilot", "claude", "codex"]}},
    {"id": "q78", "lang": "id", "q": "Apakah Agent Office itu langsung?", "facts": ["Agent Office"], "expect": {"any": ["langsung", "live", "github", "hook"]}}
```

and raise `passThreshold` from 73 to 75; append to `$comment`: ` 2 Agent Office questions (q77 and q78, 2026-10-19): what it is and whether it is live.`

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/ask/scope.test.ts tests/ask/golden-facts.test.ts`
Expected: FAIL: "What is the Agent Office?" is not a site question, and the fact "Agent Office" is missing from the pack.

- [ ] **Step 3: Add the knowledge and the scope pattern**

In `functions/_lib/scope.ts`, add to `SITE` after the engine room pattern:

```ts
  /\bagent office\b|\bkantor agen\b/i,
```

In `content/ask/site-build.json`:

- set `"asOf"` to the PR's date;
- append to `text.en`: ` The Lobby's Agent Office shows the AI coding agents Kurniadi works with (GitHub Copilot, Claude Code and OpenAI Codex) as Rovers at five desks, live from his machine through agent hooks: each Rover shows a state (working, thinking, reviewing, running tests, waiting on CI, needs Kurniadi, done, CI failed or asleep) and the activity type. Task titles appear only for allowlisted public repositories; private work shows "Client project", and code, prompts, file paths and client names never leave his machine. A screen wall adds public GitHub activity (CI runs, pull requests, deploys) from repository webhooks; when no agent reports, the office is semi-live and the Rovers sleep. The Classic home page shows the same office as the Live Agent Office card.`
- append to `text.id`: ` Agent Office di Lobi menampilkan agen AI coding yang bekerja bersama Kurniadi (GitHub Copilot, Claude Code, dan OpenAI Codex) sebagai Rover di lima meja, langsung dari mesinnya melalui hook agen: setiap Rover menunjukkan status (bekerja, berpikir, meninjau, menjalankan tes, menunggu CI, menunggu Kurniadi, selesai, CI gagal, atau tidur) dan jenis aktivitasnya. Judul tugas hanya muncul untuk repositori publik yang diizinkan; pekerjaan privat tampil sebagai "Proyek klien", dan kode, prompt, path file, serta nama klien tidak pernah meninggalkan mesinnya. Dinding layar menambahkan aktivitas GitHub publik (CI run, pull request, deploy) dari webhook repositori; saat tidak ada agen yang melapor, kantor menjadi semi-langsung dan para Rover tidur. Halaman utama Situs Klasik menampilkan kantor yang sama sebagai kartu Kantor Agen Langsung.`
- add to `keywords`: `"agent office"`, `"kantor agen"`, `"live agents"`, `"agen langsung"`, `"openai codex"`;
- in `$comment`, change "and the secret B1 Engine Room" to "the secret B1 Engine Room and the Agent Office".

- [ ] **Step 4: Run the Ask and content tests**

Run: `bunx vitest run tests/ask tests/content && bun scripts/build-knowledge.ts`
Expected: PASS; the pack builds under `PACK_MAX_BYTES`. `PROMPT_VERSION` stays unchanged (no prompt change).

- [ ] **Step 5: Commit**

```bash
git add content/ask/site-build.json functions/_lib/scope.ts tests/ask/golden.json tests/ask/scope.test.ts
git commit -m "feat(ask): Ask Rover Assistant knows the Agent Office"
```

### Task 5: Docs, verification and the PR

**Files:**
- Modify: `docs/agents/office.md` (a "Classic card and Ask" section), `docs/agents/page-view.md` (`## Landing (home hero)`: a bullet for the section order), `docs/features.md` (`## Classic site` bullet and a Status row), this plan's `Status:` line; part 1's spec table row in `docs/superpowers/README.md` to `implemented` with the four PR links once this merges
- Test: `tests/unit/agents-md.test.ts`, `tests/unit/docs-index.test.ts`

- [ ] **Step 1: Write the docs**

Append to `docs/agents/office.md`:

```markdown
## Classic card and Ask

- `#office` on the Classic home page, after `#intro`: `OfficeSection` (server, strings as props from `office.classic.*`
  and the shared `office.*` labels), `OfficeLazy` (client shell, under 1 KB) and the lazy `OfficePanel` chunk.
- The panel loads when the section is within a screen of the viewport, polls through `createOfficePoller` only while
  it is near the viewport and the tab is visible, and hides the section when the office is disabled.
- Tests: `tests/unit/office-card-labels.test.ts`, `tests/hud/OfficePanel.test.tsx`, `e2e/office-classic.spec.ts`
  (mocks `/api/office`; `OFFICE_SHOTS=<dir>` writes the review captures).
- Ask: one paragraph in `content/ask/site-build.json`; "Agent Office" questions are site questions (`SITE` in
  `functions/_lib/scope.ts`); golden q77 and q78. Never put live office data in the pack.
```

In `docs/agents/page-view.md`, under `## Landing (home hero)`, add:

```markdown
- Section order after the hero: Selected work, the intro (bio and status), the Live Agent Office (`#office`, lazy,
  [office.md](office.md#classic-card-and-ask)), Journey, Writing, Skills, Certifications, Contact.
```

In `docs/features.md`, under `## Classic site`, add:

```markdown
- Live Agent Office (`/#office`): the L1 office as a card: counts, the agents at their desks with their activity
  ("Client project" for private work), the latest public GitHub activity, today's numbers and the privacy note; it
  loads and polls only while on screen.
```

and a Status row:

```markdown
| Agent Office, part 4 (Classic and Ask) | 2026-10-19: the Live Agent Office card on the Classic home page, and Ask Rover Assistant can explain the office | In review |
```

- [ ] **Step 2: Verify everything**

Run: `bun run verify:quick && bun run e2e:changed`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/agents/office.md docs/agents/page-view.md docs/features.md docs/superpowers/plans/2026-10-19-agent-office-classic.md
git commit -m "docs(office): Classic card and Ask note"
```

- [ ] **Step 4: Push and open the PR**

Check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` (at most 2 runs, no `main` run), push, and open a
ready-for-review PR `feat(office): Live Agent Office card on the Classic site and an Ask note` with the captures list,
the `/en` and `/id` script and document numbers before and after, and "waiting for owner review of the captures".

## Self-review

- Spec coverage: 4.2 (card on the home page, EN and ID, counts, active agents with activity, latest GitHub events,
  privacy note, reads `/api/office`) in Tasks 1 to 3; the correction on the Classic budget (lazy panel, poll only when
  visible) in Task 2; 4.3 (Ask note, no live data) in Task 4; 8 (offline after 60 s, disabled hides) through part 3's
  poller and Task 2; 9 (Classic card e2e with mocked API, offline and semi-live) in Tasks 2 and 3; captures in Task 3.
- Placeholder scan: the only conditional step is the colour class check in Task 2, which names the exact files and the
  fallback.
- Type consistency: `OfficeCardLabels`, `OfficePanelProps`, `OfficeFeed`, `OfficeFeedStatus`, `OfficePoller`,
  `officeCounts`, `deskTitle`, `STATE_TONE` and `sinceLabel` match part 3's shared modules.

## Owner actions

1. Review the 12 captures (6 states at 1440x900 and 390x844) and approve before merge.
2. Optional: ask Rover Assistant "What is the Agent Office?" on the preview after the PR's Ask eval.
