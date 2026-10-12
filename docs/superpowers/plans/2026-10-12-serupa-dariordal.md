# R4-K: Serupa and DariOrdal Ticketing Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Serupa event ticketing platform (attendee site, organizer dashboard, Express API) as a new Product Engineering pod with its own Journey entry, refresh the existing DariOrdal ticketing pod from its repository, and give both pods a privacy-reviewed screenshot gallery captured from local runs on sample data.

**Architecture:** Content only on the site side: `content/site-content.json` gets one new pod (`event-ticketing-platform`), one new career entry (`serupa-2025`), a refreshed `limited-quota-event-ticketing` pod and two galleries under `public/media/<slug>/`; every derived surface (Page View, L2 Career Road, L3 Project Roads, Cmd-K, OG cards, sitemap, Ask pack) is generated from that file. Screenshots come from a throwaway toolkit outside the repo (Docker Postgres, Redis and Mailpit, dummy env files, a Playwright capture script with DOM blurring, cwebp conversion, an OCR privacy pass); only the final `.webp` files and their asset entries are committed.

**Tech Stack:** Next.js 16 static export, TypeScript strict, zod 4, Vitest, Playwright 1.64 (capture and e2e), Bun, Docker Compose (local sample-data runs only), libwebp (`cwebp`), ImageMagick (`magick`), Tesseract (OCR privacy pass).

## Global Constraints

