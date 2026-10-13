# R5 P10: Accent Stripes Replaced Sitewide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every colored left or top edge stripe from the site (Page View, HUD, Cmd-K, dialogs; the OG bar is P9's) and mark state and category with a small colored dot or icon chip next to the label plus a subtle full-outline glow on hover or selection, with cards keeping one uniform neutral hairline border.

**Architecture:** One shared primitive pair: `AccentDot` (`src/components/AccentDot.tsx`, CSS `.hq-dot`, `.hq-dot-md`, `.hq-dot-glow`) for the colored marker and the Tailwind utility `hq-glow` (full hairline outline plus soft glow on `:hover`, `:focus-visible`, `[aria-current="true"]`, `[aria-selected="true"]`). Five concrete stripes are replaced (Cmd-K selected row, featured certification cards, certification preview card, case study table of contents, MDX blockquote). Two guards keep stripes out for good: a static scanner over `src` (Vitest, a ratchet list that shrinks task by task) and a runtime computed-style audit (`e2e/edge-audit.ts`) on every Page View template, the palette, the Ask dock, the certification preview, the Glass Drawer and the 3D HUD. A reusable capture and pixel-diff harness (`e2e/region-diff.ts`, canvas in Chromium, no new dependency) proves that only the edited elements changed.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript strict, Tailwind CSS 4 (`@utility`, `@layer components`), Vitest 5 + Testing Library (jsdom), Playwright 1.64, Bun 1.4.

## Global Constraints

- Repo `ShinyQ/ShinyQ-HQ`, planned against `main` @ `f61fbba`. Work in a fresh worktree (`git worktree add ../hq-p10 -b r5/p10-accent-stripes origin/main`), never in the read-only reference clone `files/hq-local`. Read `AGENTS.md` (Hard rules, Styling, Page View, Fast verification) and `README.md` first.
- Owner request (verbatim): "I dont like the left side border colored or top colored remove that from all of my apps and change with other thing".
- Decision (confirmed): remove every colored left/top accent stripe and replace it with a small colored dot or icon chip next to the label, plus a subtle full-outline glow on hover/selection; cards keep a uniform hairline border (neutral `--color-line`). This is an explicit owner-requested visual change: screenshot diffs may differ only at those elements; everything else must match.
- Neutral structural dividers stay: `--color-line` (`rgb(255 255 255 / 0.09)`), `--color-line-2` (`rgb(255 255 255 / 0.16)`), `--color-glass-border` (`#27272a`), the white 5% inset highlight of `.glass`, and the green terminal's own `terminal-fg/25` rules. Bottom indicators (active nav link, phone tabs, drawer tabs) are not left/top edges and stay (see "Not changed" in the inventory).
- The aesthetic must not change outside the edited elements. Every pixel-affecting task is covered by the before/after screenshot diff in Task 8: desktop 1440x900 and 2560x1440, phone 390x844, same scroll positions and states. Threshold: per-channel tolerance 24/255; changed pixels outside the edited elements (padded 24 px for glows) at most 0.05% of each shot; any change in shot size (a layout shift) fails; shots that list edited elements must show a change.
- Never remove the rover, neon look, bloom, holograms, missions or the intro. No 3D scene file changes in this workstream (the in-world neon edges are the look; see the inventory's 3D section and the open question for the owner).
- Keep Lighthouse CI budgets green (LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB) and render budgets (< 150 draw calls, < 30k triangles). This plan adds about 1 KB of raw CSS and a few hundred bytes of JS; measure before and after with the same commands (Task 1 and Task 8) and record both in the PR body.
- Accessibility: keyboard `:focus-visible` keeps the global 2 px cyan outline (`globals.css:89-93`); the palette's selected row stays obvious (tinted fill, full cyan hairline, glowing cyan dot, ink text); dots are decorative (`aria-hidden`) because the label next to them carries the meaning; touch targets stay at least 44 px.
- No em dashes (U+2014) anywhere: code, comments, docs, commits, PR text. EN/ID: this plan adds no UI strings.
- Accent classes come from the static maps in `src/lib/accent.ts` (Tailwind must see every class at build time).
- Fast verification before every push: `bun run verify:quick`, then `E2E_PORT=4439 bun run e2e:changed`. Port 4439 for every local e2e and screenshot run in this workstream.
- Parallel round 5 workstreams touching the same files (rebase notes in "Cross-workstream coordination"): P1 (featured cards grid, `Featured.tsx`, `landing.css`, `pageview.css`), P3 (`globals.css` `.glass`/`.glass-solid`, palette search), P9 (`src/lib/og.tsx` left bar), P2/P4 (screenshot-diff gates may reuse `e2e/region-diff.ts`), all (README, AGENTS.md).

---

## Inventory of edge accents (main @ f61fbba)

Found with the static scanner of Task 3 (run against `src` it reports exactly the six "Replace" rows), the runtime audit of Task 3 (run against the built site: ToC, blockquotes and palette flagged; drawer and HUD clean at 1440x900 and 390x844), and manual greps for `border-l-`, `border-t-[0-9]`, `border-s`, `before:`/`after:`, `::before`/`::after`, `borderLeft`/`borderTop`, `inset Npx 0`, thin absolute bars (`w-0.5`, `w-1`, `w-px`, `h-0.5`, `h-1`, `h-px`) and `divide-`.

### Replace (colored left or top edge)

| # | Where | What | Replacement (task) |
|---|---|---|---|
| 1 | `src/hud/CommandPalette.tsx:245-247` | Selected row `border-l-2` + `border-cyan bg-cyan/10` (Cmd-K, every page and the 3D HUD) | Full 1 px cyan hairline, `bg-cyan/10`, soft cyan glow, glowing cyan `AccentDot` before the title; idle rows show a neutral `line` dot (Task 4) |
| 2 | `src/components/certs/Certifications.tsx:19` | Featured certification card: `absolute inset-x-0 top-0 h-0.5 bg-cyan/70` top bar (home `#certifications`, About, Quick view, `/id`) | Bar removed; the issuer logo (`IssuerMark`) is the icon chip next to the label; `hq-glow` outline glow on hover and keyboard focus (Task 5) |
| 3 | `src/components/certs/CertDialog.tsx:10,23` | Certification preview card: top bar `RULE[cert.status]` (cyan, amber, ink-3) | Bar removed; status keeps its colored chip next to the "Status" label (`pv-mark` + `STATUS_CLASS`, `CertDialog.tsx:46`) (Task 5) |
| 4 | `src/app/pageview.css:383-404` | Case study ToC: neutral 1 px left rail per link (L389) and `border-left-color: var(--color-violet)` on the current section (L403) | Rail removed; a 6 px dot per link (neutral `line-2`; violet with a halo for the current section) and a full violet hairline with a soft glow around the current link (Task 6) |
| 5 | `src/app/globals.css:242-247` | `.prose-hq blockquote { border-left: 2px solid var(--color-violet) }` (MDX quotes; today only `content/blog/the-sun-the-moon-and-the-dark-sea.id.mdx`) | A glowing 7 px violet dot on the first line in the same 18 px gutter (text start and wrapping unchanged) (Task 7) |
| 6 | `src/lib/og.tsx:110` | OG image left edge bar (`left: 0, top: 0, bottom: 0, width: 10`, accent color) | Owned by P9 (cinematic OG redesign). Listed in the static ratchet so it cannot spread; whichever of P9/P10 merges second deletes the ratchet entry |

### Not changed: neutral structural rules (kept)

| Where | What |
|---|---|
| `src/app/pageview.css:200-207` | `.pv-rows > li { border-top: 1px solid var(--color-line) }` and the closing bottom rule: the ruled rows of home work rows, `/labs`, `/journey`, `/library` |
| `src/app/[locale]/journey/page.tsx:62` | `[&>li:first-child]:border-line-2` first rule of each year |
| `src/components/page/Case.tsx:8,10,28,32` | `FactRow` and `MetricLedger` grid dividers (`border-y/t/l border-line`, the `border-t-0`/`border-l-0` responsive variants) |
| `src/components/page/Work.tsx:75`, `src/components/page/About.tsx:36`, `src/app/[locale]/blog/[slug]/page.tsx:77`, `src/app/[locale]/page.tsx:102` (`divide-line`) | Section dividers in `border-line` |
| `src/components/SiteHeader.tsx:23,63`, `src/components/SiteFooter.tsx:26,69`, `src/components/docs/PageViewer.tsx:107,167`, `src/components/paper/PaperReader.tsx:85`, `src/components/paper/PaperDialog.tsx:83`, `src/components/cv/CvViewer.tsx:51`, `src/hud/pads/PadPicker.tsx:44` | Header, footer and toolbar rules in `border-line` |
| `src/components/Modal.tsx:87`, `src/hud/ask/AskChat.tsx:167` | Phone bottom sheets keep only their top glass edge (`.glass` `--color-line`) |
| `src/hud/drawer/RoomDrawer.tsx:496,580,603,607` | Drawer bar, tab strip, README body and footer rules in `border-glass-border` |
| `src/hud/CommandPalette.tsx:157,273` | Input row bottom rule (cyan only on `focus-within`, bottom side only) and hint rule in `border-glass-border` |
| `src/hud/ask/AskChat.tsx:198,304,404` | Ask dock header/footer rules and the `border-l border-line` divider inside a suggestion pill |
| `src/hud/ProfileCard.tsx:47` | `border-t border-glass-border` |
| `src/hud/RoverTerminal.tsx:230,233,303` | Monochrome green terminal: its own `terminal-fg/25` rules and full `terminal-fg/40` frame (structural, not an accent; the scanner does not treat `terminal-fg` as an accent) |
| `src/app/globals.css:120`, `src/hud/RoverTerminal.tsx:230` | `inset 0 1px 0 rgb(255 255 255 / 0.05)` glass highlight (white 5%) |
| `src/components/page/WorkIndex.tsx:59` | `h-6 w-px bg-line` filter separator |

### Not changed: bottom indicators, functional bars, full outlines, existing dots

| Where | What | Why kept |
|---|---|---|
| `src/app/pageview.css:284-292,307-315` | 2 px rule under the active nav link and the active phone tab (`--pv-accent`) | Bottom indicator, not a left/top stripe (open question 2) |
| `src/hud/drawer/RoomDrawer.tsx:593-594` | Active drawer tab `border-b-2 border-cyan` | Same |
| `src/hud/walk/WalkBar.tsx:196-197` | Amber walk progress meter (in flow) | A meter, not an edge |
| `src/app/globals.css:350-356` `.hq-boot-bar`, `src/app/landing.css:72-96` `.hx-packet` | Boot scan bar, hero data packets | Animation, not an edge |
| `src/components/Chip.tsx:16-19`, `src/components/ArchitectureDiagram.tsx:6-10`, `src/hud/drawer/RoomDrawer.tsx:45-50,262,291,634,642`, `src/hud/ElevatorPanel.tsx:11-15,48`, `src/hud/ask/AskPill.tsx:24`, `src/hud/ask/AskDock.tsx:137,150`, `src/hud/drawer/HighlightsBody.tsx:19`, `src/hud/drawer/ResearchBody.tsx:96`, `src/hud/drawer/RoofBody.tsx:16,72,103`, `src/hud/walk/WalkBar.tsx:207`, `src/hud/BoostButton.tsx:45`, `src/hud/dialog/DialogBox.tsx:176`, `.hq-dialog` (`globals.css:408-415`), `.hx-card:hover .pv-shot` (`landing.css:285-288`) | Colored full outlines and glows | Already the target pattern |
| `src/hud/drawer/RoomDrawer.tsx:498-499` | Drawer bar accent dot (`ACCENT_DOT`) | Already a dot; refactored onto `AccentDot` (Task 2, pixel-identical) |
| `src/components/page/Layout.tsx:10-16`, `src/app/pageview.css:115-129` | `Marker` / `TypeMarker` (`.pv-mark`, 7 px square in the text color) on featured cards, work rows, journey rows, floor markers | Already the "dot next to the label" pattern; unchanged |
| `src/hud/HologramOverlay.tsx`, `src/hud/ProfileCard.tsx`, `src/hud/dialog/*`, `src/hud/walk/*`, `src/hud/Hud.tsx`, `src/hud/Controls.tsx` | No edge accents (scanner clean; HUD audit clean) | Guarded from now on |

### Not changed: 3D in-world neon (round 5 rule: the look is fixed)

| Where | What |
|---|---|
| `src/experience/floors/lobby/StatsRing.tsx:110-113` | "Accent glow line along the top edge" of each L1 stats tile (in-world mesh) |
| `src/experience/fx/materials.ts:18` | Glass wall shader "bright top band" |
| `src/experience/tower/primitives.tsx:45`, `src/experience/floors/lobby/CertWall.tsx:155` | Neon rim bars on every box edge (full outlines), cert wall top and bottom rims |

These are part of the neon look the round 5 rules protect, and P2 owns `StatsRing` labels this round. Open question 1 asks the owner whether the stats tiles' top line should follow the new rule in a later 3D pass.

### Prototypes and mockups

- `docs/design/pageview/pageview.css:335-336`: the Page View mockup ToC uses the same violet left rule. Updated in Task 6 so the mockup matches the app (this also triggers the Screenshots workflow on the PR, which is wanted).
- `docs/prototypes/agent-hq-v0.html:71` (`.hl` left border): historical v0 prototype, not shipped, left as is.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `e2e/region-diff.ts` (create) | Reusable capture (`captureShot`) and canvas pixel diff (`diffPair`, `diffShotDirs`) with allowed regions | 1 |
| `e2e/pageview-visual.spec.ts` (modify) | Opt-in "P10 accent stripes" captures (`P10_SHOTS=before|after`) and the diff gate (`P10_SHOTS=diff`) | 1 |
| `docs/superpowers/plans/2026-10-13-accent-stripes.md` (create) | Copy of this plan in the repo | 1 |
| `src/components/AccentDot.tsx` (create) | The colored dot next to a label (`AccentDot`, `DotTone`) | 2 |
| `src/app/globals.css` (modify) | `.hq-dot*` components, `@utility hq-glow`, blockquote marker | 2, 7 |
| `src/hud/drawer/RoomDrawer.tsx:12,499` (modify) | Drawer bar dot on `AccentDot` | 2 |
| `tests/hud/AccentDot.test.tsx` (create), `tests/hud/RoomDrawer.test.tsx` (modify) | Primitive and drawer dot tests | 2 |
| `tests/helpers/edge-accents.ts` (create) | Static scanner (`scanTree`, `scanFile`, `scanCss`) | 3 |
| `tests/unit/edge-accents.test.ts` (create) | Detector self-tests and the `src` ratchet (`KNOWN`) | 3 to 7 |
| `e2e/edge-audit.ts` (create) | Runtime computed-style audit (`findEdgeAccents`) | 3 |
| `e2e/pageview.spec.ts` (modify) | Edge audits for every template, Ask dock, palette, certification preview (`P10_PENDING` ratchet) | 3 to 7 |
| `e2e/drawer-solid.spec.ts` (modify) | Edge audit of the Glass Drawer and the 3D HUD at 3 viewports | 3 |
| `src/hud/CommandPalette.tsx:225-250` (modify), `tests/hud/CommandPalette.test.tsx` (modify) | Selected row | 4 |
| `src/components/certs/Certifications.tsx:11-31`, `src/components/certs/CertDialog.tsx:10,23` (modify), `tests/hud/CertDialog.test.tsx` (create) | Certification cards and preview | 5 |
| `src/app/pageview.css:383-404` (modify), `docs/design/pageview/pageview.css:335-336` (modify) | ToC | 6 |
| `AGENTS.md`, `README.md`, `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md`, `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md`, `docs/superpowers/specs/2026-10-11-certifications-layout-design.md` (modify) | Styling rule, guards, spec appendices | 8 |

No dependency, `package.json`, `playwright.config.ts` or `scripts/e2e-plan.ts` change: the new e2e helpers are plain modules (unmatched paths fall back to the smoke specs in `e2e:changed`), and the captures live in the already opt-in `pageview-visual.spec.ts` (mapped to no e2e run).

---
### Task 1: Capture harness and baseline (before) screenshots and bytes

Records the look of `main` before any source change: full pages, the states the change touches (case study ToC with a current section, Cmd-K with a selected row, certification preview) and the states it must leave alone (Ask dock, Glass Drawer, rows). No `src` change in this task.

**Files:**
- Create: `e2e/region-diff.ts`
- Modify: `e2e/pageview-visual.spec.ts` (imports at the top, new describe block at the end)
- Create: `docs/superpowers/plans/2026-10-13-accent-stripes.md` (copy of this plan)

**Interfaces:**
- Consumes: `asReturningVisitor`, `waitForHQ`, `waitForPhase` from `e2e/hq.ts`; `heroPod` from `e2e/routes.ts`.
- Produces: `captureShot(page: Page, dir: string, name: string, options: ShotOptions): Promise<void>`; `diffShotDirs(page: Page, beforeDir: string, afterDir: string, outDir: string, options: DiffOptions): Promise<DiffRow[]>`; `interface Box { x; y; w; h }`; `interface ShotOptions { kind: "page" | "viewport" | "element"; element?: Locator; changes?: readonly string[] }`; `interface DiffOptions { tolerance: number; pad: number }`; `interface DiffRow { name; width; height; changed; outside; ratio; expected; sizeMismatch? }`. Captures land in `screenshots/p10/{before,after}/<scene>-<w>x<h>.png` plus `.json` (`{ regions }`); the diff writes `screenshots/p10/diff/*.diff.png`, `report.json`, `report.md`. `/screenshots/` is gitignored.

- [ ] **Step 1: Create the capture and diff harness**

Create `e2e/region-diff.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";

/**
 * Before/after screenshot captures and a pixel diff that runs in Chromium (canvas), so no image
 * library is needed. Each capture stores the PNG plus the boxes of the elements the change is
 * allowed to touch; the diff fails when pixels change outside those boxes (R5 P10, reusable).
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotOptions {
  /** `page`: full page (capped at 8000 px tall), `viewport`: what is on screen, `element`: one locator. */
  kind: "page" | "viewport" | "element";
  element?: Locator;
  /** Selectors of the elements this change may repaint (empty: the shot must not change). */
  changes?: readonly string[];
}

/** SwiftShader cannot capture very tall pages (the Journey), so full captures stop here. */
const MAX_HEIGHT = 8_000;

/** Saves `<dir>/<name>.png` and `<dir>/<name>.json` (`{ regions }` in the PNG's pixel space). */
export async function captureShot(page: Page, dir: string, name: string, { kind, element, changes = [] }: ShotOptions) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  let origin = { x: 0, y: 0 };
  if (kind === "element") {
    const box = await element!.boundingBox();
    origin = { x: box!.x, y: box!.y };
    await element!.screenshot({ path: file, animations: "disabled" });
  } else if (kind === "page") {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const width = page.viewportSize()!.width;
    await page.screenshot({ path: file, fullPage: true, animations: "disabled", clip: { x: 0, y: 0, width, height: Math.min(height, MAX_HEIGHT) } });
  } else {
    await page.screenshot({ path: file, animations: "disabled" });
  }
  const regions = await page.evaluate(
    ({ selectors, docCoords, origin }) =>
      selectors
        .flatMap((selector) =>
          [...document.querySelectorAll(selector)].map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + (docCoords ? window.scrollX : 0) - origin.x, y: r.y + (docCoords ? window.scrollY : 0) - origin.y, w: r.width, h: r.height };
          }),
        )
        .filter((r) => r.w > 0 && r.h > 0),
    { selectors: [...changes], docCoords: kind === "page", origin },
  );
  writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify({ regions }, null, 2)}\n`);
}

