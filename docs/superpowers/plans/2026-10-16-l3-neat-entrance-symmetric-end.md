# L3 Neat Entrance and Symmetric End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the L3 arrival neat (three separate directory boards, one name per path, clean one-line board text) and make the Tech Reactor end mirror-symmetric about the spine axis; move the Fabric forecasting pod to the Data and ML wing.

**Architecture:** All geometry stays in the pure `src/experience/floors/labs/layout.ts` and `directory.ts` (Vitest in node). Boards become three free-standing boards, each with its own center, face normal and stop; the side boards turn toward the arrival camera and stand beside their road mouths, the Data and ML board stays a gate over the spine. The floating road signs go. Board text is one line per project, measured with a pinned Inter 400 advance table, with an optional `Pod.shortTitle` for long titles. Both wing roads turn at the reactor plaza's x and drop straight onto the ring's north and south points; the Express Return pad moves onto the axis east of the ring.

**Tech Stack:** TypeScript, React Three Fiber, troika text (`BatchedLabels`), zod, Vitest, Playwright, Bun.

## Global Constraints

- Owner feedback (verbatim): "I think the entrace of L3 should be separate its looks to full we need to make it neat. also the end of L3 was not symmetrical (the right side road just like the screenshoot)". Keep Option 1 (Product north road, Data and ML centre spine, AI south road, all meeting at the Tech Reactor plaza).
- Owner addition (verbatim): "Also the text inside the board too need to become more clean": one line per project (optional schema-validated `shortTitle` EN/ID for long titles, never a mid-word ellipsis), at most 5 entries plus "+N more" on the "open the full list" line, bullets and text left-aligned on one column with even spacing (wrapped text aligns under the text, not the bullet), less glow and weight on list items (regular weight, subtle glow only on the title), titles on one line where width allows, same font family and colors, readable at 390x844 lite from each board's stop. Classic site and Cmd-K keep full titles.
- Owner addition (verbatim): "for the fabric since i pull data from on premise into the fabric and do medallion pattern doesnt it should be on Data & ML section". Move pod `fabric-forecasting-dashboard` from wing `ai` to `data`; keep its text (client stays a sector label).
- Guided walks are being removed by another session: do not add tour code or spend effort on tour order; keep `labsWalk` compiling and its existing tests green until that PR lands. Keep deep links and point-and-go.
- No em dashes (U+2014). EN and ID for every user-facing string. No first person in titles. Title Case for titles (`shortTitle` included).
- Gates: L3 under 150 scene calls and 30k triangles, no new shader program, L3 chunk under 20 KB gzip, ride peaks unchanged, L3 arrival scene calls at most lite 67 and full 87.
- One CI run at a time: `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` before every push. Do not merge.

## Decisions (numbers checked with a projection harness, `followPose` + three `PerspectiveCamera`)