- Repo: `ShinyQ/ShinyQ-HQ`, planned against `main` @ `e2a6c53`. Read `AGENTS.md` (Hard rules, Content access "Pod galleries", Content style, Public-safety lint, Ask the HQ, Fast verification) and `README.md` before starting. Never modify the read-only reference clone `files/hq-local`.
- Owner request (verbatim): "I need you to add this ticketing porto too" (three Serupa repositories) and "And this too" (the DariOrdal repository).
- The four source repositories are PRIVATE. Use `gh` read-only (`gh api`, `gh repo view`, `gh repo clone` into the scratch directory). Never commit their code, env files, secrets, internal URLs, customer data or their repository names. Commit messages, PR title and PR body never contain the repository names; say "the Serupa repositories" and "the DariOrdal repository".
- No em dashes (U+2014) anywhere: content, code, comments, docs, commits, PR text. A unit test scans the repo.
- Bilingual: every content string is `{ en, id }`; Indonesian is natural and professional ("saya"), technical terms stay in English. `tests/content/dataset.test.ts` rejects prose copied verbatim into `id` (more than 6 words).
- Title Case for pod titles in both locales (`titleCase`, `tests/content/title-case.test.ts`). Role titles, org names and alt text are not titles.
- Freelance clients are named (C8): the pod `client` is the string `"Serupa"`, the Journey `org` is `"Serupa"`. The public brand shown in the attendee site's logo is "<attendee-site-domain>!"; it may appear inside screenshots (a client brand, like DariOrdal's logo) but never in copy, alt text, slugs or file names. The operating company's legal name never appears anywhere.
- Slugs follow the existing descriptive convention (no client name in pod slugs, see `limited-quota-event-ticketing`, `ticket-marketplace-backend`): the new pod slug is `event-ticketing-platform`. This also keeps the slug from matching any private repository name in the CI `SAFETY_BLOCKLIST` secret. The DariOrdal slug `limited-quota-event-ticketing` never changes.
- Never claim work the owner did not do. Role and approach copy follow the commit evidence in "Role evidence" below: no "Lead" title for Serupa; the teammate's payment and order work is attributed to the teammate (unnamed in public copy).
- Results only from verifiable facts (commit counts, app count); no invented metrics. `confidence` stays internal (never rendered).
- No money amounts in copy (`money amount` forbidden pattern). Prices visible inside screenshots are fictional seed values from a local database.
- Galleries: `public/media/<pod-slug>/NN-name.webp` (1600 x 1000) plus `NN-name.thumb.webp` (480 x 300), webp without metadata, `redacted: true` only after a human-eye review plus the OCR pass, `pod.assets[0]` is the cover. Desktop captures at 1440 x 900, DPR 2; one mobile triptych from three 390 x 844 captures (DPR 2) composed on a 1600 x 1000 canvas (the PR #27 / #45 convention). `public/media` stays under 25 MB (`tests/content/assets.test.ts`).
- Screenshots come only from local runs with sample or seed data and dummy secrets. Nothing is submitted to a real payment gateway, mail server or S3 bucket; requests to the production hosts are blocked in the capture browser. Blur emails, phone numbers and people-name columns; rename seeded people and events to obviously fictional "Demo ..." values before capturing. If an app cannot run within a 45 minute timebox, skip that app's shots and keep its text (never fake UI in an image editor).
- Gallery first (`orderPods` / `comparePods`): never hard-code slugs to reorder lists; ordering follows the gallery, `tier` and `order`.
- `tests/content/dataset.test.ts` allows at most 6 `featured` pods per wing and Product Engineering already has 6. The new Serupa pod is `featured` (owner decision); to stay within the cap this plan moves `limited-quota-event-ticketing` (the other ticketing pod from the same request) to `listed`. It keeps its page, gallery, Journey link and its gallery-first rank in every list; only its L3 dock moves to the wing board. Flag it in the PR.
- Coordination with the parallel R4-J plan (live links for the MII Microsoft sites): R4-J adds `Pod.liveUrl` with a hard-coded host allowlist `PUBLIC_LIVE_HOSTS` (`src/content/live-links.ts`), moves `solutions-marketing-site` into Product Engineering as `featured` order 11, demotes `event-tech-search-backend` to `listed`, and adds golden item `q31` (31 items, threshold 29). This plan works in either merge order: the Serupa `order` is computed (max software order + 1), the featured count stays 6 in both orders (each plan frees the slot it takes), and the golden id, count and threshold are computed from the file. Add a Serupa live link only if R4-J has merged AND `https://<attendee-site-domain>.com` answers with valid TLS at execution time (it failed TLS on 2026-10-12).
- `site-content.json` is written as `JSON.stringify(data, null, 2) + "\n"`; every scripted edit checks the byte-identical round trip first.
- Public copy (2026-10-12): the coordinator asked for this plan in `docs/superpowers/plans/`; private repository names, teammate handles and production hostnames are replaced with placeholders.
- Scratch directory outside the repo: `SCRATCH=/tmp/hq-r4-k` (owner's choice). If your harness forbids `/tmp`, use `SCRATCH=$HOME/hq-scratch/r4-k`. Delete it at the end (Task 10).
- Bun is the package manager. Prefix git with `rtk` (`rtk git add`, `rtk git commit`). Conventional commits. One PR; do not merge without the owner.
- Before pushing: `bun run verify:quick`, then `E2E_PORT=4410 bun run e2e:changed` (another local session may own the default port 4173).

---

## Role Evidence (from the commit history, read 2026-10-12)

Counted with `git shortlog -sne --no-merges HEAD` and `git blame -w` on read-only clones, plus `gh pr list --state merged`. Authors: the owner and one teammate per project (handles withheld).

| Repository | Non-merge commits (owner / teammate / bot) | What the owner's commits touch | What the teammate's commits touch |
|---|---|---|---|
| Serupa backend (Express, created 2025-06-14, last commit 2025-08-17) | 45 / 88 / 0 (owner 34%) | Initial config and app setup (Express 5 on Bun, Helmet, rate limiting, CORS, trust proxy), error and request-logging middleware, Winston logger, sanitizer, JWT auth (login, refresh, email verification, password reset, change password, roles), event CRUD, filters and query builder, public event endpoints, Redis event cache with invalidation, rate-limited Redis view counts, S3 uploads (event covers, user photos; `PutObjectCommand`, no presigned URLs), seeders, HTML email templates, GitHub Actions deploy with Bun, migrations | Event schemas and endpoints refactor, Google OAuth, tickets, transactions (quota and per-user limits, rollback), payment gateway links and callbacks (QRIS, card, OVO, DANA, ShopeePay, Permata and BRI VAs), fees and tax, PDF invoices to S3, status emails, Socket.IO payment status events. Merged his own PRs. |
| Serupa attendee site (Next.js 15.2, created 2025-06-13, last commit 2025-08-18) | 52 / 2 / 3 v0 (owner 52 of 54 hand-written) | Everything after the v0 bootstrap: landing, event search and filters, event pages and ticket selector, free-ticket flow, checkout and payment choice, payment success and failure, My Tickets with QR, profile with photo, Google OAuth callback, verify email, refresh tokens, SEO (metadata, sitemap, robots), legal pages, FAQ, about, CI | Two CI deploy commits |
| Serupa organizer dashboard (Next.js 15.2, created 2025-06-22, last commit 2025-08-18) | 10 / 1 / 2 v0 (owner 10 of 11 hand-written) | Revamped the v0 scaffold: login, create, edit and list events through the API, sub-categories, Leaflet map, ticket sales and review pages, sitemap. Admin pages and the event sales view still read v0 mock data. | One CI deploy commit |
| DariOrdal (Next.js 15.2 + Prisma, created 2025-07-10, last commit 2025-08-16) | 32 / 39 / 0 (owner 45%); with merge commits 54 of 95; merged PRs 14 owner / 10 teammate (24) | Repository and service layers ("refactor API pattern to repository pattern"), GitHub deployer, atomic quota decrement in the Prisma checkout transaction (`lib/repositories/transaction.repository.ts`), ticket service and repository, My Tickets page with QR codes, admin dashboard and TanStack Table revamp, Excel export, refresh tokens, Redis event cache, Google Analytics, iPaymu payment channel list, email redesign, landing | iPaymu checkout, direct VA page and callbacks, PDF invoices, payment emails, Google OAuth, S3 uploads, SMTP verification, tax and service fees, checkout API |

Conclusions used in the copy:

- Serupa role: "Full Stack Engineer, freelance in a two-person team" covering the backend foundation, accounts and events in the API, the attendee site and the organizer dashboard. "Lead" is not supported: the teammate authored 66% of backend commits, the whole order and payment domain, and merged his own PRs.
- Serupa period: 2025-06 to 2025-08.
- DariOrdal: the pod says "Next.js 14" but the repository has used Next.js 15.2.4 since its first commit; the approach line "I connected iPaymu payments and callbacks..." credits the owner with the teammate's integration; the "57% (54 of 95)" result counts 22 merge commits. All three are corrected in Task 2.
- Not changed (owner to confirm, listed in the PR): `dariordal-2025` career highlights "Integrated payment gateway checkout with webhooks and an audit trail" (teammate's work in the repo) and "Reduced operations overhead by 40%..." (not verifiable from the repo; it comes from the CV).

## Planning Dry Run (2026-10-12)

Done on a throwaway copy of `e2a6c53` inside the session folder (never in `files/hq-local`):

- `edit-serupa.ts` and `refresh-dariordal.ts` (Tasks 1 and 2) run as written and print the expected lines; the result parses with `SiteContentSchema`, both titles are unchanged by `titleCase`, no forbidden pattern or committed blocklist term matches, no prose is copied into `id`, Product Engineering keeps 6 featured pods, and the only unresolved stack name is `Drizzle ORM` (fixed by Task 1 Step 7).
- With Tasks 1 to 3 applied (content, `TEXT_ONLY_TECH`, the dataset tests from Tasks 1 and 2, golden `q31` with the two titles), the full Vitest suite passes: 113 files, 1197 tests, including the real Career Road and Project Roads space rules.
- The first golden draft (`facts: ["Serupa Ticket Hub", "DariOrdal"]`) failed the retrieval check; the titles version passes (Task 3 uses it).
- The Task 9 Step 2 order and 2025 room list were computed with `orderPods` and `getYears` on that copy.
- The Task 4 toolkit self-test passes end to end; it caught a 1 px height difference under mobile emulation (780 x 1687) and a missing ImageMagick default font, both fixed in the plan. `add-gallery.ts` produced an asset entry that passes `tests/content/assets.test.ts`.
- Not dry-run: the four apps themselves (Tasks 5 to 8), because they need Docker services and the private clones at execution time.

## Decisions Made in This Plan

| Question | Decision | Why |
|---|---|---|
| Pod slug | `event-ticketing-platform` (owner example was `serupa-ticket-hub`) | Repo slug convention is descriptive without the client; avoids matching the private repo names in the CI blocklist secret (a plain term such as `<serupa-repo-name>` would match the slug on word boundaries). |
| Title | "Serupa Ticket Hub: Event Ticketing Platform" / "Serupa Ticket Hub: Platform Ticketing Acara" | Owner's example; Title Case in both locales. |
| Tier | Serupa `featured`; DariOrdal `featured` to `listed` | Owner asked for featured; the 6-per-wing cap is full; demoting the sibling ticketing pod from the same request keeps the change in scope and conflict-free with R4-J. |
| Teammates | Described as "my teammate", never named | Personal data minimization; DariOrdal already says "two-person team". |
| Stack name "Drizzle ORM" | Add `"drizzle orm"` to `TEXT_ONLY_TECH` | No logo in `public/tech/`; `tests/unit/tech.test.ts` requires every stack name to resolve or be text-only. |
| Golden question | "What ticketing platforms has Kurniadi built?" with facts `Serupa Ticket Hub`, `Limited-Quota Event Ticketing` | Owner's example. Dry run on a copy of `e2a6c53` with this plan's content: retrieval returns `projects-summary`, `career-serupa-2025` and `project-event-ticketing-platform`, so both titles are in the context, but "DariOrdal" is not (its project chunk ranks below TOP_K); the drift check passes with the titles and fails with `DariOrdal`. The eval still accepts "dariordal" in the answer. |
| Serupa screens | Home, event search, event page, checkout, My Tickets QR, organizer events, create event, mobile triptych | Covers attendee and organizer flows the owner built; admin pages are v0 mock data, so they are not shown. |
| DariOrdal screens | Storefront, event details, checkout, My Tickets QR, admin dashboard, transactions, create event, mobile triptych | Covers the owner's admin dashboard and ticket work. |
| Payment channels in DariOrdal checkout | Playwright route mock for `/api/payment/channels` with a 3-category fixture | The real route calls iPaymu; a mocked API response with sample data is allowed (owner decision 4), the UI itself is real. |

## Apps Expected to Run Locally

| App | Expectation | Why |
|---|---|---|
| Serupa backend | Runs | Bun + Express; needs Postgres and Redis (Docker), Drizzle migrations and a faker seeder exist; required env vars are only checked for presence, so dummy values pass; SMTP goes to Mailpit; payment and S3 are never called because nothing is submitted. |
| Serupa attendee site | Runs | `next dev` on port 3001; API base URL from `NEXT_PUBLIC_API_BASE_URL` (defaults to the production API, so it MUST be set to `http://localhost:3000`). |
| Serupa organizer dashboard | Runs | `next dev` on port 3002; `NEXT_PUBLIC_API_URL=http://localhost:3000`; event list and create use the API, other pages use bundled v0 mock data. |
| DariOrdal | Runs | Next.js API routes + Prisma; `prisma migrate deploy` and the seeders exist (admin plus sample users, events, ticket types, transactions, tickets); payment channels are mocked in the browser. |

Risk of failure (falls back to text only for that app): Next.js 15.2 dev servers with Turbopack fetching Google Fonts offline, the backend refusing to boot because of an SMTP or Redis handshake, or login flows that depend on cross-domain cookies.

## File Structure

Committed (HQ repo):

| File | Change | Responsibility |
|---|---|---|
| `content/site-content.json` | Modify | New pod `event-ticketing-platform`, new career entry `serupa-2025`, DariOrdal pod refresh and tier, both gallery `assets` arrays. |
| `src/content/tech.ts` | Modify | `"drizzle orm"` in `TEXT_ONLY_TECH`. |
| `tests/content/dataset.test.ts` | Modify | New `describe("ticketing projects (owner request 2026-10-12)")` block pinning the owner decisions and the commit-evidence wording, plus gallery checks. |
| `content/safety-allowlist.txt` | Modify only if needed | `Serupa` and `Serupa Ticket Hub` when the merged blocklist flags them (Task 1 Step 1). |
| `tests/ask/golden.json`, `tests/ask/pipeline.test.ts` | Modify | One golden question, item count and threshold. |
| `scripts/ask-eval.ts`, `docs/ask-runbook.md`, `README.md`, `AGENTS.md` | Modify | Golden set size in docs and comments. |
| `docs/superpowers/specs/agent-hq/07-content-map.md` | Modify | 2025 Journey row, Product Engineering table, C8 freelance clients. |
| `public/media/event-ticketing-platform/*.webp` | Create | Serupa gallery (up to 7 desktop + 1 mobile, each with a thumbnail). |
| `public/media/limited-quota-event-ticketing/*.webp` | Create | DariOrdal gallery (up to 7 desktop + 1 mobile, each with a thumbnail). |
| `src/content/live-links.ts`, `tests/unit/live-links.test.ts` | Modify only in the Task 9 condition | `<attendee-site-domain>.com` in `PUBLIC_LIVE_HOSTS`. |

Scratch only (never committed, deleted in Task 10), all under `$SCRATCH`:

| File | Responsibility |
|---|---|
| `tools/edit-serupa.ts` | Adds the Serupa pod and entry, demotes DariOrdal (Task 1). |
| `tools/refresh-dariordal.ts` | DariOrdal copy and stack refresh (Task 2). |
| `tools/compose.yml` | Postgres 16, Redis 7, Mailpit on non-default ports. |
| `tools/fill-env.ts` | Builds a dummy env file from `.env.example` keys and `process.env.*` references, plus local overrides. Never reads a real env file. |
| `tools/covers.ts` | Serves neutral SVG event covers on port 3009 (no stock photos of people). |
| `tools/capture.ts` | Playwright captures per app, login helpers, production-host blocking, DOM blurring, debug dumps on failure. |
| `tools/convert.sh` | PNG to 1600 x 1000 webp and 480 x 300 thumbnail, mobile triptych. |
| `tools/ocr-check.ts` | Tesseract pass over raw captures for emails, phones, hostnames and leftover dummy strings. |
| `tools/add-gallery.ts` | Writes a pod's `assets` from a manifest and the real image sizes. |
| `apps/*` | Read-only clones of the four repositories. |
| `shots/<app>/raw`, `shots/<app>/out` | Raw PNG captures and converted webp. |

---

## Before You Start

- [ ] **Step 1: Branch from the latest `main` in your own checkout**

Run inside your working checkout of `ShinyQ/ShinyQ-HQ` (never `files/hq-local`):

```bash
rtk git fetch origin && rtk git switch -c feat/r4-k-ticketing-projects origin/main
bun install
```

- [ ] **Step 2: Set the shared variables (repeat in every fresh shell)**

```bash
export HQ="$PWD" SCRATCH=/tmp/hq-r4-k   # or SCRATCH=$HOME/hq-scratch/r4-k if /tmp is not allowed
mkdir -p "$SCRATCH"/{tools,apps,shots,logs}
```

- [ ] **Step 3: Record the starting state (decides the R4-J branches later)**

```bash
jq -r '.floors.labs.pods[] | select(.wing=="software" and .tier=="featured") | [.id,.order] | @tsv' content/site-content.json
jq '.items | length' tests/ask/golden.json
test -f src/content/live-links.ts && echo "R4-J merged" || echo "R4-J not merged"
```

Expected on `e2a6c53` (R4-J not merged):

```
multi-tenant-saas-platform	3
payments-realtime-backend	4
anime-figure-ecommerce	5
vulnerability-scanning-automation	6
limited-quota-event-ticketing	7
event-tech-search-backend	8
30
R4-J not merged
```

If R4-J merged first: `event-tech-search-backend` is gone from the list, `solutions-marketing-site	11` is in it, the golden count is `31` and the last line is `R4-J merged`. Both are fine; the scripts below handle either.

- [ ] **Step 4: Tools present**

```bash
docker info --format '{{.ServerVersion}}' && which cwebp magick tesseract gh && gh auth status 2>&1 | head -2
```

Expected: a Docker server version, four paths, and `Logged in to github.com`. If one is missing: `brew install webp imagemagick tesseract gh`.

---
### Task 1: Serupa Pod and Journey Entry

**Files:**
- Modify: `content/site-content.json` (new pod after `limited-quota-event-ticketing`, new entry after `dariordal-2025`, DariOrdal `tier`)
- Modify: `src/content/tech.ts:150` (`TEXT_ONLY_TECH`)
- Modify: `docs/superpowers/specs/agent-hq/07-content-map.md` (2025 row, Product Engineering table, C8)
- Modify (only if Step 1 flags a term): `content/safety-allowlist.txt`
- Test: `tests/content/dataset.test.ts` (append), `tests/unit/tech.test.ts`, `tests/content/title-case.test.ts`, `tests/content/safety.test.ts`
- Scratch: `$SCRATCH/tools/edit-serupa.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: pod id and slug `event-ticketing-platform` (wing `software`, tier `featured`, `client: "Serupa"`, `timelineRef: "serupa-2025"`, `assets: []`); career entry id and slug `serupa-2025` (`podRef: "event-ticketing-platform"`); room ids `L3:event-ticketing-platform` and `L2:serupa-2025`; Page View routes `/{locale}/labs/event-ticketing-platform` and `/{locale}/journey/serupa-2025`; `limited-quota-event-ticketing.tier === "listed"`. The test block `describe("ticketing projects (owner request 2026-10-12)")` in `tests/content/dataset.test.ts` with the consts `ticketPods`, `ticketEntries`, `serupa`, `serupaEntry`, `dariordal` that Tasks 2, 6 and 8 extend.

- [ ] **Step 1: Check the merged blocklist for the new names**

Run from `$HQ` (uses the committed list, your gitignored `content/.safety-blocklist.local.txt` if present, and `SAFETY_BLOCKLIST` if exported):

```bash
bun -e 'import { findBlockedTerms, loadBlocklist } from "./src/content/safety"; console.log(JSON.stringify(findBlockedTerms("Serupa. Serupa Ticket Hub: Event Ticketing Platform. serupa-2025. event-ticketing-platform. DariOrdal.", loadBlocklist())))'
```

Expected: `[]`. If it prints any term (for example a private repository name that contains "Serupa"), append these two lines to `content/safety-allowlist.txt` (owner-approved in decision 1; they are a freelance client and its product, not a client of an employer):

```
Serupa
Serupa Ticket Hub
```

Re-run the command; expected `[]`. CI reads its own `SAFETY_BLOCKLIST` secret, which you cannot see: if CI's "public safety" test later flags a Serupa term, add the same two lines then.

- [ ] **Step 2: Write the failing test**

Append to the end of `tests/content/dataset.test.ts`:

```ts
describe("ticketing projects (owner request 2026-10-12)", () => {
  const data = parsed.success ? parsed.data : undefined;
  const ticketPods = data?.floors.labs.pods ?? [];
  const ticketEntries = data?.floors.careerArchive.entries ?? [];
  const serupa = ticketPods.find((p) => p.id === "event-ticketing-platform");
  const serupaEntry = ticketEntries.find((e) => e.id === "serupa-2025");
  const dariordal = ticketPods.find((p) => p.id === "limited-quota-event-ticketing");

  it("adds the Serupa pod to Product Engineering, linked both ways to its Journey entry", () => {
    expect(serupa).toMatchObject({
      wing: "software",
      tier: "featured",
      client: "Serupa",
      timelineRef: "serupa-2025",
      period: { start: "2025-06", end: "2025-08" },
    });
    expect(serupaEntry).toMatchObject({
      type: "freelance",
      org: "Serupa",
      start: "2025-06",
      end: "2025-08",
      podRef: "event-ticketing-platform",
    });
  });

  it("describes the two-person split the commit history shows, without a lead title", () => {
    expect(serupa?.role.en).toContain("two-person team");
    expect(serupa?.role.en).not.toMatch(/\blead\b/i);
    expect(serupa?.approach.some((a) => a.en.startsWith("My teammate built"))).toBe(true);
  });

  it("keeps the client name out of the slug and frees a featured slot with the sibling ticketing pod", () => {
    expect(serupa?.slug).not.toMatch(/serupa/i);
    expect(dariordal?.tier).toBe("listed");
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `bunx vitest run tests/content/dataset.test.ts`
Expected: FAIL, 3 failed in "ticketing projects (owner request 2026-10-12)" (for example `expected undefined to match object { wing: 'software', ... }`); the other dataset tests pass.

- [ ] **Step 4: Write the content edit script**

Create `$SCRATCH/tools/edit-serupa.ts`:

```ts
// Adds the Serupa pod and Journey entry and moves DariOrdal to listed. Run from the HQ repo root.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content/site-content.json";
const before = readFileSync(FILE, "utf8");
const data = JSON.parse(before);
if (JSON.stringify(data, null, 2) + "\n" !== before) throw new Error("site-content.json does not round-trip; stop and edit by hand");

const pods: { id: string; wing: string; tier: string; order: number }[] = data.floors.labs.pods;
const entries: { id: string }[] = data.floors.careerArchive.entries;
if (pods.some((p) => p.id === "event-ticketing-platform") || entries.some((e) => e.id === "serupa-2025")) throw new Error("already applied");
const dariordal = pods.find((p) => p.id === "limited-quota-event-ticketing");
if (!dariordal || dariordal.tier !== "featured") throw new Error("expected limited-quota-event-ticketing to be featured");

const order = Math.max(...pods.filter((p) => p.wing === "software").map((p) => p.order)) + 1;

const pod = {
  id: "event-ticketing-platform",
  slug: "event-ticketing-platform",
  order,
  tier: "featured",
  accent: "pink",
  wing: "software",
  client: "Serupa",
  timelineRef: "serupa-2025",
  title: {
    en: "Serupa Ticket Hub: Event Ticketing Platform",
    id: "Serupa Ticket Hub: Platform Ticketing Acara",
  },
  tagline: {
    en: "An event ticketing platform with an attendee site, an organizer dashboard and an Express API, from event discovery to QR e-tickets.",
    id: "Platform ticketing acara dengan situs pengunjung, dashboard penyelenggara, dan API Express, dari pencarian acara hingga e-ticket QR.",
  },
  period: { start: "2025-06", end: "2025-08" },
  role: {
    en: "Full Stack Engineer, freelance in a two-person team (backend foundation, attendee site and organizer dashboard)",
    id: "Full Stack Engineer, freelance dalam tim dua orang (fondasi backend, situs pengunjung, dan dashboard penyelenggara)",
  },
  problem: {
    en: "Serupa needed its own ticketing platform: organizers publish events with ticket tiers, attendees find events and get free or paid tickets online, and every order ends in a ticket that can be shown at the door. Two freelance engineers built it as three apps between June and August 2025.",
    id: "Serupa membutuhkan platform ticketing sendiri: penyelenggara memublikasikan acara dengan beberapa tier tiket, pengunjung mencari acara dan mendapatkan tiket gratis maupun berbayar secara online, dan setiap pesanan berakhir dengan tiket yang bisa ditunjukkan di pintu masuk. Dua engineer freelance membangunnya sebagai tiga aplikasi antara Juni dan Agustus 2025.",
  },
  approach: [
    {
      en: "I set up the API on Express 5 and Bun with routes, controllers, services and repositories over PostgreSQL and Drizzle, plus Helmet, rate limiting, structured logs, seed data and GitHub Actions deploys.",
      id: "Saya menyiapkan API di Express 5 dan Bun dengan lapisan route, controller, service, dan repository di atas PostgreSQL dan Drizzle, ditambah Helmet, rate limiting, log terstruktur, data seed, dan deploy lewat GitHub Actions.",
    },
    {
      en: "I built accounts and events in the API: JWT access and refresh tokens, email verification and password reset, user and admin roles, event search with filters, a Redis event cache with invalidation, rate-limited view counts and S3 uploads for event covers and profile photos.",
      id: "Saya membangun fitur akun dan acara di API: access token dan refresh token JWT, verifikasi email dan reset password, peran user dan admin, pencarian acara dengan filter, cache acara di Redis dengan invalidasi, penghitungan view dengan rate limit, serta upload cover acara dan foto profil ke S3.",
    },
    {
      en: "I built the attendee site in Next.js with TanStack Query: event discovery and search, event pages with ticket tiers, a free-ticket flow, checkout with a payment method choice, payment result pages and My Tickets with QR codes, plus SEO metadata and a sitemap.",
      id: "Saya membangun situs pengunjung dengan Next.js dan TanStack Query: penemuan dan pencarian acara, halaman acara dengan tier tiket, alur tiket gratis, checkout dengan pilihan metode pembayaran, halaman hasil pembayaran, dan My Tickets dengan kode QR, ditambah metadata SEO dan sitemap.",
    },
    {
      en: "I turned a v0-generated scaffold into the organizer dashboard and connected sign-in and event creation, editing and listing, with sub-categories and a location map, to the API.",
      id: "Saya mengubah kerangka hasil v0 menjadi dashboard penyelenggara dan menghubungkan login serta pembuatan, pengeditan, dan daftar acara, lengkap dengan sub-kategori dan peta lokasi, ke API.",
    },
    {
      en: "My teammate built ticket orders and payments in the API (quota and per-user limits, payment links and callbacks for QRIS, cards, e-wallets and virtual accounts, PDF invoices, status emails and Socket.IO payment events); my checkout and My Tickets pages call those endpoints.",
      id: "Rekan tim saya membangun pemesanan tiket dan pembayaran di API (batas kuota dan batas per pengguna, link pembayaran dan callback untuk QRIS, kartu, e-wallet, dan virtual account, invoice PDF, email status, serta event pembayaran lewat Socket.IO); halaman checkout dan My Tickets buatan saya memanggil endpoint tersebut.",
    },
  ],
  architecture: {
    nodes: [
      { id: "attendee-site", label: "Attendee site", sublabel: { en: "Next.js 15, TanStack Query", id: "Next.js 15, TanStack Query" }, layer: 0, row: 0, kind: "client" },
      { id: "organizer-dashboard", label: "Organizer dashboard", sublabel: { en: "Next.js 15, Radix UI", id: "Next.js 15, Radix UI" }, layer: 0, row: 1, kind: "client" },
      { id: "express-api", label: "Express API", sublabel: { en: "Bun, JWT, Socket.IO", id: "Bun, JWT, Socket.IO" }, layer: 1, row: 0, kind: "service" },
      { id: "postgresql", label: "PostgreSQL (Drizzle)", sublabel: { en: "Events, tickets and orders", id: "Acara, tiket, dan pesanan" }, layer: 2, row: 0, kind: "data" },
      { id: "redis", label: "Redis", sublabel: { en: "Event cache, view counts, payment links", id: "Cache acara, jumlah view, link pembayaran" }, layer: 2, row: 1, kind: "data" },
      { id: "s3", label: "AWS S3", sublabel: { en: "Covers, photos, invoices", id: "Cover, foto, invoice" }, layer: 2, row: 2, kind: "external" },
      { id: "payment-gateway", label: "Payment gateway", sublabel: { en: "QRIS, cards, e-wallets, VAs", id: "QRIS, kartu, e-wallet, VA" }, layer: 2, row: 3, kind: "external" },
    ],
    edges: [
      { from: "attendee-site", to: "express-api", label: "REST + JWT" },
      { from: "organizer-dashboard", to: "express-api", label: "manage events" },
      { from: "express-api", to: "postgresql", label: "queries" },
      { from: "express-api", to: "redis", label: "cache" },
      { from: "express-api", to: "s3", label: "uploads" },
      { from: "express-api", to: "payment-gateway", label: "payment links" },
      { from: "payment-gateway", to: "express-api", label: "callbacks", async: true },
    ],
  },
  results: [
    {
      value: "3 apps",
      label: {
        en: "Delivered as an Express API, an attendee site and an organizer dashboard",
        id: "Diserahkan sebagai API Express, situs pengunjung, dan dashboard penyelenggara",
      },
      context: { en: "From the three project repositories.", id: "Dari tiga repositori proyek." },
      confidence: "verified",
    },
    {
      value: "95%",
      label: {
        en: "Share of commits I authored on the attendee site and the organizer dashboard (62 of 65)",
        id: "Proporsi commit yang saya tulis di situs pengunjung dan dashboard penyelenggara (62 dari 65)",
      },
      context: {
        en: "Non-merge commits in git history from Jun to Aug 2025, excluding commits generated by v0.",
        id: "Commit non-merge di riwayat git dari Jun hingga Agu 2025, tanpa commit yang dihasilkan v0.",
      },
      confidence: "verified",
    },
    {
      value: "34%",
      label: {
        en: "Share of backend commits I authored (45 of 133); my teammate wrote the order and payment code",
        id: "Proporsi commit backend yang saya tulis (45 dari 133); rekan tim saya menulis kode pesanan dan pembayaran",
      },
      context: { en: "Non-merge commits in git history from Jun to Aug 2025.", id: "Commit non-merge di riwayat git dari Jun hingga Agu 2025." },
      confidence: "verified",
    },
  ],
  stack: [
    "Express",
    "TypeScript",
    "Bun",
    "PostgreSQL",
    "Drizzle ORM",
    "Redis",
    "Socket.IO",
    "JWT",
    "Google OAuth",
    "AWS S3",
    "Next.js 15",
    "TanStack Query",
    "Tailwind CSS",
    "shadcn/ui",
    "GitHub Actions",
  ],
  hologram: "pipeline",
  assets: [],
};

const entry = {
  id: "serupa-2025",
  slug: "serupa-2025",
  type: "freelance",
  org: "Serupa",
  role: { en: "Full Stack Engineer (freelance)", id: "Full Stack Engineer (freelance)" },
  start: "2025-06",
  end: "2025-08",
  summary: {
    en: "In a two-person team, I built the API foundation, accounts and events of Serupa's event ticketing platform, plus its attendee site and organizer dashboard.",
    id: "Dalam tim dua orang, saya membangun fondasi API serta fitur akun dan acara pada platform ticketing acara Serupa, beserta situs pengunjung dan dashboard penyelenggaranya.",
  },
  highlights: [
    {
      en: "Set up the Express API on Bun with PostgreSQL, Drizzle, a Redis event cache and S3 uploads",
      id: "Menyiapkan API Express di Bun dengan PostgreSQL, Drizzle, cache acara di Redis, dan upload ke S3",
    },
    {
      en: "Built the Next.js attendee site from event search to checkout and QR e-tickets",
      id: "Membangun situs pengunjung Next.js dari pencarian acara hingga checkout dan e-ticket QR",
    },
    {
      en: "Connected the organizer dashboard to the API for creating and managing events",
      id: "Menghubungkan dashboard penyelenggara ke API untuk membuat dan mengelola acara",
    },
  ],
  stack: ["Express", "TypeScript", "Bun", "PostgreSQL", "Drizzle ORM", "Redis", "Next.js", "TanStack Query"],
  discipline: "software",
  podRef: "event-ticketing-platform",
  confidence: "verified",
};

pods.splice(pods.indexOf(dariordal) + 1, 0, pod as never);
dariordal.tier = "listed";
entries.splice(entries.findIndex((e) => e.id === "dariordal-2025") + 1, 0, entry);

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
const featured = pods.filter((p) => p.wing === "software" && p.tier === "featured").length;
console.log(`added event-ticketing-platform (order ${order}) and serupa-2025; software featured pods: ${featured}`);
```

- [ ] **Step 5: Run the script**

Run: `bun "$SCRATCH/tools/edit-serupa.ts"`
Expected (R4-J not merged): `added event-ticketing-platform (order 11) and serupa-2025; software featured pods: 6`. With R4-J merged first the order is `12`; the featured count is `6` either way.

- [ ] **Step 6: Run the dataset test and the content suites**

Run: `bunx vitest run tests/content tests/unit/tech.test.ts`
Expected: `tests/content/dataset.test.ts` PASS (including the 3 new tests); `tests/unit/tech.test.ts` FAIL in "resolves every stack and skill name in content or allowlists it as text-only" with `Drizzle ORM` in the unresolved list. Everything else PASS.

- [ ] **Step 7: Allowlist "Drizzle ORM" as a text-only tech name**

In `src/content/tech.ts`, inside `TEXT_ONLY_TECH`, change:

```ts
  "kysely",
  "datatables",
```

to:

```ts
  "kysely",
  "drizzle orm",
  "datatables",
```

- [ ] **Step 8: Run the tests again**

Run: `bunx vitest run tests/content tests/unit/tech.test.ts tests/unit/schema.test.ts && bun run validate:content`
Expected: all PASS (title case, safety, assets, dataset, tech); `validate:content` prints no errors.

- [ ] **Step 9: Update the content map appendix**

In `docs/superpowers/specs/agent-hq/07-content-map.md`:

1. In the `| 2025 |` row, change `| 2025 | Freelance: premium event ticketing (links to pod) · ` to `| 2025 | Freelance: premium event ticketing (links to pod) · Freelance: Serupa event ticketing platform (links to pod) · `.
2. Replace the row `| featured | Limited-quota event ticketing with inventory locking | 2025 | Freelance, anonymized |` with these two rows:

```
| featured | Serupa Ticket Hub: event ticketing platform (attendee site, organizer dashboard, Express API) | 2025 | Freelance (Serupa), two-person team; commit shares verified from git (added 2026-10-12) |
| listed | Limited-quota event ticketing with inventory locking | 2025 | Freelance (DariOrdal); listed since 2026-10-12 to keep 6 featured pods per wing |
```

3. In the `| C8 |` row, change `(e.g. TEMMPAT, DariOrdal, Jublia, BSSN, Shumi)` to `(e.g. TEMMPAT, DariOrdal, Serupa, Jublia, BSSN, Shumi)`.

Run: `rg -n "Serupa" docs/superpowers/specs/agent-hq/07-content-map.md`
Expected: 3 matching lines (2025 row, the featured row, C8).

- [ ] **Step 10: Commit**

```bash
rtk git add content/site-content.json src/content/tech.ts tests/content/dataset.test.ts docs/superpowers/specs/agent-hq/07-content-map.md
rtk git add content/safety-allowlist.txt 2>/dev/null || true
rtk git commit -m "feat(content): add the Serupa event ticketing platform pod and Journey entry"
```

---
### Task 2: Refresh the DariOrdal Pod from Its Repository

**Files:**
- Modify: `content/site-content.json` (pod `limited-quota-event-ticketing`: architecture sublabel, `approach[0]`, `approach[2]`, `approach[3]`, `results[0]`, `stack`)
- Test: `tests/content/dataset.test.ts` (extend the Task 1 block)
- Scratch: `$SCRATCH/tools/refresh-dariordal.ts`

**Interfaces:**
- Consumes: the `describe("ticketing projects (owner request 2026-10-12)")` block and its `dariordal` const from Task 1.
- Produces: DariOrdal pod copy that names Next.js 15, credits the teammate's iPaymu integration, and reports the non-merge commit share. Slug, id, title, tagline, problem, role, period, tier (`listed`, from Task 1) and `timelineRef` unchanged.

- [ ] **Step 1: Write the failing test**

In `tests/content/dataset.test.ts`, inside the Task 1 block, after the test "keeps the client name out of the slug and frees a featured slot with the sibling ticketing pod", add:

```ts
  it("refreshes DariOrdal from its repository: Next.js 15, the teammate's payment work, non-merge commit share", () => {
    expect(JSON.stringify(dariordal)).not.toContain("Next.js 14");
    expect(dariordal?.stack).toContain("Next.js 15");
    expect(dariordal?.approach.some((a) => a.en.includes("my teammate integrated iPaymu"))).toBe(true);
    expect(dariordal?.results[0]).toMatchObject({ value: "45%" });
    expect(dariordal?.slug).toBe("limited-quota-event-ticketing");
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bunx vitest run tests/content/dataset.test.ts -t "refreshes DariOrdal"`
Expected: FAIL with `expected '{"id":"limited-quota-event-ticketing",...' not to contain 'Next.js 14'`.

- [ ] **Step 3: Write the refresh script**

Create `$SCRATCH/tools/refresh-dariordal.ts`:

```ts
// Refreshes the DariOrdal pod copy and stack from its repository. Run from the HQ repo root.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content/site-content.json";
const before = readFileSync(FILE, "utf8");
const data = JSON.parse(before);
if (JSON.stringify(data, null, 2) + "\n" !== before) throw new Error("site-content.json does not round-trip; stop and edit by hand");

const pod = data.floors.labs.pods.find((p: { id: string }) => p.id === "limited-quota-event-ticketing");
if (!pod) throw new Error("pod limited-quota-event-ticketing not found");
const expectStart = (actual: string, start: string) => {
  if (!actual.startsWith(start)) throw new Error(`unexpected starting copy: ${actual.slice(0, 60)}`);
};
expectStart(pod.approach[0].en, "I reorganized the Next.js 14 API");
expectStart(pod.approach[2].en, "I connected iPaymu payments");
expectStart(pod.approach[3].en, "I built an admin dashboard");
if (pod.results[0].value !== "57%") throw new Error(`unexpected results[0].value ${pod.results[0].value}`);

const storefront = pod.architecture.nodes.find((n: { id: string }) => n.id === "storefront");
storefront.sublabel = { en: "Next.js 15", id: "Next.js 15" };

pod.approach[0] = {
  en: "I reorganized the Next.js 15 API routes into repository and service layers and automated deployment from GitHub.",
  id: "Saya menata API route Next.js 15 ke dalam lapisan repository dan service, lalu mengotomatiskan deployment dari GitHub.",
};
pod.approach[2] = {
  en: "I built ticket issuance, a My Tickets page with QR codes and the payment channel list from iPaymu, and redesigned the emails; my teammate integrated iPaymu checkout, callbacks and PDF invoices.",
  id: "Saya membangun penerbitan tiket, halaman My Tickets dengan kode QR, dan daftar channel pembayaran dari iPaymu, serta mendesain ulang email; rekan tim saya mengintegrasikan checkout iPaymu, callback, dan invoice PDF.",
};
pod.approach[3] = {
  en: "I built the admin dashboard: event management, sortable transaction tables with Excel export, refresh-token sessions, a Redis event cache and Google Analytics.",
  id: "Saya membangun dashboard admin: pengelolaan acara, tabel transaksi yang bisa diurutkan dan diekspor ke Excel, sesi refresh token, cache acara di Redis, dan Google Analytics.",
};
pod.results[0] = {
  value: "45%",
  label: {
    en: "Share of non-merge commits I authored (32 of 71), plus 14 of 24 merged pull requests",
    id: "Proporsi commit non-merge yang saya tulis (32 dari 71), ditambah 14 dari 24 pull request yang di-merge",
  },
  context: {
    en: "Counted in git history and pull requests from Jul to Aug 2025.",
    id: "Dihitung dari riwayat git dan pull request pada Jul hingga Agu 2025.",
  },
  confidence: "verified",
};
pod.stack = pod.stack.map((s: string) => (s === "Next.js 14" ? "Next.js 15" : s));
if (!pod.stack.includes("GitHub Actions")) pod.stack.splice(pod.stack.indexOf("Bun"), 0, "GitHub Actions");

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`refreshed limited-quota-event-ticketing; stack: ${pod.stack.join(", ")}`);
```

- [ ] **Step 4: Run the script**

Run: `bun "$SCRATCH/tools/refresh-dariordal.ts"`
Expected: `refreshed limited-quota-event-ticketing; stack: Next.js 15, TypeScript, Prisma, PostgreSQL, Redis, iPaymu, AWS S3, TanStack Table, Tailwind CSS, shadcn/ui, GitHub Actions, Bun`

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/content tests/unit/tech.test.ts && bun run validate:content`
Expected: all PASS, including "refreshes DariOrdal from its repository...".

- [ ] **Step 6: Review the diff for accuracy**

Run: `rtk git diff --stat && git --no-pager diff -U0 content/site-content.json | rg '^[+-] ' | cut -c1-160`
Expected: only the six fields named in **Files** change (sublabel, three approach entries, `results[0]`, stack). No em dash: `rg -n $'\u2014' content/site-content.json` prints nothing.

- [ ] **Step 7: Commit**

```bash
rtk git add content/site-content.json tests/content/dataset.test.ts
rtk git commit -m "fix(content): refresh the DariOrdal ticketing pod from its repository"
```

---

### Task 3: Ask the HQ Golden Question for the Ticketing Projects

**Files:**
- Modify: `tests/ask/golden.json` (one item, `passThreshold`, `$comment`)
- Modify: `tests/ask/pipeline.test.ts:153-155`
- Modify: `scripts/ask-eval.ts:5`, `docs/ask-runbook.md:173`, `README.md:56`, `AGENTS.md:128`
- Test: `tests/ask/pack.test.ts` (drift and retrieval check), `tests/ask/pipeline.test.ts`, `tests/ask/suggestions.test.ts`

**Interfaces:**
- Consumes: the pod titles "Serupa Ticket Hub: Event Ticketing Platform" (Task 1) and "Limited-Quota Event Ticketing" (existing), both listed in the `projects-summary` chunk. The Ask pack is rebuilt from content by `scripts/build-knowledge.ts` (gitignored output).
- Produces: golden item `qN` (N = current item count + 1: `q31` on `e2a6c53`, `q32` if R4-J merged first), item count N, `passThreshold` N - 2.

- [ ] **Step 1: Write the failing test**

In `tests/ask/pipeline.test.ts`, the test "has 30 unique items with a 28 pass threshold" currently reads (on `e2a6c53`):

```ts
  it("has 30 unique items with a 28 pass threshold", () => {
    expect(golden.items).toHaveLength(30);
    expect(new Set(golden.items.map((i) => i.id)).size).toBe(30);
    expect(golden.passThreshold).toBe(28);
  });
```

Replace it with (R4-J not merged):

```ts
  it("has 31 unique items with a 29 pass threshold", () => {
    expect(golden.items).toHaveLength(31);
    expect(new Set(golden.items.map((i) => i.id)).size).toBe(31);
    expect(golden.passThreshold).toBe(29);
  });
```

If R4-J merged first, the test already says 31 and 29; change it to 32 and 30 (title "has 32 unique items with a 30 pass threshold").

- [ ] **Step 2: Run it to make sure it fails**

Run: `bunx vitest run tests/ask/pipeline.test.ts -t "unique items"`
Expected: FAIL with `expected [ ... ] to have a length of 31 but got 30` (or 32 / 31).

- [ ] **Step 3: Add the golden item**

In `tests/ask/golden.json`, after the last item line (`q30` on `e2a6c53`, `q31` if R4-J merged), add a comma to that line and append (use `q32` if R4-J merged):

```json
    {"id": "q31", "lang": "en", "q": "What ticketing platforms has Kurniadi built?", "facts": ["Serupa Ticket Hub", "Limited-Quota Event Ticketing"], "expect": {"any": ["serupa"], "any2": ["limited-quota", "limited quota", "dariordal"]}}
```

Then change `"passThreshold": 28,` to `"passThreshold": 29,` (or `29` to `30`), and in `$comment` change `18 benchmark questions plus 12 new.` to `18 benchmark questions plus 13 new.` (or `13` to `14`).

- [ ] **Step 4: Run the Ask suites**

Run: `bun run build:knowledge && bunx vitest run tests/ask`
Expected: all PASS (verified on a copy of `e2a6c53` with this plan's content: 6 files, 190 tests): `pipeline.test.ts` (31 or 32 items), `pack.test.ts` "finds every golden fact in the pack (drift check) and in the retrieved context" (both titles are in the `projects-summary` chunk), `suggestions.test.ts` (the `work-tickets` pill still retrieves `project-ticket-marketplace-backend`).

If `pack.test.ts` reports `retrieval no longer finds these golden facts: q31: ...` (for example because the projects summary changed), print the ranked chunks:

```bash
bun -e 'import { buildRepoPack } from "./src/ask/repo-pack"; import { retrieve } from "./functions/_lib/retrieve"; const { pack } = buildRepoPack(); console.log(retrieve(pack, "What ticketing platforms has Kurniadi built?", "en").chunks.map((c) => c.id).join("\n"))'
```

Expected: `profile, now, projects-summary, project-university-alumni-platforms, career-serupa-2025, project-event-ticketing-platform` (one per line). If `projects-summary` is missing, then make the question more specific instead of touching retrieval code: `"Which event ticketing platforms did Kurniadi build as a freelancer?"`, and re-run Step 4.

- [ ] **Step 5: Update the golden set size in docs and comments**

Replace (R4-J not merged; if merged, replace 31/29 with 32/30 in the same four places):

- `scripts/ask-eval.ts` line 5: ` *   bun scripts/ask-eval.ts golden    # 30 questions, fails below passThreshold (28)` with ` *   bun scripts/ask-eval.ts golden    # 31 questions, fails below passThreshold (29)`.
- `docs/ask-runbook.md` line 173: `golden set (fails below 28/30)` with `golden set (fails below 29/31)`.
- `README.md` line 56: `runs the golden set (30 questions)` with `runs the golden set (31 questions)`.
- `AGENTS.md` line 128: `golden.json (30) and redteam.json sets` with `golden.json (31) and redteam.json sets`.

Run: `rg -n "golden set \(30|golden.json \(30|28/30|30 questions" README.md AGENTS.md docs/ask-runbook.md scripts/ask-eval.ts`
Expected: no output (with R4-J merged, search for `31` variants instead and expect no output).

- [ ] **Step 6: Commit**

```bash
rtk git add tests/ask/golden.json tests/ask/pipeline.test.ts scripts/ask-eval.ts docs/ask-runbook.md README.md AGENTS.md
rtk git commit -m "feat(ask): golden question for the ticketing projects"
```

---
### Task 4: Screenshot Toolkit (Scratch, Not Committed)

**Files (all under `$SCRATCH/tools`, never committed):**
- Create: `package.json` (via `bun init`), `compose.yml`, `fill-env.ts`, `covers.ts`, `capture.ts`, `convert.sh`, `ocr-check.ts`, `add-gallery.ts`, `selftest.sh`

**Interfaces:**
- Consumes: Docker, `cwebp`, `magick`, `tesseract`; Playwright 1.64.0 (same version as the HQ repo, so the cached Chromium is reused).
- Produces (used by Tasks 5 to 8):
  - `docker compose -f $SCRATCH/tools/compose.yml up -d`: Postgres on `localhost:55432` (user `demo`, password `demo`, database `serupa_demo`), Redis on `localhost:56379`, Mailpit SMTP on `localhost:51025` (web UI `localhost:58025`).
  - `bun fill-env.ts <appDir> <outFile> [KEY=VALUE ...]`: writes a dummy env file with every key from `<appDir>/.env.example` and every `process.env.KEY` referenced in the app source, then applies the overrides.
  - `bun covers.ts`: neutral SVG covers at `http://localhost:3009/cover/<n>.svg`.
  - `bun capture.ts serupa|dariordal [shot ...]`: raw PNGs in `$SCRATCH/shots/<app>/raw/` named `NN-name.png` (desktop) and `m1-*.png` to `m3-*.png` (mobile); on failure `_debug-<shot>.png` plus a dump of visible controls; exit code 1 if any shot failed. Needs `DEMO_PASSWORD` (and `SERUPA_EVENT_SLUG` for Serupa).
  - `bash convert.sh <rawDir> <outDir>`: `NN-name.webp` (1600 x 1000) and `NN-name.thumb.webp` (480 x 300) per desktop PNG, plus `NN-mobile.webp` (+ thumbnail) where NN is the next number after the desktop shots.
  - `bun ocr-check.ts <rawDir>`: prints OCR hits for emails, phones, hosts, dummy values, company legal names, "hackathon".
  - `bun add-gallery.ts <podSlug> <manifest.json>` (run from `$HQ`): replaces `pod.assets` with entries `{ src, alt, width, height, redacted: true }` read from the manifest `[{ "file": "01-home", "alt": { "en": "...", "id": "..." } }]`.

- [ ] **Step 1: Write the failing self-test**

Create `$SCRATCH/tools/selftest.sh`:

```bash
#!/usr/bin/env bash
# Self-test for the screenshot toolkit. Run from $SCRATCH/tools.
set -euo pipefail
t="$(pwd)/selftest-tmp"; rm -rf "$t"; mkdir -p "$t/app/src" "$t/raw" "$t/out"

# fill-env: keys from .env.example and process.env references, dummy values, overrides win
printf 'DATABASE_URL=postgres://real-looking\nPORT=1234\n# comment\nSMTP_PASS=secret\n' > "$t/app/.env.example"
printf 'const a = process.env.NEXT_PUBLIC_PAYMENT_QRIS_FEE_TYPE;\nconst b = process.env["MERCHANT_ID"];\n' > "$t/app/src/a.ts"
bun fill-env.ts "$t/app" "$t/app/.env" PORT=3000
grep -qx 'PORT=3000' "$t/app/.env"
grep -qx 'NEXT_PUBLIC_PAYMENT_QRIS_FEE_TYPE=fixed' "$t/app/.env"
grep -qx 'MERCHANT_ID=dummy-merchant_id' "$t/app/.env"
grep -qx 'DATABASE_URL=http://127.0.0.1:9' "$t/app/.env"
if grep -q 'real-looking\|secret' "$t/app/.env"; then echo "FAIL: copied a value from .env.example"; exit 1; fi

# convert.sh: desktop and mobile sizes, thumbnails, no metadata chunks
magick -size 2880x1800 gradient:'#222244-#8888cc' "$t/raw/01-test.png"
for i in 1 2 3; do magick -size 780x1688 gradient:'#224422-#88cc88' "$t/raw/m$i-test.png"; done
bash convert.sh "$t/raw" "$t/out"
[ "$(magick identify -format '%wx%h' "$t/out/01-test.webp")" = "1600x1000" ]
[ "$(magick identify -format '%wx%h' "$t/out/01-test.thumb.webp")" = "480x300" ]
[ "$(magick identify -format '%wx%h' "$t/out/02-mobile.webp")" = "1600x1000" ]
[ "$(magick identify -format '%wx%h' "$t/out/02-mobile.thumb.webp")" = "480x300" ]
if webpinfo "$t/out/01-test.webp" | grep -q 'EXIF\|XMP\|ICCP'; then echo "FAIL: metadata chunk kept"; exit 1; fi

# covers.ts serves SVG
bun covers.ts & pid=$!; sleep 1
curl -sf http://localhost:3009/cover/3.svg | grep -q '<svg'
kill "$pid"

rm -rf "$t"
echo "toolkit selftest: OK"
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd "$SCRATCH/tools" && bash selftest.sh`
Expected: FAIL at the first command with `error: Module not found "fill-env.ts"` (exit code 1).

- [ ] **Step 3: Set up the toolkit package and services file**

```bash
cd "$SCRATCH/tools" && bun init -y >/dev/null && bun add playwright@1.64.0
```

Create `$SCRATCH/tools/compose.yml`:

```yaml
name: hq-r4-k
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: demo
      POSTGRES_PASSWORD: demo
      POSTGRES_DB: serupa_demo
    ports: ["55432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["56379:6379"]
  mailpit:
    image: axllent/mailpit:latest
    ports: ["51025:1025", "58025:8025"]
```

- [ ] **Step 4: Write `fill-env.ts`**

Create `$SCRATCH/tools/fill-env.ts`:

```ts
// Builds a dummy env file for a local sample-data run. Never reads an existing env file.
// Usage: bun fill-env.ts <appDir> <outFile> [KEY=VALUE ...]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [appDir, outFile, ...overrides] = process.argv.slice(2);
if (!appDir || !outFile) throw new Error("usage: bun fill-env.ts <appDir> <outFile> [KEY=VALUE ...]");

const keys = new Set<string>();
const example = path.join(appDir, ".env.example");
if (existsSync(example)) {
  for (const line of readFileSync(example, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
}
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "public", "logs"]);
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) {
      for (const m of readFileSync(p, "utf8").matchAll(/process\.env(?:\.|\[['"])([A-Z][A-Z0-9_]*)/g)) keys.add(m[1]);
    }
  }
};
walk(appDir);
keys.delete("NODE_ENV");

const dummy = (k: string): string => {
  if (/FEE_TYPE$/.test(k)) return "fixed";
  if (/FEE_AMOUNT$/.test(k)) return "2500";
  if (/(^|_)TAX$/.test(k)) return "11";
  if (/SERVICE_FEE$/.test(k)) return "5";
  if (/EXPIRATION$/.test(k)) return "60";
  if (/ROUNDS$/.test(k)) return "10";
  if (/_MS$/.test(k)) return "900000";
  if (/REQUESTS$/.test(k)) return "1000";
  if (/(^|_)PORT$/.test(k)) return "9";
  if (/^NEXT_PUBLIC_ENABLE_/.test(k)) return "true";
  if (/(_URL|_ENDPOINT|_HOST)$/.test(k)) return "http://127.0.0.1:9";
  if (/EMAIL$/.test(k)) return "noreply@demo.test";
  if (/PHONE$/.test(k)) return "0000";
  return `dummy-${k.toLowerCase()}`;
};

const env = new Map([...keys].sort().map((k) => [k, dummy(k)] as [string, string]));
for (const o of overrides) {
  const i = o.indexOf("=");
  if (i < 1) throw new Error(`bad override ${o}`);
  env.set(o.slice(0, i), o.slice(i + 1));
}
writeFileSync(outFile, [...env].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
console.log(`${outFile}: ${env.size} keys (${overrides.length} overrides)`);
```

- [ ] **Step 5: Write `covers.ts`**

Create `$SCRATCH/tools/covers.ts`:

```ts
// Neutral SVG event covers for local captures, so no stock photos of people reach the gallery.
// Usage: bun covers.ts   (serves http://localhost:3009/cover/<n>.svg)
const PALETTE = [
  ["#7c3aed", "#ec4899"],
  ["#0ea5e9", "#22c55e"],
  ["#f59e0b", "#ef4444"],
  ["#14b8a6", "#6366f1"],
  ["#e11d48", "#f97316"],
  ["#2563eb", "#a855f7"],
];

Bun.serve({
  port: 3009,
  fetch(req) {
    const n = Number(new URL(req.url).pathname.match(/(\d+)/)?.[1] ?? 0) % PALETTE.length;
    const [a, b] = PALETTE[n];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="6"><circle cx="${300 + n * 90}" cy="340" r="150"/><circle cx="${760 - n * 40}" cy="300" r="220"/><path d="M0 560 Q 300 470 600 560 T 1200 540"/></g></svg>`;
    return new Response(svg, { headers: { "content-type": "image/svg+xml", "access-control-allow-origin": "*" } });
  },
});
console.log("covers on http://localhost:3009/cover/<n>.svg");
```

- [ ] **Step 6: Write `convert.sh`**

Create `$SCRATCH/tools/convert.sh`:

```bash
#!/usr/bin/env bash
# PNG captures to gallery webp. Usage: bash convert.sh <rawDir> <outDir>
# Desktop: NN-name.png (2880x1800) -> NN-name.webp 1600x1000 + NN-name.thumb.webp 480x300.
# Mobile: m1-*.png m2-*.png m3-*.png (about 780x1688) -> one triptych NN-mobile.webp, NN = next number.
set -euo pipefail
raw="$1"; out="$2"; mkdir -p "$out"
shopt -s nullglob
desktop=()
for png in "$raw"/[0-9][0-9]-*.png; do
  case "$png" in *-mobile.png) continue ;; esac
  desktop+=("$png")
done
for png in "${desktop[@]}"; do
  base="$(basename "$png" .png)"
  cwebp -quiet -q 80 -m 6 -resize 1600 1000 -metadata none "$png" -o "$out/$base.webp"
  cwebp -quiet -q 72 -m 6 -resize 480 300 -metadata none "$png" -o "$out/$base.thumb.webp"
done
m1=("$raw"/m1-*.png); m2=("$raw"/m2-*.png); m3=("$raw"/m3-*.png)
if [ ${#m1[@]} -eq 1 ] && [ ${#m2[@]} -eq 1 ] && [ ${#m3[@]} -eq 1 ]; then
  idx="$(printf '%02d' $(( ${#desktop[@]} + 1 )))"
  magick "${m1[0]}" "${m2[0]}" "${m3[0]}" -resize x900 -bordercolor '#0b0b12' -border 24x0 +append \
    -background '#0b0b12' -gravity center -extent 1600x1000 "$raw/_triptych.png"
  cwebp -quiet -q 80 -m 6 -metadata none "$raw/_triptych.png" -o "$out/$idx-mobile.webp"
  cwebp -quiet -q 72 -m 6 -resize 480 300 -metadata none "$raw/_triptych.png" -o "$out/$idx-mobile.thumb.webp"
fi
ls -1 "$out"
```

- [ ] **Step 7: Run the self-test (fill-env, convert, covers)**

Run: `cd "$SCRATCH/tools" && bash selftest.sh`
Expected: the `fill-env` line `.../app/.env: 5 keys (1 overrides)`, the two converted file lists, the covers line, then `toolkit selftest: OK`.

- [ ] **Step 8: Extend the self-test for capture and OCR (failing first)**

Insert these lines just before the last two lines of `selftest.sh` (`rm -rf "$t"` and `echo "toolkit selftest: OK"`):

```bash
# capture.ts: desktop 1440x900 and mobile 390x844 at DPR 2, against the covers server
bun covers.ts & pid=$!; sleep 1
DEMO_PASSWORD=selftest SCRATCH="$t" bun capture.ts selftest
kill "$pid"
[ "$(magick identify -format '%wx%h' "$t/shots/selftest/raw/01-cover.png")" = "2880x1800" ]
[ "$(magick identify -format '%w' "$t/shots/selftest/raw/m1-cover.png")" = "780" ]   # height is 1687 or 1688 under mobile emulation

# ocr-check.ts flags an email
font=/System/Library/Fonts/Supplemental/Arial.ttf   # macOS; on Linux use any .ttf, e.g. /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
magick -size 1600x200 xc:white -font "$font" -fill black -pointsize 56 -annotate +40+120 'Contact someone@example.com' "$t/raw/ocr.png"
bun ocr-check.ts "$t/raw" | grep -q 'ocr.png: email'
```

Run: `cd "$SCRATCH/tools" && bash selftest.sh`
Expected: FAIL with `error: Module not found "capture.ts"`.

- [ ] **Step 9: Write `capture.ts`**

Create `$SCRATCH/tools/capture.ts`:

```ts
// Captures app screens for the HQ galleries from local sample-data runs.
// Usage: DEMO_PASSWORD=... [SERUPA_EVENT_SLUG=...] bun capture.ts serupa|dariordal|selftest [shot-name ...]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const SCRATCH = process.env.SCRATCH ?? "/tmp/hq-r4-k";
const PASSWORD = process.env.DEMO_PASSWORD ?? "";
if (!PASSWORD) throw new Error("export DEMO_PASSWORD first (Task 5 Step 6)");

type Shot = {
  name: string;
  url: string;
  mobile?: boolean;
  login?: string;
  mock?: Record<string, unknown>;
  act?: (page: Page) => Promise<void>;
};
type App = { logins: Record<string, (page: Page) => Promise<void>>; shots: Shot[] };

// Production hosts and trackers never get a request from the capture browser.
const BLOCKED = /(^|\.)(<production hosts>|googletagmanager\.com|google-analytics\.com|vercel-insights\.com|vercel-scripts\.com)$/;

async function poll(check: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 80; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function formLogin(page: Page, url: string, email: string) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
}

const hasCookie = (page: Page, name: string) => async () => (await page.context().cookies()).some((c) => c.name === name);

// Serupa: attendee site on 3001, organizer dashboard on 3002, API on 3000.
const FE = "http://localhost:3001";
const DASH = "http://localhost:3002";
const SLUG = process.env.SERUPA_EVENT_SLUG ?? "missing-SERUPA_EVENT_SLUG";

const serupa: App = {
  logins: {
    attendee: async (page) => {
      await formLogin(page, `${FE}/login`, "attendee@demo.test");
      await poll(() => page.evaluate(() => !!localStorage.getItem("accessToken")), "attendee access token");
    },
    organizer: async (page) => {
      await formLogin(page, `${DASH}/login`, "organizer@demo.test");
      await poll(async () => !new URL(page.url()).pathname.startsWith("/login"), "dashboard redirect after login");
    },
  },
  shots: [
    { name: "01-home", url: `${FE}/` },
    { name: "02-events", url: `${FE}/events` },
    { name: "03-event-detail", url: `${FE}/event/${SLUG}` },
    {
      name: "04-checkout",
      login: "attendee",
      url: `${FE}/event/${SLUG}`,
      act: async (page) => {
        await page.getByRole("button", { name: /Tambah/ }).first().click();
        await page.getByRole("button", { name: /Lanjut ke Pembayaran|Dapatkan Tiket Gratis/ }).click();
        await page.waitForURL(/\/checkout/);
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "05-my-tickets-qr",
      login: "attendee",
      url: `${FE}/my-tickets`,
      act: async (page) => {
        await page.getByRole("button", { name: /Tampilkan QR/ }).first().click();
        await page.getByRole("dialog").waitFor();
      },
    },
    { name: "06-organizer-events", login: "organizer", url: `${DASH}/user/events` },
    { name: "07-create-event", login: "organizer", url: `${DASH}/user/events/create` },
    { name: "m1-home", mobile: true, url: `${FE}/` },
    { name: "m2-event-detail", mobile: true, url: `${FE}/event/${SLUG}` },
    { name: "m3-my-tickets", mobile: true, login: "attendee", url: `${FE}/my-tickets` },
  ],
};

// DariOrdal: one Next.js app on 3003. Event details open as a dialog on the home page.
const DO = "http://localhost:3003";
const openFirstEvent = async (page: Page) => {
  await page.locator('img[src*="/images/"]').first().click();
  await page.getByText("Pilih Tiket").first().waitFor();
};
const CHANNELS = {
  success: true,
  data: [
    { Code: "qris", Name: "QRIS", Description: "Scan with any e-wallet or mobile banking app", Channels: [{ Code: "qris", Name: "QRIS", FeatureStatus: "active", HealthStatus: "online" }] },
    {
      Code: "va",
      Name: "Virtual Account",
      Description: "Bank transfer",
      Channels: [
        { Code: "bca", Name: "BCA", FeatureStatus: "active", HealthStatus: "online" },
        { Code: "bni", Name: "BNI", FeatureStatus: "active", HealthStatus: "online" },
      ],
    },
    { Code: "cc", Name: "Credit Card", Description: "Visa and Mastercard", Channels: [{ Code: "cc", Name: "Credit Card", FeatureStatus: "active", HealthStatus: "online" }] },
  ],
};

const dariordal: App = {
  logins: {
    admin: async (page) => {
      await formLogin(page, `${DO}/login`, "admin@demo.test");
      await poll(hasCookie(page, "userRole"), "admin session cookie");
    },
    attendee: async (page) => {
      await formLogin(page, `${DO}/login`, "attendee@demo.test");
      await poll(hasCookie(page, "userId"), "attendee session cookie");
    },
  },
  shots: [
    { name: "01-home", url: `${DO}/` },
    { name: "02-event-detail", url: `${DO}/`, act: openFirstEvent },
    {
      name: "03-checkout",
      login: "attendee",
      url: `${DO}/`,
      mock: { "**/api/payment/channels": CHANNELS },
      act: async (page) => {
        await openFirstEvent(page);
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: /^\+$|Tambah/ }).first().click();
        await dialog.getByRole("button", { name: /Checkout|Lanjut|Beli|Pesan/ }).first().click();
        await page.getByText("Checkout Tiket").waitFor();
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "04-my-tickets-qr",
      login: "attendee",
      url: `${DO}/tickets`,
      act: async (page) => {
        await page.locator('img[src^="data:image/png"]').first().waitFor();
      },
    },
    { name: "05-admin-dashboard", login: "admin", url: `${DO}/dashboard` },
    { name: "06-transactions", login: "admin", url: `${DO}/dashboard/transactions` },
    { name: "07-create-event", login: "admin", url: `${DO}/dashboard/events/create` },
    { name: "m1-home", mobile: true, url: `${DO}/` },
    { name: "m2-event-detail", mobile: true, url: `${DO}/`, act: openFirstEvent },
    { name: "m3-my-tickets", mobile: true, login: "attendee", url: `${DO}/tickets` },
  ],
};

const selftest: App = {
  logins: {},
  shots: [
    { name: "01-cover", url: "http://localhost:3009/cover/1.svg" },
    { name: "m1-cover", mobile: true, url: "http://localhost:3009/cover/2.svg" },
  ],
};

const APPS: Record<string, App> = { serupa, dariordal, selftest };

// Blurs emails, phone numbers and people columns in tables before every capture.
async function blurPrivate(page: Page) {
  await page.evaluate(() => {
    const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
    const PHONE = /(\+62|\b08\d{2})[\s-]?\d{3,4}[\s-]?\d{3,5}/;
    const PEOPLE = /name|nama|email|pembeli|customer|buyer|attendee|peserta|pengguna|user|phone|telepon|hp/i;
    const blur = (el: Element) => {
      (el as HTMLElement).style.filter = "blur(6px)";
    };
    const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      if ((EMAIL.test(text) || PHONE.test(text)) && node.parentElement) blur(node.parentElement);
    }
    document.querySelectorAll("input, textarea").forEach((el) => {
      const value = (el as HTMLInputElement).value ?? "";
      if (EMAIL.test(value) || PHONE.test(value)) blur(el);
    });
    document.querySelectorAll("table").forEach((table) => {
      table.querySelectorAll("thead th").forEach((th, col) => {
        if (PEOPLE.test(th.textContent ?? "")) table.querySelectorAll(`tbody tr > :nth-child(${col + 1})`).forEach(blur);
      });
    });
  });
}

const appName = process.argv[2] ?? "";
const app = APPS[appName];
if (!app) throw new Error(`usage: bun capture.ts ${Object.keys(APPS).join("|")} [shot ...]`);
const only = new Set(process.argv.slice(3));
const raw = path.join(SCRATCH, "shots", appName, "raw");
mkdirSync(raw, { recursive: true });

const browser = await chromium.launch();
const failed: string[] = [];
for (const shot of app.shots.filter((s) => only.size === 0 || only.has(s.name))) {
  const context = await browser.newContext(
    shot.mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "id-ID" }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "id-ID" },
  );
  await context.route((url) => BLOCKED.test(url.hostname), (route) => route.abort());
  for (const [glob, body] of Object.entries(shot.mock ?? {})) await context.route(glob, (route) => route.fulfill({ json: body }));
  const page = await context.newPage();
  try {
    if (shot.login) await app.logins[shot.login](page);
    await page.goto(shot.url, { waitUntil: "networkidle" });
    if (shot.act) await shot.act(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await blurPrivate(page);
    await page.screenshot({ path: path.join(raw, `${shot.name}.png`) });
    console.log(`ok   ${shot.name}`);
  } catch (error) {
    failed.push(shot.name);
    await page.screenshot({ path: path.join(raw, `_debug-${shot.name}.png`) }).catch(() => {});
    console.log(`FAIL ${shot.name}: ${(error as Error).message.split("\n")[0]}`);
    const controls = await page
      .locator("button, a[href], input, [role=button]")
      .evaluateAll((els) =>
        els.slice(0, 60).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || (e as HTMLInputElement).placeholder || "").trim().slice(0, 40)}"`),
      )
      .catch(() => []);
    console.log(controls.join("\n"));
  }
  await context.close();
}
await browser.close();
if (failed.length > 0) {
  console.log(`failed: ${failed.join(", ")}`);
  process.exit(1);
}
```

- [ ] **Step 10: Write `ocr-check.ts` and `add-gallery.ts`**

Create `$SCRATCH/tools/ocr-check.ts`:

```ts
// OCR privacy pass over raw captures. Usage: bun ocr-check.ts <rawDir>
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: bun ocr-check.ts <rawDir>");
const CHECKS: [string, RegExp][] = [
  ["email", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ["phone", /(\+62|\b08\d{2})[\s-]?\d{3,4}[\s-]?\d{3,5}/],
  ["production host", /<production hosts>/i],
  ["local host", /localhost|127\.0\.0\.1/i],
  ["dummy env value", /dummy-[a-z_]+/i],
  ["company legal name", /\bPT\.? [A-Z][a-z]+/],
  ["hackathon", /hackathon/i],
];
let hits = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".png") && !f.startsWith("_"))) {
  const result = spawnSync("tesseract", [path.join(dir, file), "stdout"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`tesseract failed on ${file}: ${result.stderr}`);
  for (const [name, re] of CHECKS) {
    const m = result.stdout.match(re);
    if (m) {
      hits++;
      console.log(`${file}: ${name}: "${m[0]}"`);
    }
  }
}
console.log(hits > 0 ? `${hits} hit(s): review each image by eye, then blur or recapture` : "no OCR hits");
```

Create `$SCRATCH/tools/add-gallery.ts`:

```ts
// Writes a pod's gallery assets from a manifest and the real image sizes. Run from the HQ repo root.
// Usage: bun add-gallery.ts <podSlug> <manifest.json>
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [slug, manifestFile] = process.argv.slice(2);
if (!slug || !manifestFile) throw new Error("usage: bun add-gallery.ts <podSlug> <manifest.json>");
const manifest: { file: string; alt: { en: string; id: string } }[] = JSON.parse(readFileSync(manifestFile, "utf8"));

const FILE = "content/site-content.json";
const before = readFileSync(FILE, "utf8");
const data = JSON.parse(before);
if (JSON.stringify(data, null, 2) + "\n" !== before) throw new Error("site-content.json does not round-trip; stop and edit by hand");
const pod = data.floors.labs.pods.find((p: { slug: string }) => p.slug === slug);
if (!pod) throw new Error(`unknown pod ${slug}`);

pod.assets = manifest.map(({ file, alt }) => {
  const src = `/media/${slug}/${file}.webp`;
  const disk = `public${src}`;
  if (!existsSync(disk) || !existsSync(disk.replace(/\.webp$/, ".thumb.webp"))) throw new Error(`missing ${disk} or its thumbnail`);
  const size = spawnSync("magick", ["identify", "-format", "%w %h", disk], { encoding: "utf8" });
  const [width, height] = size.stdout.trim().split(" ").map(Number);
  if (!width || !height) throw new Error(`cannot read the size of ${disk}`);
  return { src, alt, width, height, redacted: true };
});

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`${slug}: ${pod.assets.length} assets, cover ${pod.assets[0]?.src}`);
```

- [ ] **Step 11: Run the full self-test**

Run: `cd "$SCRATCH/tools" && bash selftest.sh`
Expected: `ok   01-cover`, `ok   m1-cover`, the OCR line is consumed by `grep -q`, and the last line is `toolkit selftest: OK`. Lines such as `selftest.sh: line 36: NNNN Terminated: 15 bun covers.ts` are the expected result of `kill` on the covers server. (Verified during planning on macOS with Bun 1.4.1, Playwright 1.64.0, ImageMagick 7 and Tesseract 5.5.)

- [ ] **Step 12: No commit**

The toolkit lives outside the repo on purpose. Confirm the HQ tree is untouched by this task:

Run: `cd "$HQ" && rtk git status --short`
Expected: no output (Tasks 1 to 3 are committed).

---
### Task 5: Run Serupa Locally with Sample Data

Timebox: 45 minutes from Step 2 to a passing Step 9. If the backend cannot serve the seeded events in that time, stop, skip Task 6 (keep the Serupa pod text-only, `assets: []`) and record why in the PR (fallback). If only the dashboard fails, capture the attendee screens and skip `06` and `07`.

**Files (scratch only):**
- Create: `$SCRATCH/apps/serupa-be`, `$SCRATCH/apps/serupa-fe`, `$SCRATCH/apps/serupa-dash` (clones), their dummy `.env` / `.env.local`, `$SCRATCH/tools/serupa-demo.sql`, `$SCRATCH/demo-password`, logs and pid files in `$SCRATCH/logs`

**Interfaces:**
- Consumes: `compose.yml`, `fill-env.ts`, `covers.ts` (Task 4).
- Produces: API on `http://localhost:3000` (`/api/v1/...`), attendee site on `http://localhost:3001`, dashboard on `http://localhost:3002`, covers on `http://localhost:3009`; demo logins `attendee@demo.test` and `organizer@demo.test` with the password in `$SCRATCH/demo-password`; `SERUPA_EVENT_SLUG` (a seeded, approved event with ticket tiers).

