# Impact-First Results, Pagination and Key Project Chapters Implementation Plan

Status: in review

> **For agentic workers:** Execute serially in one session; research lanes (metric mining, chapter drafts) may run as
> read-only subagents. Track tasks in the session SQL database.

**Goal:** Ship the approved spec `docs/superpowers/specs/2026-11-13-impact-first-results-design.md`: impact results lead
and volume metrics become context, "More projects" and Blog paginate, and every key project has the 8 standard chapters.

**Architecture:** Optional `kind` and `delta` on results and stats, read only through client-safe selectors in
`src/content/selectors.ts`; one server `DeltaValue` renderer; one client `Paginated` wrapper over server-rendered rows
with pure helpers in `src/content/pagination.ts`; a pure `caseChapters(pod)` selector and a schema rule for key projects.

**Tech Stack:** Existing Next.js static export, React, TypeScript, Bun, next-intl, Zod, Vitest, Playwright, Lighthouse
CI. No new dependencies.


## Tasks

1. Schema: `ResultKindSchema`, `DeltaSchema`, result checks (delta only on impact, value reads before then after,
   headline is impact), pod check (at least one impact result), stats checks (6 lead, at most 2 scale with `short`,
   `heroProof` lead only). Vitest in `tests/content/impact.test.ts`.
2. Selectors: `isImpact`, `impactResults`, `scaleResults`, `headlineResults` (impact only), `leadResult`, `leadStats`,
   `scaleStats`; `keyResult`, `beforeAfterResults`, `WorkRow`, `FeaturedProject`, room views and the stats ring read
   them. Vitest in `tests/unit/selectors.test.ts`.
3. Renderers: `DeltaValue` (full and compact), strip, ledger with the scale line, homepage proof strip, ledger
   footnote, /quick. Messages `common.delta`, `home.scaleNote`, `labs.scaleLine` in en and id.
4. Content (mechanical): deltas on existing before and after results, `fraud-false-positives` and
   `dashboard-payload` stats, scale kind on the PR and contribution stats, `heroProof` with the voice stat.
5. Pagination: `src/content/pagination.ts`, `Paginated`, `pageItemAttrs`, CSS, `/labs` and `/library` wiring, filter
   resets. Vitest and Playwright (`e2e/pagination.spec.ts`).
6. Key projects: tier swap, `caseChapters`, key-project schema rule, `STORY_SLUGS` with `ai-app-accelerator`, the
   assistant's engineering topics, the template's story and engineering; tests and 3D follow-ups.
7. Content pass: classify every result, headlines, owner-reviewed mined deltas and qualitative outcomes (review table
   in the PR description, public-safe columns only).
8. Docs: `docs/agents/content.md`, `page-view.md`, `floor-l1-lobby.md`, `docs/features.md`, `docs/content.md`, the
   decision file.
9. Gates: `bun run verify:quick`, `bun run e2e:changed`, the L3 and L1 perf specs touched by the tier swap and ring.