| Topic | Decision |
| --- | --- |
| Board size | Every board 9 u wide (`LABS.board.width`), 0.6 thick (`w`), from `base` 3.2 to `h` 9.6 (was 11.2: one-line text needs less height). Text width 8.4 (inset 0.3). |
| Data and ML board | Gate over the spine at x = 18 (`LABS.board.dataX`), facing west (normal (-1, 0)), two posts 0.4 deep at z in [-4.5, -4.1] and [4.1, 4.5] (outside the 8 u road). Stop (14.7, 0). |
| Side boards | Centers (16, -11.2) Product and (16, 11.2) AI (`LABS.board.side`), each turned `LABS.board.turn` = 0.33 rad toward the axis: normal (-cos t, -WING_SIDE sin t). One central pylon each (0.4 along the normal, 0.8 along the face), so pylon-to-gate-post gaps stay at least 6 u (space rule). Stop = center + normal * (w/2 + `boardStop` 3), about (12.88, -10.13) and (12.88, 10.13), on a short spur from the nearest point of its wing road's mouth leg. |
| Gaps | Physical gap between neighbouring boards about 2.3 u. On screen at arrival: 1440x900 Product x 125..499, Data 559..881, AI 941..1315 (gaps about 60 px, inside the 40..1400 safe box); 2560x1440 gaps about 96 px. |
| Phones | 390x844 arrival (zoom 1.45, camera kept east of the shaft) cannot show three separated 9 u boards: the Data and ML board is whole (x 110..280), each side board shows its inner part (Product -112..76, AI 314..502), the three road mouths are on screen. Each board reads whole from its stop (x 47..343, 22 px per u, compact list 9.9 px em). |
| Names | One name per path: the board titles. The floating road signs (`labs-wing-signs`, `roadSigns`, `LabsLayout.signs`, `LABS.signAlong`, `LABS.spineSignX`) are removed on every device. |
| Board zones | Side zones: a 3 u square around the stop, yaw `lookAlong(-normal)`, zoom 1.05, phones 1. Data zone and overview zone as before (`travel` east), overview maxX = data stop x - 1 = 13.7. `lookAlong(d) = 5*PI/4 - atan2(d.z, d.x)` inverts `followForward` (all follow offsets have ox = oz). |
| Board text | Title one line, JetBrains Mono Bold 0.6 (shrinks to fit, never wraps for the real names); sub 0.3 in `#a1a1aa`; list Inter 400 (`fonts.sans`) 0.37, line height 1.45, in `#c4c4cc` (linear luminance about 0.55, under the bloom threshold 0.6); tier marks in their own column (`#8b8b94`), text starts `PANEL.mark` (1.3) list em right of the marks; footer `▸ OPEN THE FULL LIST · +N MORE` in the wing tint (`+N` only when N > 0). Compact (phones): 3 entries at 0.45, line height 1.4. |
| Width | `interWidth(text)` (em) from a pinned advance table of the Inter 400 cut (`public/fonts/3d/inter-latin-400-normal.73c1b225.woff`), 0.6 em for characters outside the table. Available list width: full (8.4 - 1.3 * 0.37) / 0.37 = 21.4 em, compact (8.4 - 1.3 * 0.45) / 0.45 = 17.4 em. A title fits when its width is at most 97 percent of that. |
| Short titles | `Pod.shortTitle?: { en, id }` (each at most 32 characters, shorter than the title, Title Case, no first person). Needed today (top 5 on desktop, top 3 on phones, both locales): `serupa-2025`, `anime-figure-ecommerce`, `ai-code-security-platform` (id), `fraud-review-platform` (id), `fabric-forecasting-dashboard`, `ifest-2021-sentiment-analysis`, `covid-herd-immunity-forecast`, `university-sentiment-indobert`; the fit test decides the final list. |
| End | Both wing roads turn at `loopEnd.x` (the reactor plaza center x, 126 today) and run straight to the ring's north and south points; the spine enters at the west point. Express Return pad on the axis at (loopEnd.x + 13, 0) (`LABS.returnPadX`), east of the ring road, below the rover in the reactor stop view. The Ops Control Room stays a docked room of the AI wing (inner row after the last inner AI pod, outside the plaza). |
| Fabric | `fabric-forecasting-dashboard` moves to `wing: "data"`: AI docks 10, Data and ML 6 (it docks first on the spine: it has a gallery). The reactor plaza stays at x 126. |

---

### Task 1: Inter 400 width table

**Files:**
- Create: `src/experience/fx/interWidth.ts`
- Test: `tests/unit/inter-width.test.ts`

**Interfaces:**
- Produces: `INTER_400_FILE: string`, `interWidth(text: string): number` (advance width in em, sum of per-character advances; unknown characters count 0.6).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import troikaFonts from "@/experience/troika-fonts.json";
import { INTER_400_FILE, interWidth } from "@/experience/fx/interWidth";

