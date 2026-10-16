# Clearbox and Sewise Fashion Labs Pods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the owner's two new projects to the portfolio as L3 pods with masked, synthetic-data galleries: Clearbox (public, AI Engineering) and, only if the owner approves (see Gate), Sewise Fashion Labs.

**Architecture:** Content is data: one pod entry per project in `content/site-content.json` (bilingual, Title Case titles, `shortTitle` for the L3 boards), gallery webps in `public/media/<slug>/` (1600x1000 plus `.thumb` 480 px and `.w1200`), tech logos and reactor rings for new stack names, then the pinned L3 numbers that move when a wing docks one more pod, an Ask golden question, and the docs that list pods.

**Tech Stack:** Next.js 16 static export, Bun, Vitest, Playwright, cwebp, Python Pillow (triptych), tesseract (OCR check).

## Global Constraints

- No em dashes (U+2014) anywhere.
- No first person in titles, `shortTitle` and taglines; role, problem, approach and results may use "I" / "saya".
- Every content string is `{ en, id }`; Indonesian natural and professional, technical terms in English.
- Titles in Title Case (`bun scripts/title-case.ts`); `shortTitle` at most 32 characters and shorter than `title` in each locale.
- Never commit 2026 hackathon entries (AGENTS.md hard rule) unless the owner overrides it in writing; never commit money amounts, client names, private evidence.
- Sources are read from fresh clones under the session folder only; the owner's working copies are never built, run or modified.
- Screens are captured from local instances with synthetic or seed data only; every write request is blocked during capture; any money figure is blurred in the page before capture.
- Gallery images: 1600x1000 webp, metadata stripped, `.thumb.webp` 480 px, `.w1200.webp` via `bun scripts/media-sizes.ts`; `redacted: true` only after OCR and by-eye review.
- Featured pods per wing at most 7; docked (hero plus featured) per wing at most `LABS.maxPerWing` (12); Ask pack under 256 KiB; L3 floor chunk under 20 KB gzip.
- No `liveUrl` without an owner decision (neither project has a public deployment).
- Product name "Sewise Fashion Labs" on every surface; never "pola" / "Pola.ai" in user-facing text.

## Gate (owner decision needed)

Sewise is documented in its own repository as a 2026 hackathon entry (`docs/README.md` "Hackathon alignment", `docs/gform-answer.md` entry form with a four-person team plan), while git shows every commit and PR by ShinyQ. AGENTS.md forbids committing 2026 hackathon entries. Tasks 5 and 6 run only after the coordinator relays the owner's decision; Tasks 1 to 4 do not depend on it.

## Evidence (fresh clones, 16 Oct 2026)

| Claim (Clearbox) | Evidence |
|---|---|
| 179 commits, all by Kurniadi, 15 Oct 15:54 to 16 Oct 16:40 2026 | `git log` |
| MIT, public, TypeScript | `LICENSE`, `gh repo view` |
| Pipeline: signals, guardrails, Microsoft-Decision-1, per-sender priors, deterministic fusion; trash only above a calibrated threshold of at least 0.80 | README "Architecture", `packages/core` |
| Nightly threshold tuning to the lowest value that keeps delete precision at or above 98% | README "Highlights" |
| No permanent delete; Undo for 24 hours; Cloudflare Access plus JWT check; AES-256-GCM tokens; EU D1; Decision-1 in Sweden Central | README "Highlights", "Security" |
| 1,589 automated tests pass (Vitest: core 645, Worker 401, SPA 438, eval 55; node:test scripts 50) | `pnpm test` and `node --test scripts/test/*.test.ts` on the clone |
| Model evaluation on 40 synthetic labeled emails | `eval/fixtures/emails.jsonl` (40 lines) |
| No public deployment (self-hosted per owner, behind Cloudflare Access) | README "What is this", "Deploy" |

---

### Task 1: Clearbox gallery and pod entry

**Files:**
- Create: `public/media/clearbox/0{1..7}-*.webp`, `.thumb.webp`, `.w1200.webp`
- Modify: `content/site-content.json` (append pod `clearbox` to `floors.labs.pods`)
- Modify: `src/content/tech.ts`, `public/tech/README.md`, `public/tech/*.svg` (Vite, Cloudflare Workers, Cloudflare D1), `src/content/tech-rings.ts` (rings for new keys)
- Test: `tests/content/dataset.test.ts`, `tests/content/assets.test.ts`, `tests/unit/media-sizes.test.ts`, `tests/unit/tech.test.ts`, `tests/unit/tech-index.test.ts`, `tests/content/title-case.test.ts`, `tests/content/first-person.test.ts`, `tests/content/safety.test.ts`

