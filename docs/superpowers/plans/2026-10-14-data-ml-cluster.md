# Data and ML Project Cluster Implementation Plan

Status: shipped in #96 (b49ea73), 2026-10-14. Later replaced in #164: the east annex, data plaza and third directory panel, by the Data and ML spine. Later removed in #167: the data wing walk

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third L3 wing, "Data and ML" (`data`), with 5 to 6 real project pods built from the owner's public GitHub repos, docked in an east annex past the Tech Reactor, lit by the reactor's Data ring, filterable on the Classic `/labs` page, reachable from Cmd-K and deep links, and known to Ask the HQ.

**Owner request (verbatim):** "Btw i havent seen so much data related projects beside the fabric (but thts have dashboard app too) check my personal github for it". Owner choice: "Add a 'Data and ML' cluster of 5 to 6 real project pods on L3 (thesis IndoBERT line, IFest 2021 finals, N-BEATS forecast, Streamlit optimizer, Kampus Merdeka crawler), each with a short case card from the repo, so the Tech Reactor's Data ring lights them; Classic /labs gets a Data filter (Recommended)".

**Architecture:** `WingSchema` gains `data`. The two hub wings (`software` north, `ai` south) keep their geometry byte for byte; the data wing gets its own road that leaves the reactor ring road at its east point and runs east along z = 0, docks its pods alternating north and south (same slot, gap and forecourt rules), and ends in a round "data plaza" with a third directory panel just east of it (same merged wall mesh, line batch and BatchedText, so no new draw call or program). The data pods start east of the old slab end, so the Express Return pad, the reactor stop and the inner pocket (x 91 to 103, |z| 9 to 20, the parallel Ops Control Room session) stay untouched. Pods carry optional `repos` (public `github.com/ShinyQ/...` links; several pods span more than one repo) and `publications` (ids of existing `library.publications`), rendered on the case study page and in the Glass Drawer.