describe("interWidth (Inter 400 advances)", () => {
  it("is pinned to the shipped Inter 400 cut", () => {
    // Regenerate the table (see the module comment) whenever this file name changes.
    expect(troikaFonts.sans.endsWith(INTER_400_FILE)).toBe(true);
  });
  it("measures known titles within 1 percent of fonttools", () => {
    expect(interWidth("Vendor Management Portal")).toBeCloseTo(12.95, 1);
    expect(interWidth("Serupa Ticket Hub: Event Ticketing Platform")).toBeCloseTo(20.95, 1);
    expect(interWidth("")).toBe(0);
  });
  it("counts characters outside the table as 0.6 em", () => {
    expect(interWidth("\u25C6")).toBeCloseTo(0.6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**: `bunx vitest run tests/unit/inter-width.test.ts` (module missing).

- [ ] **Step 3: Generate the table and implement.** Run:

```bash
python3 - <<'EOF'
from fontTools.ttLib import TTFont
f = TTFont('public/fonts/3d/inter-latin-400-normal.73c1b225.woff'); upm = f['head'].unitsPerEm; cmap = f.getBestCmap(); hm = f['hmtx']
def adv(cp): return round(hm[cmap[cp]][0] * 1000 / upm) if cp in cmap else 600
print(",".join(str(adv(cp)) for cp in list(range(32, 127)) + list(range(160, 256))))
EOF
```

Write the module with the printed list:

```ts
/**
 * Advance widths of the in-world Inter 400 cut (`public/fonts/3d/<INTER_400_FILE>`), in thousandths of
 * an em, for U+0020..U+007E then U+00A0..U+00FF; anything else counts 0.6 em. Pure: the L3 directory
 * boards measure list lines with it (one line per project), Vitest checks the fit in node.
 * Regenerate with fonttools when the cut changes (tests/unit/inter-width.test.ts pins the file):
 * python3 -c "from fontTools.ttLib import TTFont; ..." (see docs/superpowers/plans/2026-10-16-l3-neat-entrance-symmetric-end.md, Task 1).
 */
export const INTER_400_FILE = "inter-latin-400-normal.73c1b225.woff";
const ADVANCES = "<printed list>".split(",").map(Number);
const advance = (cp: number) => (cp >= 32 && cp <= 126 ? ADVANCES[cp - 32] : cp >= 160 && cp <= 255 ? ADVANCES[95 + cp - 160] : 600);

export function interWidth(text: string): number {
  let sum = 0;
  for (const ch of text) sum += advance(ch.codePointAt(0)!);
  return sum / 1000;
}
```

- [ ] **Step 4: Run** `bunx vitest run tests/unit/inter-width.test.ts` (PASS).
- [ ] **Step 5: Commit** `feat(l3): Inter 400 advance table for in-world text measurement`.

---

### Task 2: `Pod.shortTitle` and the Fabric pod in Data and ML

**Files:**
- Modify: `src/content/schema.ts` (`PodSchema`), `src/content/titles.ts` (title slots), `src/content/experience.ts` (`labPods`), `src/experience/types.ts` (`LabPod.shortTitle?`), `content/site-content.json` (fabric wing), `tests/content/first-person.test.ts`, `tests/content/dataset.test.ts`, `tests/unit/tech-index.test.ts`, any test or doc that pins per-wing counts.
- Test: `tests/content/short-title.test.ts` (create)

**Interfaces:**
- Produces: `Pod.shortTitle?: LocalizedText`; `LabPod.shortTitle?: string` (only when set, locale-resolved). Board code reads `pod.shortTitle ?? pod.title`; nothing else reads it (Classic site, Cmd-K, drawer, OG, JSON-LD, Ask keep `title`).

- [ ] **Step 1: Failing tests** in `tests/content/short-title.test.ts`: `PodSchema` accepts a pod with `shortTitle` `{ en: "Serupa Ticket Hub", id: "Serupa Ticket Hub" }`; rejects a `shortTitle` longer than 32 characters in either locale, and one not shorter than the title in the same locale; `labPods("en")` carries `shortTitle` only for pods that set it. Build the pod from a real pod of `getContent()` with `structuredClone`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Schema: `shortTitle: LocalizedTextSchema.optional()` after `title`, documented ("Board title on the L3 directory (one line); every other surface keeps `title`."); in `superRefine` add issues at `["shortTitle", locale]` for length > 32 or `>= title[locale].length`. `titleSlots`: add `localized(...shortTitle...)` for pods that set it (Title Case applies). First-person test: include `shortTitle` values. `labPods`: `...(p.shortTitle ? { shortTitle: p.shortTitle[locale] } : {})`.
- [ ] **Step 4: Fabric.** Set `"wing": "data"` on `fabric-forecasting-dashboard`. Update tests that pin wings: `tests/content/dataset.test.ts` (Data and ML block: the five repo pods keep their checks by slug, plus the Fabric pod moved by the owner on 2026-10-16 with a sector-label client and a gallery; AI hero count unchanged), `tests/unit/tech-index.test.ts` (data pods off the Data and AI rings now also include Fabric's Next.js, App Service, Bicep, Key Vault and Microsoft 365 Copilot style entries: compute the expected list from the real stack; pandas lights the five repo pods, Fabric reaches the Data ring through Lakehouse, Spark notebooks and Fabric Data Pipelines). Run `bun run validate:content`, `bunx vitest run tests/content tests/unit/tech-index.test.ts tests/unit/labs-*.test.ts tests/ask` and fix count pins (for example "an 11-pod AI wing" stays a padded synthetic case). Grep `tests/ask/golden.json` and `content/ask/` for a Fabric wing claim and keep them true.
- [ ] **Step 5: Commit** `feat(content): optional pod shortTitle; Fabric forecasting moves to Data and ML (owner 2026-10-16)`.

---

### Task 3: Three separate boards, no road signs

**Files:**
- Modify: `src/experience/floors/labs/layout.ts`, `src/experience/floors/labs/directory.ts` (geometry only: solids, lines, label positions), `src/experience/floors/labs/Hub.tsx` (drop `WingSigns`), `src/experience/prototype/FloorsPrototype.tsx` (mouth from `network.roads[...].points[1]`), `e2e/spectacle.spec.ts` (L3 group `labs-reactor-signs`).
- Test: `tests/unit/labs-layout.test.ts`, `tests/unit/labs-spine.test.ts` (drop the signs case), `tests/unit/facing.test.ts` (replace the L3 sign cases), `tests/unit/labs-arrival.test.ts`, `tests/unit/labs-directory.test.ts`, `tests/unit/interact-registry.test.ts`.

**Interfaces:**
- Produces in `layout.ts`:
  - `LABS.board = { w: 0.6, base: 3.2, h: 9.6, width: 9, post: 0.4, pylon: { across: 0.4, along: 0.8 }, dataX: 18, side: { x: 16, z: 11.2 }, turn: 0.33 }` (removes `x`, `d`, `gate`); removes `signAlong`, `spineSignX`.
  - `interface DirectoryBoard extends Rect { center: Vec2; normal: Vec2; along: Vec2; yaw: number; stop: Vec2 }` where `Rect` is the axis-aligned bounds of the board, `normal` the unit front direction, `along = (normal.z, -normal.x)` the front face's reading direction, `yaw = atan2(normal.x, normal.z)` (troika text yaw of the front face).
  - `directoryBoard(wing: Wing): DirectoryBoard` (fixed, independent of pods), `directoryStop(wing)` unchanged signature.
  - `interface BoardPost { wing: Wing; center: Vec2; across: number; along: number; yaw: number; rect: Rect }` and `wallPosts(): BoardPost[]` (two gate posts, two pylons); obstacles are `post.rect` (axis-aligned bounds).
  - `lookAlong(dir: Vec2): number` (follow camera yaw whose forward is `dir`).
  - `LabsLayout.signs` and `WingSign` removed.
- Produces in `directory.ts`: `wallSolids(boards?)` returns boxes with `yaw` (board box yaw = `board.yaw + PI / 2`, post box yaw the same as its board), `wallLines(boards?)` rotated rims and underlines, label positions on both faces from `center ± normal * (w/2 + PANEL.out) + along * u` (back face: `-along`, yaw + PI). `roadSigns` and `ROAD_SIGN` removed.

- [ ] **Step 1: Failing tests** (pure, node):
  - `labs-layout.test.ts`: three boards; data board normal (-1, 0), centered on z = 0, posts outside the road's driving width and the rover fits under `base`; side boards mirror images (`center.z`, `normal.z` negated), each normal within 0.35 rad of west and pointing toward the axis; each board's stop is `center + normal * (w/2 + boardStop)`; neighbouring boards' face end points at least 2 u apart; the side stop's spur starts on its wing road (distance to the road polyline < 1e-6) and ends at the stop; `expectSpaceRules` still passes with real pods, an empty floor and a lopsided floor (existing cases); `layout.floor.tall` holds each board's bounds with `h` 9.6; `lookAlong(d)` round-trips through `followForward` for every camera class and 8 directions.
  - `labs-arrival.test.ts`: replace the projection helpers so a face is projected from `center ± along * width/2` at `base` and `h`, offset by `normal * w/2`. Desktop 1440x900 and 2560x1440: all three faces inside the safe box, ordered Product, Data and ML, AI left to right, on-screen gaps at least 40 px (1440) and 60 px (2560). 390x844: Data and ML face inside the safe box; each side face at least 35 percent on screen; the three road mouths on screen. From each stop at the three sizes: the board's face inside the safe box. Legibility: title em at least 15 px on arrival at 1440x900; list em (0.37) at least 9.2 px at 1440x900 and 14.4 px at 2560x1440 on arrival; compact list (0.45) at least 9.6 px from the stop at 390x844. Remove every sign case.
  - `facing.test.ts`: replace "L3 floating wing signs" with "L3 side boards face the arrival camera": for each side board, `dot(normal, toward(center, eye)) > 0.9` and the front reading direction `along` points screen right for that camera.
  - `labs-directory.test.ts` (geometry part): `wallSolids()` has 3 boards and 4 posts with the yaws above; every solid corner lies within its board's or post's bounds; `wallLines()` per board 12 rim edges plus 2 underlines in the wing tint, 4 vertical edges per post; label positions sit `PANEL.out` off a face and inside the board's span. Drop the road signs block.
- [ ] **Step 2: Run** `bunx vitest run tests/unit/labs-layout.test.ts tests/unit/labs-arrival.test.ts tests/unit/facing.test.ts tests/unit/labs-directory.test.ts` (FAIL).
- [ ] **Step 3: Implement.** In `directoryBoard`: data `{ center: { x: dataX, z: 0 }, normal: { x: -1, z: 0 } }`; side `{ center: { x: side.x, z: WING_SIDE[wing] * side.z }, normal: { x: -Math.cos(turn), z: -WING_SIDE[wing] * Math.sin(turn) } }`; bounds from the four corners `center ± along * width/2 ± normal * w/2`; `stop = center + normal * (w/2 + boardStop)`. `wallPosts`: gate posts at `center ± along * (width/2 - post/2)`, `across = w`, `along = post`; pylons at the side centers with `pylon`; rect = bounds of the rotated footprint. In `buildLabsLayout`: side stop spurs `from` = `projectOnSegment(stop, mouth(wing), { x: wingStartX, z: WING_SIDE * wingZ }).point`; side board zones `{ id: "L3:directory:<wing>", area: stop ± 1.5, yaw: lookAlong({ x: -normal.x, z: -normal.z }), zoom: boardZoom, classView: { mobile: { zoom: boardZoomPhone } } }`; data zone as before with `minZ/maxZ = ±width/2`; lanes start at `dataX + w/2 + 1`; `tall` from board bounds with `h`. Update the module comment and `LABS` doc comments. `Hub.tsx`: render only `DirectoryWall`. Update `src/experience/floors/labs/directory.ts` geometry functions and `textWidth() = width - 2 * inset`.
- [ ] **Step 4: Run** the four test files plus `bunx vitest run tests/unit/labs-*.test.ts tests/unit/interact-registry.test.ts tests/unit/floor-pads.test.ts tests/unit/tech-reactor.test.ts` and `bun run typecheck` (PASS).
- [ ] **Step 5: Commit** `feat(l3): three separate directory boards at their road mouths, no duplicate road signs`.

---

### Task 4: Symmetric reactor end

**Files:**
- Modify: `src/experience/floors/labs/layout.ts` (`loopEnd`, `wingRoad`, `returnPad`, `LABS.returnPadX`)
- Test: `tests/unit/labs-spine.test.ts`, `tests/unit/floor-pads.test.ts` (if it pins the L3 pad), new case in `tests/unit/labs-layout.test.ts`

**Interfaces:**
- Produces: `LABS.returnPadX = 13`; both wing roads `[hubC, mouth, (wingStartX, ±wingZ), (loopEnd.x, ±wingZ), (loopEnd.x, ∓REACTOR.ring)]`; `floor.returnPad = { x: loopEnd.x + LABS.returnPadX, z: 0 }`.

- [ ] **Step 1: Failing test** "mirrors the reactor end about the spine axis" for the real pods, an 11-pod AI wing, short side wings with eight hero spine pods and an empty floor: the last two points of the `software` and `ai` roads are mirror images (x equal within 0.5, z negated within 0.5); the turn x equals `layout.east.center.x`; the ring entries are due north and south of the reactor center; the spine's last point is at z = 0; the return pad has z = 0 and x > the ring's outer edge; pad and space rules pass.
- [ ] **Step 2: Run, verify FAIL** (Product turns at 113 today).
- [ ] **Step 3: Implement**: compute `loopEnd` first, then `turn = { x: loopEnd.x, z }` for both wings. Update the "places the reactor plaza ... Return pad" expectation in `labs-spine.test.ts`.
- [ ] **Step 4: Run** `bunx vitest run tests/unit/labs-*.test.ts tests/unit/floor-pads.test.ts tests/unit/fast-return.test.ts tests/unit/interact-registry.test.ts` (PASS).
- [ ] **Step 5: Commit** `feat(l3): mirror-symmetric reactor end, Return pad on the axis`.

---

### Task 5: Clean board text

**Files:**
- Modify: `src/experience/floors/labs/directory.ts` (`PANEL`, `LIST_STYLE`, `fitTitle`, `boardList`, `wallLabels`, `DirectoryLabels.more`, `DirectoryFonts.sans`), `src/experience/floors/Labs.tsx` and `src/experience/Experience.tsx` (pass `more`), `messages/en.json` and `messages/id.json` (`walk.boardMore`: "+{count} more" / "+{count} lainnya"; the walks-removal PR moves the board strings to `labs.*`: whoever merges second carries this key over), `content/site-content.json` (short titles).
- Test: `tests/unit/labs-directory.test.ts`

**Interfaces:**
- Produces: `fitTitle(name, width): { text: string; size: number }` (one line, uppercase, size `min(PANEL.title.size, width / (0.6 * length))`); `boardList(list, maxLines, style?): { marks: string; text: string; entries: number; lines: number; more: number }` (marks and text have the same line count; continuation lines of the marks column are `\u00A0`; `more` = `list.length - entries`); `listWidthEm(style): number`.

- [ ] **Step 1: Failing tests**: every wing name in both locales fits one line at `PANEL.title.size`; for both locales and both styles, every shown entry (`shortTitle ?? title`) is one line within 97 percent of `listWidthEm(style)` and never contains "..."; marks and text have equal line counts and the marks column starts each entry; the footer reads `▸ OPEN THE FULL LIST · +N MORE` when N > 0 and fits `textWidth()` in mono at `PANEL.footer.size`; each face has five labels (title, sub, marks, list, footer), list labels use `fonts.sans` and the list ink, titles the wing tint; panel rows keep the list between the underline block and the footer with room for `entries` lines in both styles; legibility tests from Task 3 still pass.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** per the Decisions table; wrapping fallback (only for content that does not fit): wrap at word boundaries by `interWidth`, at most `perEntry` (2) lines, the last line ends on a whole word followed by "..." if more remained. Add the `shortTitle` values the test asks for (Title Case, at most 32 characters, faithful to the title; for example "Serupa Ticket Hub", "Anime Figure E-Commerce" / "E-Commerce Figure Anime", "Platform Keamanan Kode AI", "Review Dokumen Fraud AI", "Fabric Demand Forecasting" / "Forecasting Permintaan Fabric", "IFEST 2021 E-Wallet Sentiment" / "Sentimen E-Wallet IFEST 2021", "COVID-19 Herd Immunity Forecast" / "Prediksi Herd Immunity COVID-19", "Sentiboard (IndoBERT)"), each only where the fit test needs it. Run `bun run validate:content`.
- [ ] **Step 4: Run** `bunx vitest run tests/unit/labs-directory.test.ts tests/unit/labs-arrival.test.ts tests/content tests/unit/client-namespaces.test.ts` and `bun run typecheck` (PASS).
- [ ] **Step 5: Commit** `feat(l3): one-line board text, short titles, +N more, quieter list`.

---

### Task 6: End-to-end coverage

**Files:**
- Modify: `e2e/labs-paths.spec.ts`

- [ ] **Step 1**: Arrival: assert no floating sign group on L3 names a wing (`__hq.probes.signs` values: no text equal to an uppercase wing name), the board bounds in `__hq.layouts.L3.tall` (the three entries with `h` equal to the board height) are pairwise at least 1.5 u apart, and `__hq.interact.screenOf("L3:board:<wing>")` centers order Product, Data and ML, AI left to right on desktop. End: the `software` and `ai` road junction points mirror within 0.5 u, the spine ends on z = 0, the `return:L3` pad (`__hq.layouts.L3.pads`) sits on z = 0. Keep the capture poses (`board-<wing>`, `reactor-approach`, `reactor-top`).
- [ ] **Step 2**: `bun run build`, then `E2E_PORT=<port> bunx playwright test e2e/labs-paths.spec.ts e2e/spectacle.spec.ts e2e/reactor.spec.ts e2e/labs-data.spec.ts e2e/labs.spec.ts e2e/fast-return.spec.ts e2e/production.spec.ts` (PASS).
- [ ] **Step 3: Commit** `test(l3): separate boards, one name per path and a mirrored end`.

---

### Task 7: Docs

- [ ] `AGENTS.md`: L3 Project Roads (boards, no road signs, symmetric turns), Data and ML spine (Fabric first, 6 pods, pandas lights the five repo pods), Fast return (L3 pad on the axis), schema additions (`Pod.shortTitle`), Tech Reactor note. `docs/features.md` L3 section and status log. `docs/content.md` (`shortTitle`). Commit `docs: L3 neat entrance, symmetric end, short titles`.

### Task 8: Verification, measurements, PR

- [ ] `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=<port> bun run e2e:perf` (L3 chunk, floors, peaks).
- [ ] After captures: `LABS_SHOTS=<files>/shots/after E2E_PORT=<port> bunx playwright test e2e/labs-paths.spec.ts`; compare with `shots/before` (main 4bb8579a).
- [ ] Check CI capacity, push, open the PR (not merged), report to the coordinator with captures and numbers.