- [ ] **Step 1: Write the failing smoke check**

Create `$SCRATCH/tools/smoke-serupa.sh`:

```bash
#!/usr/bin/env bash
# Smoke check for the local Serupa run. Usage: bash smoke-serupa.sh
set -euo pipefail
code() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
[ "$(code http://localhost:3000/api/v1/health)" = "200" ] || { echo "FAIL api health"; exit 1; }
login=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"attendee@demo.test\",\"password\":\"$DEMO_PASSWORD\"}")
echo "$login" | grep -q 'ccessToken' || { echo "FAIL attendee login: ${login:0:200}"; exit 1; }
[ "$(code "http://localhost:3000/api/v1/public/events/$SERUPA_EVENT_SLUG")" = "200" ] || { echo "FAIL public event"; exit 1; }
[ "$(code http://localhost:3001/)" = "200" ] || { echo "FAIL attendee site"; exit 1; }
[ "$(code "http://localhost:3001/event/$SERUPA_EVENT_SLUG")" = "200" ] || { echo "FAIL event page"; exit 1; }
[ "$(code http://localhost:3002/login)" = "200" ] || { echo "FAIL dashboard"; exit 1; }
[ "$(code http://localhost:3009/cover/1.svg)" = "200" ] || { echo "FAIL covers"; exit 1; }
echo "serupa smoke: OK"
```