**Tech Stack:** Next.js 16 static export, React Three Fiber, zod content schema, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere.
- No first person in titles and taglines (`hasFirstPerson`); Title Case for pod titles (`titleCase`).
- EN and ID for every content and UI string; `messages/en.json` and `messages/id.json` keep identical keys.
- Facts only from the repos (README, notebook outputs, commit dates) and existing site content; every number cites its source in the result `context`; `confidence: "verified"` only when the repo shows it. No client names (personal, academic, competition work). Never invent a rank: IFEST 2021 placing comes from `awards[]` (`ifest-2021-data-analysis`, 1st place).
- Do not duplicate L2 Workshop side projects that are not chosen pods: `real-estate-cluster-map` stays a side project only.
- Do not change the home featured top 3 (`pickFeaturedPods`).
- Budgets: L3 under 150 scene calls, under 30k triangles at every peak, programs within `e2e/perf/baseline.json` + 2; reuse `fx/holoFx.ts` and existing pod materials; lite simpler; reduced motion static.
- Ask pack under 200 KB (`PACK_MAX_BYTES`); trim per runbook deviation 8 and report the change.
- Own e2e port `E2E_PORT=4457`, never 4173. CI is the authority for heavy e2e.
- Keep clear of the L3 inner pocket x 91..103, |z| 9..20.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/content/schema.ts` | `WingSchema` adds `data`; `Pod.repos`, `Pod.publications` |
| `content/site-content.json` | 5 to 6 data pods; `podRef` on matching timeline entries |
| `src/content/tech-rings.ts`, `src/content/tech.ts`, `public/tech/README.md` | rings and logos for the new techs |
| `src/experience/floors/labs/layout.ts` | `HUB_WINGS`, data annex (road, plaza, board, docking), `directoryStops` |
| `src/experience/floors/labs/directory.ts`, `Hub.tsx` | three panels from `layout.boards`, data wing sign |
| `src/experience/floors/labs/techReactor.ts` | `roadGlow` for the data road |
| `src/experience/missions/walks.ts`, `host3d.ts`, `interact/registry.ts` | data wing tour stops, listed-pod stop, data board target |
| `src/experience/types.ts` | `FloorLayout.directoryStops` |
| `src/content/pageview.ts`, `src/components/page/WorkIndex.tsx`, `src/app/[locale]/labs/page.tsx`, `src/app/[locale]/labs/[slug]/page.tsx`, `src/app/[locale]/quick/page.tsx` | Data filter, wing card, repo and research links, quick view section |
| `src/content/room-views/labs.ts` | drawer: data accent, code and research links |
| `src/lib/accent.ts`, `src/lib/jsonld.ts`, `src/ask/pack.ts`, `functions/_lib/tags.ts`, `functions/_lib/askStats.ts` | wing accent, genre, Ask wing name and tags |
| `src/hud/index-data.ts` (Cmd-K) | wing rows ("Data and ML projects") |
| `messages/{en,id}.json` | wing names, intros, links |
| `tests/...`, `e2e/labs-data.spec.ts`, `scripts/e2e-plan.ts` | tests |
| docs | README, AGENTS.md, specs 01, 07, 08, runbook |

---

### Task 1: Content model (wing, repo, publications)

**Files:** Modify `src/content/schema.ts`; Test `tests/content/dataset.test.ts`, `tests/unit/schema.test.ts`.

**Interfaces:** Produces `Wing = "software" | "ai" | "data"`, `Pod.repos?: string[]` (1 to 4, https, `github.com/ShinyQ/<repo>` roots only), `Pod.publications?: string[]` (ids that must exist in `floors.library.publications`).

- [x] Write failing schema tests: a pod with `wing: "data"` parses; `repos: ["https://gitlab.com/x"]` and `repos: ["https://github.com/other/x"]` fail; dataset test: every `publications` id resolves; every data pod has `repos`.
- [x] Run `bunx vitest run tests/unit/schema.test.ts tests/content/dataset.test.ts`: FAIL.
- [x] Implement `WingSchema = z.enum(["software", "ai", "data"])`, `GITHUB_REPO = /^https:\/\/github\.com\/ShinyQ\/[A-Za-z0-9._-]+$/`, `repos: z.array(httpsUrl.regex(GITHUB_REPO)).min(1).max(4).optional()`, `publications: z.array(SlugSchema).min(1).optional()`, cross-ref in `SiteContentSchema` superRefine.
- [x] Fix every `Record<Wing, ...>` the compiler flags (`bun run typecheck`) with the data entries named in the File Structure table.
- [x] Run tests: PASS. Commit `feat(content): data wing, pod repo and publication links`.

### Task 2: Tech rings and logos for data techs

**Files:** Modify `src/content/tech-rings.ts`, `src/content/tech.ts`, `public/tech/README.md`; Test `tests/unit/tech-index.test.ts`, `tests/unit/tech.test.ts`.

- [x] Failing test: every `data` wing pod has at least one tech on the `data` ring (`getTechIndex()`), and every other tech of a data pod is on `data`, `ai` or (Python only, a CV language) `backend`.
- [x] Add `EXTRA_RING` entries (data: pandas, numpy, jupyter, plotly, streamlit, pulp, scipy, matplotlib, beautiful soup, selenium, requests; ai: indobert, indobertweet, transformers, pytorch, tensorflow, keras, scikit-learn, n-beats) limited to the techs the pods really use (stale-entry test), and logos or `TEXT_ONLY_TECH` entries.
- [x] PASS; commit `feat(reactor): data and ML techs on the Data and AI rings`.

### Task 3: Data pods content

**Files:** Modify `content/site-content.json`, `tests/content/dataset.test.ts`, `tests/content/cv-facts.test.ts` (only if a CV marker moves).

Facts source: `files/repo-facts.md` (session artifact, from `gh` reads of each repo). Pods (tier `featured`, wing `data`, accent `amber`, hologram `chart` or `graph` or `pipeline`, no `client`):

1. `university-sentiment-indobert` (thesis line, `timelineRef: sentiboard-2022`, `publications: [sentiboard-bsc-thesis, sentiboard-paper, indobert-university-reviews-model]`)
2. `ifest-2021-sentiment-analysis` (IFEST 2021 final and selection phase, `timelineRef: research-ewallet-sentiment-2021`, placing from `awards[]`; plus the selection-phase e-wallet repos, `publications: [ewallet-sentiment-cnn-lstm]` only if the paper is the same work)
3. `covid-herd-immunity-forecast` (N-BEATS, `timelineRef: research-covid-forecasting-2021`, `publications: [covid-19-herd-immunity-study]`)
4. `stock-allocation-optimizer` (Streamlit, SLSQP)
5. `kampus-merdeka-reports-crawler`
6. No sixth pod: the DAC 2022 repo has no placing and holds personal data (student IDs, photos); the real estate map is already an L2 side project.

- [x] Failing dataset test: exactly the planned data slugs exist, all `featured`, each with `repos`, `pickFeaturedPods` top 3 unchanged (`voice-ai-contact-center`, `ai-code-security-platform`, `fraud-review-platform`), `real-estate-cluster-map` is not a pod.
- [x] Add the pods (EN and ID), `podRef` on the linked timeline entries where the schema allows.
- [x] `bun run validate:content`, `bun scripts/title-case.ts`, safety and first-person tests: PASS. Commit `feat(content): Data and ML pods from public repos`.

### Task 4: L3 data annex layout

**Files:** Modify `src/experience/floors/labs/layout.ts`, `src/experience/types.ts`, `src/experience/floors/labs/techReactor.ts`; Test `tests/unit/labs-layout.test.ts`, `tests/unit/tech-reactor.test.ts`, `tests/unit/labs-reactor.test.ts`.

**Interfaces:** Produces `HUB_WINGS: readonly ["software", "ai"]`, `WING_SIDE: Record<HubWing, -1 | 1>`, `WING_TINT: Record<Wing, string>` (data `#fbbf24`), `LABS.data = { start, plaza: 18, maxPods: 8 }`, `LabsLayout.boards: Record<Wing, DirectoryBoard>`, `LabsLayout.signs: Record<Wing, ...>`, `LabsLayout.dataPlaza: Plaza | null`, `FloorLayout.directoryStops?: Partial<Record<Wing, Vec2>>`, `directoryStop(wing, layout?)`.