export interface DiffRow {
  name: string;
  width: number;
  height: number;
  /** Pixels whose largest channel difference exceeds the tolerance. */
  changed: number;
  /** Changed pixels outside every allowed region (padded). */
  outside: number;
  /** `outside / (width * height)`. */
  ratio: number;
  /** The capture listed elements the change may repaint, so it must differ somewhere. */
  expected: boolean;
  /** Set when the two PNGs differ in size (a layout shift): the shot fails. */
  sizeMismatch?: string;
}

export interface DiffOptions {
  /** Largest per-channel difference (0 to 255) that still counts as equal; absorbs anti-aliasing. */
  tolerance: number;
  /** Padding around each allowed region, for glows and outlines (px). */
  pad: number;
}

/** Diffs one pair in the page; returns counts and a PNG (after, dimmed; yellow = allowed change, red = unexpected). */
export async function diffPair(page: Page, before: Buffer, after: Buffer, regions: Box[], { tolerance, pad }: DiffOptions) {
  return page.evaluate(
    async ({ a, b, regions, tolerance, pad }) => {
      const load = async (data: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { width: ib.width, height: ib.height, changed: -1, outside: -1, png: "", sizeMismatch: `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}` };
      }
      const { width, height } = ia;
      const boxes = regions.map((r) => ({ x0: r.x - pad, y0: r.y - pad, x1: r.x + r.w + pad, y1: r.y + r.h + pad }));
      const allowed = (x: number, y: number) => boxes.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
      const BAND = 512;
      const ca = new OffscreenCanvas(width, BAND).getContext("2d", { willReadFrequently: true })!;
      const cb = new OffscreenCanvas(width, BAND).getContext("2d", { willReadFrequently: true })!;
      const out = new OffscreenCanvas(width, height);
      const co = out.getContext("2d")!;
      let changed = 0;
      let outside = 0;
      for (let y0 = 0; y0 < height; y0 += BAND) {
        const h = Math.min(BAND, height - y0);
        ca.clearRect(0, 0, width, BAND);
        cb.clearRect(0, 0, width, BAND);
        ca.drawImage(ia, 0, y0, width, h, 0, 0, width, h);
        cb.drawImage(ib, 0, y0, width, h, 0, 0, width, h);
        const da = ca.getImageData(0, 0, width, h).data;
        const img = cb.getImageData(0, 0, width, h);
        const db = img.data;
        for (let i = 0; i < db.length; i += 4) {
          const diff = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
          if (diff > tolerance) {
            changed++;
            const p = i / 4;
            const ok = allowed(p % width, y0 + Math.floor(p / width));
            if (!ok) outside++;
            db[i] = 255;
            db[i + 1] = ok ? 200 : 0;
            db[i + 2] = 0;
            db[i + 3] = 255;
          } else {
            db[i] = db[i] * 0.3;
            db[i + 1] = db[i + 1] * 0.3;
            db[i + 2] = db[i + 2] * 0.3;
          }
        }
        co.putImageData(img, 0, y0);
      }
      const blob = await out.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { width, height, changed, outside, png: btoa(binary), sizeMismatch: undefined as string | undefined };
    },
    { a: before.toString("base64"), b: after.toString("base64"), regions, tolerance, pad },
  );
}

/** Diffs every `<name>.png` present in both folders; writes `<outDir>/<name>.diff.png` and `<outDir>/report.json`. */
export async function diffShotDirs(page: Page, beforeDir: string, afterDir: string, outDir: string, options: DiffOptions): Promise<DiffRow[]> {
  mkdirSync(outDir, { recursive: true });
  await page.setContent("<!doctype html><title>diff</title>");
  const rows: DiffRow[] = [];
  for (const file of readdirSync(afterDir).filter((f) => f.endsWith(".png")).sort()) {
    const name = file.slice(0, -4);
    if (!existsSync(path.join(beforeDir, file))) throw new Error(`no before capture for ${name}`);
    const meta = (dir: string): Box[] => JSON.parse(readFileSync(path.join(dir, `${name}.json`), "utf8")).regions;
    const regions = [...meta(beforeDir), ...meta(afterDir)];
    const r = await diffPair(page, readFileSync(path.join(beforeDir, file)), readFileSync(path.join(afterDir, file)), regions, options);
    if (r.png) writeFileSync(path.join(outDir, `${name}.diff.png`), Buffer.from(r.png, "base64"));
    rows.push({
      name,
      width: r.width,
      height: r.height,
      changed: r.changed,
      outside: r.outside,
      ratio: r.outside < 0 ? 1 : r.outside / (r.width * r.height),
      expected: regions.length > 0,
      ...(r.sizeMismatch ? { sizeMismatch: r.sizeMismatch } : {}),
    });
  }
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(rows, null, 2)}\n`);
  return rows;
}
```

(Planning note: this harness was exercised against a local build of `main`; a CSS-only change to the ToC and the blockquote produced 0 changed pixels outside the edited elements and 0 on `/en/labs`.)

- [ ] **Step 2: Add the P10 captures and the diff gate to the opt-in visual spec**

In `e2e/pageview-visual.spec.ts`, replace the first two lines:

```ts
import { expect, test } from "@playwright/test";
import { heroPod } from "./routes";
```

with:

```ts
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, waitForHQ, waitForPhase } from "./hq";
import { heroPod } from "./routes";
import { captureShot, diffShotDirs } from "./region-diff";
```

Append at the end of the file:

```ts
/**
 * R5 P10 accent stripes (opt-in, SCREENSHOTS=1): `P10_SHOTS=before` on main and `P10_SHOTS=after` on the
 * branch capture the same scenes into screenshots/p10/<label>/; `P10_SHOTS=diff` compares them. Each
 * capture lists the elements P10 edits; pixels may only change inside those (padded 24 px for glows).
 */
const P10 = process.env.P10_SHOTS;
const P10_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
  { width: 390, height: 844 },
];
const QUOTE_POST = "/id/blog/the-sun-the-moon-and-the-dark-sea";
const CERT_CARDS = "#certifications .card[data-cert-open]";
const ASK_ON = JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 });
type HQ = { __hq: { store: { getState: () => { openRoom: (room: string) => void } } } };

async function openStatic(page: Page, path: string) {
  await page.goto(`${path}?tier=static`, { waitUntil: "networkidle" });
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  // Lazy images load before the capture, so before and after hold the same pixels.
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll("img")) img.loading = "eager";
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((done) => img.addEventListener("loadend", done, { once: true })))));
    await document.fonts.ready;
  });
}

async function scrollToSection(page: Page, id: string) {
  await page.evaluate((target) => {
    const el = document.getElementById(target)!;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
  }, id);
}

test.describe("P10 accent stripes", () => {
  test.skip(!P10, "Set P10_SHOTS=before|after|diff");

  for (const v of P10_VIEWPORTS) {
    test(`P10 capture ${v.width}x${v.height}`, async ({ browser }) => {
      test.skip(P10 === "diff", "diff run");
      test.setTimeout(600_000);
      const dir = `screenshots/p10/${P10}`;
      const tag = `${v.width}x${v.height}`;
      const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await context.addInitScript(() => {
        localStorage.setItem("hq:terminal-seen", "1");
        localStorage.setItem("hq:onboarded", "done");
        localStorage.setItem("hq:hints", "off");
        sessionStorage.setItem("hq:ask-teaser", "1");
      });
      await context.route("**/api/ask", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ASK_ON }));
      const page = await context.newPage();

      await openStatic(page, "/en");
      await captureShot(page, dir, `home-${tag}`, { kind: "page", changes: [CERT_CARDS] });
      await scrollToSection(page, "work");
      await captureShot(page, dir, `home-work-${tag}`, { kind: "viewport" });
      await scrollToSection(page, "certifications");
      await captureShot(page, dir, `home-certs-${tag}`, { kind: "viewport", changes: [CERT_CARDS] });

      await openStatic(page, "/en/labs");
      await captureShot(page, dir, `labs-${tag}`, { kind: "page" });

      await openStatic(page, `/en/labs/${heroPod.slug}`);
      await captureShot(page, dir, `case-${tag}`, { kind: "page", changes: [".pv-toc"] });
      if (v.width >= 1024) {
        await scrollToSection(page, "approach");
        await expect(page.locator(".pv-toc a[aria-current='true']")).toHaveCount(1);
        await captureShot(page, dir, `case-toc-${tag}`, { kind: "viewport", changes: [".pv-toc"] });
      }

      await openStatic(page, "/en/journey");
      await captureShot(page, dir, `journey-${tag}`, { kind: "page" });

      await openStatic(page, "/en/library");
      await captureShot(page, dir, `library-${tag}`, { kind: "page" });

      await openStatic(page, "/en/contact");
      await captureShot(page, dir, `about-${tag}`, { kind: "page", changes: [CERT_CARDS] });

      await openStatic(page, QUOTE_POST);
      await captureShot(page, dir, `quote-${tag}`, { kind: "page", changes: [".prose-hq blockquote"] });

      await openStatic(page, "/en");
      await page.locator(CERT_CARDS).first().click();
      await expect(page.getByTestId("cert-dialog")).toBeVisible();
      await captureShot(page, dir, `cert-dialog-${tag}`, { kind: "viewport", changes: ["[data-testid='cert-dialog']"] });

      await openStatic(page, "/en/journey");
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await captureShot(page, dir, `palette-${tag}`, { kind: "viewport", changes: ["[role='dialog']:has([role='listbox'])"] });

      await openStatic(page, "/en/labs");
      await page.getByTestId("ask-launcher").click();
      await expect(page.getByTestId("ask-dock")).toBeVisible();
      await captureShot(page, dir, `ask-${tag}`, { kind: "viewport" });
      await context.close();

      // Glass Drawer over the 3D tower (lite tier; phones get touch, as in drawer-solid.spec.ts).
      const phone = v.width < 500;
      const world = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: phone, hasTouch: phone });
      const p3 = await world.newPage();
      await asReturningVisitor(p3);
      await p3.goto("/en/labs?tier=lite");
      await waitForHQ(p3);
      await waitForPhase(p3, "explore");
      await p3.evaluate((room) => (window as unknown as HQ).__hq.store.getState().openRoom(room), `L3:${heroPod.slug}`);
      const drawer = p3.getByTestId("room-drawer");
      await expect(drawer).toBeVisible();
      await expect.poll(() => drawer.evaluate((el) => [...el.querySelectorAll("img")].every((img) => img.complete))).toBe(true);
      // Let the slide-in settle (same wait as drawer-solid.spec.ts).
      await p3.waitForTimeout(600);
      await captureShot(p3, dir, `drawer-${tag}`, { kind: "element", element: drawer });
      await world.close();
    });
  }

  test("P10 diff", async ({ page }) => {
    test.skip(P10 !== "diff", "capture run");
    test.setTimeout(900_000);
    const rows = await diffShotDirs(page, "screenshots/p10/before", "screenshots/p10/after", "screenshots/p10/diff", { tolerance: 24, pad: 24 });
    const table = [
      "| Shot | Size | Changed px | Outside edited elements | Ratio |",
      "|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.name} | ${r.sizeMismatch ?? `${r.width}x${r.height}`} | ${r.changed} | ${r.outside} | ${(r.ratio * 100).toFixed(3)}% |`),
    ];
    writeFileSync("screenshots/p10/diff/report.md", `${table.join("\n")}\n`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.sizeMismatch, `${r.name} changed size (layout shift)`).toBeUndefined();
      expect(r.ratio, `${r.name}: pixels changed outside the edited elements`).toBeLessThanOrEqual(0.0005);
      if (r.expected) expect(r.changed, `${r.name}: the edited elements should look different`).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Typecheck and lint the test-only change**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0 (no output from `tsc`; ESLint prints nothing).

- [ ] **Step 4: Build main and capture the "before" set**

Run:

```bash
rm -rf .next && bun run build
SCREENSHOTS=1 P10_SHOTS=before E2E_PORT=4439 bun run e2e e2e/pageview-visual.spec.ts -g "P10" --workers=1
ls screenshots/p10/before | wc -l
```

Expected: build exits 0; Playwright prints `3 passed` and `1 skipped` (the diff test); the count is `82`: 14 scenes x (PNG + JSON) at 1440x900 and at 2560x1440, and 13 x 2 at 390x844 (the ToC viewport shot is desktop only because the ToC is hidden below 1024 px).

- [ ] **Step 5: Record the byte baseline**

Run:

```bash
bun -e 'import { readFileSync, writeFileSync } from "node:fs"; import { brotliCompressSync } from "node:zlib"; const out = {}; for (const [k, pat] of [["css", "out/_next/static/**/*.css"], ["js", "out/_next/static/chunks/**/*.js"]]) { const files = [...new Bun.Glob(pat).scanSync(".")]; let raw = 0, br = 0; for (const f of files) { const b = readFileSync(f); raw += b.length; br += brotliCompressSync(b).length; } out[k] = { files: files.length, raw, br }; } writeFileSync("screenshots/p10/bytes-before.json", JSON.stringify(out, null, 2)); console.log(JSON.stringify(out));'
```

Expected: one JSON line such as `{"css":{"files":1,"raw":7xxxx,"br":1xxxx},"js":{...}}` (CSS brotli is about 11 to 13 KB, well under the 20 KB budget). Also note the `Lighthouse CI` job's stylesheet and script transfer sizes for the latest green `main` run (Actions > CI > Lighthouse CI > job summary) in the PR body draft.

- [ ] **Step 6: Copy this plan into the repo and commit**

```bash
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r5-p10-accent-stripes.md docs/superpowers/plans/2026-10-13-accent-stripes.md
git add e2e/region-diff.ts e2e/pageview-visual.spec.ts docs/superpowers/plans/2026-10-13-accent-stripes.md
git commit -m "P10: before/after capture and pixel diff harness for the accent stripe change"
```

### Task 2: Shared primitives: `AccentDot` and the `hq-glow` outline (drawer bar adopts the dot)

**Files:**
- Create: `src/components/AccentDot.tsx`
- Modify: `src/app/globals.css` (after `.card` at L193-197; end of file)
- Modify: `src/hud/drawer/RoomDrawer.tsx:12,499`
- Test: `tests/hud/AccentDot.test.tsx` (create), `tests/hud/RoomDrawer.test.tsx` (add one test)

**Interfaces:**
- Consumes: `ACCENT_TEXT` from `src/lib/accent.ts`; `Accent` type from `src/content/schema` (type-only import, no zod in the client bundle).
- Produces:
  - `export type DotTone = Accent | "muted" | "line"` (`muted` = `text-ink-3`, `line` = `text-line-2`, the idle marker).
  - `export function AccentDot(props: { tone: DotTone; size?: "sm" | "md"; glow?: boolean; className?: string }): JSX.Element`: a `span` with `aria-hidden="true"`, `data-accent-dot={tone}` and classes in this exact order: `hq-dot`, `hq-dot-md` (when `size="md"`), `hq-dot-glow` (when `glow`), the tone's text class, then `className`.
  - CSS components `.hq-dot` (6 px circle filled with `currentColor`), `.hq-dot-md` (8 px), `.hq-dot-glow` (`box-shadow: 0 0 8px currentColor`).
  - Tailwind utility `hq-glow`: on `:hover`, `:focus-visible`, `[aria-current="true"]` and `[aria-selected="true"]` the element's whole border turns `color-mix(in srgb, var(--hq-glow, var(--color-cyan)) 50%, transparent)` and gets `box-shadow: 0 0 24px -8px var(--hq-glow, var(--color-cyan))`; set `[--hq-glow:var(--color-violet)]` (or any token) to recolor. It never touches `outline`, so the global keyboard focus ring stays.

- [ ] **Step 1: Write the failing tests**

Create `tests/hud/AccentDot.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccentDot } from "@/components/AccentDot";

afterEach(() => cleanup());

describe("AccentDot", () => {
  it("is a decorative 6 px dot in the accent's text color", () => {
    const { container } = render(<AccentDot tone="violet" />);
    const dot = container.firstElementChild!;
    expect(dot.tagName).toBe("SPAN");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveAttribute("data-accent-dot", "violet");
    expect(dot.className).toBe("hq-dot text-violet");
  });

  it("supports the 8 px size, a glow, the neutral tones and extra classes", () => {
    const { container, rerender } = render(<AccentDot tone="line" size="md" glow className="invisible" />);
    expect(container.firstElementChild!.className).toBe("hq-dot hq-dot-md hq-dot-glow text-line-2 invisible");
    rerender(<AccentDot tone="muted" />);
    expect(container.firstElementChild!.className).toBe("hq-dot text-ink-3");
  });
});
```

In `tests/hud/RoomDrawer.test.tsx`, add inside `describe("RoomDrawer", () => {`, right after the `it("closes on Escape", ...)` test:

```tsx
  it("marks the room's accent with a dot in the bar, never an edge stripe (R5 P10)", () => {
    render(<Harness view={hero} />);
    const dot = screen.getByTestId("drawer-bar").querySelector("[data-accent-dot]");
    expect(dot).toHaveAttribute("data-accent-dot", hero.accent);
    expect(dot).toHaveClass("hq-dot", "hq-dot-md");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun run test tests/hud/AccentDot.test.tsx tests/hud/RoomDrawer.test.tsx`