Run: `bash "$SCRATCH/tools/smoke-serupa.sh"`
Expected: `FAIL api health` (nothing runs yet).

- [ ] **Step 2: Start the services**

```bash
docker compose -f "$SCRATCH/tools/compose.yml" up -d
docker compose -f "$SCRATCH/tools/compose.yml" exec -T postgres sh -c 'until pg_isready -U demo -q; do sleep 1; done; echo ready'
```

Expected: three containers started (`postgres`, `redis`, `mailpit`), then `ready`.

- [ ] **Step 3: Clone the three repositories read-only**

```bash
cd "$SCRATCH/apps"
gh repo clone <serupa-backend-repo> serupa-be -- --depth 1 --quiet
gh repo clone <serupa-attendee-repo> serupa-fe -- --depth 1 --quiet
gh repo clone <serupa-dashboard-repo> serupa-dash -- --depth 1 --quiet
for d in serupa-be serupa-fe serupa-dash; do git -C "$d" remote set-url --push origin no-push; done
ls serupa-be/.env* serupa-fe/.env* serupa-dash/.env* 2>/dev/null
```

Expected: only `serupa-be/.env.example` is listed (no real env file is committed in any of them). Pushing is disabled.

- [ ] **Step 4: Install dependencies**

```bash
cd "$SCRATCH/apps/serupa-be" && HUSKY=0 bun install
cd "$SCRATCH/apps/serupa-fe" && HUSKY=0 bun install
cd "$SCRATCH/apps/serupa-dash" && HUSKY=0 bun install
```

