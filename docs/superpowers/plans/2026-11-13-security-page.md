# Security Page Implementation Plan

Status: in review

> **For agentic workers:** Execute serially in one session; the evidence check against the cited commits may run as a
> read-only subagent. Track tasks in the session SQL database.

**Goal:** A Classic page `/{locale}/security` (EN and ID) that tells how Kurniadi secures applications, impact first:
before and after deltas lead, volume counts stay small supporting context (owner decision 2026-11-13).

**Architecture:** Page text lives in `content/security.json`, parsed by `SecurityPageSchema` in
`src/content/security.ts` (server only, like the build story). `src/app/[locale]/security/page.tsx` renders it with
the existing Classic parts (`PageIntro`, `SectionSplit`, `DeltaValue`, `ArchitectureDiagram`, `pv-rows`). No 3D
room: like `/build` and `/quick` the page mounts no `ExperienceGate`, and "Back to 3D" opens the Lobby (`threeDPath`).

**Tech Stack:** Existing Next.js static export, React, TypeScript, Bun, next-intl, Zod, Vitest, Playwright, Lighthouse
CI. No new dependencies.

## Evidence

- Source: the owner's security hardening catalog (mined read-only from his git history and IaC across 26 repositories,
  2026-11-13), kept outside the repository. Only its public-safe one-liners and numbers are used.
- Never published: client names, hostnames, resource or repository names, subscription ids, code, secrets, the
  catalog's "Risks found" and "Gaps" sections, and dates finer than the month for incidents.
- Headline numbers were re-checked against the cited commits before writing.

## Sections (owner approved, in order)

1. Hero: one stance line and 3 proof deltas.
2. How I secure applications: 5 principles.
3. Keyless Azure: counts, and one diagram of the keyless flow (at most 12 nodes).
4. AI and LLM security: three evaluation deltas, linked to their case studies.
5. Security products: the AI Code Security Platform and Vulnerability Scanning Automation case studies.
6. Incidents handled, anonymized (month only).
7. Supply chain and CI.
8. How this site is secured (checked against this repository).
9. Background: the two CTF placings from `awards`.

## Tasks

1. Schema, loader and content (`content/security.json`, `src/content/security.ts`); safety and validate-content
   coverage.
2. Route, components and messages (`security` namespace, server only), footer and About links, related case study
   links.
3. SEO: `seo.securityTitle`, the description tails, the share card (`OG_PAGES`), the sitemap (`STATIC_PATHS`), the
   route index, BreadcrumbList plus an `Article` JSON-LD, Lighthouse URL.
4. Ask: a `security` chunk (url `/security`), `isSecurityQuestion` always retrieves it and the answer cites
   `/security` (cite kind `security`), golden items, a pill, embeddings refresh.
5. Docs: `docs/features.md`, `docs/content.md`, `docs/agents/page-view.md`, `docs/agents/content.md`,
   `docs/agents/ask.md`, README routes, a decision file.
6. Gates: `bun run verify:quick`, `bun run e2e:changed` (axe included), Lighthouse budgets.
