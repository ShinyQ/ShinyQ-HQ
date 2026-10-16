# MII Cowork and MII Deck Implementation Plan

Status: shipped in #163 (8dd529c), 2026-10-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "MII Cowork" pod (the owner's UI and UX revamp plus the Deck Studio integration) and update the existing `agent-deck-platform` pod (MII Deck) with verified, git-backed facts, a gallery for Cowork and the right tiers.

**Architecture:** Content only. Both pods live in `content/site-content.json` (`floors.labs.pods`), so the Classic site, `/labs`, L3 (AI wing), Cmd-K, OG cards and the Ask pack pick them up with no component changes. Gallery images go under `public/media/mii-cowork/` through the same capture, masking, OCR and `scripts/media-sizes.ts` pipeline as PR #27, #99 and #144.

**Tech Stack:** JSON content (zod schema `src/content/schema.ts`), Vitest content tests, Playwright over CDP against a headed Chrome with a temporary profile, `cwebp`, tesseract OCR.

## Owner request (verbatim)

"i think i need you to take a look at my project too since i revamp the UI UX its called AgentSandbox (or MII Cowork) on the github but i integrate it with MII Deck check the github i need you to add it into my web (have you add it?? ). Lemme know if you need local access"

Owner decisions: two projects (a new MII Cowork pod and the existing MII Deck pod updated); role phrased from git history without overclaiming (the Cowork platform and backend are led by a colleague); Cowork screenshots from a headed Chrome with a temporary profile that the owner signs in to; MII Deck gallery recaptured only if the live decks show a newer design.

## Global Constraints

- No em dashes (U+2014) anywhere, including commits and PR text.
- No first person in titles and taglines (`hasFirstPerson`); approach steps keep "I" / "Saya".
- Title Case for pod titles (`bun scripts/title-case.ts`).
- No client company names anywhere (C3). The two client decks the owner linked are never named; their URLs, slugs and `pass` values never appear in content, docs, commits, PR text or logs.
- No repo links (both repositories are private) and no `liveUrl` (the Cowork host is a login page, not a public demo).
- Do not change `selected` ranks. A pod with a gallery is at least `featured`.
- Never claim the whole Cowork platform: it is led by a colleague. Claims are limited to what git history shows.
- Mask people's names (other than the owner's), emails, chat contents, workspace and file names that are private, and any client name in every Cowork image; read-only browsing; temp profile deleted after capture.
- Keep L3 budgets (scene calls, triangles, L3 chunk under 20 KB) and the Ask pack under 256 KiB.
- The local working copies of both repositories are read-only. Facts come from fresh clones in `/tmp/hq-src/`.

## Verified facts (fresh clones, 2026-10-16)