Expected: FAIL. `AccentDot.test.tsx` fails to resolve `@/components/AccentDot`; the new RoomDrawer test fails with `expect(received).toHaveAttribute()` on `null` (the bar's dot has no `data-accent-dot` yet). The other RoomDrawer tests pass.

- [ ] **Step 3: Create the component**

Create `src/components/AccentDot.tsx`:

```tsx
import type { Accent } from "@/content/schema";
import { ACCENT_TEXT } from "@/lib/accent";

/** Accent colors plus two neutral tones: `muted` (ink-3) and `line` (an idle marker in line-2). */
export type DotTone = Accent | "muted" | "line";

const TONE_TEXT: Record<DotTone, string> = { ...ACCENT_TEXT, muted: "text-ink-3", line: "text-line-2" };

export interface AccentDotProps {
  tone: DotTone;
  /** `sm` 6 px (rows, lists), `md` 8 px (panel bars). */
  size?: "sm" | "md";
  /** A soft halo in the same color, for the selected or current item. */
  glow?: boolean;
  className?: string;
}

/**
 * The colored marker next to a label (R5 P10, owner decision 2026-10-13): state and category are never
 * drawn as a colored left or top edge. Decorative; the label next to it carries the meaning.
 */
export function AccentDot({ tone, size = "sm", glow = false, className = "" }: AccentDotProps) {
  const classes = ["hq-dot", size === "md" && "hq-dot-md", glow && "hq-dot-glow", TONE_TEXT[tone], className].filter(Boolean).join(" ");
  return <span aria-hidden="true" data-accent-dot={tone} className={classes} />;
}
```

- [ ] **Step 4: Add the CSS**

In `src/app/globals.css`, replace:

```css
  .card {
    border: 1px solid var(--color-line);
    border-radius: 12px;
    background: var(--color-surface);
  }
```

with:

```css
  .card {
    border: 1px solid var(--color-line);
    border-radius: 12px;
    background: var(--color-surface);
  }

  /* AccentDot (src/components/AccentDot.tsx): the colored marker next to a label, never an edge stripe. */
  .hq-dot {
    display: inline-block;
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }

  .hq-dot-md {
    width: 8px;
    height: 8px;
  }

  .hq-dot-glow {
    box-shadow: 0 0 8px currentColor;
  }
```

Append at the very end of `src/app/globals.css` (top level, outside any `@layer`):

```css

/*
 * Hover, keyboard focus, current and selected states light up the whole hairline with a soft glow
 * (R5 P10: never one colored edge). `--hq-glow` picks the color (default cyan). The global
 * :focus-visible outline stays on top for keyboard users.
 */
@utility hq-glow {
  transition-property: border-color, box-shadow, background-color;
  transition-duration: 150ms;
  transition-timing-function: var(--ease-standard);

  &:hover,
  &:focus-visible,
  &[aria-current="true"],
  &[aria-selected="true"] {
    border-color: color-mix(in srgb, var(--hq-glow, var(--color-cyan)) 50%, transparent);
    box-shadow: 0 0 24px -8px var(--hq-glow, var(--color-cyan));
  }
}
```

(Planning note: compiled with this repo's Tailwind 4 `@tailwindcss/node`; it lands in `@layer utilities`, so it wins over `.card` (components layer) and, at higher specificity, over `border-transparent`.)

- [ ] **Step 5: Move the drawer bar dot onto `AccentDot` (pixel-identical: 8 px circle in the same color)**

In `src/hud/drawer/RoomDrawer.tsx`, replace:

```tsx
import { ACCENT_DOT, ACCENT_TEXT } from "@/lib/accent";
```

with:

```tsx
import { AccentDot } from "@/components/AccentDot";
import { ACCENT_TEXT } from "@/lib/accent";
```

and replace:

```tsx
            <span className={`h-2 w-2 shrink-0 rounded-full ${ACCENT_DOT[view.accent]}`} aria-hidden="true" />
```

with:

```tsx
            <AccentDot tone={view.accent} size="md" />
```

(Keep the `@/components/AccentDot` import next to the other `@/` imports in the file's existing order; `ACCENT_DOT` stays exported from `src/lib/accent.ts` because P1 may use it.)

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun run test tests/hud/AccentDot.test.tsx tests/hud/RoomDrawer.test.tsx`
Expected: PASS, `Test Files  2 passed`.

- [ ] **Step 7: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/AccentDot.tsx src/app/globals.css src/hud/drawer/RoomDrawer.tsx tests/hud/AccentDot.test.tsx tests/hud/RoomDrawer.test.tsx
git commit -m "P10: AccentDot and hq-glow primitives; drawer bar dot uses AccentDot"
```

### Task 3: Guards: static scanner ratchet and runtime edge audit (regression guards for clean surfaces)

Two guards with the same rule. The static scanner reads `src` and fails on a new stripe; its `KNOWN` list holds the six stripes on `main` (inventory rows 1 to 6) and shrinks as Tasks 4 to 7 fix them. The runtime audit reads computed styles in the browser, so it also catches colors that come from class maps at run time. It runs on every Page View template (the pages that still have stripes sit in `P10_PENDING` and must still show one), the Ask dock, the Glass Drawer and the 3D HUD.

**Files:**
- Create: `tests/helpers/edge-accents.ts`, `tests/unit/edge-accents.test.ts`, `e2e/edge-audit.ts`
- Modify: `e2e/pageview.spec.ts` (import, constants, a new describe block at the end), `e2e/drawer-solid.spec.ts` (import, two assertions)

**Interfaces:**
- Consumes: `TEMPLATES`, `staticTier`, `openPage`, `heroPod` already in `e2e/pageview.spec.ts`.
- Produces:
  - `scanTree(repo: string, root?: string): EdgeAccent[]`, `scanFile(file: string, text: string): EdgeAccent[]`, `scanCss(file: string, text: string): EdgeAccent[]`, `interface EdgeAccent { file: string; line: number; id: string }` where `id` is `"<file>: <kind>: <detail>"` (no line number, so unrelated edits do not churn the ratchet).
  - `KNOWN` (ratchet, `tests/unit/edge-accents.test.ts`); Tasks 4 to 7 delete one entry each, P9 or this PR deletes the OG entry.
  - `findEdgeAccents(selector: string): string[]` (pass to `page.evaluate`); empty array means clean.
  - `P10_PENDING: Set<string>` and `QUOTE_POST` in `e2e/pageview.spec.ts`; Tasks 5 to 7 delete their paths.

- [ ] **Step 1: Write the static scanner**

Create `tests/helpers/edge-accents.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static guard for the owner's rule (R5 P10, 2026-10-13): no colored left or top edge stripe anywhere.
 * Color, state and category are marked with a dot or icon chip next to the label plus a full-outline
 * glow; neutral structural rules (`--color-line`, `--color-line-2`, `--color-glass-border`) stay.
 * The runtime twin is `e2e/edge-audit.ts`.
 */

/** Accent colors that must never mark a single left or top edge (`ink` too: a white stripe is still a stripe). */
const ACCENT = "(?:cyan|violet|pink|green|amber|blue|white|indigo|ink|current)";
const SIDE_CLASS = /(?:^|[\s"'`:])(border-(?:l|t|s|bs)(?:-(?:[1-9]\d*|\[[^\]]+\]))?)(?![\w-])/;
const ACCENT_BORDER_CLASS = new RegExp(`(?:^|[\\s"'\`:])(border-${ACCENT}(?:\\/\\d+)?)(?![\\w-])`);
const ACCENT_BG_CLASS = new RegExp(`(?:^|[\\s"'\`:])bg-${ACCENT}(?:\\/\\d+)?(?![\\w-])|\\$\\{`);
const THIN_H = /(?:^|\s)(h-(?:px|0\.5|1)|h-\[[1-4]px\])(?![\w.-])/;
const THIN_W = /(?:^|\s)(w-(?:px|0\.5|1)|w-\[[1-4]px\])(?![\w.-])/;
const has = (text: string, token: string) => new RegExp(`(?:^|[\\s"'\`:])${token}(?![\\w-])`).test(text);
const NEUTRAL = /var\(--color-(?:line|line-2|glass-border)\)|^\s*(?:0|none|transparent|inherit|initial|unset)\s*$|255[ ,_]+255[ ,_]+255|\b0[ ,_]+0[ ,_]+0\b/;

export interface EdgeAccent {
  file: string;
  line: number;
  /** Stable id for the ratchet list: `file: kind: detail` (no line number, so edits elsewhere do not churn it). */
  id: string;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Class strings (string and template literals) that pair a left/top border with an accent color, or draw a thin edge bar. */
export function scanClassStrings(file: string, text: string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  const literals = [...text.matchAll(/`[^`]*`/g), ...text.matchAll(/"[^"\n]*"/g)];
  const seen = new Set<string>();
  for (const m of literals) {
    const s = m[0];
    const side = SIDE_CLASS.exec(s)?.[1];
    const color = ACCENT_BORDER_CLASS.exec(s)?.[1];
    let detail: string | null = null;
    if (side && color) detail = `class: ${side} + ${color}`;
    if (!detail && has(s, "absolute") && ACCENT_BG_CLASS.test(s)) {
      const top = has(s, "top-0") && (has(s, "inset-x-0") || (has(s, "left-0") && has(s, "right-0")));
      const left = (has(s, "left-0") || has(s, "right-0")) && (has(s, "inset-y-0") || (has(s, "top-0") && has(s, "bottom-0")));
      const h = THIN_H.exec(s)?.[1];
      const w = THIN_W.exec(s)?.[1];
      if (top && h) detail = `bar: top ${h}`;
      else if (left && w) detail = `bar: side ${w}`;
    }
    if (!detail) continue;
    const id = `${file}: ${detail}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ file, line: lineOf(text, m.index ?? 0), id });
  }
  return out;
}