Expected: each ends with `N packages installed`. If `bcrypt` fails to build in the backend, run `bun pm trust bcrypt` then `bun install` again.

- [ ] **Step 5: Write dummy env files (no real values anywhere)**

```bash
T="$SCRATCH/tools"
bun "$T/fill-env.ts" "$SCRATCH/apps/serupa-be" "$SCRATCH/apps/serupa-be/.env" \
  NODE_ENV=development PORT=3000 API_VERSION=v1 BASE_URL=http://localhost:3000 \
  DATABASE_URL=postgres://demo:demo@localhost:55432/serupa_demo \
  REDIS_URL=redis://localhost:56379 REDIS_PASSWORD= \
  JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  JWT_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d \
  SMTP_HOST=localhost SMTP_PORT=51025 \
  FRONTEND_URL=http://localhost:3001 DASHBOARD_URL=http://localhost:3002 AWS_REGION=us-east-1
bun "$T/fill-env.ts" "$SCRATCH/apps/serupa-fe" "$SCRATCH/apps/serupa-fe/.env.local" \
  NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 NEXT_PUBLIC_FRONTEND_URL=http://localhost:3001 \
  NEXT_PUBLIC_SITE_URL=http://localhost:3001 NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3002 \
  NEXT_PUBLIC_ANALYTICS_ID= NEXT_PUBLIC_ENABLE_ANALYTICS=false NEXT_PUBLIC_DEBUG_MODE=false
bun "$T/fill-env.ts" "$SCRATCH/apps/serupa-dash" "$SCRATCH/apps/serupa-dash/.env.local" \
  NEXT_PUBLIC_API_URL=http://localhost:3000 NEXT_PUBLIC_FALLBACK_URL=http://localhost:3001 \
  NEXT_PUBLIC_APP_URL=http://localhost:3002 NEXT_PUBLIC_MAIN_SITE_URL=http://localhost:3001 NEXT_PUBLIC_COOKIE_DOMAIN=
grep -l '<attendee-site-domain>' "$SCRATCH"/apps/serupa-*/.env* || echo "no production hosts in env files"
```