| Fact | Source |
|---|---|
| MII Deck: 134 of 136 commits by the owner (the other two: the Cowork deck publisher GitHub App and a Copilot coding agent), 2026-09-12 to 2026-10-05 | `git log` |
| MII Deck: 20 merged PRs by the owner, 20 release tags | `gh pr list`, `git tag` |
| MII Deck: 32 slide blueprints in `kit/blueprints/` | file tree |
| MII Deck CI/CD: PR `validate` check that the Cowork backend waits for before it merges a `deck/<slug>` PR with its GitHub App; deploy on `main` verifies the exact SHA and rolls back to the retained release on failure | `.github/workflows/*.yml`, Cowork `decks/publish.py` |
| Cowork: 194 commits by the owner between 2026-09-23 and 2026-10-06 in 10 merged PRs | `git log`, `gh pr list` |
| Cowork: frontend revamp PR #84, 133 files, no backend or API contract change; MII Light (default) and MII Dark themes, rail navigation, overlay or side-by-side files panel, AA contrast checked in every theme, tested at 1440, 1100, 768 and 390 px | PR #84 body |
| Cowork: 57% of the current frontend source lines (18,785 of 32,765, `git blame -w`, main at 2026-10-15) and 97% of the deck backend module (8,341 of 8,564 lines) are the owner's | `git blame` |
| Cowork Deck Studio (PR #70, #71, #89, #102): agents draft MII Deck slides in the conversation sandbox, QA and critic gates, owner approvals, slide locks, editable PPTX export, publish through a PR | PR titles, `decks/` module |
| The owner's internal-auth change (#104) was removed upstream on 2026-10-15, so it is not claimed | `git log` |
| The two client decks were last changed on 2026-09-15, before the 2026-10-11 gallery capture (#27), so the MII Deck gallery already shows their current design | `git log -- decks/` |

---

### Task 1: Update the MII Deck pod

**Files:**
- Modify: `content/site-content.json` (pod `agent-deck-platform`)
- Test: `tests/content/dataset.test.ts` (add a pin), existing suites

**Interfaces:**
- Produces: pod `agent-deck-platform` with `tier: "featured"`, unchanged slug, title and assets.

- [x] **Step 1: Write the failing test** in `tests/content/dataset.test.ts`:

```ts
it("MII Deck and MII Cowork are featured AI pods with galleries", () => {
  const pods = getPods("ai");
  for (const slug of ["agent-deck-platform", "mii-cowork"]) {
    const pod = pods.find((p) => p.slug === slug);
    expect(pod?.tier).toBe("featured");
    expect(pod?.assets.length).toBeGreaterThan(0);
    expect(pod?.repos ?? []).toEqual([]);
    expect(pod?.liveUrl).toBeUndefined();
  }
});
```

- [x] **Step 2:** `bunx vitest run tests/content/dataset.test.ts` fails (tier is `listed`, no `mii-cowork`).
- [x] **Step 3:** Edit the pod: `tier: "featured"`; role "Sole engineer of MII Deck and of its Deck Studio integration in MII Cowork, from agent authoring to CI/CD and hosting"; approach (agent authoring with QA and critic gates and the 32 blueprints, editable PPTX export, PR-based publishing gated by the `validate` check and merged by a GitHub App, exact-commit deploys with rollback); results: "134 of 136 commits", "20 releases", "32 blueprints", all `verified`; stack adds TypeScript, Python, GitHub Actions and Azure App Service.
- [x] **Step 4:** Run the test (still fails on `mii-cowork` until Task 2) and `bun run validate:content`.
- [x] **Step 5:** Commit `feat(content): MII Deck pod from git history, featured`.

### Task 2: Add the MII Cowork pod

**Files:**
- Modify: `content/site-content.json` (new pod after `agent-deck-platform`), `tests/ask/golden.json` (one golden question), `AGENTS.md` (C3 product line), `docs/superpowers/specs/agent-hq/07-content-map.md` (C3 row), `docs/features.md` status log if it lists pods
- Test: `tests/content/*.test.ts`, `tests/ask/*.test.ts`, `tests/unit/tech-index.test.ts`, `tests/unit/labs-*.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: pod `mii-cowork` (`id === slug`, `wing: "ai"`, `tier: "featured"`, `order: 17`, `timelineRef: "metrodata-2026"`, `client: "Metrodata"` omitted because it is an internal product), assets filled in Task 3.

- [x] **Step 1:** Add the pod with a temporary single asset (the Task 3 cover path) so the Task 1 test can pass once the image exists. Title "MII Cowork UI Revamp and Deck Studio" / "Revamp UI MII Cowork dan Deck Studio"; role "Frontend revamp lead and Deck Studio engineer; the platform and backend are led by a colleague"; results "194 commits" (10 merged PRs), "133 files" (revamp PR, no backend change), "57%" (current frontend source lines), all `verified` with their measuring context.
- [x] **Step 2:** Add a golden question `"What did Kurniadi change in MII Cowork?"` whose facts are present in the pack.
- [x] **Step 3:** Run `bunx vitest run tests/content tests/ask tests/unit/tech-index.test.ts tests/unit/labs-layout.test.ts tests/unit/labs-ops.test.ts tests/unit/labs-data-annex.test.ts tests/unit/labs-arrival.test.ts`; fix pins that move because the AI wing now docks 11 pods (update "today" coordinates in tests and AGENTS.md only when the layout rule still holds).
- [x] **Step 4:** Commit `feat(content): MII Cowork pod`.

### Task 3: Capture the MII Cowork gallery

**Files:**
- Create: `public/media/mii-cowork/NN-name.webp`, `.thumb.webp`, `.w1200.webp`
- Modify: `content/site-content.json` (`mii-cowork.assets`)
- Scratch (never committed): session `files/capture/` (scripts, raw PNGs, OCR dumps)

- [x] **Step 1:** Headed Chrome, fresh `--user-data-dir` in `/tmp`, remote debugging on 127.0.0.1; the owner signs in; poll until the app shell loads.
- [x] **Step 2:** Connect with Playwright `connectOverCDP`; abort every non-GET request except what loading needs; 1440x900 at DPR 2 in MII Light (and one MII Dark shot).
- [x] **Step 3:** Before each shot, blur in the DOM: user names and avatars other than the owner, emails, conversation titles, chat text, file and workspace names that are private, any client name.
- [x] **Step 4:** Screens: home, conversation (masked), files panel, Decks hub, Deck Studio with a product deck (ARIA or eVendor, never a client deck), one MII Dark view, one 390 px phone triptych.
- [x] **Step 5:** Convert to 1600 px webp q80 plus 480 px thumbnails without metadata; `bun scripts/media-sizes.ts`.
- [x] **Step 6:** OCR every image (normal and inverted) and check the dump with `loadBlocklist` / `findBlockedLabels`, `findForbiddenPatterns`, email, phone and hostname patterns; review each image by eye.
- [x] **Step 7:** Wire `assets` (alt text EN/ID, `redacted: true`), run the content tests, commit `feat(media): MII Cowork gallery, masked`.
- [x] **Step 8:** Close Chrome and delete the temporary profile.

### Task 4: Verify and open the PR

- [x] `bun run verify:quick`, `bun run e2e:changed`, and `E2E_PORT=<port> bun run e2e:perf` (L3 docks two more pods).
- [x] Rebase on `origin/main`; check `gh run list -s in_progress` and `-s queued` before pushing; open the PR (not merged) and report to the coordinator.