/** Inline style objects: a thin absolutely positioned bar on the left, right or top edge, or a borderLeft/borderTop accent. */
export function scanInlineStyles(file: string, text: string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  for (const m of text.matchAll(/style=\{\{([^{}]*)\}\}/g)) {
    const props = new Map([...m[1].matchAll(/(\w+):\s*([^,]+?)\s*(?:,|$)/g)].map((p) => [p[1], p[2].trim()]));
    const zero = (k: string) => props.get(k) === "0";
    const thin = (k: string) => Number(props.get(k)) > 0 && Number(props.get(k)) <= 12;
    let detail: string | null = null;
    if (props.get("position") === '"absolute"') {
      if ((zero("left") || zero("right")) && zero("top") && zero("bottom") && thin("width")) detail = `style: side bar width ${props.get("width")}`;
      else if (zero("top") && zero("left") && zero("right") && thin("height")) detail = `style: top bar height ${props.get("height")}`;
    }
    for (const key of ["borderLeft", "borderTop", "borderInlineStart", "borderLeftColor", "borderTopColor"]) {
      const value = props.get(key);
      if (value && !NEUTRAL.test(value)) detail = `style: ${key}`;
    }
    if (detail) out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: ${detail}` });
  }
  return out;
}

/** CSS: left/top border declarations with a non-neutral color, thin ::before/::after edge bars, inset edge shadows. */
export function scanCss(file: string, text: string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  for (const m of text.matchAll(/border-(?:left|top|inline-start|block-start)(?:-color)?\s*:\s*([^;{}]+);/g)) {
    if (NEUTRAL.test(m[1]) || /^\s*[\d.]+px\s+solid\s+var\(--color-(?:line|line-2|glass-border)\)\s*$/.test(m[1])) continue;
    out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: css: ${m[0].replace(/\s+/g, " ").trim()}` });
  }
  for (const m of text.matchAll(/([^{}]*::?(?:before|after)[^{}]*)\{([^{}]*)\}/g)) {
    const body = m[2];
    const decl = (k: string) => new RegExp(`(?:^|[;\\s])${k}\\s*:\\s*([^;]+);`).exec(body)?.[1].trim();
    if (decl("position") !== "absolute") continue;
    const px = (k: string) => Number.parseFloat(decl(k) ?? "NaN");
    const isZero = (k: string) => decl(k) === "0" || decl(k) === "0px";
    const sideBar = (isZero("left") || isZero("right")) && isZero("top") && isZero("bottom") && px("width") <= 4;
    const topBar = isZero("top") && isZero("left") && isZero("right") && px("height") <= 4;
    if (sideBar || topBar) out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: css bar: ${m[1].trim()}` });
  }
  out.push(...scanShadows(file, text, /box-shadow\s*:\s*([^;]+);/g, (s) => s));
  return out;
}

function scanShadows(file: string, text: string, pattern: RegExp, normalize: (s: string) => string): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  for (const m of text.matchAll(pattern)) {
    for (const part of normalize(m[1]).split(/,(?![^(]*\))/)) {
      if (!/\binset\b/.test(part)) continue;
      const rest = part.replace(/\binset\b/, "").trim();
      const nums = rest.match(/^(?:-?[\d.]+(?:px)?\s+){1,4}/)?.[0].trim().split(/\s+/).map((n) => Number.parseFloat(n)) ?? [];
      const [x = 0, y = 0, blur = 0] = nums;
      const color = rest.replace(/^(?:-?[\d.]+(?:px)?\s+){1,4}/, "");
      if ((x !== 0 || y !== 0) && blur <= 2 && !NEUTRAL.test(color)) out.push({ file, line: lineOf(text, m.index ?? 0), id: `${file}: inset shadow: ${part.trim()}` });
    }
  }
  return out;
}

/** Tailwind arbitrary shadows (`shadow-[inset_2px_0_0_var(--color-cyan)]`) in class strings. */
export function scanClassShadows(file: string, text: string): EdgeAccent[] {
  return scanShadows(file, text, /shadow-\[([^\]]+)\]/g, (s) => s.replace(/_/g, " "));
}

export function scanFile(file: string, text: string): EdgeAccent[] {
  if (file.endsWith(".css")) return scanCss(file, text);
  return [...scanClassStrings(file, text), ...scanInlineStyles(file, text), ...scanClassShadows(file, text)];
}

/** Every edge accent in the `.ts`, `.tsx` and `.css` files under `root` (repo-relative POSIX paths), test files excluded. */
export function scanTree(repo: string, root = "src"): EdgeAccent[] {
  const out: EdgeAccent[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(path.join(repo, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(path.join(repo, rel)).isDirectory()) walk(rel);
      else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(...scanFile(rel, readFileSync(path.join(repo, rel), "utf8")));
    }
  };
  walk(root);
  return out;
}
```

- [ ] **Step 2: Write the detector self-tests and the ratchet**

Create `tests/unit/edge-accents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scanCss, scanFile, scanTree } from "../helpers/edge-accents";

/**
 * Ratchet for R5 P10 (owner, 2026-10-13: "I dont like the left side border colored or top colored"):
 * the colored edge stripes still in `src`. Each P10 task deletes the entry it fixes; any new stripe,
 * or an entry whose stripe is gone, fails. The OG left bar belongs to P9 (cinematic OG redesign):
 * whichever of P9 and P10 merges second deletes that entry.
 */
const KNOWN = [
  "src/app/globals.css: css: border-left: 2px solid var(--color-violet);",
  "src/app/pageview.css: css: border-left-color: var(--color-violet);",
  "src/components/certs/CertDialog.tsx: bar: top h-0.5",
  "src/components/certs/Certifications.tsx: bar: top h-0.5",
  "src/hud/CommandPalette.tsx: class: border-l-2 + border-cyan",
  "src/lib/og.tsx: style: side bar width 10",
];

const ids = (list: { id: string }[]) => list.map((e) => e.id).sort();

describe("edge accent detectors", () => {
  it("flag a colored left or top border, a thin edge bar, an inset edge shadow and an inline edge bar", () => {
    const tsx = [
      'const a = <div className="border-l-2 border-cyan px-4" />;',
      "const b = <div className={`border-t-4 ${tone}`} />;",
      'const c = <span className="absolute inset-x-0 top-0 h-0.5 bg-violet/70" />;',
      'const d = <span className="absolute inset-y-0 left-0 w-1 bg-amber" />;',
      'const e = <li className="shadow-[inset_3px_0_0_var(--color-cyan)]" />;',
      'const f = <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: accent }} />;',
    ].join("\n");
    expect(ids(scanFile("x.tsx", tsx))).toEqual(
      [
        "x.tsx: class: border-l-2 + border-cyan",
        "x.tsx: bar: top h-0.5",
        "x.tsx: bar: side w-1",
        "x.tsx: inset shadow: inset 3px 0 0 var(--color-cyan)",
        "x.tsx: style: side bar width 6",
      ].sort(),
    );
  });

  it("keep neutral structural rules, bottom indicators and full outlines", () => {
    const tsx = [
      'const a = <div className="border-t border-line md:border-t-0 md:border-l md:pl-6" />;',
      'const b = <footer className="border-t border-glass-border px-4" />;',
      'const c = <div className="rounded-lg border border-cyan/60 bg-cyan/10" />;',
      'const d = <button className="border-b-2 border-cyan" />;',
      'const e = <div className="absolute inset-x-0 bottom-4 h-1 bg-cyan" />;',
      'const f = <div className="shadow-[0_12px_40px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.05)]" />;',
      'const g = <div style={{ position: "absolute", left: x, top: 0, width: 1, height: H }} />;',
    ].join("\n");
    expect(scanFile("y.tsx", tsx)).toEqual([]);
  });

  it("read CSS declarations, pseudo-element bars and inset shadows", () => {
    const css = [
      ".rows > li { border-top: 1px solid var(--color-line); }",
      ".toc a { border-left: 1px solid var(--color-line-2); }",
      ".quote { border-left: 2px solid var(--color-violet); }",
      '.toc a[aria-current="true"] { border-left-color: var(--color-violet); }',
      '.card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--color-cyan); }',
      '.tab::after { content: ""; position: absolute; left: 18%; right: 18%; bottom: 0; height: 2px; background: var(--color-cyan); }',
      ".glass { box-shadow: 0 12px 40px rgb(0 0 0 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.05); }",
      ".row { box-shadow: inset 2px 0 0 var(--color-amber); }",
    ].join("\n");
    expect(ids(scanCss("z.css", css))).toEqual(
      [
        "z.css: css: border-left: 2px solid var(--color-violet);",
        "z.css: css: border-left-color: var(--color-violet);",
        "z.css: css bar: .card::before",
        "z.css: inset shadow: inset 2px 0 0 var(--color-amber)",
      ].sort(),
    );
  });
});

describe("src", () => {
  it("has no colored edge stripe beyond the ratchet list", () => {
    expect(ids(scanTree(process.cwd()))).toEqual([...KNOWN].sort());
  });
});
```

- [ ] **Step 3: Run the scanner tests**

Run: `bun run test tests/unit/edge-accents.test.ts`
Expected: PASS, `Tests  4 passed`. The ratchet test proves the scanner finds exactly the six stripes of the inventory and nothing else in `src` (planning run on `main` @ f61fbba printed exactly these six ids). To see it guard, temporarily add `<div className="border-l-2 border-amber" />` to any component: the test fails listing `...: class: border-l-2 + border-amber`; remove it again.

- [ ] **Step 4: Write the runtime audit**

Create `e2e/edge-audit.ts`:

```ts
/**
 * Runtime twin of `tests/helpers/edge-accents.ts` (R5 P10). Pass to `page.evaluate(findEdgeAccents, selector)`:
 * lists every visible colored edge stripe under `selector` (the element itself included):
 * - a left or top border in a saturated color that is not part of an even full outline,
 * - an absolutely positioned bar at most 4 px thick, flush with its container's left, right or top edge,
 * - the same bar drawn by `::before` / `::after`,
 * - an inset box-shadow offset to one edge in a saturated color.
 * Neutral rules (`--color-line`, `--color-line-2`, `--color-glass-border`, white highlights) are gray and pass.
 * Self-contained: Playwright serializes the function source into the page.
 */
export function findEdgeAccents(selector: string): string[] {
  const root = document.querySelector(selector);
  if (!root) return [`missing ${selector}`];
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (color: string): [number, number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const colored = (color: string) => {
    const [r, g, b, a] = rgba(color);
    return a >= 0.25 && Math.max(r, g, b) - Math.min(r, g, b) >= 40;
  };
  const name = (el: Element) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 5).join(".") : "";
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""} "${text}"`;
  };
  const SIDES = ["Top", "Right", "Bottom", "Left"] as const;
  type Side = (typeof SIDES)[number];
  const border = (cs: CSSStyleDeclaration, side: Side) => ({
    width: cs.getPropertyValue(`border-${side.toLowerCase()}-width`),
    style: cs.getPropertyValue(`border-${side.toLowerCase()}-style`),
    color: cs.getPropertyValue(`border-${side.toLowerCase()}-color`),
  });
  const out: string[] = [];
  const checkBorders = (cs: CSSStyleDeclaration, label: string) => {
    for (const side of ["Left", "Top"] as const) {
      const b = border(cs, side);
      if (Number.parseFloat(b.width) < 1 || b.style === "none" || b.style === "hidden" || !colored(b.color)) continue;
      const even = SIDES.every((s) => {
        const o = border(cs, s);
        return o.width === b.width && o.style === b.style && o.color === b.color;
      });
      if (!even) out.push(`${label} border-${side.toLowerCase()} ${b.width} ${b.color}`);
    }
  };
  const checkShadow = (cs: CSSStyleDeclaration, label: string) => {
    if (cs.boxShadow === "none") return;
    for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
      if (!/\binset\b/.test(part)) continue;
      const color = /(?:rgba?|oklab|oklch|color|hsla?)\([^)]*\)|#[0-9a-f]{3,8}/i.exec(part)?.[0] ?? "";
      const [x = 0, y = 0, blur = 0] = (part.replace(color, "").match(/-?[\d.]+px/g) ?? []).map(Number.parseFloat);
      if ((x !== 0 || y !== 0) && blur <= 2 && colored(color)) out.push(`${label} inset shadow ${part.trim()}`);
    }
  };
  const thinBar = (r: { left: number; top: number; right: number; width: number; height: number }, host: DOMRect) =>
    (r.width <= 4 && r.height >= 12 && (Math.abs(r.left - host.left) <= 2 || Math.abs(r.right - host.right) <= 2)) ||
    (r.height <= 4 && r.width >= 24 && Math.abs(r.top - host.top) <= 2);

  for (const el of [root, ...root.querySelectorAll("*")]) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || Number.parseFloat(cs.opacity) === 0) continue;
    const label = name(el);
    checkBorders(cs, label);
    checkShadow(cs, label);
    if (cs.position === "absolute" && colored(cs.backgroundColor)) {
      const host = (el instanceof HTMLElement ? el.offsetParent : el.parentElement) ?? document.body;
      if (thinBar(rect, host.getBoundingClientRect())) out.push(`${label} edge bar ${Math.round(rect.width)}x${Math.round(rect.height)} ${cs.backgroundColor}`);
    }
    for (const pseudo of ["::before", "::after"] as const) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === "none" || ps.content === "normal" || ps.display === "none") continue;
      checkBorders(ps, `${label}${pseudo}`);
      checkShadow(ps, `${label}${pseudo}`);
      if (ps.position !== "absolute" || !colored(ps.backgroundColor)) continue;
      const width = Number.parseFloat(ps.width);
      const height = Number.parseFloat(ps.height);
      const left = rect.left + Number.parseFloat(ps.left);
      const top = rect.top + Number.parseFloat(ps.top);
      if (thinBar({ left, top, right: left + width, width, height }, rect)) out.push(`${label}${pseudo} edge bar ${width}x${height} ${ps.backgroundColor}`);
    }
  }
  return out;
}
```

(Planning note: run against a synthetic page this flags a 2 px `oklab` top bar, a 2 px left border, an inset 3 px shadow and a 3 px `::before` bar, and passes a full cyan outline with glow, a 2 px bottom tab rule, the `.glass` white inset highlight, a 6 px dot, gradient data packets and neutral `rgb(255 255 255 / 0.09)` rules. On a build of `main` it flags the current ToC link, the six blockquotes of the quote post and the palette's selected row; the HUD and the drawer are clean at 1440x900 and 390x844.)

- [ ] **Step 5: Add the Page View and Ask dock audits**

In `e2e/pageview.spec.ts`, add below `import { openPage } from "./hq";`:

```ts
import { findEdgeAccents } from "./edge-audit";
```

Append at the end of the file:

```ts
/** R5 P10 (owner, 2026-10-13): no colored left or top edge stripe; a dot or icon chip plus an outline glow instead. */
const QUOTE_POST = "/id/blog/the-sun-the-moon-and-the-dark-sea";
const ASK_ON = JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 });

/**
 * Pages that still show a stripe while P10 lands (certification cards: Task 5; case study ToC: Task 6;
 * blockquotes: Task 7). Each task deletes its paths; a fixed path left here fails.
 */
const P10_PENDING = new Set<string>(["/en", "/en/contact", "/en/quick", "/id", `/en/labs/${heroPod.slug}`, QUOTE_POST]);

test.describe("no colored edge stripes", () => {
  test("Page View templates, the case study table of contents and a post with quotes", async ({ page }) => {
    test.setTimeout(120_000);
    expect(content.floors.library.posts.some((p) => QUOTE_POST.endsWith(`/${p.slug}`))).toBe(true);
    for (const path of [...TEMPLATES, QUOTE_POST]) {
      await openPage(page, staticTier(path));
      if (path === `/en/labs/${heroPod.slug}`) {
        await page.evaluate(() => {
          const el = document.getElementById("approach")!;
          window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
        });
        await expect(page.locator(".pv-toc a[aria-current='true']")).toHaveCount(1);
      }
      const found = await page.evaluate(findEdgeAccents, "body");
      if (P10_PENDING.has(path)) expect(found.length, `${path} has no stripe left: delete it from P10_PENDING`).toBeGreaterThan(0);
      else expect(found, path).toEqual([]);
    }
  });

  test("the Ask dock", async ({ page }) => {
    await page.route("**/api/ask", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ASK_ON }));
    await openPage(page, staticTier("/en/labs"));
    await page.getByTestId("ask-launcher").click();
    await expect(page.getByTestId("ask-dock")).toBeVisible();
    expect(await page.evaluate(findEdgeAccents, "[data-testid='ask-dock']")).toEqual([]);
  });
});
```

(`content` is already imported from `./routes` at the top of the file.)

- [ ] **Step 6: Add the Glass Drawer and 3D HUD audits**

In `e2e/drawer-solid.spec.ts`, add below `import { asReturningVisitor, waitForHQ, waitForPhase } from "./hq";`:

```ts
import { findEdgeAccents } from "./edge-audit";
```

and in the per-viewport test replace:

```ts
    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").withRules(["color-contrast"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await context.close();
```

with:

```ts
    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").withRules(["color-contrast"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

    // R5 P10: no colored left or top edge stripe in the drawer or the HUD over the world.
    expect(await page.evaluate(findEdgeAccents, "[data-testid='room-drawer']"), "drawer").toEqual([]);
    expect(await page.evaluate(findEdgeAccents, "[data-testid='hud']"), "HUD").toEqual([]);
    await context.close();