Expected: three `...: N keys (M overrides)` lines, then `no production hosts in env files`.

- [ ] **Step 6: Migrate, seed and prepare the demo data**

```bash
cd "$SCRATCH/apps/serupa-be"
bunx drizzle-kit migrate || bunx drizzle-kit push --force
bun run seed
openssl rand -hex 12 > "$SCRATCH/demo-password"
export DEMO_PASSWORD="$(cat "$SCRATCH/demo-password")"
export HASH="$(bun -e 'console.log(await Bun.password.hash(process.env.DEMO_PASSWORD, { algorithm: "bcrypt", cost: 10 }))')"
```

Expected: drizzle-kit applies the migrations (or pushes the schema), the seeder prints `Seeded categories: N` and the other seeded counts without an error.

Create `$SCRATCH/tools/serupa-demo.sql`:

```sql
-- Turns the faker seed into obviously fictional demo data and picks the demo accounts.
CREATE TEMP TABLE demo_ids (attendee uuid, organizer uuid);
INSERT INTO demo_ids (attendee)
SELECT user_id FROM transactions GROUP BY user_id ORDER BY count(*) DESC, user_id LIMIT 1;
UPDATE demo_ids SET organizer = (
  SELECT created_by FROM events WHERE created_by <> (SELECT attendee FROM demo_ids)
  GROUP BY created_by ORDER BY count(*) DESC, created_by LIMIT 1
);

UPDATE users SET first_name = 'Demo', last_name = 'User ' || upper(substr(id::text, 1, 4)),
  email = 'user-' || substr(id::text, 1, 8) || '@demo.test', photo = NULL;
UPDATE users SET first_name = 'Demo', last_name = 'Attendee', email = 'attendee@demo.test', role = 'USER',
  is_email_verified = true, is_active = true, password = :'hash'
WHERE id = (SELECT attendee FROM demo_ids);
UPDATE users SET first_name = 'Demo', last_name = 'Organizer', email = 'organizer@demo.test', role = 'USER',
  is_email_verified = true, is_active = true, password = :'hash'
WHERE id = (SELECT organizer FROM demo_ids);

UPDATE events SET title = replace(title, 'Hackathon', 'Meetup') || ' ' || upper(substr(id::text, 1, 3))
WHERE title ILIKE '%hackathon%';
UPDATE events SET cover_image = 'http://localhost:3009/cover/' || (abs(hashtext(id::text)) % 6) || '.svg',
  approval_status = 'APPROVED';
UPDATE events SET approval_status = 'PENDING'
WHERE id = (SELECT id FROM events WHERE created_by = (SELECT organizer FROM demo_ids) ORDER BY id LIMIT 1);
UPDATE transactions SET status = 'PAID'
WHERE id IN (SELECT id FROM transactions WHERE user_id = (SELECT attendee FROM demo_ids) ORDER BY id LIMIT 2);

SELECT 'attendee transactions' AS what, count(*) FROM transactions WHERE user_id = (SELECT attendee FROM demo_ids)
UNION ALL
SELECT 'organizer events', count(*) FROM events WHERE created_by = (SELECT organizer FROM demo_ids);
SELECT e.slug FROM events e JOIN tickets t ON t.event_id = e.id
WHERE e.approval_status = 'APPROVED' GROUP BY e.slug ORDER BY count(*) DESC, e.slug LIMIT 1;
```

Run:

```bash
docker compose -f "$SCRATCH/tools/compose.yml" exec -T postgres \
  psql -U demo -d serupa_demo -v ON_ERROR_STOP=1 -v hash="$HASH" < "$SCRATCH/tools/serupa-demo.sql"
```

Expected: `UPDATE n` lines, then two counts above 0 (`attendee transactions`, `organizer events`) and one event slug. If psql reports an unknown column, inspect the table (`\d events`, `\d transactions`) and adjust only that column name in the SQL file. Save that slug for the later steps:

```bash
docker compose -f "$SCRATCH/tools/compose.yml" exec -T postgres psql -U demo -d serupa_demo -tA -c \
  "SELECT e.slug FROM events e JOIN tickets t ON t.event_id = e.id WHERE e.approval_status = 'APPROVED' GROUP BY e.slug ORDER BY count(*) DESC, e.slug LIMIT 1" \
  > "$SCRATCH/serupa-event-slug"
export SERUPA_EVENT_SLUG="$(cat "$SCRATCH/serupa-event-slug")" && echo "$SERUPA_EVENT_SLUG"
```

Expected: the same slug as the last line of the SQL output.

- [ ] **Step 7: Start the four processes (keep them running)**