- [x] Failing tests: software and ai placements, roads, bounds-x up to the old slab end, boards, view zones and the return pad equal the layout built without data pods (geometry unchanged); data pods dock east of `LABS.east` rim + margin, alternate north and south, at least 6 u apart, doors face the data road; the data road starts on the ring road's east point and ends at the data plaza; the data board stands east of the plaza with its stop on the plaza; nothing intersects the inner pocket (x 91..103, |z| 9..20) or the return pad; `expectSpaceRules` and `padViolations` pass; `roadGlow` lights the data road from the ring to the westmost lit data spur.
- [x] Implement; PASS; commit `feat(l3): Data and ML annex east of the Tech Reactor`.

### Task 5: Directory panel, wing sign, interactions, walk

**Files:** Modify `directory.ts`, `Hub.tsx`, `interact/registry.ts`, `missions/walks.ts`, `missions/host3d.ts`, `hud/walk/WalkLayer.tsx`; Test `tests/unit/labs-directory.test.ts`, `tests/unit/interact-registry.test.ts`, `tests/unit/walk.test.ts`, `tests/unit/missions-host3d.test.ts`.

- [x] Failing tests: `wallSolids(layout.boards)` has three panels, data panel lines in amber, data labels list the data pods (compact phones top 3); registry has `L3:board:data`; `labsWalk` tours software, ai, data then three board stops; `roomTarget` for a listed data pod returns the data board stop.
- [x] Implement (functions take `boards` from the layout; Hub draws three panels in the same three calls and three wing signs in the same sign group); PASS; commit.

### Task 6: Classic site and drawer

**Files:** `pageview.ts`, `WorkIndex.tsx`, `labs/page.tsx`, `labs/[slug]/page.tsx`, `quick/page.tsx`, `room-views/labs.ts`, `lib/accent.ts`, `lib/jsonld.ts`, `messages/*.json`; Test `tests/unit/pageview.test.ts`, `tests/hud/WorkIndex.test.tsx`, `tests/unit/room-views.test.ts`, `tests/unit/seo-copy.test.ts`.

- [x] Failing tests: `parsePodFilter("?wing=data")` keeps `data`; `wingCounts` counts data; WorkIndex shows a "Data and ML" chip; pod room view of a data pod has a "Code and research" section with the GitHub link and the publication links.
- [x] Implement: wing chips order `all, ai, data, software`; labs page wing cards 3 columns; case page "View code on GitHub" button and a "Research" chapter (paper preview triggers for papers and the thesis, links for models); quick view data section; PASS; commit.

### Task 7: Cmd-K and deep links

**Files:** `src/hud/index-data.ts` and the palette; Test palette tests.

- [x] Failing test: the HUD index has wing rows (`L3` wings) with static path `/labs?wing=<wing>` and a 3D target (the wing's board stop); "Data and ML projects" matches "data", "ml", "machine learning".
- [x] Implement following the `HudIndex.techs` pattern; PASS; commit.

### Task 8: Ask the HQ

**Files:** `src/ask/pack.ts`, `functions/_lib/tags.ts`, `functions/_lib/askStats.ts`, `tests/ask/golden.json`, `content/ask/suggestions.json` (optional), `docs/ask-runbook.md`.

- [x] Failing tests: pack has a chunk per data pod with wing name "Data and ML"; tags map data pods to `data` (or the closest allowlisted tag); two new golden questions (data projects overview, the IndoBERT thesis model) retrieve the data chunks; pack under 200 KB.
- [x] Trim (deviation 8: repo or post text first), record before/after sizes in the runbook; PASS; commit.

### Task 9: E2E and measurement

**Files:** `e2e/labs-data.spec.ts`, `scripts/e2e-plan.ts`, existing e2e fixes.

- [x] Spec: deep link `/en/labs/<data pod>?tier=lite` opens its drawer; point-and-go on the data board opens the palette; `/en/labs?wing=data&tier=static` shows only data rows; reactor Data ring pick of `pandas` (or the shared data tech) lights every data pod (`__hq.probes.reactor.lit`).
- [x] `bun run verify:quick`, `E2E_PORT=4457 bun run e2e:changed`, `E2E_PORT=4457 bun run e2e:perf` (L3 floors and peaks), visual gate for the unchanged hub and wings, captures at 1440x900 full, 2560x1440 full, 390x844 lite.

### Task 10: Docs and PR

- [x] README, AGENTS.md (schema additions, L3 paragraph, Tech Reactor rings), specs 01 (world layout), 07 (content map), 08 (acceptance), runbook pack size.
- [x] Push, open the PR, get "Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI", "3D perf gates" green. Do not merge.