```

- [ ] **Step 7: Run the new e2e audits**

Run:

```bash
bun run build
E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts e2e/drawer-solid.spec.ts -g "edge stripes|near-opaque"
```

Expected: PASS, `6 passed` (the two Page View audits, the three drawer viewports and the HUD pills test, which `near-opaque` also matches). These surfaces are already clean or listed as pending, so this step proves the guards run; the pending entries turn into real assertions in Tasks 5 to 7.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
bun run typecheck && bun run lint
git add tests/helpers/edge-accents.ts tests/unit/edge-accents.test.ts e2e/edge-audit.ts e2e/pageview.spec.ts e2e/drawer-solid.spec.ts
git commit -m "P10: static and runtime guards against colored edge stripes (ratchet for the remaining ones)"
```

### Task 4: Cmd-K selected row: dot plus full outline instead of the left stripe (inventory row 1)

**Files:**
- Modify: `src/hud/CommandPalette.tsx:1-8` (import), `src/hud/CommandPalette.tsx:236-250` (option row)
- Modify: `tests/unit/edge-accents.test.ts` (delete one `KNOWN` entry)
- Test: `tests/hud/CommandPalette.test.tsx` (one new test), `e2e/pageview.spec.ts` (one new test in the P10 block)

**Interfaces:**
- Consumes: `AccentDot` (Task 2), `findEdgeAccents` (Task 3).
- Produces: every palette option renders an `AccentDot` first (`data-accent-dot="cyan"` with `hq-dot-glow` when selected, `"line"` otherwise); the selected option carries `border border-cyan/60 bg-cyan/10 shadow-[0_0_16px_-6px_var(--color-cyan)]`, idle options `border border-transparent`. Row height is unchanged (1 px border + 7 px padding replaces 8 px padding).

- [ ] **Step 1: Write the failing unit test**

In `tests/hud/CommandPalette.test.tsx`, add inside `describe("CommandPalette", () => {`, right after the `it("moves the active option with the arrow keys, wrapping around", ...)` test:

```tsx
  it("marks the selected row with a glowing dot and a full outline, never a left stripe (R5 P10)", async () => {
    const { user } = setup();
    await user.keyboard("{ArrowDown}");
    const selected = activeOption()!;
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(selected.className).not.toMatch(/(^|\s)border-[lst](-\d+)?(\s|$)/);
    expect(selected).toHaveClass("border", "border-cyan/60", "bg-cyan/10");
    const dot = selected.querySelector("[data-accent-dot]");
    expect(dot).toHaveAttribute("data-accent-dot", "cyan");
    expect(dot).toHaveClass("hq-dot-glow");
    for (const other of screen.getAllByRole("option").filter((o) => o !== selected)) {
      expect(other).toHaveClass("border", "border-transparent");
      expect(other.querySelector("[data-accent-dot]")).toHaveAttribute("data-accent-dot", "line");
    }
  });
```

- [ ] **Step 2: Write the failing e2e test**

In `e2e/pageview.spec.ts`, add inside `test.describe("no colored edge stripes", () => {`, after the Ask dock test:

```ts
  test("Cmd-K marks the selected row with a dot and a full outline", async ({ page }) => {
    await openPage(page, staticTier("/en/journey"));
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const selected = palette.locator("[role='option'][aria-selected='true']");
    await expect(selected).toHaveCount(1);
    const look = await selected.evaluate((el) => {
      const cs = getComputedStyle(el);
      const dot = el.querySelector("[data-accent-dot]");
      return {
        sides: new Set([cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor]).size,
        left: cs.borderLeftWidth,
        fill: cs.backgroundColor,
        dot: dot ? getComputedStyle(dot).visibility : "missing",
      };
    });
    expect(look.sides).toBe(1);
    expect(look.left).toBe("1px");
    expect(look.fill).not.toBe("rgba(0, 0, 0, 0)");
    expect(look.dot).toBe("visible");
    expect(await page.evaluate(findEdgeAccents, "[role='dialog']:has([role='listbox'])")).toEqual([]);
  });
```

- [ ] **Step 3: Run both to see them fail**

Run:

```bash
bun run test tests/hud/CommandPalette.test.tsx
E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "Cmd-K marks"
```

Expected: the unit test FAILS on `expect(selected.className).not.toMatch(...)` (the class list holds `border-l-2`); the e2e test FAILS on `expect(look.sides).toBe(1)` (received 2: cyan left, default elsewhere). The `out/` build from Task 3 is still `main`'s palette.

- [ ] **Step 4: Implement the row**

In `src/hud/CommandPalette.tsx`, add below `import { useTranslations } from "next-intl";`:

```tsx
import { AccentDot } from "@/components/AccentDot";
```

Replace:

```tsx
                      className={`flex min-h-11 cursor-pointer items-center gap-3 border-l-2 px-4 py-2 motion-safe:transition-colors ${
                        selected ? "border-cyan bg-cyan/10" : "border-transparent"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
```

with:

```tsx
                      className={`mx-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-2 py-[7px] motion-safe:transition-[background-color,border-color,box-shadow] ${
                        selected ? "border-cyan/60 bg-cyan/10 shadow-[0_0_16px_-6px_var(--color-cyan)]" : "border-transparent"
                      }`}
                    >
                      <AccentDot tone={selected ? "cyan" : "line"} glow={selected} />
                      <span className="min-w-0 flex-1">
```

(The idle `line` dots form a quiet bullet column under the group heading; the selected row gets the tinted fill, the full cyan hairline, the halo and a glowing cyan dot, plus `text-ink` on the title as before. The input keeps focus and `aria-activedescendant`, so keyboard users see the same selection.)

- [ ] **Step 5: Shrink the ratchet**

In `tests/unit/edge-accents.test.ts`, delete this line from `KNOWN`:

```ts
  "src/hud/CommandPalette.tsx: class: border-l-2 + border-cyan",
```

- [ ] **Step 6: Run the tests to see them pass**

Run:

```bash
bun run test tests/hud/CommandPalette.test.tsx tests/unit/edge-accents.test.ts
bun run build
E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts e2e/ask.spec.ts -g "Cmd-K"
```

Expected: unit PASS (`Test Files  2 passed`); e2e PASS: `Cmd-K marks the selected row ...` and the existing `Cmd-K Ask row sends the question to the dock` (2 passed).

- [ ] **Step 7: Commit**

```bash
bun run typecheck && bun run lint
git add src/hud/CommandPalette.tsx tests/hud/CommandPalette.test.tsx tests/unit/edge-accents.test.ts e2e/pageview.spec.ts
git commit -m "P10: Cmd-K selected row uses a glowing dot and a full outline instead of a left stripe"
```

### Task 5: Certification cards and preview card lose their top bars (inventory rows 2 and 3)

**Files:**
- Modify: `src/components/certs/Certifications.tsx:11-19` (featured card)
- Modify: `src/components/certs/CertDialog.tsx:10,23` (preview card)
- Modify: `tests/unit/edge-accents.test.ts` (delete two `KNOWN` entries), `e2e/pageview.spec.ts` (`P10_PENDING` loses four paths; one new test)
- Test: `tests/hud/CertDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `hq-glow` (Task 2), `findEdgeAccents` (Task 3), `STATUS_CLASS` already in `CertDialog.tsx`.
- Produces: featured cards keep `.card` (neutral hairline) and add `hq-glow` (cyan outline glow on hover and keyboard focus); the issuer logo stays the icon chip next to the issuer label. The preview card keeps the status chip next to the "Status" label (`pv-mark text-green|text-amber|text-ink-3`) as its only status color.

- [ ] **Step 1: Write the failing unit test**

Create `tests/hud/CertDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import CertDialog from "@/components/certs/CertDialog";
import type { CertView } from "@/content/certs";

afterEach(() => cleanup());

/** A fictional certification: only the status matters here. */
const cert = (status: CertView["status"]): CertView => ({
  id: "example-cert",
  code: "EX-100",
  name: "Example Certified: Test Associate",
  short: "Test Associate",
  issuer: "Example Org",
  logo: null,
  issued: "2025-01",
  issuedLabel: "Jan 2025",
  expires: null,
  expiresLabel: null,
  status,
  url: null,
  credentialId: null,
  featured: false,
});

describe("CertDialog (R5 P10)", () => {
  for (const [status, label, tone] of [
    ["earned", "Earned", "text-green"],
    ["in-progress", "In progress", "text-amber"],
    ["expired", "Expired", "text-ink-3"],
  ] as const) {
    it(`shows "${label}" as a colored chip next to its label, with no colored top rule`, () => {
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <CertDialog cert={cert(status)} onClose={vi.fn()} />
        </NextIntlClientProvider>,
      );
      const dialog = screen.getByTestId("cert-dialog");
      expect(dialog.querySelector(".absolute.inset-x-0.top-0")).toBeNull();
      expect(within(dialog).getByText(label)).toHaveClass("pv-mark", tone);
    });
  }
});
```

- [ ] **Step 2: Write the failing e2e test and arm the pending pages**

In `e2e/pageview.spec.ts`, change the `P10_PENDING` line to:

```ts
const P10_PENDING = new Set<string>([`/en/labs/${heroPod.slug}`, QUOTE_POST]);
```

and add inside `test.describe("no colored edge stripes", () => {`:

```ts
  test("certification cards glow on hover and the preview card has no top rule", async ({ page }) => {
    await openPage(page, staticTier("/en"));
    const card = page.locator("#certifications .card[data-cert-open]").first();
    await card.hover();
    await expect
      .poll(() =>
        card.evaluate((el) => {
          const cs = getComputedStyle(el);
          return cs.boxShadow !== "none" && cs.borderTopColor === cs.borderLeftColor && cs.borderLeftColor === cs.borderRightColor;
        }),
      )
      .toBe(true);
    await card.click();
    await expect(page.getByTestId("cert-dialog")).toBeVisible();
    expect(await page.evaluate(findEdgeAccents, "[data-testid='cert-dialog']")).toEqual([]);
  });
```

- [ ] **Step 3: Run them to see them fail**

Run:

```bash
bun run test tests/hud/CertDialog.test.tsx
E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "edge stripes"
```

Expected: unit FAILS 3 times on `expect(...querySelector(".absolute.inset-x-0.top-0")).toBeNull()`; e2e FAILS: the templates test reports `/en` with `span ... edge bar NNNx2 oklab(...)` (the cyan card bars), and the new test fails on the hover poll (box-shadow `none`) on the `out/` build of Task 4.

- [ ] **Step 4: Remove the featured card bar and add the outline glow**

In `src/components/certs/Certifications.tsx`, replace:

```tsx
      className="card relative flex h-full min-h-[200px] w-full flex-col overflow-hidden p-5 text-left transition hover:border-line-2 hover:bg-surface-2"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-cyan/70" />
      <span className="flex items-center gap-2">
```

with:

```tsx
      className="card hq-glow relative flex h-full min-h-[200px] w-full flex-col overflow-hidden p-5 text-left hover:bg-surface-2"
    >
      <span className="flex items-center gap-2">
```

(`hq-glow` owns the transition; `relative` and `overflow-hidden` stay so the box and the layout are unchanged.)

- [ ] **Step 5: Remove the preview card bar**

In `src/components/certs/CertDialog.tsx`, delete the line:

```tsx
const RULE = { earned: "bg-cyan", "in-progress": "bg-amber", expired: "bg-ink-3" } as const;
```

and delete the line:

```tsx
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${RULE[cert.status]}`} />
```

- [ ] **Step 6: Shrink the ratchet**

In `tests/unit/edge-accents.test.ts`, delete these two lines from `KNOWN`:

```ts
  "src/components/certs/CertDialog.tsx: bar: top h-0.5",
  "src/components/certs/Certifications.tsx: bar: top h-0.5",
```

- [ ] **Step 7: Run the tests to see them pass**

Run:

```bash
bun run test tests/hud/CertDialog.test.tsx tests/unit/edge-accents.test.ts
bun run build
E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "edge stripes|certifications open|preview card is localized"
```

Expected: unit PASS; e2e PASS (the edge stripe tests plus the two existing certification preview tests: keyboard first and Indonesian).

- [ ] **Step 8: Commit**

```bash
bun run typecheck && bun run lint
git add src/components/certs/Certifications.tsx src/components/certs/CertDialog.tsx tests/hud/CertDialog.test.tsx tests/unit/edge-accents.test.ts e2e/pageview.spec.ts
git commit -m "P10: certification cards and preview lose the colored top bar; cards glow on hover"
```

### Task 6: Case study table of contents: dots and an outline glow instead of the violet left rule (inventory row 4)

**Files:**
- Modify: `src/app/pageview.css:383-404`
- Modify: `docs/design/pageview/pageview.css:335-336` (mockup parity)
- Modify: `tests/unit/edge-accents.test.ts` (delete one `KNOWN` entry), `e2e/pageview.spec.ts` (`P10_PENDING` loses the case study)

**Interfaces:**
- Consumes: `CaseToc` markup (`nav.pv-toc > ul > li > a[aria-current]`, unchanged), `findEdgeAccents` (Task 3).
- Produces: each ToC link draws a 6 px `::before` dot (neutral `--color-line-2`); the current link (`aria-current="true"`) gets ink text, a violet dot with an 8 px halo, and a full violet hairline (`rgb(167 139 250 / 0.45)`, radius 8 px) with `box-shadow: 0 0 20px -8px var(--color-violet)`. Link height (36 px) and vertical rhythm are unchanged; the text starts 12 px further right (dot plus gap).

- [ ] **Step 1: Arm the pending page (failing test)**

In `e2e/pageview.spec.ts`, change the `P10_PENDING` line to:

```ts
const P10_PENDING = new Set<string>([QUOTE_POST]);
```

- [ ] **Step 2: Run it to see it fail**

Run: `E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "Page View templates"`
Expected: FAIL at `/en/labs/<hero slug>` with `a "What I did" border-left 1px rgb(167, 139, 250)` (the planning run on `main` printed exactly this entry).

- [ ] **Step 3: Replace the ToC styles**

In `src/app/pageview.css`, replace:

```css
  /* Case study table of contents */
  .pv-toc a {
    display: flex;
    align-items: center;
    min-height: 36px;
    padding-left: 14px;
    border-left: 1px solid var(--color-line);
    font-size: 14px;
    color: var(--color-ink-3);
    transition:
      color 150ms var(--ease-standard),
      border-color 150ms var(--ease-standard);
  }

  .pv-toc a:hover {
    color: var(--color-ink);
  }

  .pv-toc a[aria-current="true"] {
    color: var(--color-ink);
    border-left-color: var(--color-violet);
  }