**Interfaces:**
- Produces: pod slug `clearbox`, wing `ai`, tier `featured`, `repos: ["https://github.com/ShinyQ/Clearbox"]`, 7 assets under `/media/clearbox/`.

- [ ] **Step 1: Convert the captures** (raw PNGs at 2880x1800 in the session folder `capture/cb/`): `cwebp -quiet -q 82 -metadata none -resize 1600 0 in.png -o NN-name.webp` and `-resize 480 0` for `.thumb.webp`. Names: `01-review`, `02-clean-up`, `03-unsure-group`, `04-insights`, `05-activity`, `06-rules`, `07-mobile` (triptych 3200x2000 composed by `capture/compose.py`).
- [ ] **Step 2: OCR check** every webp (normal and inverted) with tesseract against the committed blocklist, the forbidden patterns (money, phone, Azure hosts, em dash) and email addresses outside `example.*`; expect no hits. Review each image by eye.
- [ ] **Step 3: Add the pod entry** (text in the Appendix below), then `bun scripts/media-sizes.ts` to write the `.w1200.webp` files.
- [ ] **Step 4: Register tech** that does not resolve (`Vite`, `Cloudflare Workers`, `Cloudflare D1`): an svg in `public/tech/` with its source and licence line in `public/tech/README.md`, a `svg(...)` entry in `tech.ts`, and a ring in `EXTRA_RING` (`vite` frontend, `cloudflare workers` and `cloudflare d1` devops or backend per the existing Cloudflare Pages entry).
- [ ] **Step 5: Run** `bun run validate:content && bunx vitest run tests/content tests/unit/tech.test.ts tests/unit/tech-index.test.ts tests/unit/media-sizes.test.ts`; expect PASS except pinned L3 numbers (Task 2).
- [ ] **Step 6: Commit** `feat(media): Clearbox gallery from the synthetic dev seed` and `feat(content): Clearbox pod (AI Engineering, featured)`.

### Task 2: L3 pins and docs for 11 docked AI pods

**Files:**
- Modify: `tests/unit/labs-layout.test.ts` (docked counts `[9, 10]` to `[9, 11]`), `tests/unit/labs-ops.test.ts` (Ops room rect, door, spur, reactor center), any other failing pin in `tests/unit/labs-*.test.ts` and `tests/unit/labs-arrival.test.ts`
- Modify: `AGENTS.md` (L3 counts and coordinates: "today Product Engineering docks 9, AI Engineering 10", Ops room x, reactor x, slab end, Return pad), `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, `docs/superpowers/specs/agent-hq/07-content-map.md` (AI wing table row), `docs/features.md` if it lists L3 numbers

- [ ] **Step 1:** `bunx vitest run tests/unit/labs` and list failures.
- [ ] **Step 2:** For each failure, confirm the new value follows the documented rule (a wider AI wing pushes the Ops room, the reactor plaza and the Return pad east by one pitch) and update the pin with a dated comment.
- [ ] **Step 3:** Update the docs with the measured numbers.
- [ ] **Step 4:** `bunx vitest run tests/unit` PASS; commit `test(l3): pins for 11 docked AI Engineering pods`.

### Task 3: Ask golden question

**Files:** `tests/ask/golden.json` (q65), `tests/ask/pipeline.test.ts` (65 items, threshold 62)

- [ ] **Step 1:** Add `{"id": "q65", "lang": "en", "q": "What is Clearbox?", "facts": ["Gmail", "Outlook"], "expect": {"all": ["clearbox"], "any": ["inbox", "email"]}}`.
- [ ] **Step 2:** Update the count test; `bunx vitest run tests/ask` PASS (drift and pack size under 256 KiB); commit `test(ask): golden q65 for Clearbox`.

### Task 4: Verification

- [ ] `bun run verify:quick`, `bun run e2e:changed`, and `E2E_PORT=<port> bun run e2e:perf` (L3 docking changes floor geometry). Record L3 scene calls, triangles, programs and the L3 chunk size for the PR.

### Task 5 (gated): Sewise gallery

Run the API with `REPO_BACKEND=memory` and the web app from a fresh clone; capture 4 to 8 desktop screens at 1440x900 @2x plus a phone triptych from seed data; mask any money figure; same conversion and OCR steps as Task 1, folder `public/media/sewise-fashion-labs/`.

### Task 6 (gated): Sewise pod

Pod `sewise-fashion-labs`, wing and tier per the owner's decision (proposal: `software`, `featured`, no `repos` because the repository is private, no `liveUrl`); then Task 2 and Task 3 equivalents for that wing.

---

## Appendix: Clearbox pod text

Final EN and ID text lives in `content/site-content.json`; the PR body repeats it with the evidence table above.