Start each in the background (use your harness's async mode if it has one) and keep the pids:

```bash
cd "$SCRATCH/tools" && (bun covers.ts > "$SCRATCH/logs/covers.log" 2>&1 & echo $! > "$SCRATCH/logs/covers.pid")
cd "$SCRATCH/apps/serupa-be" && (bun src/app.ts > "$SCRATCH/logs/serupa-be.log" 2>&1 & echo $! > "$SCRATCH/logs/serupa-be.pid")
cd "$SCRATCH/apps/serupa-fe" && (bun run dev > "$SCRATCH/logs/serupa-fe.log" 2>&1 & echo $! > "$SCRATCH/logs/serupa-fe.pid")
cd "$SCRATCH/apps/serupa-dash" && (bun run dev > "$SCRATCH/logs/serupa-dash.log" 2>&1 & echo $! > "$SCRATCH/logs/serupa-dash.pid")
```

Wait until the logs show the API listening on 3000 and both Next.js servers `Ready` (Turbopack compiles a route on first request, so the first page load can take 20 to 60 seconds):

```bash
tail -n 5 "$SCRATCH"/logs/serupa-*.log
```

If the API exits with a missing-variable error, add that key to the Step 5 override list and restart it. If it exits on SMTP or Redis, check `docker compose -f "$SCRATCH/tools/compose.yml" ps` and the ports in the env file.

- [ ] **Step 8: Warm the routes**

```bash
for u in http://localhost:3001/ http://localhost:3001/events "http://localhost:3001/event/$SERUPA_EVENT_SLUG" http://localhost:3001/login http://localhost:3001/my-tickets http://localhost:3002/login http://localhost:3002/user/events http://localhost:3002/user/events/create; do
  curl -s -o /dev/null -w "%{http_code} $u\n" --max-time 120 "$u"
done
```

Expected: `200` for every URL (the protected pages render their client shell and redirect in the browser).

- [ ] **Step 9: Run the smoke check**

Run: `bash "$SCRATCH/tools/smoke-serupa.sh"`
Expected: `serupa smoke: OK`

- [ ] **Step 10: No commit** (scratch only). `cd "$HQ" && rtk git status --short` prints nothing.

---

### Task 6: Serupa Gallery

**Files:**
- Create: `public/media/event-ticketing-platform/01-home.webp`, `02-events.webp`, `03-event-detail.webp`, `04-checkout.webp`, `05-my-tickets-qr.webp`, `06-organizer-events.webp`, `07-create-event.webp`, `08-mobile.webp`, each with a `.thumb.webp` sibling (fewer if some shots were skipped; numbering stays contiguous)
- Modify: `content/site-content.json` (pod `event-ticketing-platform` `assets`)
- Test: `tests/content/dataset.test.ts` (extend the Task 1 block), `tests/content/assets.test.ts`
- Scratch: `$SCRATCH/shots/serupa/{raw,out}`, `$SCRATCH/tools/serupa-manifest.json`

**Interfaces:**
- Consumes: `capture.ts`, `convert.sh`, `ocr-check.ts`, `add-gallery.ts` (Task 4); the running apps, `DEMO_PASSWORD` and `SERUPA_EVENT_SLUG` (Task 5).
- Produces: `pod.assets` for `event-ticketing-platform` (cover `01-home`), all `redacted: true`, 1600 x 1000.

- [ ] **Step 1: Write the failing test**

In `tests/content/dataset.test.ts`, inside the Task 1 block, add:

```ts
  it("ships the Serupa gallery: desktop screens plus one mobile triptych, cover first", () => {
    const assets = serupa?.assets ?? [];
    expect(assets.length).toBeGreaterThanOrEqual(6);
    expect(assets[0].src).toBe("/media/event-ticketing-platform/01-home.webp");
    expect(assets.at(-1)?.src).toMatch(/^\/media\/event-ticketing-platform\/\d{2}-mobile\.webp$/);
    expect(assets.every((a) => a.width === 1600 && a.height === 1000 && a.redacted)).toBe(true);
  });
```

If fewer than 5 desktop screens can be captured, lower `6` to the real count plus one; if the app could not run at all (Task 5 fallback), skip this whole task and do not add the test.

Run: `bunx vitest run tests/content/dataset.test.ts -t "Serupa gallery"`
Expected: FAIL with `expected 0 to be greater than or equal to 6`.

- [ ] **Step 2: Capture**

```bash
cd "$SCRATCH/tools"
export DEMO_PASSWORD="$(cat "$SCRATCH/demo-password")" SERUPA_EVENT_SLUG="$(cat "$SCRATCH/serupa-event-slug")"
bun capture.ts serupa
```

Expected: `ok   01-home` through `ok   m3-my-tickets` (10 lines). For any `FAIL <shot>`: open `$SCRATCH/shots/serupa/raw/_debug-<shot>.png`, read the dumped control labels, fix only that shot's `act` selector in `capture.ts`, and re-run just that shot (`bun capture.ts serupa 04-checkout`). Two attempts per shot; after that, drop the shot, renumber the remaining desktop PNGs contiguously (`mv 05-my-tickets-qr.png 04-my-tickets-qr.png`, and so on) and note it for the PR.

- [ ] **Step 3: Review every raw capture by eye**

Open each PNG in `$SCRATCH/shots/serupa/raw/` (not the `_debug-*` files). Check: the UI is the real app (no error overlay, no Next.js dev error toast, no "Missing environment variable" banner, no empty states caused by the local setup); people's names are only "Demo ..." values; no email, phone number, address bar, `localhost` text, `dummy-` value, company legal name or production hostname is readable; no photo of a person. The Next.js dev indicator badge (bottom-left "N") must not be visible; if it is, add `devIndicators: false` to the clone's `next.config.mjs` (scratch clone only), restart that dev server and recapture. If dev mode keeps showing overlays, run the clone in production mode instead (`bun run build && bun run start`; both apps set `ignoreBuildErrors`).

- [ ] **Step 4: OCR pass**

Run: `bun "$SCRATCH/tools/ocr-check.ts" "$SCRATCH/shots/serupa/raw"`
Expected: `no OCR hits`. For each hit, look at the image: blur the area (`magick in.png -region WxH+X+Y -blur 0x12 in.png`) or fix the data and recapture, then re-run until `no OCR hits`. Prices and the fictional event titles are fine.

- [ ] **Step 5: Convert and copy into the repo**

```bash
bash "$SCRATCH/tools/convert.sh" "$SCRATCH/shots/serupa/raw" "$SCRATCH/shots/serupa/out"
mkdir -p "$HQ/public/media/event-ticketing-platform"
cp "$SCRATCH"/shots/serupa/out/*.webp "$HQ/public/media/event-ticketing-platform/"
ls -1 "$HQ/public/media/event-ticketing-platform" | wc -l
du -sh "$HQ/public/media"
```

Expected: 16 files (8 images and 8 thumbnails), `public/media` about 10 to 12 MB (well under 25 MB).

- [ ] **Step 6: Write the manifest (alt text describes what each image shows)**

Create `$SCRATCH/tools/serupa-manifest.json` (drop entries for skipped shots and keep the file names in sync; if a screen differs from the description, change the words in both locales):

```json
[
  { "file": "01-home", "alt": { "en": "Attendee site home with featured events and categories, shown with sample data", "id": "Beranda situs pengunjung dengan acara unggulan dan kategori, ditampilkan dengan data contoh" } },
  { "file": "02-events", "alt": { "en": "Event search with category, city and date filters", "id": "Pencarian acara dengan filter kategori, kota, dan tanggal" } },
  { "file": "03-event-detail", "alt": { "en": "Event page with schedule, location and ticket tiers", "id": "Halaman acara dengan jadwal, lokasi, dan tier tiket" } },
  { "file": "04-checkout", "alt": { "en": "Checkout with attendee details, order summary and payment method choice", "id": "Checkout dengan data pengunjung, ringkasan pesanan, dan pilihan metode pembayaran" } },
  { "file": "05-my-tickets-qr", "alt": { "en": "My Tickets with a QR code ready to show at the entrance", "id": "My Tickets dengan kode QR yang siap ditunjukkan di pintu masuk" } },
  { "file": "06-organizer-events", "alt": { "en": "Organizer dashboard listing events with their review status", "id": "Dashboard penyelenggara berisi daftar acara beserta status review" } },
  { "file": "07-create-event", "alt": { "en": "Create event form with details, schedule, location map and ticket tiers", "id": "Formulir pembuatan acara dengan detail, jadwal, peta lokasi, dan tier tiket" } },
  { "file": "08-mobile", "alt": { "en": "Mobile layouts of the home page, an event page and My Tickets", "id": "Tampilan mobile untuk beranda, halaman acara, dan My Tickets" } }
]
```

- [ ] **Step 7: Write the assets**

Run: `cd "$HQ" && bun "$SCRATCH/tools/add-gallery.ts" event-ticketing-platform "$SCRATCH/tools/serupa-manifest.json"`
Expected: `event-ticketing-platform: 8 assets, cover /media/event-ticketing-platform/01-home.webp`

- [ ] **Step 8: Run the tests**

Run: `bunx vitest run tests/content tests/unit/room-views.test.ts tests/unit/selectors.test.ts && bun run validate:content`
Expected: all PASS, including "ships the Serupa gallery..." and the asset tests (files exist, thumbnails, `redacted`, pod-slug folder, 25 MB budget).

- [ ] **Step 9: Commit**

```bash
rtk git add public/media/event-ticketing-platform content/site-content.json tests/content/dataset.test.ts
rtk git commit -m "feat(media): Serupa ticketing gallery from a local run with sample data"
```

- [ ] **Step 10: Stop the Serupa processes**

```bash
for f in "$SCRATCH"/logs/serupa-*.pid; do kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
for port in 3000 3001 3002; do for pid in $(lsof -ti ":$port"); do kill "$pid"; done; done
```

Expected: `lsof -ti :3000 -ti :3001 -ti :3002` prints nothing afterwards. Leave Docker and the covers server running for Task 7.

---
### Task 7: Run DariOrdal Locally with Sample Data

Timebox: 45 minutes from Step 2 to a passing Step 8. Fallback as in Task 5: skip Task 8, keep the refreshed text, note it in the PR.

**Files (scratch only):**
- Create: `$SCRATCH/apps/dariordal` (clone) and its dummy `.env`, `$SCRATCH/tools/dariordal-demo.sql`, `$SCRATCH/tools/smoke-dariordal.sh`

**Interfaces:**
- Consumes: Docker services, `fill-env.ts`, `DEMO_PASSWORD` and `HASH` (Task 5 Step 6; recompute `HASH` in a new shell with the same command).
- Produces: DariOrdal on `http://localhost:3003` with demo logins `admin@demo.test` (role ADMIN) and `attendee@demo.test`, both with the password in `$SCRATCH/demo-password`.

- [ ] **Step 1: Write the failing smoke check**

Create `$SCRATCH/tools/smoke-dariordal.sh`:

```bash
#!/usr/bin/env bash
# Smoke check for the local DariOrdal run. Usage: bash smoke-dariordal.sh
set -euo pipefail
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 120 "$1"; }
[ "$(code http://localhost:3003/)" = "200" ] || { echo "FAIL home"; exit 1; }
for who in admin attendee; do
  curl -s -i -X POST http://localhost:3003/api/auth/login -H 'content-type: application/json' \
    -d "{\"email\":\"$who@demo.test\",\"password\":\"$DEMO_PASSWORD\"}" | grep -qi '^set-cookie: userId=' \
    || { echo "FAIL $who login"; exit 1; }
done
echo "dariordal smoke: OK"
```

Run: `bash "$SCRATCH/tools/smoke-dariordal.sh"`
Expected: `FAIL home`.

- [ ] **Step 2: Clone, install, create the database**

```bash
cd "$SCRATCH/apps"
gh repo clone <dariordal-repo> dariordal -- --depth 1 --quiet
git -C dariordal remote set-url --push origin no-push
ls dariordal/.env* 2>/dev/null
cd dariordal && HUSKY=0 bun install
docker compose -f "$SCRATCH/tools/compose.yml" exec -T postgres createdb -U demo dariordal_demo
```

Expected: only `dariordal/.env.example` is listed; install ends with `N packages installed`; `createdb` prints nothing.

- [ ] **Step 3: Dummy env file**

```bash
bun "$SCRATCH/tools/fill-env.ts" "$SCRATCH/apps/dariordal" "$SCRATCH/apps/dariordal/.env" \
  NODE_ENV=development BASE_URL=http://localhost:3003 NEXT_PUBLIC_BASE_URL=http://localhost:3003 NEXT_PUBLIC_API_URL=http://localhost:3003 \
  DATABASE_URL=postgres://demo:demo@localhost:55432/dariordal_demo \
  REDIS_URL=redis://localhost:56379 REDIS_PASSWORD= SMTP_HOST=localhost SMTP_PORT=51025 \
  JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)" NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
  IPAYMU_ALLOWED_CATEGORIES=qris,va,cc PAYMENT_SERVICE_FEE=5 PAYMENT_TAX=11
grep -c 'dariordal\.com' "$SCRATCH/apps/dariordal/.env" || true
```

Expected: `.../dariordal/.env: N keys (M overrides)`, then `0`. (Overrides for keys the app does not read are harmless.)

- [ ] **Step 4: Migrate and seed**

```bash
cd "$SCRATCH/apps/dariordal"
bunx prisma generate && bunx prisma migrate deploy && bunx prisma db seed
```

Expected: `Generated Prisma Client`, `All migrations have been successfully applied.` (2 migrations), then the seeder's success lines for users, events, ticket types, tickets and transactions.

- [ ] **Step 5: Demo data**

Create `$SCRATCH/tools/dariordal-demo.sql`:

```sql
-- Turns the seed into obviously fictional demo data and picks the demo accounts.
CREATE TEMP TABLE demo_ids (attendee text, admin text);
INSERT INTO demo_ids (attendee)
SELECT t."userId" FROM transactions t JOIN users u ON u.id = t."userId"
WHERE u.role <> 'ADMIN' GROUP BY t."userId" ORDER BY count(*) DESC, t."userId" LIMIT 1;
UPDATE demo_ids SET admin = (SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1);

UPDATE users SET name = 'Demo User ' || upper(substr(id, 1, 4)), email = 'user-' || substr(id, 1, 8) || '@demo.test';
UPDATE users SET name = 'Demo Admin', email = 'admin@demo.test', password = :'hash', "emailVerified" = true
WHERE id = (SELECT admin FROM demo_ids);
UPDATE users SET name = 'Demo Attendee', email = 'attendee@demo.test', password = :'hash', "emailVerified" = true
WHERE id = (SELECT attendee FROM demo_ids);
UPDATE events SET name = 'Demo ' || initcap(replace(regexp_replace(id, '-[0-9]{4}$', ''), '-', ' ')),
  location = 'Demo Hall, Jakarta', "eventLink" = NULL, date = '2026-12-12';

SELECT 'attendee tickets' AS what, count(*) FROM tickets WHERE "userId" = (SELECT attendee FROM demo_ids)
UNION ALL
SELECT 'events', count(*) FROM events;
```

Run:

```bash
export DEMO_PASSWORD="$(cat "$SCRATCH/demo-password")"
export HASH="$(bun -e 'console.log(await Bun.password.hash(process.env.DEMO_PASSWORD, { algorithm: "bcrypt", cost: 10 }))')"
docker compose -f "$SCRATCH/tools/compose.yml" exec -T postgres \
  psql -U demo -d dariordal_demo -v ON_ERROR_STOP=1 -v hash="$HASH" < "$SCRATCH/tools/dariordal-demo.sql"
```

Expected: `UPDATE n` lines, then `attendee tickets` above 0 and `events` above 0. On an unknown column, check `\d users`, `\d events`, `\d tickets` and adjust only that name.

- [ ] **Step 6: Start the app (keep it running)**

```bash
cd "$SCRATCH/apps/dariordal" && (bun next dev -p 3003 > "$SCRATCH/logs/dariordal.log" 2>&1 & echo $! > "$SCRATCH/logs/dariordal.pid")
tail -n 5 "$SCRATCH/logs/dariordal.log"
```

Expected: `Ready` on `http://localhost:3003` within a minute.

- [ ] **Step 7: Warm the routes**

```bash
for u in / /login /tickets /dashboard /dashboard/transactions /dashboard/events/create; do
  curl -s -o /dev/null -w "%{http_code} $u\n" --max-time 120 "http://localhost:3003$u"
done
```

Expected: `200` for `/` and `/login`; `307` for `/tickets` or `/dashboard*` without cookies is fine (middleware redirect to `/login`).

- [ ] **Step 8: Run the smoke check**

Run: `bash "$SCRATCH/tools/smoke-dariordal.sh"`
Expected: `dariordal smoke: OK`

- [ ] **Step 9: No commit** (scratch only). `cd "$HQ" && rtk git status --short` prints nothing.

---

### Task 8: DariOrdal Gallery

**Files:**
- Create: `public/media/limited-quota-event-ticketing/01-home.webp`, `02-event-detail.webp`, `03-checkout.webp`, `04-my-tickets-qr.webp`, `05-admin-dashboard.webp`, `06-transactions.webp`, `07-create-event.webp`, `08-mobile.webp`, each with a `.thumb.webp` sibling (fewer if shots were skipped; numbering stays contiguous)
- Modify: `content/site-content.json` (pod `limited-quota-event-ticketing` `assets`)
- Test: `tests/content/dataset.test.ts` (extend the Task 1 block), `tests/content/assets.test.ts`
- Scratch: `$SCRATCH/shots/dariordal/{raw,out}`, `$SCRATCH/tools/dariordal-manifest.json`

**Interfaces:**
- Consumes: the toolkit (Task 4), the running app and demo logins (Task 7).
- Produces: `pod.assets` for `limited-quota-event-ticketing` (cover `01-home`), all `redacted: true`, 1600 x 1000.

- [ ] **Step 1: Write the failing test**

In `tests/content/dataset.test.ts`, inside the Task 1 block, add:

```ts
  it("ships the DariOrdal gallery: desktop screens plus one mobile triptych, cover first", () => {
    const assets = dariordal?.assets ?? [];
    expect(assets.length).toBeGreaterThanOrEqual(6);
    expect(assets[0].src).toBe("/media/limited-quota-event-ticketing/01-home.webp");
    expect(assets.at(-1)?.src).toMatch(/^\/media\/limited-quota-event-ticketing\/\d{2}-mobile\.webp$/);
    expect(assets.every((a) => a.width === 1600 && a.height === 1000 && a.redacted)).toBe(true);
  });
```

Same adjustment rule as Task 6 Step 1 when shots are skipped; skip the task and the test if the app did not run.

Run: `bunx vitest run tests/content/dataset.test.ts -t "DariOrdal gallery"`
Expected: FAIL with `expected 0 to be greater than or equal to 6`.

- [ ] **Step 2: Capture**

```bash
cd "$SCRATCH/tools" && export DEMO_PASSWORD="$(cat "$SCRATCH/demo-password")"
bun capture.ts dariordal
```

Expected: `ok   01-home` through `ok   m3-my-tickets` (10 lines). The likely fragile shots are `02-event-detail` and `03-checkout` (the event opens as a dialog from a card; the ticket and checkout buttons are guessed by label). Fix a failing shot from its `_debug-<shot>.png` and the dumped control labels, re-run only that shot, two attempts each, then drop and renumber as in Task 6 Step 2.

- [ ] **Step 3: Review every raw capture by eye**

Same checklist as Task 6 Step 3, plus: transaction and user tables show blurred name and email columns; invoice ids and amounts are fictional seed values (fine); the DariOrdal logo may show (named freelance client); no iPaymu error banner in the checkout (the channel list comes from the mocked response); the seeded stock images of the app itself are fine, but recapture with a different event if one shows a recognizable person's face.

- [ ] **Step 4: OCR pass**

Run: `bun "$SCRATCH/tools/ocr-check.ts" "$SCRATCH/shots/dariordal/raw"`
Expected: `no OCR hits`, after the same blur or recapture loop as Task 6 Step 4.

- [ ] **Step 5: Convert and copy into the repo**

```bash
bash "$SCRATCH/tools/convert.sh" "$SCRATCH/shots/dariordal/raw" "$SCRATCH/shots/dariordal/out"
mkdir -p "$HQ/public/media/limited-quota-event-ticketing"
cp "$SCRATCH"/shots/dariordal/out/*.webp "$HQ/public/media/limited-quota-event-ticketing/"
ls -1 "$HQ/public/media/limited-quota-event-ticketing" | wc -l
du -sh "$HQ/public/media"
```

Expected: 16 files; `public/media` about 12 to 15 MB.

- [ ] **Step 6: Write the manifest**

Create `$SCRATCH/tools/dariordal-manifest.json` (same editing rules as Task 6 Step 6):

```json
[
  { "file": "01-home", "alt": { "en": "Ticket storefront home with upcoming events, shown with sample data", "id": "Beranda toko tiket dengan acara mendatang, ditampilkan dengan data contoh" } },
  { "file": "02-event-detail", "alt": { "en": "Event details with ticket tiers and the remaining quota for each tier", "id": "Detail acara dengan tier tiket dan sisa kuota setiap tier" } },
  { "file": "03-checkout", "alt": { "en": "Checkout step with the ticket summary, fees and payment channels", "id": "Langkah checkout dengan ringkasan tiket, biaya, dan channel pembayaran" } },
  { "file": "04-my-tickets-qr", "alt": { "en": "My Tickets with QR e-tickets grouped by ticket type", "id": "My Tickets dengan e-ticket QR yang dikelompokkan per jenis tiket" } },
  { "file": "05-admin-dashboard", "alt": { "en": "Admin dashboard overview of events, ticket sales and transactions", "id": "Ringkasan dashboard admin untuk acara, penjualan tiket, dan transaksi" } },
  { "file": "06-transactions", "alt": { "en": "Transaction table with sorting, status filters and Excel export, buyer columns blurred", "id": "Tabel transaksi dengan pengurutan, filter status, dan ekspor Excel, kolom pembeli diburamkan" } },
  { "file": "07-create-event", "alt": { "en": "Create event form with ticket tiers and quotas", "id": "Formulir pembuatan acara dengan tier tiket dan kuota" } },
  { "file": "08-mobile", "alt": { "en": "Mobile layouts of the storefront, event details and My Tickets", "id": "Tampilan mobile untuk toko tiket, detail acara, dan My Tickets" } }
]
```

- [ ] **Step 7: Write the assets**

Run: `cd "$HQ" && bun "$SCRATCH/tools/add-gallery.ts" limited-quota-event-ticketing "$SCRATCH/tools/dariordal-manifest.json"`
Expected: `limited-quota-event-ticketing: 8 assets, cover /media/limited-quota-event-ticketing/01-home.webp`

- [ ] **Step 8: Run the tests**

Run: `bunx vitest run tests/content tests/unit/room-views.test.ts tests/unit/selectors.test.ts && bun run validate:content`
Expected: all PASS, including "ships the DariOrdal gallery...".

- [ ] **Step 9: Commit**

```bash
rtk git add public/media/limited-quota-event-ticketing content/site-content.json tests/content/dataset.test.ts
rtk git commit -m "feat(media): DariOrdal ticketing gallery from a local run with sample data"
```

- [ ] **Step 10: Stop DariOrdal, the covers server and Docker**

```bash
for f in "$SCRATCH"/logs/*.pid; do kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
for port in 3003 3009; do for pid in $(lsof -ti ":$port"); do kill "$pid"; done; done
docker compose -f "$SCRATCH/tools/compose.yml" down -v
```

Expected: `docker compose ... down -v` removes the three containers and the network and volumes; `lsof -ti :3003 -ti :3009` prints nothing.

---
### Task 9: Derived Surfaces and the Conditional Live Link

**Files:**
- Verify only (no edits expected): L2 Career Road, L3 Project Roads, Page View pages, OG cards, sitemap, Cmd-K and room data, all generated from content
- Modify only if the Step 5 condition holds: `src/content/live-links.ts`, `tests/unit/live-links.test.ts`, `content/site-content.json` (`liveUrl` on `event-ticketing-platform`)

**Interfaces:**
- Consumes: Tasks 1 to 8 content; `orderPods` (`src/content/selectors.ts`), `getYears` / `getPods` (`src/content/load.ts`), `buildCareerRoad` and `buildLabsLayout` via their unit tests; R4-J's `PUBLIC_LIVE_HOSTS` if merged.
- Produces: evidence for the PR (ordering, 2025 plaza rooms, generated pages); optionally `liveUrl: "https://<attendee-site-domain>.com"` on the Serupa pod.

- [ ] **Step 1: Layout, walk and catalog tests with the real content**

Run: `bunx vitest run tests/unit/career-layout.test.ts tests/unit/labs-layout.test.ts tests/unit/walk.test.ts tests/unit/experience-data.test.ts tests/unit/missions-rooms.test.ts tests/unit/search.test.ts tests/unit/seo.test.ts tests/unit/room-views.test.ts tests/unit/pads.test.ts tests/unit/pad-space.test.ts`
Expected: all PASS. The real Career Road passes `expectSpaceRules` with the sixth 2025 room (the plaza grows by `plazaLength`), and the real Project Roads dock the Serupa pod on the Product Engineering road while DariOrdal moves to the wing board. If a space rule fails, do not edit layout constants in this PR: report the failing rule and the numbers in the PR and ask the owner (the layout code belongs to the L2/L3 plans).

- [ ] **Step 2: Gallery-first order and the 2025 plaza**

```bash
bun -e 'import { getPods, getYears } from "./src/content/load"; console.log(getPods("software").map((p) => [p.slug, p.tier, p.assets.length].join(" ")).join("\n")); console.log("2025:", getYears().find((y) => y.year === 2025)?.entries.map((e) => e.id).join(", "))'
```

Expected (R4-J not merged, both galleries shipped):

```
anime-figure-ecommerce featured 6
vulnerability-scanning-automation featured 4
event-ticketing-platform featured 8
limited-quota-event-ticketing listed 8
university-alumni-platforms listed 6
digital-banking-integrations hero 0
ticket-marketplace-backend hero 0
vendor-management-portal hero 0
multi-tenant-saas-platform featured 0
payments-realtime-backend featured 0
event-tech-search-backend featured 0
digital-products-ecommerce listed 0
2025: portfolio-v1-2025, dariordal-2025, serupa-2025, 370-agency-2025, temmpat-2025, naremax-2025
```

With R4-J merged, `solutions-marketing-site featured 7` comes right before `event-ticketing-platform` (order 11 versus 12) and `event-tech-search-backend` shows as `listed 0` just before `digital-products-ecommerce`. If a gallery was skipped, that pod moves down into the no-gallery part of its tier.

- [ ] **Step 3: Build and check the generated pages, OG cards and sitemap**

```bash
bun run build
for f in out/en/labs/event-ticketing-platform.html out/id/labs/event-ticketing-platform.html out/en/journey/serupa-2025.html out/id/journey/serupa-2025.html out/og/en/labs/event-ticketing-platform.png out/og/id/labs/event-ticketing-platform.png out/en/labs/limited-quota-event-ticketing.html; do test -f "$f" && echo "ok $f" || echo "MISSING $f"; done
rg -o 'labs/event-ticketing-platform|journey/serupa-2025' out/sitemap.xml | wc -l
rg -l 'Next\.js 14' out/en/labs/limited-quota-event-ticketing.html || echo "no Next.js 14 on the DariOrdal page"
```

Expected: seven `ok` lines, a sitemap count of at least 4 (two routes in two locales), and `no Next.js 14 on the DariOrdal page`.

- [ ] **Step 4: Scan the export with the merged blocklist**

```bash
bun -e 'import { loadBlocklist, scanBuildOutput } from "./src/content/safety"; const hits = scanBuildOutput("out", loadBlocklist()); console.log(hits.length === 0 ? "export clean" : JSON.stringify(hits.slice(0, 5)))'
```

Expected: `export clean`. A hit on a Serupa term means the allowlist step of Task 1 Step 1 is needed after all; add the two allowlist lines, rebuild, re-run, and amend the Task 1 commit with a new commit (`fix(content): allow the Serupa client and product names`).

- [ ] **Step 5: Live link (only if R4-J merged AND the site is up)**

```bash
test -f src/content/live-links.ts && echo "R4-J merged" || echo "skip: R4-J not merged"
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 15 https://<attendee-site-domain>.com
```

Skip this step (and say so in the PR) unless the first line is `R4-J merged` AND curl prints `200` with no TLS error. Otherwise:

1. In `src/content/live-links.ts`, change
   `export const PUBLIC_LIVE_HOSTS: readonly string[] = ["mii-microsoft.azurewebsites.net", "mii-microsoft-ai.azurewebsites.net"];`
   to
   `export const PUBLIC_LIVE_HOSTS: readonly string[] = ["mii-microsoft.azurewebsites.net", "mii-microsoft-ai.azurewebsites.net", "<attendee-site-domain>.com"];`
2. In `tests/unit/live-links.test.ts`, change the exact-host expectation
   `expect([...PUBLIC_LIVE_HOSTS].sort()).toEqual(["mii-microsoft-ai.azurewebsites.net", "mii-microsoft.azurewebsites.net"]);`
   to
   `expect([...PUBLIC_LIVE_HOSTS].sort()).toEqual(["mii-microsoft-ai.azurewebsites.net", "mii-microsoft.azurewebsites.net", "<attendee-site-domain>.com"]);`
   Run `bunx vitest run tests/unit/live-links.test.ts`: it passes only after both edits (run it after edit 2 alone first to see it fail).
3. Add the field to the pod (its key position does not matter to the schema):

```bash
bun -e 'import { readFileSync, writeFileSync } from "node:fs"; const f = "content/site-content.json"; const s = readFileSync(f, "utf8"); const d = JSON.parse(s); if (JSON.stringify(d, null, 2) + "\n" !== s) throw new Error("round trip"); const p = d.floors.labs.pods.find((x) => x.id === "event-ticketing-platform"); p.liveUrl = "https://<attendee-site-domain>.com"; writeFileSync(f, JSON.stringify(d, null, 2) + "\n"); console.log("liveUrl set")'
bunx vitest run tests/unit/live-links.test.ts tests/content tests/ask && bun run validate:content
```

Expected: `liveUrl set`, then all PASS. Commit:

```bash
rtk git add src/content/live-links.ts tests/unit/live-links.test.ts content/site-content.json
rtk git commit -m "feat(content): live site link for the Serupa ticketing platform"
```

Flag in the PR that adding a host to `PUBLIC_LIVE_HOSTS` is an owner decision (R4-J rule).

- [ ] **Step 6: Commit only if something changed**

Run: `rtk git status --short`
Expected: no output (Steps 1 to 4 only verify). If Step 4 added allowlist lines, commit them as described there.

---

### Task 10: Final Verification, Privacy Review, Cleanup and PR

**Files:**
- Verify: the whole branch
- Delete: `$SCRATCH` (clones, env files, captures, toolkit)

**Interfaces:**
- Consumes: every earlier task.
- Produces: a pushed branch `feat/r4-k-ticketing-projects` and one PR for the owner.

- [ ] **Step 1: Content checks**

Run: `bun run validate:content && bun scripts/title-case.ts && rg -n $'\u2014' content tests src docs README.md AGENTS.md | head -3`
Expected: `validate:content` without errors, `title-case.ts` reports no titles to fix, the `rg` prints nothing.

- [ ] **Step 2: No private names in the branch**

```bash
git --no-pager log --format='%s%n%b' origin/main..HEAD | rg -i 'Ticket-Hub_|_BE\b|_FE\b|_Dashboard|NextJS_Prisma|<attendee-site-domain>|<private names>' || echo "commit messages clean"
git --no-pager diff origin/main...HEAD -- . ':!public/media' | rg -i 'Ticket-Hub_|NextJS_Prisma|<private names>|<api host>' || echo "diff clean"
```

Expected: `commit messages clean` and `diff clean`. (`<attendee-site-domain>.com` may appear in the diff only through the Task 9 Step 5 live link.)

- [ ] **Step 3: Fast verification**

```bash
bun run verify:quick
E2E_PORT=4410 bun run e2e:changed
```

Expected: `verify:quick` passes (typecheck, lint, all unit tests including the new dataset tests, the Ask suites and the asset budget, then `next build`). `e2e:changed` runs the specs mapped from `content/`, `public/media/` and `src/content/tech.ts` (`static-routes`, `pageview`, `seo`, `gallery`; `tests/` and `docs/` map to nothing) and passes. If port 4410 is busy, pick another free port.

- [ ] **Step 4: Final privacy review of the committed images**

```bash
mkdir -p "$SCRATCH/review"
for f in "$HQ"/public/media/{event-ticketing-platform,limited-quota-event-ticketing}/*.webp; do
  case "$f" in *.thumb.webp) continue ;; esac
  dwebp -quiet "$f" -o "$SCRATCH/review/$(basename "$(dirname "$f")")-$(basename "$f" .webp).png"
done
bun "$SCRATCH/tools/ocr-check.ts" "$SCRATCH/review"
for f in "$HQ"/public/media/{event-ticketing-platform,limited-quota-event-ticketing}/*.webp; do webpinfo "$f" | rg -q 'EXIF|XMP' && echo "METADATA $f"; done; echo "metadata check done"
```

Expected: `no OCR hits`, no `METADATA` lines, then `metadata check done`. Open every committed image once more at full size and confirm: fictional "Demo" names only, emails and buyer columns blurred, no hostnames, no company legal name, no person photo, alt text matches the picture.

- [ ] **Step 5: Delete the scratch directory and the clones**

```bash
docker compose -f "$SCRATCH/tools/compose.yml" down -v 2>/dev/null || true
rm -rf "$SCRATCH"
test -d "$SCRATCH" && echo "still there" || echo "scratch removed"
```

Expected: `scratch removed`.

- [ ] **Step 6: Push and open the PR**

```bash
rtk git push -u origin feat/r4-k-ticketing-projects
gh pr create --title "Ticketing projects: Serupa event ticketing platform and a refreshed DariOrdal pod, with galleries" --body-file - <<'BODY'
Adds the Serupa event ticketing platform as a Product Engineering project with its own Journey entry, refreshes the DariOrdal ticketing project from its repository, and adds galleries for both from local runs on sample data.

## Content
- New pod `event-ticketing-platform` ("Serupa Ticket Hub: Event Ticketing Platform", featured, Jun to Aug 2025) and Journey entry `serupa-2025` (freelance, Serupa), linked both ways.
- Role from the commit history: Full Stack Engineer in a two-person team. I set up the backend foundation and built accounts and events in the API, the attendee site (52 of 54 hand-written commits) and the organizer dashboard (10 of 11, on a v0 scaffold). My teammate wrote the order and payment code (88 of 133 backend commits), so the pod says so and does not use a "Lead" title.
- DariOrdal pod: Next.js 14 corrected to Next.js 15 (the repository used 15.2 from its first commit); the payment line now credits my teammate for the iPaymu checkout, callbacks and PDF invoices; the commit share is now non-merge commits (32 of 71) plus merged PRs (14 of 24) instead of 54 of 95 with merge commits; GitHub Actions added to the stack.
- Tier: the Product Engineering wing allows 6 featured pods and already had 6, so DariOrdal moved to `listed` to make room for Serupa. It keeps its page, gallery, Journey link and gallery-first rank in every list; only its L3 dock moves to the wing board. Swap back by setting one tier if you prefer.
- Ask the HQ: golden question "What ticketing platforms has Kurniadi built?" (facts: both project titles; set size and threshold updated in docs).
- Content map appendix updated (2025 Journey row, Product Engineering table, C8).

## Galleries
- Captured from local runs with seed data, dummy secrets and blocked production hosts; nothing was submitted to a payment gateway, mail server or bucket. 1440x900 at DPR 2 scaled to 1600x1000 webp plus 480x300 thumbnails, metadata stripped, and one 390 px mobile triptych each.
- People and events were renamed to "Demo ..." values before capture; emails, phone numbers and buyer columns are blurred; covers are neutral generated graphics. OCR pass plus a visual review on every image; all entries are `redacted: true`.
- Skipped shots (if any): list them here with the reason.

## Not changed, owner to confirm
- `dariordal-2025` highlights still say "Integrated payment gateway checkout with webhooks and an audit trail" (my teammate's work in the repository) and "Reduced operations overhead by 40%" (not verifiable from the repository; from the CV).
- The attendee site's public brand is "<attendee-site-domain>!"; copy uses "Serupa" as agreed. No live link: the public site failed TLS when checked (or: live link added, see the commit).

## Verification
- `bun run validate:content`, `bun run verify:quick` and `E2E_PORT=4410 bun run e2e:changed` pass.
BODY
```

Expected: the PR URL. Edit the "Skipped shots" and "live link" lines to match what happened before submitting (or right after with `gh pr edit`). Do not merge; the owner reviews.

---

## Self-Review

1. **Spec coverage**

| Requirement (owner decisions) | Task |
|---|---|
| 1. New Serupa pod: wing `software`, tier `featured`, Title Case title, slug, client "Serupa", allowlist if needed, period Jun to Aug 2025, role verified from commits, tagline, problem, approach, architecture nodes, verifiable results, stack, EN + ID | Task 1 (Steps 1, 4); evidence in "Role Evidence"; slug deviation explained in Decisions |
| 2. New Journey entry, freelance, org Serupa, 2025-06 to 2025-08, linked to the pod; L2 space rules with real content | Task 1 Step 4; Task 9 Steps 1 and 2 |
| 3. DariOrdal refresh, keep slug | Task 2 |
| 4. Screenshots for both: local runs with seed data and dummy secrets (Docker Postgres and Redis, BE for FE and dashboard, mocked responses where needed), 5 to 7 desktop at 1440x900 plus a 390x844 mobile, blur, webp + thumb, EN/ID alt, fallback when an app will not run, delete clones | Tasks 4 to 8; Task 10 Steps 4 and 5 |
| 5. Derived updates: gallery-first order, L3 layout tests, Ask pack and golden question, Page View pages, OG, docs | Task 9 (order, layouts, pages, OG, sitemap); Task 3 (Ask); Task 1 Step 9 and Task 3 Step 5 (docs) |
| 6. Coordination with the live-link plan | Global Constraints; Before You Start Step 3; Task 1 (computed order, featured count); Task 3 (computed golden id); Task 9 Step 5 |
| 7. Final: content validation, unit and content tests, `verify:quick`, `E2E_PORT=4410 bun run e2e:changed`, privacy review, PR | Task 10 |

2. **Placeholder scan:** no "TBD" or "implement later". Runtime values are produced by commands (the event slug in Task 5 Step 6 is written to a file by psql); the only hand-edited text is the PR's "Skipped shots" and "live link" lines, which depend on what happened during execution.

3. **Type and name consistency:** pod id and slug `event-ticketing-platform` and entry `serupa-2025` are the same in Tasks 1, 6, 9 and the test block; test consts `serupa`, `serupaEntry`, `dariordal` are defined in Task 1 and reused in Tasks 2, 6 and 8; toolkit commands and outputs (`capture.ts <app> [shot]`, `convert.sh <raw> <out>`, `add-gallery.ts <slug> <manifest>`, `NN-name.webp` / `.thumb.webp`, `NN-mobile.webp`) match between Task 4 and their uses; ports 3000, 3001, 3002, 3003, 3009, 55432, 56379, 51025 are consistent across compose, env overrides, capture and smoke scripts.