```

with:

```css
  /* Case study table of contents: a dot per section; the current one glows violet inside a full hairline (R5 P10, no edge rule). */
  .pv-toc a {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 14px;
    color: var(--color-ink-3);
    transition:
      color 150ms var(--ease-standard),
      border-color 150ms var(--ease-standard),
      box-shadow 150ms var(--ease-standard);
  }

  .pv-toc a::before {
    content: "";
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--color-line-2);
    transition:
      background-color 150ms var(--ease-standard),
      box-shadow 150ms var(--ease-standard);
  }

  .pv-toc a:hover {
    color: var(--color-ink);
  }

  .pv-toc a[aria-current="true"] {
    color: var(--color-ink);
    border-color: rgb(167 139 250 / 0.45);
    box-shadow: 0 0 20px -8px var(--color-violet);
  }

  .pv-toc a[aria-current="true"]::before {
    background: var(--color-violet);
    box-shadow: 0 0 8px var(--color-violet);
  }
```

(Planning note: this exact CSS was injected into a build of `main` and captured at 1440x900, DPR 2: dots at the left, "What I did" inside a soft violet outline; the diff showed 0 changed pixels outside `.pv-toc`.)

- [ ] **Step 4: Keep the mockup in step**

In `docs/design/pageview/pageview.css`, replace:

```css
.toc a { display: flex; align-items: center; min-height: 36px; color: var(--ink-3); font-size: 14px; border-left: 1px solid var(--line); padding-left: 14px; }
.toc a[aria-current="true"] { color: var(--ink); border-left-color: var(--violet); }
```

with:

```css
.toc a { display: flex; align-items: center; gap: 10px; min-height: 36px; color: var(--ink-3); font-size: 14px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; }
.toc a::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 999px; background: var(--line-2); }
.toc a[aria-current="true"] { color: var(--ink); border-color: rgb(167 139 250 / 0.45); box-shadow: 0 0 20px -8px var(--violet); }
.toc a[aria-current="true"]::before { background: var(--violet); box-shadow: 0 0 8px var(--violet); }
```

(Changing `docs/design/**` also makes the Screenshots workflow run on the PR.)

- [ ] **Step 5: Shrink the ratchet**

In `tests/unit/edge-accents.test.ts`, delete this line from `KNOWN`:

```ts
  "src/app/pageview.css: css: border-left-color: var(--color-violet);",
```

- [ ] **Step 6: Run the tests to see them pass**

Run:

```bash
bun run test tests/unit/edge-accents.test.ts tests/hud/CaseToc.test.tsx
rm -rf .next && bun run build
E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "Page View templates|table of contents"
```

Expected: unit PASS (the ToC scroll-spy tests are unchanged); e2e PASS: the templates audit and `case study keeps its anchors and table of contents`. (`rm -rf .next` because Turbopack can serve stale CSS after style edits, AGENTS.md "Fast verification".)

- [ ] **Step 7: Commit**

```bash
git add src/app/pageview.css docs/design/pageview/pageview.css tests/unit/edge-accents.test.ts e2e/pageview.spec.ts
git commit -m "P10: case study table of contents marks the current section with a dot and an outline glow"
```

### Task 7: Blockquotes: a glowing dot on the first line instead of the violet left rule (inventory row 5)

**Files:**
- Modify: `src/app/globals.css:242-247`
- Modify: `tests/unit/edge-accents.test.ts` (delete one `KNOWN` entry), `e2e/pageview.spec.ts` (`P10_PENDING` becomes empty)

**Interfaces:**
- Consumes: `.prose-hq` (MDX body on `/[locale]/blog/[slug]`), `findEdgeAccents` (Task 3).
- Produces: `.prose-hq blockquote` keeps the same 18 px text inset (`padding-left: calc(1rem + 2px)`, the old 2 px rule plus 16 px padding), so line wrapping and height do not change; `::before` draws a 7 px violet dot with an 8 px halo at the first line's center (`left: 1px; top: 11px` for the 28 px line height).

- [ ] **Step 1: Arm the last pending page (failing test)**

In `e2e/pageview.spec.ts`, change the `P10_PENDING` line to:

```ts
const P10_PENDING = new Set<string>();
```

- [ ] **Step 2: Run it to see it fail**

Run: `E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "Page View templates"`
Expected: FAIL at `/id/blog/the-sun-the-moon-and-the-dark-sea` with six entries like `blockquote ""The soggy darkness crouched dow" border-left 2px rgb(167, 139, 250)`.

- [ ] **Step 3: Replace the blockquote style**

In `src/app/globals.css`, replace:

```css
  .prose-hq blockquote {
    border-left: 2px solid var(--color-violet);
    padding-left: 1rem;
    color: var(--color-ink);
    font-style: italic;
  }
```

with:

```css
  /* Quotes: a glowing violet dot on the first line, in the same 18 px gutter the old edge rule used (R5 P10). */
  .prose-hq blockquote {
    position: relative;
    padding-left: calc(1rem + 2px);
    color: var(--color-ink);
    font-style: italic;
  }

  .prose-hq blockquote::before {
    content: "";
    position: absolute;
    left: 1px;
    top: 11px;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--color-violet);
    box-shadow: 0 0 8px var(--color-violet);
  }
```

(Planning note: two variants were captured on `main` at DPR 2, a 14 px quote-mark chip and this dot; the dot reads cleaner at the poem's small italic size and matches the dot language of the ToC and the palette. The full-page diff of the post changed pixels only inside the blockquotes and the page height was identical.)

- [ ] **Step 4: Shrink the ratchet**

In `tests/unit/edge-accents.test.ts`, delete this line from `KNOWN`:

```ts
  "src/app/globals.css: css: border-left: 2px solid var(--color-violet);",
```

`KNOWN` now holds only `"src/lib/og.tsx: style: side bar width 10"` (P9). If P9 has already merged and removed the OG bar, the ratchet test fails with that entry missing: delete it too, leaving `const KNOWN: string[] = [];`.

- [ ] **Step 5: Run the tests to see them pass**

Run:

```bash
bun run test tests/unit/edge-accents.test.ts
rm -rf .next && bun run build
E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "edge stripes"
```

Expected: unit PASS; e2e PASS (`4 passed`: templates, Ask dock, Cmd-K, certifications).

- [ ] **Step 6: Simplify the now-empty pending set and commit**

With nothing pending, replace the pending block in `e2e/pageview.spec.ts`:

```ts
/**
 * Pages that still show a stripe while P10 lands (certification cards: Task 5; case study ToC: Task 6;
 * blockquotes: Task 7). Each task deletes its paths; a fixed path left here fails.
 */
const P10_PENDING = new Set<string>();
```

and the two lines that read it:

```ts
      const found = await page.evaluate(findEdgeAccents, "body");
      if (P10_PENDING.has(path)) expect(found.length, `${path} has no stripe left: delete it from P10_PENDING`).toBeGreaterThan(0);
      else expect(found, path).toEqual([]);
```

with only:

```ts
      expect(await page.evaluate(findEdgeAccents, "body"), path).toEqual([]);
```

Run `E2E_PORT=4439 bun run e2e e2e/pageview.spec.ts -g "edge stripes"` again (Expected: `4 passed`), then:

```bash
bun run typecheck && bun run lint
git add src/app/globals.css tests/unit/edge-accents.test.ts e2e/pageview.spec.ts
git commit -m "P10: blockquotes use a glowing dot instead of a violet left rule"
```

### Task 8: After captures, diff gate, bytes, docs and the PR

**Files:**
- Modify: `AGENTS.md` (Styling; folder layout), `README.md` (Stack), `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md` (section 1), `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md` (section 9), `docs/superpowers/specs/2026-10-11-certifications-layout-design.md` (Accessibility, Tests)
- No source change unless the diff gate fails (see Step 3).

**Interfaces:**
- Consumes: everything above; `screenshots/p10/before/*` from Task 1.
- Produces: `screenshots/p10/{after,diff}/*`, `screenshots/p10/diff/report.md`, `screenshots/p10/bytes-after.json`, the PR.

- [ ] **Step 1: Capture the "after" set**

Run:

```bash
rm -rf .next && bun run build
SCREENSHOTS=1 P10_SHOTS=after E2E_PORT=4439 bun run e2e e2e/pageview-visual.spec.ts -g "P10" --workers=1
ls screenshots/p10/after | wc -l
```

Expected: `3 passed`, `1 skipped`; `82` files (same scenes as Task 1).

- [ ] **Step 2: Run the diff gate**

Run: `SCREENSHOTS=1 P10_SHOTS=diff E2E_PORT=4439 bun run e2e e2e/pageview-visual.spec.ts -g "P10 diff" --workers=1`
Expected: `1 passed`. `screenshots/p10/diff/report.md` lists 41 shots. Every row has `Outside edited elements` at or near 0 and a ratio of at most 0.050%; rows for `home`, `home-certs`, `about`, `case`, `case-toc`, `quote`, `cert-dialog` and `palette` show a non-zero `Changed px`; `labs`, `journey`, `library`, `home-work`, `ask` and `drawer` show `0` (or a few anti-aliasing pixels under the threshold). No size changes.

- [ ] **Step 3: If the gate fails, fix the cause (never raise the threshold)**

Open the failing `screenshots/p10/diff/<name>.diff.png`: red pixels are changes outside the edited elements, yellow ones are inside. A size mismatch means a layout shift: compare the element's box in `before/<name>.json` and `after/<name>.json`. Typical causes and fixes: the palette rows grew (the row must keep `py-[7px]` with the 1 px border); the blockquote reflowed (`padding-left` must stay `calc(1rem + 2px)`); a lazy image or the Ask teaser differed between runs (re-run both captures; the harness waits for images and sets `hq:ask-teaser`). Re-run Steps 1 and 2 after a fix.

- [ ] **Step 4: Review the edited elements by eye**

Open the before/after pairs at 1440x900 and 390x844 for: `home-work` (featured cards and work rows, unchanged), `labs`, `case-toc` (dots and the violet outline on "What I did"), `journey`, `library`, `cert-dialog`, `palette` (selected row: tinted fill, cyan hairline, glowing dot; idle rows: grey dots), `drawer`, `ask`, and `quote`/`home-certs` (2560x1440 too). Check: the selected palette row is obvious at a glance; no stripe anywhere; hairlines look uniform. Keep these PNGs for the PR.

- [ ] **Step 5: Record bytes after**

Run the Task 1 Step 5 command again with `bytes-after.json` as the output name:

```bash
bun -e 'import { readFileSync, writeFileSync } from "node:fs"; import { brotliCompressSync } from "node:zlib"; const out = {}; for (const [k, pat] of [["css", "out/_next/static/**/*.css"], ["js", "out/_next/static/chunks/**/*.js"]]) { const files = [...new Bun.Glob(pat).scanSync(".")]; let raw = 0, br = 0; for (const f of files) { const b = readFileSync(f); raw += b.length; br += brotliCompressSync(b).length; } out[k] = { files: files.length, raw, br }; } writeFileSync("screenshots/p10/bytes-after.json", JSON.stringify(out, null, 2)); console.log(JSON.stringify(out));'
```

Expected: CSS raw grows by about 1 KB and brotli by at most 400 B; JS brotli grows by at most 300 B (`AccentDot` in the palette and drawer chunks). Anything larger means an unintended change: inspect before continuing.

- [ ] **Step 6: Update AGENTS.md**

In `AGENTS.md` ("Styling"), below the bullet that starts with `- Utility classes: \`.glass\`, \`.label\``, add:

```markdown
- No colored edge stripes (owner decision 2026-10-13, R5 P10): never mark state, category or selection with a colored left or top border, a thin bar on an edge (an absolute `h-0.5`/`w-1` element or a `::before`/`::after` bar) or an inset edge shadow. Put a dot or icon chip next to the label instead (`AccentDot` from `src/components/AccentDot.tsx`: `tone` is an accent or `muted`/`line`, `size` `sm` 6 px or `md` 8 px, `glow` for the current or selected item; CSS `.hq-dot`, `.hq-dot-md`, `.hq-dot-glow`; or the existing `Marker`/`TypeMarker`, `IssuerMark` and `TypeIcon`) and use `hq-glow` for interaction (the whole hairline lights up with a soft glow on hover, `:focus-visible`, `aria-current="true"` and `aria-selected="true"`; `[--hq-glow:var(--color-violet)]` recolors it; the global focus outline stays). Cards keep the neutral `--color-line` hairline; neutral rules in `line`, `line-2` or `glass-border` and bottom tab indicators stay. Guards: `tests/unit/edge-accents.test.ts` (static scan of `src`, scanner in `tests/helpers/edge-accents.ts`) and `findEdgeAccents` (`e2e/edge-audit.ts`), which `pageview.spec.ts` runs on every template, Cmd-K, the Ask dock and the certification preview, and `drawer-solid.spec.ts` on the drawer and the HUD. Before/after captures for visual changes: `captureShot` and `diffShotDirs` in `e2e/region-diff.ts` (example: the `P10_SHOTS` block in `e2e/pageview-visual.spec.ts`).
```

In the folder layout block, replace:

```text
tests/helpers/space.ts          expectSpaceRules(...) for walkable floor layouts
```

with:

```text
tests/helpers/space.ts          expectSpaceRules(...) for walkable floor layouts
tests/helpers/edge-accents.ts   static scanner for colored left/top edge stripes (tests/unit/edge-accents.test.ts)
```

- [ ] **Step 7: Update README.md**

Below the "## Stack" paragraph (the line that starts with `Next.js 16 (App Router, static export)`), add a blank line and:

```markdown
Visual language: the Neon Grid tokens of spec appendix 05. Color marks state and category with a dot or icon chip next to the label and a full-outline glow on hover or selection, never with a colored left or top edge (see AGENTS.md, "Styling").
```

- [ ] **Step 8: Update the spec appendices**

In `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md`, replace:

```markdown
All HUD text must meet WCAG AA contrast against `glass.bg`.
```

with:

```markdown
All HUD text must meet WCAG AA contrast against `glass.bg`.

### Markers, selection and edges (R5 P10, owner decision 2026-10-13)

- Color marks state, category and selection only as a dot or icon chip next to the label (`AccentDot`: 6 px, 8 px in panel bars, a soft halo for the current or selected item) and as a full-outline glow on hover, keyboard focus, current and selected states (`hq-glow`: the whole hairline at 50% of the accent plus `0 0 24px -8px` of the accent).
- Never a colored left or top edge on a card, row, panel or dialog: no one-sided colored border, no thin bar on an edge, no inset edge shadow. Cards keep one uniform neutral hairline (`line`).
- Neutral structural rules (`line`, `line-2`, `glass.border`) and bottom tab indicators stay. The in-world neon edges of the 3D tower are part of the look and are not affected.
```

In `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md`, replace:

```markdown
- ToC uses `aria-current="true"` for the visible section.
```

with:

```markdown
- ToC uses `aria-current="true"` for the visible section, shown as ink text with a violet dot and a full violet hairline glow (R5 P10: no left rule; every link has a neutral dot).
```

In `docs/superpowers/specs/2026-10-11-certifications-layout-design.md`, replace:

```markdown
## Tests

`tests/unit/certs.test.ts`
```

with:

```markdown
Featured cards keep the neutral card hairline and light up with `hq-glow` on hover and keyboard focus; neither the cards nor the preview card carry a colored top rule (R5 P10, owner decision 2026-10-13). The preview's status color lives in the status chip next to its label.

## Tests

`tests/hud/CertDialog.test.tsx` (no top rule, status chip per status), `tests/unit/certs.test.ts`
```

- [ ] **Step 9: Full fast verification**

Run:

```bash
bun run verify:quick
E2E_PORT=4439 bun run e2e:changed
```

Expected: `verify:quick` exits 0 (typecheck, lint, all unit tests including `edge-accents`, `AccentDot`, `CertDialog`, `CommandPalette`, `RoomDrawer`, build). `e2e:changed` runs the mapped specs (`pageview`, `static-routes`, `gallery` for `src/app` and `src/components`; `ask`, `experience`, `missions`, `drawer-solid` for `CommandPalette`; `labs`, `gallery`, `career`, `library-roof`, `drawer-solid`, `hud` for the drawer; `pageview`, `experience`, `static-routes` for certs; `drawer-solid`, `pageview`, `static-routes` for `globals.css`; the smoke specs for the new `e2e/*.ts` helpers) and all pass. It is the longest step (about 8 to 12 minutes on SwiftShader).

- [ ] **Step 10: Commit the docs**

```bash
git add AGENTS.md README.md docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md docs/superpowers/specs/2026-10-10-pageview-revamp-design.md docs/superpowers/specs/2026-10-11-certifications-layout-design.md
git commit -m "P10: document the no-edge-stripe rule, AccentDot, hq-glow and the guards"
```

- [ ] **Step 11: Open the PR**

```bash
git push -u origin r5/p10-accent-stripes
gh pr create --title "R5 P10: replace colored edge stripes with dots and outline glows" --label screenshots --body-file pr-body.md
```

Write `pr-body.md` (do not commit it) with: the owner request (verbatim) and decision; the inventory summary (5 stripes replaced, OG bar left to P9, what stays and why, the 3D question); the guards; the diff table from `screenshots/p10/diff/report.md` with the thresholds (tolerance 24/255, pad 24 px, at most 0.05% outside, no size change); the before/after PNG pairs from Step 4 at 1440x900 and 390x844 for home featured and work rows, `/en/labs`, the case study ToC, `/en/journey`, `/en/library`, Cmd-K with a selected row, the drawer and the Ask dock, plus the diff PNGs of the changed scenes (drag them into the description); a bytes table from `bytes-before.json` and `bytes-after.json` plus the `Lighthouse CI` stylesheet and script transfer sizes before (latest green `main` run) and after (this PR's run); the cross-workstream notes below; the rollback note. Delete `pr-body.md` after the PR is created. The `screenshots` label makes CI attach its own capture artifacts too.

**Rollback:** the change is CSS and markup only, with no content, storage or URL changes. Revert the squash commit to restore every stripe; to restore one element, revert its task commit (Tasks 4 to 7 are independent) and re-add its id to `KNOWN` and its path to the e2e audit exceptions.

---

## Cross-workstream coordination

| Workstream | Shared files | Rebase note |
|---|---|---|
| P1 Page View and delivery (featured cards grid, srcset) | `src/components/page/Featured.tsx`, `src/app/landing.css`, `src/app/pageview.css`, maybe `src/app/globals.css` | P10 does not touch `Featured.tsx` or `landing.css`; in `pageview.css` it edits only the `.pv-toc` block (L383-404). P1's equal-height cards must not add a top or left stripe (both guards fail if they do): use the neutral `.card`/`pv-shot` hairline, `hq-glow` for hover (or keep the existing full violet outline on `.hx-card:hover .pv-shot`), and `Marker`/`AccentDot` next to the wing label. If P1 merges first, recapture P10's "before" set from the new `main`. |
| P3 CPU, lifecycle and memory | `src/app/globals.css` (`.glass`, `.glass-solid` L114-143: backdrop-filter), `src/hud/CommandPalette.tsx` / `src/hud/search.ts` (palette search pre-normalization) | Different blocks of `globals.css` (P10: after `.card`, the blockquote at L242-247, end of file). If P3 edits `CommandPalette.tsx`, the conflict is in the option row (L236-250): keep P3's data flow and P10's row classes and `AccentDot`. |
| P9 SEO wording and cinematic OG | `src/lib/og.tsx` (left edge bar L110) | P9 rewrites `og.tsx` with no edge stripes (its Task 3 has its own "draws no edge stripes" test). The static ratchet lists it (`"src/lib/og.tsx: style: side bar width 10"`): whichever PR merges second deletes that entry (the test fails with a stale or missing entry, so nobody can forget). P9's glowing screenshot frame is a full outline and passes the scanner. |
| P1, P2, P3, P4, P9 screenshot tools | P1 and P3: `scripts/shot-diff.ts` (whole-image CLI diff); P2 and P3: `e2e/visual-gate.spec.ts`; P9: `scripts/png-diff.ts`; P4: `playwright.config.ts`, `scripts/e2e-plan.ts`, CI workflows | P10's harness is `e2e/region-diff.ts` because it needs allowed regions ("differ only at the edited elements"), which the whole-image tools do not offer; the names differ, so there is no file conflict. P10 changes neither `playwright.config.ts` nor `scripts/e2e-plan.ts` nor workflows (its captures live in the existing opt-in `pageview-visual.spec.ts`). Suggest folding the tools into one after round 5. `StatsRing.tsx` (P2) is untouched here. |
| P6 elevator + Page view icon | `src/hud/Controls.tsx` | No overlap. The new icon must sit next to the label, not as an edge bar (the HUD audit in `drawer-solid.spec.ts` would flag one). |
| P5, P7, P8, P11 | none in code | `AGENTS.md` and `README.md` are edited by everyone: rebase by keeping both additions. |

## Open questions and risks

1. **3D stats tiles (owner).** The L1 stats tiles draw an accent glow line along their top edge (`StatsRing.tsx:110-113`), an in-world version of what the owner disliked. Round 5 keeps the 3D look fixed and P2 owns `StatsRing` this round, so this plan leaves it. Ask the owner in the PR; if yes, a follow-up swaps the line for a small glowing dot beside the tile label under the 3D screenshot gate.
2. **Bottom indicators.** The active nav link, the phone tabs and the drawer tabs use a 2 px bottom rule. The request names left and top only, so they stay; if the owner means every colored edge, the same `AccentDot` swap applies to `pageview.css:284-315` and `RoomDrawer.tsx:593-594` in a follow-up.
3. **Diff stability on SwiftShader.** The drawer shot sits over the live canvas (6% show-through); tolerance 24/255 absorbs it in planning runs. If CI-only noise appears, re-run both captures on one machine; never raise the threshold without the owner's say-so.
4. **Palette density.** Idle rows now show a neutral dot column. If the owner finds it busy, hide idle dots with `className={selected ? "" : "invisible"}` (the slot keeps the alignment); tests then check `visibility` instead of the `line` tone.
5. **Scanner blind spots.** The static scanner cannot see colors that arrive through class maps at run time (for example `border-l-2 ${TONE[x]}`); the runtime audit covers the rendered pages and HUD states listed above. New surfaces should add one `findEdgeAccents` assertion to their spec.

## Self-review

- **Spec coverage:** exhaustive inventory with file:line and keep/replace classification (Inventory); the known hits: `pageview.css` L202 (neutral, kept) and L389-403 (Task 6), `globals.css` L243 (Task 7), `Case.tsx` variants (neutral, kept), `CommandPalette.tsx:245` (Task 4); searches for `border-l-`, `border-t-N`, `border-s`, pseudo stripes, `borderLeft`/`borderTop`, inset shadows and thin bars across Page View, HUD (drawer, Ask dock, dialog, walk HUD, palette, profile card), hologram overlay and the OG generator (row 6, P9); newly found stripes on certification cards and the preview card (Task 5); shared `AccentDot` and `hq-glow` (Task 2); focus-visible kept and the selected palette row still obvious (Task 4 tests); unit and e2e tests per area; before/after screenshots at 1440x900, 2560x1440 and 390x844 of home featured/work rows, `/en/labs`, a case study, `/en/journey`, `/en/library`, Cmd-K with a selected row, the drawer and the Ask dock (Tasks 1 and 8, diffed with explicit thresholds); README, AGENTS and spec updates (Task 8); P1 and P9 coordination; port 4439 everywhere.
- **Placeholder scan:** every code step has the full code; every command has its expected output; the only conditional (P9 merge order) names the exact line to delete.
- **Type and name consistency:** `AccentDot` / `DotTone` / `AccentDotProps` (Task 2) are used with `tone`, `size`, `glow`, `className` in Tasks 2 and 4; `.hq-dot`, `.hq-dot-md`, `.hq-dot-glow`, `hq-glow`, `--hq-glow` match between CSS, tests and docs; `scanTree`, `scanFile`, `scanCss`, `EdgeAccent`, `KNOWN` (Task 3) and the ratchet ids deleted in Tasks 4 to 7 are the exact strings the scanner printed on `main`; `findEdgeAccents`, `P10_PENDING`, `QUOTE_POST`, `ASK_ON` are defined in Task 3 and only shrunk later; `captureShot`, `diffShotDirs`, `DiffRow.expected`, `screenshots/p10/{before,after,diff}` are consistent between Tasks 1 and 8.
