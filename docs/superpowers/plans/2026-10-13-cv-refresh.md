# R5 P5: CV Refresh Implementation Plan

Status: shipped in #67 (fafbe64), 2026-10-13

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the owner's CV PDF with the 2026-10-13 version and make every CV-derived fact on the site (EN and ID, Page View, 3D, Ask, JSON-LD) agree with it, with a test that cross-checks the site against the CV.

**Architecture:** The PDF is committed byte for byte and rendered to page images by the existing `bun run cv:pages`; its sha256 gets pinned. Content stays data: one guarded one-off Bun script edits `content/site-content.json` (it refuses to run if an old value moved), the skills section adopts the CV's seven-group taxonomy, and the L1 3D skills wall keeps its four 10 u columns through a small selector (`wallSkillGroups`) so the lobby look does not change shape. A new `tests/content/cv-facts.test.ts` pairs each CV marker with the site value (site side always, PDF side when `pdftotext` exists). The Ask knowledge pack is rebuilt from content and the golden set gains three CV questions.

**Tech Stack:** Next.js 16 static export, Bun, zod 4, Vitest 5, Playwright 1.64, poppler (`pdftotext`, `pdftoppm`), libwebp (`cwebp`), ImageMagick 7 (`magick`, local diffs only).

**Workstream:** Round 5, P5 (owner request 2: "also i update my CV need to update it into the web (cv file, and all text related to CV need re-verified)"). REPORT.md references: spec gap 25 / e-ci-observability "CV PDF" row (the committed-PDF flow is the current design; `tests/content/cv.test.ts` catches sha drift), Area 10 (content and data: rooms JSON and ExperienceData sizes, recorded before and after), Area 5 / c-gpu-memory L1 row (skills wall about 5 draw calls; must not grow).

## Global Constraints

- New CV (read-only source): `/Users/shinyq/.copilot/attachments/23e7e2f1-b31a-495d-8e36-eb27aba0c1f2-CV_Kurniadi Ahmad Wijaya.docx (1).pdf`, 2 pages, 122,716 bytes, sha256 `86695d1f52c473f44286dc82ff63b132b450c67ff988037ec43595987c30f89f`. Current committed CV: `public/cv/kurniadi-ahmad-wijaya-cv.pdf`, 127,035 bytes, sha256 `b75d89bd678dd60318c67bc46a7d3f6630c90b241436f5068c6ca56f507b1342`.
- Owner decision (plan.md, round 5): the new CV is the source of truth; update every site fact that differs (dates, numbers, roles, skills, education) and list each change in the PR.
- Facts the site carries that the CV does not contradict, or that come from stronger evidence (git history, credential records) and are unchanged between the two CV versions, stay; each one is listed under "Owner questions" in the PR.
- C3 (AGENTS.md hard rules): the CV PDF and `public/cv/pages/` keep client names (owner's standing exception); every other file (site text, tests, docs, commit messages, PR text) uses sector labels. Never OCR the page images into text or alt text.
- C7: the Master's degree is never shown. The safety lint already forbids it (`src/content/safety.ts:97`), Ask blocks it (`functions/_lib/checks.ts:88`).
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text. En dashes are allowed only inside quoted CV text.
- Bilingual: every content string `{ en, id }`; Indonesian natural and professional ("saya"), technical terms in English.
- Title Case rules (`src/content/title-case.ts`) apply to titles only; role titles, skill group labels and result labels are not titles. `bun run validate:content` must pass.
- Content is data: no career fact in components. The L1 wall column choice is presentation config in `@/content/selectors`.
- Aesthetic is fixed: no change to the rover, neon look, bloom, holograms, missions or the intro. The only intended 3D pixel changes are text on the L1 skills wall (and wall height 9.85 u to 9.32 u), TEMMPAT text on L2/L1 hall rows and the template pod's first result value on L3.
- Render budgets: < 150 draw calls, < 30k triangles; L1 cap 140 (`e2e/highlights.spec.ts`), RF cap 80. The skills wall stays one `BatchedLabels` plus one `LogoQuads` mesh.
- Lighthouse CI budgets stay green: LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB.
- Ask pack: under `PACK_MAX_BYTES` (204,800 bytes) with every perspective draft approved (`tests/ask/pack.test.ts`, `tests/ask/scope.test.ts`). Baseline at f61fbba: 181,415 bytes default, 199,443 bytes all-approved (headroom 5,357).
- Fast verification (AGENTS.md): `bun run verify:quick`, then `E2E_PORT=4434 bun run e2e:changed`. This workstream uses port **4434** for every Playwright run.
- Never write to `/tmp`: `scripts/cv-pages.ts` uses `os.tmpdir()`, so run it with `TMPDIR="$PWD/.cv-tmp"`.
- One PR, do not merge without the owner.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `public/cv/kurniadi-ahmad-wijaya-cv.pdf` | The owner's CV, byte for byte | Replace with the new PDF (same name) |
| `public/cv/pages/*.webp`, `content/generated/cv-pages.json` | CV viewer page images and manifest (sha256) | Regenerated by `bun run cv:pages` |
| `tests/content/cv.test.ts` | CV file, redirects, headers, page images | Pin the new sha256 |
| `tests/content/cv-facts.test.ts` | **New.** Site facts vs CV markers (periods, roles, numbers, education, skills) | Create |
| `content/site-content.json` | All CV-derived facts | Bio, Metrodata summary, TEMMPAT entry and pod, template pod result, Jatis and MNC wording, MNC pod stack and node, skills taxonomy |
| `src/content/schema.ts` | `SkillGroupSchema` ids | CV taxonomy ids |
| `src/content/selectors.ts` | Content selectors | Add `SKILLS_WALL_GROUPS`, `wallSkillGroups` |
| `src/content/experience.ts` | 3D payload | `skills` from `wallSkillGroups` |
| `src/experience/floors/lobby/SkillsWall.tsx` | L1 skills wall | `GROUP_ACCENT` keys for the new ids (same four colors, same column order) |
| `src/content/tech.ts` | Tech logo registry | AWS alias `aws api gateway websocket`; six text-only names |
| `content/ask/suggestions.json` | Curated Ask pills | `work-stack` expects `skills-backend` |
| `tests/ask/golden.json`, `tests/ask/pipeline.test.ts`, `scripts/ask-eval.ts` | Ask golden set | q39 to q41, 41 items, threshold 39 |
| `tests/fixtures/minimal-content.ts`, `tests/unit/experience-data.test.ts`, `tests/unit/lobby-layout.test.ts`, `tests/unit/selectors.test.ts` | Unit tests touching skills | New ids, wall groups |
| `e2e/screenshots.spec.ts` | Opt-in review captures | "CV refresh" captures (Page View pages, L1 skills wall, RF control) with `SHOT_DIR` |
| `README.md`, `AGENTS.md`, `docs/ask-runbook.md`, `.github/workflows/ask-eval.yml` | Docs and comments | Golden count, skills wall, CV workflow |
| `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, `06-data-contracts.md`, `07-content-map.md`, `docs/superpowers/specs/2026-10-11-ask-hq-design.md` | Spec appendices | Skills wall row, `SkillGroup`, content map rows, C4 date, new C10, golden counts |

Not changed (verified, see the inventory): `messages/en.json`, `messages/id.json`, `content/perspectives.json`, `content/blog/*.mdx`, `src/lib/jsonld.ts` and `src/lib/og.tsx` (derived from content), `public/_headers`, `public/_redirects`, `docs/design/**` (historical mockups, not shipped; touching them triggers the screenshots workflow).

## Fact Inventory (re-verification result)

Method: `pdftotext -layout` of both PDFs (old: 2026-10-06 version committed at f61fbba; new: 2026-10-13) diffed, then every site surface that states a CV-derived fact compared with the new CV. Client names in the CV are written here as "[3 client names]" or "[4 client names]". There are no `hidden` flags in the schema (`TimelineEntrySchema`, `PublicationSchema`): the Master's was removed from content entirely under C7 before this round.

### What changed between the two CVs

| Section | Old CV (2026-10-06) | New CV (2026-10-13) |
|---|---|---|
| Summary | "Software Engineer with 4+ years of experience across backend and frontend ... fintech and SaaS ... AI and RAG systems using LangChain and Llama" | "AI and Software Engineer with 4+ years building production systems across digital banking, fintech, and enterprise SaaS. Currently delivering Azure-native AI platforms for enterprise clients including [3 client names]: multi-agent RAG on Microsoft Agent Framework, realtime voice AI, and LLM-powered code security ... hands-on Azure operations (Bicep, Managed Identity, Key Vault, CI/CD). Focused on making LLM systems production-reliable through evaluation, guardrails, and observability." |
| Metrodata bullet 1 | "for [4 client names] ... template that served as the foundation for multiple client projects" | "for 12+ enterprise clients (like [4 client names]) from architecture to production, and built a reusable full-stack AI template adopted across 10+ client projects" |
| Metrodata bullets 2 to 7 | 6 bullets, incl. "Introduced spec-driven, AI-agent-orchestrated development" | 7 bullets, same numbers (23%, 10x 2s to 0.2s, 8 engines, 100+ repos, 540+ PRs, 45%, 90.9% to 36.4%, 270+ tests, 21s to ~1s, 6 weeks); spec-driven bullet dropped |
| Jatis bullet 5 | "Reduced technical debt by 60% using SonarQube and refactoring legacy modules for stability" | "Reduced SonarQube-reported technical debt by 60% by refactoring legacy modules" |
| MNC bullet 1 | "AWS WebSocket and Redis, cutting latency by 15%" | "AWS API Gateway WebSocket and Redis, cutting latency by 15%" |
| TEMMPAT | "Backend Engineer at TEMMPAT-ID (Nov 2025 - Des 2025)" | "Backend Engineer Freelance at TEMMPAT-ID (Nov 2025 - Dec 2025)"; bullets reworded (CI/CD, WebSocket chat) |
| Education | Master (ITS, 2024 to 2026, Jenius RAG-LLM thesis) + BSc Telkom | BSc Telkom only |
| Skills | 5 lines: Programming Language, Backend Stack, Frontend Stack, Tools, Others (TensorFlow, Plotly, Streamlit, Bootstrap, S3, Git hosts) | 7 lines: AI/LLM, Azure, Languages, Backend, Frontend, Data and messaging, DevOps |
| Unchanged | Header, contact, Jenius, Jublia, certifications (TOEFL ITP 547, AZ-900, AI-103, AI-901), Proclub, Motion Lab | same |

### Site surfaces vs the new CV

| Field (file: path) | Site now | New CV | Action |
|---|---|---|---|
| Name, location, email, LinkedIn, GitHub, site (`profile`, `floors.roof.contact`) | Kurniadi Ahmad Wijaya; Jakarta, Indonesia; kurniadiahmadwijaya@gmail.com; linkedin.com/in/kurniadiwijaya; github.com/ShinyQ | same | Keep |
| Headline (`profile.headline`; OG cards, JSON-LD `jobTitle`, boot card) | "Software Engineer and AI Engineer" / "Software Engineer dan AI Engineer" | Title line "Software & AI Agent Specialist"; summary opens "AI and Software Engineer" | Keep (AGENTS.md "Positioning" owner decision; the CV title line did not change). Owner question 1 |
| Subheadline (`profile.subheadline`) | "I build and operate software and AI applications in production." | consistent | Keep |
| Current role (`profile.currentRole`) | Technical Consultant, Software & AI; Metrodata (PT Mitra Integrasi Informatika); since 2026-02 | "Technical Consultant Software & AI at PT Mitra Integrasi Informatika (Metrodata) (Feb 2026 - Now)" | Keep |
| Bio (`profile.bio`; Home lead, Quick view, L1 profile drawer, JSON-LD `description`, Ask `profile` chunk) | "...At Metrodata, I have designed, built and operated Azure AI applications since February 2026 for banking, automotive, mining and food manufacturing clients. My work includes realtime voice agents, document AI, AI security tooling and grounded RAG assistants. Before that, I spent four years building backends and full-stack products for e-commerce, travel, SaaS and digital banking..." | 4+ years; digital banking, fintech, enterprise SaaS; 12+ enterprise clients; multi-agent RAG, realtime voice AI, LLM code security; evaluation, guardrails, observability | **Update** EN and ID (Task 3) |
| Story, How I work, principles (`profile.story`, `howIWork`, `principles`) | spec-first, agents, evaluation, recovery, metrics | spec-driven bullet dropped from CV, nothing contradicted | Keep (the owner's own text, not CV-derived) |
| Stat `shipping-since-2019` | 2019; "full-time engineering since 2022" | 4+ years (Feb 2022 onward) | Keep (consistent) |
| Stats `prs-merged-2026` 800+, `github-contributions-365` (live), `competition-placings` 20 | not on CV | n/a | Keep (non-CV evidence) |
| Stat `microsoft-certifications` | 3: AI-103, AI-901, AZ-900 | same three codes, (2026) | Keep |
| Stat `voice-interruption-speedup` | 10x, ~2 s to ~0.2 s | "10x (2s to 0.2s)" | Keep |
| `metrodata-2026` period and role | 2026-02 to present; "Technical Consultant, Software & AI" | Feb 2026 - Now | Keep |
| `metrodata-2026` summary | "I design and deliver Azure AI applications in the Microsoft AI practice for banking, automotive, mining and food manufacturing clients, alongside the practice's own products..." | 12+ enterprise clients, end-to-end delivery from architecture to production, template adopted across 10+ client projects | **Update** EN and ID (Task 3) |
| `metrodata-2026` highlights | ~2 s to ~0.2 s; 8 scanning engines and fix-PR agent; primary engineer on 10 repos + significant on 10 more; 800+ merged PRs | consistent | Keep (max 4 highlights, schema) |
| `jenius-2024` | Software Engineer, 2024-06 to 2025-12; 90%, five partners 30%, ~30% throughput, 99% uptime, 30% fewer issues, k6 | June 2024 - Dec 2025; same numbers | Keep |
| `jatis-2023` period, role | 2023-03 to 2024-06, Full Stack Developer | Mar 2023 - June 2024 | Keep |
| `jatis-2023` highlight 4 | "Reduced technical debt by 60% through SonarQube-guided refactoring of legacy modules" | "Reduced SonarQube-reported technical debt by 60% by refactoring legacy modules" | **Update** EN and ID (Task 3) |
| `multi-tenant-saas-platform` pod result | "-60% Reduction in SonarQube technical debt after refactoring" | consistent | Keep |
| `mnc-2022` period, role | 2022-02 to 2023-02, Backend Engineer | Feb 2022 - Feb 2023 | Keep |
| `mnc-2022` highlight 1 | "...by 15% with AWS WebSocket and Redis" | "AWS API Gateway WebSocket and Redis" | **Update** EN and ID (Task 3) |
| `payments-realtime-backend` pod approach 1, stack item, architecture node `websocket` | "AWS WebSocket APIs" (approach, stack), node label "AWS WebSocket" | "AWS API Gateway WebSocket" | **Update** approach EN and ID, stack "AWS API Gateway WebSocket", node "API Gateway WebSocket" (Task 3) |
| `temmpat-2025` period | 2025-11 to 2026-02 | Nov 2025 - Dec 2025 | **Update** end to 2025-12 (Task 3) |
| `temmpat-2025` role | "Lead Backend Engineer (freelance)" | "Backend Engineer Freelance" | **Update** to "Backend Engineer (freelance)"; the summary keeps "I led the v2 backend refactor" (CV bullet 1 "Led a full backend refactor") |
| `temmpat-2025` org | TEMMPAT | TEMMPAT-ID (both CVs) | Keep (brand name; unchanged) |
| `temmpat-2025` and pod stack | PostgreSQL, Socket.IO, Redis, Prometheus, Grafana, Bun (from the client repo's history) | Tech line: MySQL, Sequelize, WebSocket, Grafana (same as old CV) | Keep (repo-verified, not new in this CV). Owner question 2 |
| `ticket-marketplace-backend` pod period, role | 2025-11 to 2026-02; "Lead Backend Engineer (freelance), responsible for the v2 refactor" | Nov 2025 - Dec 2025; Backend Engineer Freelance | **Update** end 2025-12; role "Backend Engineer (freelance), led the v2 refactor" / "Backend Engineer (freelance), memimpin refactor v2" |
| `ticket-marketplace-backend` result 1 context | "...my commits span Nov 2025 to Feb 2026." | ends Dec 2025 | **Update**: drop the span sentence (keeps the 162 of 267 count). Owner question 2 |
| `ai-app-accelerator` pod result 1 | "8 repos: Client repositories started from the template across 5 engagements" | "adopted across 10+ client projects" | **Update** to "10+ Client projects that adopted the template", lineage of the 8 analyzed repositories kept as context. Owner question 3 |
| Other Metrodata pods (23%, 45%, 90.9% to 36.4%, 270+, ~21 s to ~1.1 s, ~6 weeks, 8 engines, 100+ repositories, LangGraph to Agent Framework) | present | same | Keep (cross-checked by the new test) |
| "540+ PRs reviewed" (code security platform) | not on site | on both CVs | Keep (not new). Owner question 5 |
| `jublia-2023` | 2023-09 to 2023-12, Backend Engineer (freelance, remote); 40%, 25%, 96%, 50% | Sep 2023 - Dec 2023; same numbers; Tech adds Python, Flask | Keep (site stack is a subset) |
| `telkom-university-2019`, `graduation-2023`, `sentiboard-2022`, thesis publication | 2019-08 to 2023-02, GPA 3.88 / 4.00, Sentiboard IndoBERT | (2019 - 2023), GPA 3.88 / 4.00, Sentiboard | Keep |
| Master's degree (ITS, 2024 to 2026, RAG-LLM thesis) | not shown anywhere: no education entry, no publication, no room; safety lint and Ask block it; only `docs/.../07-content-map.md` rows 33 and 34 still mention it | not on the CV | **Verify** + test guard (Task 3); remove the two content-map mentions (Task 6). Nothing to hide on the site |
| `campus-and-community-2020/2021` (Proclub) | VP Internal and Software Engineer Lead, 200+ students, 10+ events, 2020 to 2021 | Jan 2020 - Dec 2021, 200+ students, 10+ events | Keep |
| `campus-and-community-2022` (Motion Lab) | hackathon judge, 21 teams, January to February | Jan 2022 - Feb 2022, 21 teams | Keep |
| Skills (`skills`; Home, Quick view, About, L1 wall, L1 drawer, Cmd-K keywords, Ask `skills-*` chunks) | 4 groups: Software engineering (12), AI engineering (6), Cloud infrastructure and DevOps (11), Data and modeling (3) incl. Node.js / Express, Entra ID, IndoBERT / NLP, Forecasting | 7 groups, 56 items | **Replace** with the CV taxonomy (Task 4). L1 wall shows Backend, AI and LLM, Azure, DevOps (4 columns, max 12 items) |
| Certifications AI-103, AZ-900 | official credential names, issued 2026-09 / 2026-05 | "(2026)" | Keep |
| Certification AI-901 | "Microsoft Certified: Azure AI Fundamentals" (credential record) | "Azure AI Engineer Fundamentals AI-901" | Keep the credential's official name. Owner question 4 |
| TOEFL ITP 547 (2024) | not on site | on both CVs | Keep (not new; would add a cert wall badge). Owner question 4 |
| GH-600 (in progress), HackerRank, IARC x APTIKOM, Kominfo x IBM | on site | not on CV | Keep (credential evidence) |
| `messages/*.json` (meta description, `home.wingsIntro`, `journey.title` "2019 to 2026", `cv.*`, roof kiosk strings) | headline-based or generic | consistent | Keep |
| `content/perspectives.json` (15 drafts, status draft) | tools: Copilot, Claude Code, Spec Kit, Python/FastAPI, PostgreSQL, Next.js, Azure | consistent with the CV skills | Keep |
| Blog posts (`content/blog/*.mdx`) | 45% failures, voice interruption, spec-driven, fraud shadow mode | consistent | Keep |
| JSON-LD Person, OG cards | from `profile` | bio changes flow through | Auto |
| Ask knowledge pack | built from content | follows content | Rebuild + golden q39 to q41 (Task 5) |
| Ask pill `work-stack` | expects `skills-software` | id gone | **Update** to `skills-backend` (Task 4) |
| README, AGENTS, specs 01/06/07, Ask design spec, runbook, eval comments | old skills groups, golden 38/36 (AGENTS says 32), C4 "newest CV (Oct 6, 2026)" | n/a | **Update** (Task 6) |

---

### Task 1: Review captures and the "before" baseline

Adds an opt-in capture block (Page View pages that carry CV facts, the L1 skills wall pose and an RF control pose at the round 5 sizes) and records the baseline before any content changes. Pixels and numbers from this task are the "before" side of every comparison in Task 7.

**Files:**
- Modify: `e2e/screenshots.spec.ts` (imports at lines 1 to 2; append a block at the end of the file)

**Interfaces:**
- Consumes: `asReturningVisitor`, `waitForHQ`, `waitForPhase`, `waitForRoom`, `waitForCameraSettle` from `e2e/hq.ts`; the file's own `Viewport` type.
- Produces: `screenshots/r5-p5/{before,after}/page-{home,contact,cv,journey}-{W}x{H}.png`, `3d-l1-skills-wall-{W}x{H}.png`, `3d-rf-control-{W}x{H}.png`, `metrics.jsonl` (`{ view, size, tier, drawCalls }` per line), `sizes.txt`, `pack.json`. `screenshots/` is gitignored.

- [x] **Step 1: Branch from main**

```bash
git fetch origin && git switch -c r5-p5-cv-refresh origin/main
rtk git log --oneline -1
```
Expected: the tip of `origin/main` (f61fbba or later).

- [x] **Step 2: Add the capture block**

In `e2e/screenshots.spec.ts`, add `import { appendFileSync, mkdirSync } from "node:fs";` as the first line, and add `waitForCameraSettle` to the `./hq` import so it reads:

```ts
import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, driveTo, emptyFloorPoint, hoverTarget, interactablesOf, padsOf, PHONE_SAFE, targetPoint, visibleTarget, waitForCameraSettle, waitForHQ, waitForPhase, waitForRoom } from "./hq";
```

Append at the end of the file:

```ts
/**
 * Round 5 CV refresh review captures: the Page View pages that carry CV facts (full page), the L1
 * skills wall and an RF control pose at the round 5 sizes, reduced motion so 3D frames compare.
 * SHOT_DIR picks the folder (before and after runs); metrics.jsonl records draw calls per pose.
 *   SCREENSHOTS=1 SHOT_DIR=screenshots/r5-p5/before E2E_PORT=4434 bunx playwright test e2e/screenshots.spec.ts -g "CV refresh" --workers=1
 */
const CV_SHOT_DIR = process.env.SHOT_DIR ?? "screenshots/r5-p5";
const CV_VIEWPORTS: readonly Viewport[] = [
  { name: "desktop", width: 1440, height: 900, tier: "full", touch: false },
  { name: "desktop", width: 2560, height: 1440, tier: "full", touch: false },
  { name: "mobile", width: 390, height: 844, tier: "lite", touch: true },
];
const CV_PAGE_PATHS = ["/en", "/en/contact", "/en/cv", "/en/journey"] as const;

async function open3DStill(browser: Browser, v: Viewport, path: string) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "mobile",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

/** Floor content mounts behind Suspense: lite waits until it draws; full (one composer pass) waits a fixed time. */
async function settleFloor(page: Page, v: Viewport) {
  if (v.tier === "lite") {
    await page.waitForFunction(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls > 35, null, { timeout: 90_000 });
  } else await page.waitForTimeout(8000);
}

const cvDrawCalls = (page: Page) => page.evaluate(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls);

function recordCvMetric(entry: Record<string, unknown>) {
  mkdirSync(CV_SHOT_DIR, { recursive: true });
  appendFileSync(`${CV_SHOT_DIR}/metrics.jsonl`, `${JSON.stringify(entry)}\n`);
}

test.describe("CV refresh captures", () => {
  for (const v of CV_VIEWPORTS) {
    const size = `${v.width}x${v.height}`;
    // SwiftShader renders 2560x1440 at a few frames per second; drives take longer in wall time.
    const budget = v.width > 2000 ? 600_000 : 240_000;

    for (const path of CV_PAGE_PATHS) {
      const name = path === "/en" ? "home" : path.slice(4);
      test(`CV refresh page ${name} @ ${size}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const tab = await context.newPage();
        await tab.addInitScript(() => {
          localStorage.setItem("hq:terminal-seen", "1");
          localStorage.setItem("hq:onboarded", "done");
        });
        await tab.goto(`${path}?tier=static`, { waitUntil: "networkidle" });
        await tab.evaluate(() => document.fonts.ready);
        await expect(tab.locator("h1").first()).toBeVisible();
        await tab.screenshot({ path: `${CV_SHOT_DIR}/page-${name}-${size}.png`, fullPage: true, animations: "disabled" });
        await context.close();
      });
    }

    test(`CV refresh 3D L1 skills wall @ ${size}`, async ({ browser }) => {
      test.setTimeout(budget);
      const { context, page } = await open3DStill(browser, v, "/en");
      await settleFloor(page, v);
      await page.getByRole("button", { name: /Open search/ }).click();
      await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
      await page.keyboard.type("Skills wall");
      await page.keyboard.press("Enter");
      await waitForRoom(page, "L1:skills", budget - 60_000);
      await page.keyboard.press("Escape");
      await waitForPhase(page, "explore", 60_000);
      await waitForCameraSettle(page, { timeout: 120_000 });
      // In-world text (troika) builds its glyphs slowly on SwiftShader.
      await page.waitForTimeout(3000);
      recordCvMetric({ view: "l1-skills-wall", size, tier: v.tier, drawCalls: await cvDrawCalls(page) });
      await page.screenshot({ path: `${CV_SHOT_DIR}/3d-l1-skills-wall-${size}.png` });
      await context.close();
    });

    test(`CV refresh 3D RF control @ ${size}`, async ({ browser }) => {
      test.setTimeout(budget);
      const { context, page } = await open3DStill(browser, v, "/en/contact");
      await settleFloor(page, v);
      await waitForCameraSettle(page, { timeout: 120_000 });
      await page.waitForTimeout(3000);
      recordCvMetric({ view: "rf-control", size, tier: v.tier, drawCalls: await cvDrawCalls(page) });
      await page.screenshot({ path: `${CV_SHOT_DIR}/3d-rf-control-${size}.png` });
      await context.close();
    });
  }
});
```

- [x] **Step 3: Typecheck and lint the spec**

Run: `bun run typecheck && bun run lint`
Expected: exit 0, no errors.

- [x] **Step 4: Confirm the block is skipped without the flag (it must never run in CI)**

Run: `E2E_PORT=4434 bunx playwright test e2e/screenshots.spec.ts -g "CV refresh" --list | tail -3`
Expected: `Total: 18 tests in 1 file` (3 sizes x (4 pages + 2 3D poses)).

- [x] **Step 5: Build the unchanged site and capture the baseline**

```bash
bun run build
rm -rf screenshots/r5-p5/before
SCREENSHOTS=1 SHOT_DIR=screenshots/r5-p5/before E2E_PORT=4434 bunx playwright test e2e/screenshots.spec.ts -g "CV refresh" --workers=1
ls screenshots/r5-p5/before | wc -l
cat screenshots/r5-p5/before/metrics.jsonl
```
Expected: 18 passed; 19 files (18 PNG + `metrics.jsonl`); six metric lines. `l1-skills-wall` draw calls are well under the L1 cap of 140 (spawn lite 115 / full 134 per REPORT.md c-gpu-memory; the wall pose is lower).

- [x] **Step 6: Record baseline sizes and the Ask pack**

```bash
for f in out/en.html out/en/contact.html out/en/cv.html out/en/journey.html out/data/rooms/en.json public/cv/kurniadi-ahmad-wijaya-cv.pdf; do printf "%s raw %s gz %s\n" "$f" "$(wc -c < "$f" | tr -d ' ')" "$(gzip -9 -c "$f" | wc -c | tr -d ' ')"; done | tee screenshots/r5-p5/before/sizes.txt
du -k public/cv/pages | tee -a screenshots/r5-p5/before/sizes.txt
bun -e 'import { buildRepoPack } from "./src/ask/repo-pack"; import { getPerspectivesFile } from "./src/content/load"; const d = buildRepoPack("2026-10-11"); const a = buildRepoPack("2026-10-11", { perspectives: getPerspectivesFile().entries.map((e) => ({ ...e, approved: true })) }); console.log(JSON.stringify({ chunks: d.pack.chunks.length, bytes: Buffer.byteLength(JSON.stringify(d.pack)), approvedBytes: Buffer.byteLength(JSON.stringify(a.pack)), cap: 200 * 1024 }));' | tee screenshots/r5-p5/before/pack.json
```
Expected `pack.json` at f61fbba: `{"chunks":109,"bytes":181415,"approvedBytes":199443,"cap":204800}` (later main commits may move it a little; the after run uses the same command).

- [x] **Step 7: Commit**

```bash
rtk git add e2e/screenshots.spec.ts
rtk git commit -m "test(e2e): opt-in CV refresh review captures with draw-call metrics"
```

---

### Task 2: Replace the CV PDF, regenerate the page images and pin the sha256

**Files:**
- Modify: `tests/content/cv.test.ts` (constants after `const pdf = cvPdfPath(fileName);`; a new test in the "CV PDF" describe after "is committed under public/cv as a real PDF"; the file already imports `createHash`, `readFileSync` and `path`)
- Replace: `public/cv/kurniadi-ahmad-wijaya-cv.pdf`
- Regenerate: `public/cv/pages/kurniadi-ahmad-wijaya-cv-{1,2}.webp`, `public/cv/pages/kurniadi-ahmad-wijaya-cv-{1,2}-800.webp`, `content/generated/cv-pages.json`

**Interfaces:**
- Consumes: `cvPdfPath`, `CV_PAGES` from `@/lib/cv`; `bun run cv:pages` (`scripts/cv-pages.ts`).
- Produces: `CV_SHA256` (test-local constant) = `86695d1f52c473f44286dc82ff63b132b450c67ff988037ec43595987c30f89f`; the manifest `content/generated/cv-pages.json` with that sha256 and 2 pages. Task 3 reads the PDF text through `pdftotext`.

- [x] **Step 1: Write the failing test**

In `tests/content/cv.test.ts`, after `const pdf = cvPdfPath(fileName);` add:

```ts
/**
 * sha256 of the owner's current CV (2026-10-13 refresh, round 5). When the owner sends a new CV:
 * replace the PDF under the same name, run `bun run cv:pages`, update this pin and the site facts
 * in `tests/content/cv-facts.test.ts` in the same PR.
 */
const CV_SHA256 = "86695d1f52c473f44286dc82ff63b132b450c67ff988037ec43595987c30f89f";
const pdfSha = () => createHash("sha256").update(readFileSync(path.join(root, "public", pdf))).digest("hex");
```

and, inside `describe("CV PDF (owner's file, served as-is for every locale)", ...)`, after the `it("is committed under public/cv as a real PDF", ...)` block:

```ts
  it("is the owner's current CV (pinned sha256)", () => {
    expect(pdfSha(), "public/cv PDF is not the 2026-10-13 CV").toBe(CV_SHA256);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/content/cv.test.ts`
Expected: FAIL in "is the owner's current CV (pinned sha256)": expected `b75d89bd...1342` to be `86695d1f...f89f`. Every other test passes.

- [x] **Step 3: Copy the new PDF over the old one (same file name)**

```bash
cp "/Users/shinyq/.copilot/attachments/23e7e2f1-b31a-495d-8e36-eb27aba0c1f2-CV_Kurniadi Ahmad Wijaya.docx (1).pdf" public/cv/kurniadi-ahmad-wijaya-cv.pdf
shasum -a 256 public/cv/kurniadi-ahmad-wijaya-cv.pdf
pdfinfo public/cv/kurniadi-ahmad-wijaya-cv.pdf | grep -E "Pages|Page size"
```
Expected: `86695d1f52c473f44286dc82ff63b132b450c67ff988037ec43595987c30f89f`, `Pages: 2`, `Page size: 612 x 1008 pts` (same size as before, so the page images keep 1600x2636 and 800x1318).

- [x] **Step 4: Run the test again: the pin passes, the page images are now stale**

Run: `bunx vitest run tests/content/cv.test.ts`
Expected: FAIL only in "were rendered from the committed PDF (run `bun run cv:pages` after replacing it)" with the message "public/cv PDF changed: run `bun run cv:pages` and commit the output".

- [x] **Step 5: Regenerate the page images (no /tmp: point TMPDIR into the repo)**

```bash
mkdir -p .cv-tmp
TMPDIR="$PWD/.cv-tmp" bun run cv:pages
rm -rf .cv-tmp
cat content/generated/cv-pages.json
ls -l public/cv/pages
```
Expected: `cv-pages: 2 pages from kurniadi-ahmad-wijaya-cv.pdf`; the manifest's `sha256` is `86695d1f...f89f`, two pages at 1600x2636 and 800x1318; four webp files, each under 400,000 bytes (old: 233,926 / 105,878 / 192,720 / 87,668).

- [x] **Step 6: Look at both pages**

Open `public/cv/pages/kurniadi-ahmad-wijaya-cv-1.webp` and `-2.webp`. Expected: page 1 starts with the new summary ("AI and Software Engineer with 4+ years..."), page 2 shows EDUCATION with Telkom University only and the seven-line SKILLS section. Do not copy any text from the images into the site (C3).

- [x] **Step 7: Run the CV tests**

Run: `bunx vitest run tests/content/cv.test.ts`
Expected: PASS (all tests, including the pin and the page-image checks).

- [x] **Step 8: Commit**

```bash
rtk git add public/cv/kurniadi-ahmad-wijaya-cv.pdf public/cv/pages content/generated/cv-pages.json tests/content/cv.test.ts
rtk git commit -m "feat(cv): the owner's 2026-10-13 CV, page images regenerated and sha256 pinned"
```

---

### Task 3: CV facts cross-check and the content updates (bio, Metrodata, TEMMPAT, template, Jatis, MNC), Master's guard

**Files:**
- Create: `tests/content/cv-facts.test.ts`
- Modify: `content/site-content.json` (through a one-off script that is deleted after it runs)
- Modify: `src/content/tech.ts:36` (AWS aliases)

**Interfaces:**
- Consumes: `getContent`, `getPod`, `getProfile`, `getTimelineEntry` from `@/content/load`; the PDF from Task 2.
- Produces: `tests/content/cv-facts.test.ts` with the module-local `cvText()`, `hasPdftotext`, `PERIODS`, `ROLES`, `FACTS` (Task 4 appends a skills block to this file and adds `getSkills` to its import). Content strings that Task 5's golden items rely on: bio contains "12+ enterprise clients"; `metrodata-2026.summary` contains "10+ client projects" / "10+ proyek klien"; TEMMPAT period `2025-11` to `2025-12`.

- [x] **Step 1: Write the failing test**

Create `tests/content/cv-facts.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getContent, getPod, getProfile, getTimelineEntry } from "@/content/load";

/**
 * Round 5 CV refresh (owner request 2026-10-13): the CV PDF in public/cv is the source of truth for
 * the CV-derived facts on the site. Each row pairs a marker from the CV text with what the site must
 * say. The site side always runs; the PDF side needs `pdftotext` (poppler, not installed on CI) and
 * proves each marker is in the committed PDF. Markers never name an employer's client (C3).
 * New CV: replace the PDF, run `bun run cv:pages`, then update these rows and the content together.
 */

const content = getContent();
const pdf = path.join(process.cwd(), "public", "cv", `${content.floors.roof.cv.fileName}.pdf`);
const hasPdftotext = !spawnSync("pdftotext", ["-v"]).error;
let cachedText: string | undefined;

/** CV text with whitespace and the zero-width spaces after the bullets collapsed to single spaces. */
function cvText(): string {
  cachedText ??= spawnSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" }).stdout.replace(/[\s\u200b]+/g, " ");
  return cachedText;
}

const siteText = JSON.stringify(content);

function entry(slug: string) {
  const found = getTimelineEntry(slug);
  if (!found) throw new Error(`no timeline entry ${slug}`);
  return found;
}

function pod(slug: string) {
  const found = getPod(slug);
  if (!found) throw new Error(`no pod ${slug}`);
  return found;
}

interface PeriodRow {
  slug: string;
  cv: string;
  start: string;
  end: string;
}
interface RoleRow {
  slug: string;
  cv: string;
  role: string;
}
interface FactRow {
  cv: string;
  site: string[];
}

const PERIODS: PeriodRow[] = [
  { slug: "metrodata-2026", cv: "(Feb 2026 - Now)", start: "2026-02", end: "present" },
  { slug: "jenius-2024", cv: "(June 2024 - Dec 2025)", start: "2024-06", end: "2025-12" },
  { slug: "jatis-2023", cv: "(Mar 2023 - June 2024)", start: "2023-03", end: "2024-06" },
  { slug: "mnc-2022", cv: "(Feb 2022 - Feb 2023)", start: "2022-02", end: "2023-02" },
  { slug: "temmpat-2025", cv: "(Nov 2025 - Dec 2025)", start: "2025-11", end: "2025-12" },
  { slug: "jublia-2023", cv: "(Sep 2023 - Dec 2023)", start: "2023-09", end: "2023-12" },
  { slug: "telkom-university-2019", cv: "(2019 - 2023)", start: "2019-08", end: "2023-02" },
];

const ROLES: RoleRow[] = [
  { slug: "metrodata-2026", cv: "Technical Consultant Software & AI at PT Mitra Integrasi Informatika (Metrodata)", role: "Technical Consultant, Software & AI" },
  { slug: "jenius-2024", cv: "(Jenius)", role: "Software Engineer" },
  { slug: "jatis-2023", cv: "Full Stack Developer at PT Informasi Teknologi Indonesia", role: "Full Stack Developer" },
  { slug: "mnc-2022", cv: "Backend Engineer at PT MNC Asia Holding Tbk", role: "Backend Engineer" },
  { slug: "temmpat-2025", cv: "Backend Engineer Freelance at TEMMPAT-ID", role: "Backend Engineer (freelance)" },
  { slug: "jublia-2023", cv: "Backend Engineer Freelance at Jublia Pte Ltd.", role: "Backend Engineer (freelance, remote)" },
  { slug: "telkom-university-2019", cv: "Telkom University - Bachelor Computer Science", role: "BSc Computer Science (Informatics)" },
];

/** Numbers and wording from the CV; `site` strings must appear somewhere in site-content.json. */
const FACTS: FactRow[] = [
  { cv: "4+ years", site: ["4+ years", "4+ tahun"] },
  { cv: "12+ enterprise clients", site: ["12+ enterprise clients", "12+ klien enterprise"] },
  { cv: "10+ client projects", site: ["10+ client projects", "10+ proyek klien"] },
  { cv: "cutting prompt tokens by 23%", site: ["-23%"] },
  { cv: "(2s to 0.2s)", site: ["~0.2 s"] },
  { cv: "8 scanning engines", site: ["8 scanning engines"] },
  { cv: "100+ repositories", site: ["100+ repositories"] },
  { cv: "45% CV screening failure rate", site: ["45%"] },
  { cv: "90.9% to 36.4%", site: ["90.9%", "36.4%"] },
  { cv: "270+ automated tests", site: ["270+"] },
  { cv: "21s production stall", site: ["21 s"] },
  { cv: "6 weeks", site: ["6 weeks"] },
  { cv: "reducing manual workloads by 90%", site: ["about 90%"] },
  { cv: "five insurance partners", site: ["five insurance partners"] },
  { cv: "99% uptime", site: ["99% uptime"] },
  { cv: "500+ users", site: ["500+ users"] },
  { cv: "Reduced SonarQube-reported technical debt by 60%", site: ["SonarQube-reported technical debt by 60%"] },
  { cv: "AWS API Gateway WebSocket and Redis, cutting latency by 15%", site: ["AWS API Gateway WebSocket and Redis"] },
  { cv: "search relevance by 40%", site: ["search relevance by 40%"] },
  { cv: "96% accuracy", site: ["96% accuracy"] },
  { cv: "GPA: 3.88 / 4.00", site: ["GPA 3.88 / 4.00"] },
  { cv: "200+ software engineering students", site: ["200+ students"] },
  { cv: "Evaluating 21 teams", site: ["21 teams"] },
];

describe("CV-derived facts on the site", () => {
  it.each(PERIODS)("$slug runs $start to $end", ({ slug, start, end }) => {
    expect([entry(slug).start, entry(slug).end]).toEqual([start, end]);
  });

  it.each(ROLES)("$slug is titled $role", ({ slug, role }) => {
    expect(entry(slug).role.en).toBe(role);
  });

  it.each(FACTS)("states the CV fact: $cv", ({ site }) => {
    for (const marker of site) expect(siteText, marker).toContain(marker);
  });

  it("states the summary numbers in both locales", () => {
    const { bio } = getProfile();
    expect(bio.en).toContain("4+ years");
    expect(bio.en).toContain("12+ enterprise clients");
    expect(bio.id).toContain("4+ tahun");
    expect(bio.id).toContain("12+ klien enterprise");
    const summary = entry("metrodata-2026").summary;
    expect(summary.en).toContain("12+ enterprise clients");
    expect(summary.en).toContain("10+ client projects");
    expect(summary.id).toContain("12+ klien enterprise");
    expect(summary.id).toContain("10+ proyek klien");
  });

  it("gives the TEMMPAT case study the CV period and role, with no later date", () => {
    const ticket = pod("ticket-marketplace-backend");
    expect(ticket.period).toEqual({ start: "2025-11", end: "2025-12" });
    expect(ticket.role.en.startsWith("Backend Engineer (freelance)")).toBe(true);
    expect(ticket.role.id.startsWith("Backend Engineer (freelance)")).toBe(true);
    expect(JSON.stringify(ticket)).not.toMatch(/Feb 2026|Lead Backend/);
    expect(entry("temmpat-2025").role.id).toBe("Backend Engineer (freelance)");
  });

  it("counts the AI app template in client projects, as the CV does", () => {
    expect(pod("ai-app-accelerator").results[0].value).toBe("10+");
  });

  it("names the API Gateway WebSocket in the MNC case study", () => {
    const mnc = pod("payments-realtime-backend");
    expect(mnc.stack).toContain("AWS API Gateway WebSocket");
    expect(mnc.architecture?.nodes.find((n) => n.id === "websocket")?.label).toBe("API Gateway WebSocket");
    expect(mnc.approach[0].en).toContain("AWS API Gateway WebSocket");
  });

  it("shows only the BSc: the Master's degree is not on the CV (C7)", () => {
    const education = content.floors.careerArchive.entries.filter((e) => e.type === "education");
    expect(new Set(education.map((e) => e.org))).toEqual(new Set(["Telkom University"]));
    const theses = content.floors.library.publications.filter((p) => p.kind === "thesis");
    expect(theses.map((p) => p.venue)).toEqual(["Telkom University"]);
    expect(siteText).not.toMatch(/Sepuluh Nopember|\bITS\b|Magister|\bMaster'?s\b/);
  });
});

describe.skipIf(!hasPdftotext)("CV markers in the committed PDF", () => {
  it("carries every period, role and fact marker", () => {
    const text = cvText();
    const missing = [...PERIODS, ...ROLES, ...FACTS].map((row) => row.cv).filter((marker) => !text.includes(marker));
    expect(missing).toEqual([]);
  });

  it("no longer lists the Master's degree", () => {
    expect(cvText()).not.toMatch(/Sepuluh Nopember|Master/);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/content/cv-facts.test.ts`
Expected: FAIL in exactly these tests (all others pass, including both PDF-side tests when poppler is installed):
- `temmpat-2025 runs 2025-11 to 2025-12` (found `2026-02`)
- `temmpat-2025 is titled Backend Engineer (freelance)` (found "Lead Backend Engineer (freelance)")
- `states the CV fact: 4+ years`, `12+ enterprise clients`, `10+ client projects`, `Reduced SonarQube-reported technical debt by 60%`, `AWS API Gateway WebSocket and Redis, cutting latency by 15%`
- `states the summary numbers in both locales`
- `gives the TEMMPAT case study the CV period and role, with no later date`
- `counts the AI app template in client projects, as the CV does`
- `names the API Gateway WebSocket in the MNC case study`

If the PDF-side test "carries every period, role and fact marker" fails, print the missing markers and compare them with `pdftotext -layout public/cv/kurniadi-ahmad-wijaya-cv.pdf - | grep -n "<marker start>"`; fix the marker in the test to the exact CV wording (never the site value).

- [x] **Step 3: Write the one-off content script**

Create `.r5-p5-apply.ts` in the repo root (not committed; deleted in Step 5). It refuses to change a field whose current value is not the expected old value.

```ts
import { readFileSync, writeFileSync } from "node:fs";

type Json = Record<string, any>;
const FILE = "content/site-content.json";
const data: Json = JSON.parse(readFileSync(FILE, "utf8"));

function fail(what: string): never {
  throw new Error(what);
}
function set(holder: Json, key: string | number, from: unknown, to: unknown, at: string) {
  const now = JSON.stringify(holder[key]);
  if (now !== JSON.stringify(from)) fail(`${at}: expected ${JSON.stringify(from)}, found ${now}`);
  holder[key] = to;
}
const entry = (id: string): Json => data.floors.careerArchive.entries.find((e: Json) => e.id === id) ?? fail(`missing entry ${id}`);
const pod = (slug: string): Json => data.floors.labs.pods.find((p: Json) => p.slug === slug) ?? fail(`missing pod ${slug}`);

// Profile bio: new CV summary (4+ years, sectors, 12+ enterprise clients, reliability focus).
set(
  data.profile,
  "bio",
  {
    en: "I am a Software Engineer and AI Engineer based in Jakarta. At Metrodata, I have designed, built and operated Azure AI applications since February 2026 for banking, automotive, mining and food manufacturing clients. My work includes realtime voice agents, document AI, AI security tooling and grounded RAG assistants. Before that, I spent four years building backends and full-stack products for e-commerce, travel, SaaS and digital banking, including roles at MNC, Jatis and Jenius.",
    id: "Saya Software Engineer dan AI Engineer yang berbasis di Jakarta. Sejak Februari 2026, saya merancang, membangun, dan mengoperasikan aplikasi Azure AI di Metrodata untuk klien perbankan, otomotif, pertambangan, dan manufaktur makanan. Pekerjaan saya mencakup voice agent realtime, document AI, tooling keamanan berbasis AI, dan asisten RAG yang grounded. Sebelumnya, saya menghabiskan empat tahun membangun backend dan produk full-stack untuk e-commerce, travel, SaaS, dan perbankan digital, termasuk di MNC, Jatis, dan Jenius.",
  },
  {
    en: "I am a Software Engineer and AI Engineer based in Jakarta, with 4+ years of building production systems for digital banking, fintech and enterprise SaaS. Since February 2026, I have led the delivery of Azure-native AI platforms at Metrodata for 12+ enterprise clients in sectors such as banking, automotive, mining and food manufacturing: multi-agent RAG assistants, realtime voice agents, document AI and AI code security. Before that, I built backends and full-stack products for e-commerce, travel, SaaS and digital banking, including roles at MNC, Jatis and Jenius. I make LLM systems reliable in production through evaluation, guardrails and observability.",
    id: "Saya Software Engineer dan AI Engineer yang berbasis di Jakarta, dengan pengalaman 4+ tahun membangun sistem production untuk perbankan digital, fintech, dan SaaS enterprise. Sejak Februari 2026, saya memimpin delivery platform AI berbasis Azure di Metrodata untuk 12+ klien enterprise di sektor seperti perbankan, otomotif, pertambangan, dan manufaktur makanan: asisten RAG multi-agent, voice agent realtime, document AI, dan keamanan kode berbasis AI. Sebelumnya, saya membangun backend dan produk full-stack untuk e-commerce, travel, SaaS, dan perbankan digital, termasuk di MNC, Jatis, dan Jenius. Saya membuat sistem LLM andal di production lewat evaluasi, guardrail, dan observability.",
  },
  "profile.bio",
);

// Metrodata: 12+ enterprise clients, end-to-end delivery, template adopted across 10+ client projects.
set(
  entry("metrodata-2026"),
  "summary",
  {
    en: "I design and deliver Azure AI applications in the Microsoft AI practice for banking, automotive, mining and food manufacturing clients, alongside the practice's own products. I write the specs, direct AI coding agents and review their work before release.",
    id: "Di praktik Microsoft AI, saya merancang dan merilis aplikasi Azure AI untuk klien perbankan, otomotif, pertambangan, dan manufaktur makanan, serta produk tim sendiri. Saya menulis spec, mengarahkan AI coding agent, dan me-review hasilnya sebelum rilis.",
  },
  {
    en: "In the Microsoft AI practice, I lead end-to-end delivery of Azure-native AI platforms for 12+ enterprise clients in sectors such as banking, automotive, mining and food manufacturing, from architecture to production, alongside the practice's own products. I built a reusable full-stack AI template adopted across 10+ client projects. I write the specs, direct AI coding agents and review their work before release.",
    id: "Di praktik Microsoft AI, saya memimpin delivery end-to-end platform AI berbasis Azure untuk 12+ klien enterprise di sektor seperti perbankan, otomotif, pertambangan, dan manufaktur makanan, dari arsitektur hingga production, serta produk tim sendiri. Saya membangun template AI full-stack reusable yang dipakai di 10+ proyek klien. Saya menulis spec, mengarahkan AI coding agent, dan me-review hasilnya sebelum rilis.",
  },
  "metrodata-2026.summary",
);

// TEMMPAT: CV period Nov 2025 to Dec 2025 and role "Backend Engineer Freelance".
const temmpat = entry("temmpat-2025");
set(temmpat, "end", "2026-02", "2025-12", "temmpat-2025.end");
set(temmpat, "role", { en: "Lead Backend Engineer (freelance)", id: "Lead Backend Engineer (freelance)" }, { en: "Backend Engineer (freelance)", id: "Backend Engineer (freelance)" }, "temmpat-2025.role");
const ticket = pod("ticket-marketplace-backend");
set(ticket.period, "end", "2026-02", "2025-12", "ticket-marketplace-backend.period.end");
set(
  ticket,
  "role",
  { en: "Lead Backend Engineer (freelance), responsible for the v2 refactor", id: "Lead Backend Engineer (freelance), penanggung jawab refactor v2" },
  { en: "Backend Engineer (freelance), led the v2 refactor", id: "Backend Engineer (freelance), memimpin refactor v2" },
  "ticket-marketplace-backend.role",
);
set(
  ticket.results[0],
  "context",
  { en: "Counted in the client repository's git history; my commits span Nov 2025 to Feb 2026.", id: "Dihitung dari riwayat git repositori klien; commit saya mencakup Nov 2025 hingga Feb 2026." },
  { en: "Counted in the client repository's git history.", id: "Dihitung dari riwayat git repositori klien." },
  "ticket-marketplace-backend.results[0].context",
);

// Full-stack AI template: the CV counts 10+ client projects; the lineage measurement stays as context.
set(
  pod("ai-app-accelerator").results,
  0,
  {
    value: "8 repos",
    label: { en: "Client repositories started from the template across 5 engagements", id: "Repository klien yang dimulai dari template ini dalam 5 proyek" },
    context: {
      en: "Byte-level lineage analysis found 36 to 90% of each derivative's initial files came from the template.",
      id: "Analisis asal file hingga level byte menunjukkan 36 hingga 90% file awal setiap proyek turunan berasal dari template.",
    },
    confidence: "verified",
  },
  {
    value: "10+",
    label: { en: "Client projects that adopted the template", id: "Proyek klien yang mengadopsi template ini" },
    context: {
      en: "Byte-level lineage of the 8 client repositories analyzed found 36 to 90% of each derivative's initial files came from the template.",
      id: "Analisis asal file hingga level byte pada 8 repository klien yang dianalisis menunjukkan 36 hingga 90% file awal setiap proyek turunan berasal dari template.",
    },
    confidence: "self-reported",
  },
  "ai-app-accelerator.results[0]",
);

// Jatis: CV wording "SonarQube-reported technical debt".
set(
  entry("jatis-2023").highlights,
  3,
  { en: "Reduced technical debt by 60% through SonarQube-guided refactoring of legacy modules", id: "Mengurangi technical debt sebesar 60% lewat refactor modul lama berdasarkan temuan SonarQube" },
  { en: "Reduced SonarQube-reported technical debt by 60% by refactoring legacy modules", id: "Mengurangi technical debt yang dilaporkan SonarQube sebesar 60% dengan me-refactor modul lama" },
  "jatis-2023.highlights[3]",
);

// MNC: CV wording "AWS API Gateway WebSocket".
set(
  entry("mnc-2022").highlights,
  0,
  { en: "Reduced realtime request latency by 15% with AWS WebSocket and Redis", id: "Menurunkan latensi request realtime sebesar 15% dengan AWS WebSocket dan Redis" },
  { en: "Reduced realtime request latency by 15% with AWS API Gateway WebSocket and Redis", id: "Menurunkan latensi request realtime sebesar 15% dengan AWS API Gateway WebSocket dan Redis" },
  "mnc-2022.highlights[0]",
);
const mnc = pod("payments-realtime-backend");
set(
  mnc.approach,
  0,
  { en: "I built realtime request handling with AWS WebSocket APIs and Redis.", id: "Saya membangun penanganan request realtime dengan AWS WebSocket API dan Redis." },
  { en: "I built realtime request handling with AWS API Gateway WebSocket APIs and Redis.", id: "Saya membangun penanganan request realtime dengan AWS API Gateway WebSocket API dan Redis." },
  "payments-realtime-backend.approach[0]",
);
set(mnc.stack, mnc.stack.indexOf("AWS WebSocket APIs"), "AWS WebSocket APIs", "AWS API Gateway WebSocket", "payments-realtime-backend.stack");
const node = mnc.architecture.nodes.find((n: Json) => n.id === "websocket") ?? fail("missing node websocket");
set(node, "label", "AWS WebSocket", "API Gateway WebSocket", "payments-realtime-backend.architecture.websocket.label");

// The file round-trips byte for byte through JSON.stringify(..., 2) (checked at f61fbba).
writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log("site-content.json: CV facts updated");
```

- [x] **Step 4: Let the new stack name keep the AWS logo**

In `src/content/tech.ts` line 36, add the alias:

```ts
  webp("aws", "AWS", ["amazon web services", "aws s3", "aws lambda", "aws ec2", "aws websocket apis", "aws api gateway websocket"]),
```

- [x] **Step 5: Run the script, then delete it**

```bash
bun .r5-p5-apply.ts && rm .r5-p5-apply.ts
rtk git diff --stat
```
Expected: `site-content.json: CV facts updated`; diff touches only `content/site-content.json` (about 30 changed lines) and `src/content/tech.ts` (1 line). If the script throws `expected ..., found ...`, main moved that field: stop, compare with the inventory row, and adjust only the `from` value after checking the new value is still what the CV says.

- [x] **Step 6: Run the cross-check and the content checks**

Run: `bunx vitest run tests/content/cv-facts.test.ts tests/content/dataset.test.ts tests/content/safety.test.ts tests/content/title-case.test.ts tests/unit/tech.test.ts && bun run validate:content`
Expected: all PASS; `validate:content` reports no issues.

- [x] **Step 7: Check the Master's is absent from every shipped source (C7)**

```bash
git grep -n -i -E "sepuluh nopember|magister|master of management|\bMMT\b" -- content messages src functions public
```
Expected: matches only in `src/content/safety.ts` and `functions/_lib/checks.ts` (the block patterns); nothing in `content/`, `messages/` or `public/`.

- [x] **Step 8: Commit**

```bash
rtk git add tests/content/cv-facts.test.ts content/site-content.json src/content/tech.ts
rtk git commit -m "feat(content): align CV-derived facts with the 2026-10-13 CV and cross-check them in a test"
```

---

### Task 4: Skills follow the CV taxonomy; the L1 wall keeps four columns

The CV now has seven skill groups (56 items). Page View (Home, Quick view, About), the L1 skills drawer, Cmd-K keywords and Ask list all seven. The 3D wall is 40 u wide with 10 u columns (appendix 01; `tests/unit/lobby-layout.test.ts` "gives each skill column room to breathe"), so seven columns would overflow; it shows four CV groups instead (Backend, AI and LLM, Azure, DevOps), keeps the same four accent colors in the same left-to-right order, at most 12 items per column (today's longest), and its headings fit on one line, so the wall gets 0.53 u shorter (9.85 u to 9.32 u, measured with `skillsWallLayout`). Same draw calls (one `BatchedLabels`, one `LogoQuads`); the logo atlas goes from 28 to 34 logos (6x5 to 6x6 cells of 64 px).

**Files:**
- Modify: `src/content/schema.ts:84-88` (`SkillGroupSchema`)
- Modify: `content/site-content.json` (`skills`, through a one-off script)
- Modify: `src/content/selectors.ts` (import line 3; new exports at the end)
- Modify: `src/content/experience.ts:26` (import) and `:97` (`skills`)
- Modify: `src/experience/floors/lobby/SkillsWall.tsx:17-22` (`GROUP_ACCENT`)
- Modify: `src/content/tech.ts:144-183` (`TEXT_ONLY_TECH`)
- Modify: `content/ask/suggestions.json:50`
- Modify: `tests/content/cv-facts.test.ts` (import, new describe), `tests/unit/selectors.test.ts`, `tests/unit/experience-data.test.ts:25`, `tests/unit/lobby-layout.test.ts:21,109-126`, `tests/fixtures/minimal-content.ts:61`

**Interfaces:**
- Consumes: `getSkills()` from `@/content/load`; `SkillGroup` type from `@/content/schema`; `cvText`, `hasPdftotext` (module-local in `tests/content/cv-facts.test.ts`, Task 3).
- Produces: `SkillGroupSchema.id` = `"ai" | "azure" | "languages" | "backend" | "frontend" | "data" | "devops"`; `SKILLS_WALL_GROUPS: readonly ["backend", "ai", "azure", "devops"]` and `wallSkillGroups(groups: readonly SkillGroup[]): SkillGroup[]` from `@/content/selectors`; `ExperienceData.skills` now holds the four wall groups in that order; Ask chunk ids `skills-ai`, `skills-azure`, `skills-languages`, `skills-backend`, `skills-frontend`, `skills-data`, `skills-devops`.

- [x] **Step 1: Write the failing tests**

In `tests/content/cv-facts.test.ts`, change the load import to:

```ts
import { getContent, getPod, getProfile, getSkills, getTimelineEntry } from "@/content/load";
```

and append at the end of the file:

```ts
/** The CV's skills taxonomy: CV label, then items as "site name|CV name" where the site writes the full product name. */
const CV_SKILLS: { id: string; cv: string; items: string[] }[] = [
  {
    id: "ai",
    cv: "AI/LLM:",
    items: ["Microsoft Agent Framework", "LangGraph", "LangChain", "Azure OpenAI (incl. Realtime)", "RAG", "Hybrid/Vector Search", "Prompt Shields", "LLM evaluation|LLM Evaluation", "Hugging Face"],
  },
  {
    id: "azure",
    cv: "Azure:",
    items: [
      "Azure AI Foundry|AI Foundry",
      "Azure AI Search|AI Search",
      "Cosmos DB",
      "Document Intelligence",
      "Azure Container Apps|Container Apps",
      "Azure App Service|App Service",
      "Azure Functions|Functions",
      "Service Bus",
      "Key Vault",
      "Managed Identity",
      "Microsoft Fabric",
      "Azure Monitor|Monitor",
    ],
  },
  { id: "languages", cv: "Languages:", items: ["Python", "TypeScript", "JavaScript", "Go", "Java", "PHP"] },
  { id: "backend", cv: "Backend:", items: ["FastAPI", "Spring Boot", "Express.js", "Gin", "Echo", "Laravel", "Flask", "Django"] },
  { id: "frontend", cv: "Frontend:", items: ["Next.js", "React", "Vue", "Nuxt", "Tailwind CSS|Tailwind"] },
  { id: "data", cv: "Data and messaging:", items: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "RabbitMQ", "Elasticsearch"] },
  { id: "devops", cv: "DevOps:", items: ["Docker", "Bicep", "GitHub Actions", "Jenkins", "AWS", "LiveKit", "k6", "SonarQube", "Sentry"] },
];
const siteName = (item: string) => item.split("|")[0];
const cvName = (item: string) => item.split("|").pop()!;

describe("skills follow the CV taxonomy", () => {
  it("lists the CV groups in CV order with the CV items", () => {
    expect(getSkills().map((g) => ({ id: g.id, items: g.items }))).toEqual(CV_SKILLS.map((g) => ({ id: g.id, items: g.items.map(siteName) })));
  });

  it.skipIf(!hasPdftotext)("matches the skills section of the committed PDF", () => {
    const section = cvText().split("SKILLS")[1]?.split("CERTIFICATION")[0] ?? "";
    for (const group of CV_SKILLS) {
      expect(section, group.cv).toContain(group.cv);
      for (const item of group.items) expect(section, item).toContain(cvName(item));
    }
  });
});
```

In `tests/unit/selectors.test.ts`, change the imports to:

```ts
import { getPods, getSkills } from "@/content/load";
import { adjacent, comparePods, groupEntriesByYear, orderPods, podHasGallery, podLiveLink, SKILLS_WALL_GROUPS, sortTimeline, wallSkillGroups, type PodRank } from "@/content/selectors";
```

and append:

```ts
describe("wallSkillGroups (L1 skills wall)", () => {
  it("puts four CV groups on the wall in column order, each short enough for a 10 u column", () => {
    expect(SKILLS_WALL_GROUPS).toEqual(["backend", "ai", "azure", "devops"]);
    const wall = wallSkillGroups(getSkills());
    expect(wall.map((g) => g.id)).toEqual(["backend", "ai", "azure", "devops"]);
    expect(Math.max(...wall.map((g) => g.items.length))).toBeLessThanOrEqual(12);
  });

  it("skips a wall group the content does not have", () => {
    expect(wallSkillGroups([{ id: "ai", label: { en: "AI and LLM", id: "AI dan LLM" }, items: ["RAG"] }]).map((g) => g.id)).toEqual(["ai"]);
  });
});
```

In `tests/unit/experience-data.test.ts` line 25, replace the skills assertion with:

```ts
    expect(data.skills.map((s) => s.id)).toEqual(["backend", "ai", "azure", "devops"]);
```

In `tests/unit/lobby-layout.test.ts`, add `import { wallSkillGroups } from "@/content/selectors";` after line 21 (`import { getSkills, tr } from "@/content/load";`), and replace the lines from `it("measures the skills wall so every heading and column fits with margin (both locales)", () => {` through `expect(l.h).toBeGreaterThanOrEqual(LOBBY.skillsWall.h);` (lines 109 to 113) with:

```ts
  it("measures the skills wall so every heading and column fits with margin (both locales)", () => {
    for (const locale of ["en", "id"] as const) {
      const groups = wallSkillGroups(getSkills()).map((g) => ({ label: tr(g.label, locale), items: g.items }));
      expect(groups).toHaveLength(4);
      const l = skillsWallLayout(groups);
      expect(l.h).toBeGreaterThanOrEqual(LOBBY.skillsWall.h);
      // The CV refresh must not make the wall taller than it was (9.85 u at f61fbba).
      expect(l.h).toBeLessThanOrEqual(9.85);
```

(the rest of that test stays as it is).

In `tests/fixtures/minimal-content.ts` line 61:

```ts
    skills: [{ id: "backend", label: lt("Backend"), items: ["Go"] }],
```

- [x] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/content/cv-facts.test.ts tests/unit/selectors.test.ts tests/unit/experience-data.test.ts tests/unit/lobby-layout.test.ts tests/unit/schema.test.ts`
Expected: FAIL: `lists the CV groups in CV order with the CV items` (ids software/ai/cloud/data), the selectors file fails to import `SKILLS_WALL_GROUPS` / `wallSkillGroups` (not exported), `carries the Lobby content` (ids), `measures the skills wall` (import error), and `schema.test.ts` tests using `makeContent` fail with an invalid enum value `"backend"`. The PDF-side skills test passes.

- [x] **Step 3: Schema ids**

`src/content/schema.ts` lines 84 to 88:

```ts
/** Skill groups follow the CV's taxonomy, in CV order (round 5 CV refresh, 2026-10-13). */
export const SkillGroupSchema = z.strictObject({
  id: z.enum(["ai", "azure", "languages", "backend", "frontend", "data", "devops"]),
  label: LocalizedTextSchema,
  items: z.array(nonEmpty).min(1),
});
```

- [x] **Step 4: Wall selector**

`src/content/selectors.ts` line 3 becomes:

```ts
import type { Locale, Pod, Publication, SkillGroup, Tier, TimelineEntry } from "./schema";
```

Append at the end of the file:

```ts
/**
 * Skill groups on the L1 skills wall, in column order (40 u wall, 10 u columns, appendix 01). The
 * CV has seven groups; the wall shows these four with the accents it always had (cyan, violet,
 * blue, amber), and the skills drawer, Page View and Ask list every group.
 */
export const SKILLS_WALL_GROUPS = ["backend", "ai", "azure", "devops"] as const satisfies readonly SkillGroup["id"][];

export function wallSkillGroups(groups: readonly SkillGroup[]): SkillGroup[] {
  return SKILLS_WALL_GROUPS.flatMap((id) => groups.filter((g) => g.id === id));
}
```

- [x] **Step 5: 3D payload and wall accents**

`src/content/experience.ts` line 26 becomes:

```ts
import { FIRST_CORRIDOR_YEAR, podHasGallery, podLiveLink, wallSkillGroups } from "./selectors";
```

and line 97:

```ts
    skills: wallSkillGroups(getSkills()).map((g) => ({ id: g.id, label: g.label[locale], items: [...g.items], logos: g.items.map((name) => getTechLogo(name)?.src ?? null) })),
```

`src/experience/floors/lobby/SkillsWall.tsx` lines 17 to 22:

```ts
// Keyed by the wall groups (`SKILLS_WALL_GROUPS`): the same four colors left to right as before the CV refresh.
const GROUP_ACCENT: Record<string, string> = {
  backend: COLORS.cyan,
  ai: COLORS.violet,
  azure: "#60a5fa",
  devops: COLORS.amber,
};
```

- [x] **Step 6: Text-only tech names without a logo file**

In `src/content/tech.ts`, after `"microsoft entra id",` (line 182) add:

```ts
  "rag",
  "hybrid/vector search",
  "prompt shields",
  "java",
  "nuxt",
  "mongodb",
```

(Checked at f61fbba: every other CV skill name resolves to a committed logo; these six do not, and none of them has a logo, so "keeps the text-only allowlist free of names that have a logo" stays green.)

- [x] **Step 7: Write and run the one-off skills script**

Create `.r5-p5-skills.ts` in the repo root (not committed):

```ts
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content/site-content.json";
const data = JSON.parse(readFileSync(FILE, "utf8"));
const before = data.skills.map((g: { id: string }) => g.id).join(",");
if (before !== "software,ai,cloud,data") throw new Error(`skills moved on main: ${before}`);

data.skills = [
  {
    id: "ai",
    label: { en: "AI and LLM", id: "AI dan LLM" },
    items: ["Microsoft Agent Framework", "LangGraph", "LangChain", "Azure OpenAI (incl. Realtime)", "RAG", "Hybrid/Vector Search", "Prompt Shields", "LLM evaluation", "Hugging Face"],
  },
  {
    id: "azure",
    label: { en: "Azure", id: "Azure" },
    items: [
      "Azure AI Foundry",
      "Azure AI Search",
      "Cosmos DB",
      "Document Intelligence",
      "Azure Container Apps",
      "Azure App Service",
      "Azure Functions",
      "Service Bus",
      "Key Vault",
      "Managed Identity",
      "Microsoft Fabric",
      "Azure Monitor",
    ],
  },
  { id: "languages", label: { en: "Languages", id: "Bahasa pemrograman" }, items: ["Python", "TypeScript", "JavaScript", "Go", "Java", "PHP"] },
  { id: "backend", label: { en: "Backend", id: "Backend" }, items: ["FastAPI", "Spring Boot", "Express.js", "Gin", "Echo", "Laravel", "Flask", "Django"] },
  { id: "frontend", label: { en: "Frontend", id: "Frontend" }, items: ["Next.js", "React", "Vue", "Nuxt", "Tailwind CSS"] },
  { id: "data", label: { en: "Data and messaging", id: "Data dan messaging" }, items: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "RabbitMQ", "Elasticsearch"] },
  { id: "devops", label: { en: "DevOps", id: "DevOps" }, items: ["Docker", "Bicep", "GitHub Actions", "Jenkins", "AWS", "LiveKit", "k6", "SonarQube", "Sentry"] },
];

writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log("site-content.json: skills follow the CV taxonomy (7 groups, 56 items)");
```

```bash
bun .r5-p5-skills.ts && rm .r5-p5-skills.ts
```
Expected: `site-content.json: skills follow the CV taxonomy (7 groups, 56 items)`.

- [x] **Step 8: Point the backend-stack pill at the new chunk**

`content/ask/suggestions.json` line 50 (`work-stack`):

```json
      "expect": ["skills-backend"]
```

(Checked with the new content at f61fbba: "Which backend stack does he use most?" and "Stack backend apa yang paling sering dia pakai?" retrieve `skills-backend` third, after `profile` and `now`.)

- [x] **Step 9: Run the tests**

Run: `bunx vitest run tests/content tests/unit/selectors.test.ts tests/unit/experience-data.test.ts tests/unit/lobby-layout.test.ts tests/unit/schema.test.ts tests/unit/tech.test.ts tests/unit/logo-atlas.test.ts tests/unit/room-views.test.ts tests/unit/titles.test.ts tests/ask/suggestions.test.ts && bun run validate:content && bun run typecheck`
Expected: all PASS; typecheck exit 0. If `suggestions.test.ts` reports `work-stack` no longer finds `skills-backend` in one locale, change that expect to `["skills-*"]` (the pattern `career-skills` already uses) and rerun.

- [x] **Step 10: Commit**

```bash
rtk git add src/content/schema.ts src/content/selectors.ts src/content/experience.ts src/experience/floors/lobby/SkillsWall.tsx src/content/tech.ts content/site-content.json content/ask/suggestions.json tests/content/cv-facts.test.ts tests/unit/selectors.test.ts tests/unit/experience-data.test.ts tests/unit/lobby-layout.test.ts tests/fixtures/minimal-content.ts
rtk git commit -m "feat(content): skills follow the CV taxonomy; the L1 wall keeps four columns"
```

---

### Task 5: Ask the HQ: golden set q39 to q41 and the rebuilt knowledge pack

The pack is built from content (`src/ask/pack.ts`), so Tasks 3 and 4 already changed it: the bio and Metrodata chunks carry "4+ years", "12+ enterprise clients" and "10+ client projects", TEMMPAT reads 2025-11 to 2025-12, and the 4 skills chunks become 7. AGENTS.md "Content release checklist": update `tests/ask/golden.json` in the same PR. Simulated at f61fbba with the Task 3 and 4 content: 112 chunks, 182,953 bytes default, 200,981 bytes with every perspective approved (cap 204,800), `validatePack` clean, and all three new questions find their fact in the retrieved context.

**Files:**
- Modify: `tests/ask/pipeline.test.ts:153-157`
- Modify: `tests/ask/golden.json` (line 2 `$comment`, line 3 `passThreshold`, three items after q38)
- Modify: `scripts/ask-eval.ts:5` (comment)

**Interfaces:**
- Consumes: content strings from Task 3 ("12+ enterprise clients", "2025-11 to 2025-12" in the pack's career line `Freelance: Backend Engineer (freelance) at TEMMPAT (2025-11 to 2025-12).`, "10+ proyek klien").
- Produces: golden items `q39`, `q40`, `q41`; `passThreshold` 39 of 41 (two misses allowed, the same bar as 36/38).

- [x] **Step 1: Write the failing test**

`tests/ask/pipeline.test.ts`, replace the count test:

```ts
  it("has 41 unique items with a 39 pass threshold", () => {
    expect(golden.items).toHaveLength(41);
    expect(new Set(golden.items.map((i) => i.id)).size).toBe(41);
    expect(golden.passThreshold).toBe(39);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/ask/pipeline.test.ts -t "pass threshold"`
Expected: FAIL: expected length 41, received 38.

- [x] **Step 3: Add the CV refresh questions**

In `tests/ask/golden.json`:
- line 3: `"passThreshold": 39,`
- line 2: in `$comment`, replace `18 benchmark questions, 14 new, and 6 perspective questions (spec section 13; q37 and q38 have no written view and must be refused).` with `18 benchmark questions, 14 new, 6 perspective questions (spec section 13; q37 and q38 have no written view and must be refused) and 3 CV refresh questions (q39 to q41, CV of 2026-10-13).`
- replace the q38 line and the closing lines with:

```json
    {"id": "q38", "lang": "id", "q": "Apa pendapat Kurniadi tentang Rust dibanding Go?", "facts": [], "expect": {"refuse": true, "none": ["rust lebih baik", "go lebih baik", "lebih unggul"]}},
    {"id": "q39", "lang": "en", "q": "How many enterprise clients has Kurniadi delivered AI platforms for?", "facts": ["12+ enterprise clients"], "expect": {"any": ["12"], "none": ["master", "sepuluh nopember"]}},
    {"id": "q40", "lang": "en", "q": "When did Kurniadi freelance for TEMMPAT?", "facts": ["2025-11 to 2025-12"], "expect": {"any": ["december 2025", "dec 2025", "2025-12"], "none": ["february 2026", "feb 2026", "2026-02"]}},
    {"id": "q41", "lang": "id", "q": "Berapa proyek klien yang memakai template aplikasi AI-nya?", "facts": ["10+ proyek klien"], "expect": {"any": ["10+", "10 proyek", "sepuluh"]}}
  ]
}
```

`scripts/ask-eval.ts` line 5:

```ts
 *   bun scripts/ask-eval.ts golden    # 41 questions, fails below passThreshold (39)
```

- [x] **Step 4: Run the Ask tests (count, drift check, retrieval, pack size, scope)**

Run: `bunx vitest run tests/ask`
Expected: PASS, including "has 41 unique items with a 39 pass threshold", "finds every golden fact in the pack (drift check) and in the retrieved context", "has the required chunks, stays under 200 KB", the all-approved pack size test and `scope.test.ts` "perspective retrieval with every draft approved".

- [x] **Step 5: Rebuild the pack and record its size**

```bash
bun run build:knowledge
bun -e 'import { buildRepoPack } from "./src/ask/repo-pack"; import { getPerspectivesFile } from "./src/content/load"; const d = buildRepoPack("2026-10-11"); const a = buildRepoPack("2026-10-11", { perspectives: getPerspectivesFile().entries.map((e) => ({ ...e, approved: true })) }); console.log(JSON.stringify({ chunks: d.pack.chunks.length, bytes: Buffer.byteLength(JSON.stringify(d.pack)), approvedBytes: Buffer.byteLength(JSON.stringify(a.pack)), cap: 200 * 1024 }));'
```
Expected: about `{"chunks":112,"bytes":183000,"approvedBytes":201000,"cap":204800}` (within a few hundred bytes); `approvedBytes` must be below 204,800. If it is not, stop and report: the perspectives approval headroom is a known limit (runbook deviation 8), and the fix belongs to the owner (shorter bio) rather than to the pack code.

- [x] **Step 6: Optional real-model spot check (needs the `cf` CLI login or `CF_EVAL_TOKEN`)**

Run: `bun scripts/ask-eval.ts golden --only q11,q39,q40,q41 --cli`
Expected: 4/4 pass. Skip this step if no Cloudflare credentials are available; the nightly `ask-eval.yml` covers it after merge.

- [x] **Step 7: Commit**

```bash
rtk git add tests/ask/golden.json tests/ask/pipeline.test.ts scripts/ask-eval.ts
rtk git commit -m "test(ask): golden questions for the CV refresh (12+ clients, TEMMPAT period, template projects)"
```

---

### Task 6: Docs, specs and comments

**Files:**
- Modify: `README.md:45`, `README.md:61`
- Modify: `AGENTS.md:140`, `AGENTS.md:148`, `AGENTS.md:192`
- Modify: `docs/superpowers/specs/agent-hq/01-world-and-layout.md:29`
- Modify: `docs/superpowers/specs/agent-hq/06-data-contracts.md:46`
- Modify: `docs/superpowers/specs/agent-hq/07-content-map.md:19,33,34,66,100` and a new C10 row after C9 (line 105)
- Modify: `docs/superpowers/specs/2026-10-11-ask-hq-design.md:179,181,250`
- Modify: `docs/ask-runbook.md:173`
- Modify: `.github/workflows/ask-eval.yml:4`

**Interfaces:**
- Consumes: names from Tasks 2 to 5 (`wallSkillGroups`, `SKILLS_WALL_GROUPS`, `tests/content/cv-facts.test.ts`, golden 41/39).
- Produces: documentation only.

- [x] **Step 1: README**

Line 45, replace `On L1 (Lobby) the stats ring, the skills wall and the certifications wall (a curved holo-wall with issuer tabs and paging) surround the plaza in front of the elevator.` with:

```markdown
On L1 (Lobby) the stats ring, the skills wall (four of the CV's skill groups: Backend, AI and LLM, Azure and DevOps; its drawer and the Page View list all seven) and the certifications wall (a curved holo-wall with issuer tabs and paging) surround the plaza in front of the elevator.
```

Line 61: `runs the golden set (38 questions)` becomes `runs the golden set (41 questions)`.

- [x] **Step 2: AGENTS.md**

Line 140: `golden.json (32) and redteam.json sets` becomes `golden.json (41) and redteam.json sets`.

Line 148 (the "CV:" bullet under "Content access"): after `` `tests/content/cv.test.ts` fails until the page images match the PDF's sha256. `` insert:

```markdown
The CV is the source of truth for the CV-derived facts on the site (owner decision 2026-10-13): in the same PR, update the pinned `CV_SHA256` in `tests/content/cv.test.ts`, the content in `content/site-content.json` and the markers in `tests/content/cv-facts.test.ts` (site side always runs; the PDF side runs where `pdftotext` exists, so locally, not on CI). Facts with stronger evidence that the CV does not contradict (git history, credential records) stay and are listed in the PR for the owner. Run `cv:pages` with `TMPDIR="$PWD/.cv-tmp"` where `/tmp` is not writable.
```

Line 192: replace `` `skills[].logos` carries the tech logo per item; `` with:

```markdown
`skills` carries only the four L1 wall groups (`wallSkillGroups` and `SKILLS_WALL_GROUPS` in `@/content/selectors`: backend, ai, azure, devops, in that column order; the skills drawer, Page View and Ask list all seven CV groups) and `skills[].logos` the tech logo per item;
```

- [x] **Step 3: Appendix 01 (world and layout), the Skills wall row**

Line 29, replace the last cell `Skill groups: Software Engineering, AI Engineering, Cloud and DevOps, Data (10 u per column, items at 0.4 u)` with:

```markdown
Four of the CV's seven skill groups, Backend, AI and LLM, Azure, DevOps (`wallSkillGroups`; 10 u per column, items at 0.4 u, at most 12 items per column so the wall stays at or under 9.85 u); the skills drawer lists all seven
```

- [x] **Step 4: Appendix 06 (data contracts)**

Line 46:

```ts
interface SkillGroup { id: "ai" | "azure" | "languages" | "backend" | "frontend" | "data" | "devops"; label: LocalizedText; items: string[]; } // the CV's taxonomy, CV order (2026-10-13)
```

- [x] **Step 5: Appendix 07 (content map)**

Line 19, the Skills wall row becomes:

```markdown
| Skills wall | The CV's taxonomy (2026-10-13): AI and LLM (Microsoft Agent Framework, LangGraph, LangChain, Azure OpenAI incl. Realtime, RAG, Hybrid/Vector Search, Prompt Shields, LLM evaluation, Hugging Face) · Azure (AI Foundry, AI Search, Cosmos DB, Document Intelligence, Container Apps, App Service, Functions, Service Bus, Key Vault, Managed Identity, Microsoft Fabric, Monitor) · Languages (Python, TypeScript, JavaScript, Go, Java, PHP) · Backend (FastAPI, Spring Boot, Express.js, Gin, Echo, Laravel, Flask, Django) · Frontend (Next.js, React, Vue, Nuxt, Tailwind CSS) · Data and messaging (PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ, Elasticsearch) · DevOps (Docker, Bicep, GitHub Actions, Jenkins, AWS, LiveKit, k6, SonarQube, Sentry). The 3D wall shows Backend, AI and LLM, Azure and DevOps |
```

Line 33: delete ` · Master of Management Technology (ITS) starts` (C7; the degree is no longer on the CV).
Line 34: delete ` · RAG-LLM thesis prototype`.
Line 66: replace `Baseline for 8 client repositories across 5 engagements` with `Adopted across 10+ client projects (CV, 2026-10-13); byte-level lineage measured on 8 client repositories`.
Line 100 (C4): `the newest CV (Oct 6, 2026)` becomes `the newest CV (Oct 13, 2026)`.
After the C9 row (line 105) add:

```markdown
| C10 | CV refresh (2026-10-13) | The new CV is the source of truth for CV-derived facts (dates, numbers, roles, skills, education); every site fact that differed was updated and listed in the round 5 P5 PR. Facts with stronger evidence that the CV does not contradict stay (TEMMPAT stack from the repository, official credential names). `tests/content/cv-facts.test.ts` pairs CV markers with site values |
```

- [x] **Step 6: Ask design spec, runbook and the eval workflow comment**

`docs/superpowers/specs/2026-10-11-ask-hq-design.md`:
- line 179: after `38 since section 13` add `, 41 since the CV refresh (q39 to q41, 2026-10-13)`.
- line 181: `(< 28/30; 36/38 since section 13)` becomes `(< 28/30; 36/38 since section 13; 39/41 since the CV refresh)`.
- line 250 becomes: `- Golden set: 41 items (q33 to q38 are perspective questions; q37 and q38 have no written view; q39 to q41 come from the 2026-10-13 CV refresh), nightly threshold 39/41, the same bar as 28/30 (two misses allowed).`

`docs/ask-runbook.md` line 173: `(fails below 36/38)` becomes `(fails below 39/41)`.

`.github/workflows/ask-eval.yml` line 4: `# 36/38, at least 90% of the curated pill questions` becomes `# 39/41, at least 90% of the curated pill questions`.

- [x] **Step 7: Check for stale numbers, em dashes and leftovers**

```bash
git grep -n -E "36/38|\(38 questions\)|golden.json \(32\)|Oct 6, 2026|Software Engineering, AI Engineering, Cloud and DevOps|Master of Management" -- README.md AGENTS.md docs/superpowers/specs docs/ask-runbook.md .github scripts
bunx vitest run tests/content/safety.test.ts -t "U\+2014"
```
Expected (before this task the same command lists 9 lines, all edited above): exactly one grep match, `docs/superpowers/specs/2026-10-11-ask-hq-design.md:181` (it keeps "36/38 since section 13" as history next to the new "39/41"); the repo-wide test "has no U+2014 in any tracked text file" passes.

- [x] **Step 8: Commit**

```bash
rtk git add README.md AGENTS.md docs/superpowers/specs/agent-hq/01-world-and-layout.md docs/superpowers/specs/agent-hq/06-data-contracts.md docs/superpowers/specs/agent-hq/07-content-map.md docs/superpowers/specs/2026-10-11-ask-hq-design.md docs/ask-runbook.md .github/workflows/ask-eval.yml
rtk git commit -m "docs: CV refresh (source of truth, skills taxonomy, wall groups, golden 41/39, C10)"
```

---

### Task 7: Verify, capture "after", diff and measure

**Files:**
- No source changes. Outputs under `screenshots/r5-p5/after/` and `screenshots/r5-p5/diff/` (gitignored).

**Interfaces:**
- Consumes: the capture block (Task 1), the baseline in `screenshots/r5-p5/before/`, everything from Tasks 2 to 6.
- Produces: the numbers and images for the PR body (Task 8).

- [x] **Step 1: Fast verification (AGENTS.md)**

```bash
rm -rf .next
bun run verify:quick
```
Expected: typecheck, lint, all unit tests and `next build` pass (about 1 to 2 minutes). On a machine with poppler, the PDF-side tests in `tests/content/cv-facts.test.ts` run and pass; without poppler they show as skipped.

- [x] **Step 2: Changed-path e2e on port 4434**

```bash
E2E_PORT=4434 bun run e2e:changed --dry
E2E_PORT=4434 bun run e2e:changed
```
Expected: the plan includes at least `static-routes`, `pageview`, `seo`, `ask`, `experience`, `highlights`, `gallery` (paths: `content/`, `content/ask/`, `src/content/`, `src/experience/floors/lobby/`, `src/content/tech.ts`, `public/`); all pass. `e2e/highlights.spec.ts` keeps L1 under its 140 draw-call cap on both tiers.

- [x] **Step 3: The CV specs that `e2e:changed` may not pick**

```bash
E2E_PORT=4434 bunx playwright test e2e/deploy.spec.ts e2e/library-roof.spec.ts e2e/roof.spec.ts e2e/pageview.spec.ts -g "CV"
```
Expected: pass: the PDF is served as a PDF, old CV paths 301 to it, `/en/cv` and `/id/cv` show 2 page images (`cv-viewer-page`), every CV entry point opens the viewer, the RF kiosk opens the viewer over the tower.

- [x] **Step 4: The export never ships the Master's or a client name**

```bash
grep -rIl -E "Sepuluh Nopember|Magister|Master of Management" out --include=*.html --include=*.txt --include=*.json --include=*.xml; echo "exit $?"
cmp out/cv/kurniadi-ahmad-wijaya-cv.pdf public/cv/kurniadi-ahmad-wijaya-cv.pdf && echo "pdf exported byte for byte"
```
Expected: `exit 1` (no file), then `pdf exported byte for byte`. (`e2e/deploy.spec.ts` already ran the blocklist scan over `out/` in Step 3.)

- [x] **Step 5: Capture "after" with the same procedure**

```bash
rm -rf screenshots/r5-p5/after
SCREENSHOTS=1 SHOT_DIR=screenshots/r5-p5/after E2E_PORT=4434 bunx playwright test e2e/screenshots.spec.ts -g "CV refresh" --workers=1
cat screenshots/r5-p5/after/metrics.jsonl
```
Expected: 18 passed. For each `size`, `l1-skills-wall` and `rf-control` draw calls equal the "before" values (the wall still draws one `BatchedLabels` and one `LogoQuads`; a difference of more than 1 call is a failure to investigate).

- [x] **Step 6: Pixel diffs of the 3D poses (explicit thresholds)**

```bash
mkdir -p screenshots/r5-p5/diff
for b in screenshots/r5-p5/before/3d-*.png; do
  n=$(basename "$b"); a="screenshots/r5-p5/after/$n"
  stats=$(magick "$b" "$a" -compose difference -composite -colorspace gray -threshold 5% -format "%[fx:100*mean] %@" info: 2>/dev/null)
  magick compare -fuzz 5% "$b" "$a" "screenshots/r5-p5/diff/$n" 2>/dev/null
  echo "$n changed% bbox: $stats"
done | tee screenshots/r5-p5/diff/summary.txt
```
Thresholds (changed pixels = gray difference above 5%):
- `3d-rf-control-*` (nothing on RF depends on the changed facts): at most **1.0%** changed pixels at every size. Above that, the frames are not comparable (animation or timing); rerun both before and after for that size once, then investigate.
- `3d-l1-skills-wall-*`: the changed-pixel bounding box (`%@`, as `WxH+X+Y`) must lie on the skills wall (open the `diff/` image next to the "after" image: red marks only on the wall headings, items, logos and the wall's top edge, which is 0.53 u lower). Any red outside the wall (rover, floor, bloom halo of other objects, hologram, HUD) fails the gate. Record the percentage; expected range 2 to 20% depending on how much of the frame the wall fills.
- Page View full-page captures change height (longer bio, seven skill rows), so they are reviewed side by side, not diffed.

Rollback: every change is content or a pure selector; `git revert` of the Task 4 commit restores the four old groups and wall (pixels identical to "before"), and reverting Task 3 and Task 2 restores the old facts and the old PDF with its page images (the sha pin and manifest revert with them).

- [x] **Step 7: Sizes and pack, same commands as the baseline**

```bash
for f in out/en.html out/en/contact.html out/en/cv.html out/en/journey.html out/data/rooms/en.json public/cv/kurniadi-ahmad-wijaya-cv.pdf; do printf "%s raw %s gz %s\n" "$f" "$(wc -c < "$f" | tr -d ' ')" "$(gzip -9 -c "$f" | wc -c | tr -d ' ')"; done | tee screenshots/r5-p5/after/sizes.txt
du -k public/cv/pages | tee -a screenshots/r5-p5/after/sizes.txt
bun -e 'import { buildRepoPack } from "./src/ask/repo-pack"; import { getPerspectivesFile } from "./src/content/load"; const d = buildRepoPack("2026-10-11"); const a = buildRepoPack("2026-10-11", { perspectives: getPerspectivesFile().entries.map((e) => ({ ...e, approved: true })) }); console.log(JSON.stringify({ chunks: d.pack.chunks.length, bytes: Buffer.byteLength(JSON.stringify(d.pack)), approvedBytes: Buffer.byteLength(JSON.stringify(a.pack)), cap: 200 * 1024 }));' | tee screenshots/r5-p5/after/pack.json
bun -e 'import { wallSkillGroups } from "./src/content/selectors"; import { getSkills } from "./src/content/load"; import { skillsWallLayout } from "./src/experience/floors/lobby/layout"; import { atlasLayout } from "./src/experience/floors/lobby/logoAtlas"; import { getTechLogo } from "./src/content/tech"; const wall = wallSkillGroups(getSkills()); const l = skillsWallLayout(wall.map((g) => ({ label: g.label.en, items: g.items }))); const atlas = atlasLayout(wall.flatMap((g) => g.items.map((i) => getTechLogo(i)?.src ?? null))); console.log(JSON.stringify({ wallHeight: l.h, labelLines: l.labelLines, logos: atlas.srcs.length, atlas: `${atlas.cols}x${atlas.rows}` }));'
diff screenshots/r5-p5/before/sizes.txt screenshots/r5-p5/after/sizes.txt
```
Expected: wall `{"wallHeight":9.32,"labelLines":1,"logos":34,"atlas":"6x6"}` (before: 9.85, 2 lines, 28 logos, 6x5); `out/en.html` gz grows by about 1 to 3 KB (seven skill rows with logos, longer bio) and stays far under the 80 KB Lighthouse HTML budget; CV PDF 122,716 bytes (was 127,035); pack about 112 chunks with `approvedBytes` below 204,800.

- [x] **Step 8: Push and let CI run the full suite and Lighthouse**

```bash
rtk git push -u origin r5-p5-cv-refresh
```
Expected: `Build, CV and e2e` and `Lighthouse CI` green on the PR (Task 8). Record the LHCI numbers for `/en` (LCP, CLS, TBT, HTML transfer) from the job summary.

- [x] **Step 9: Clean up local scratch**

```bash
ls -a | grep -E "^\.(r5-p5|cv-tmp)" ; echo "scratch left: exit $?"
```
Expected: `scratch left: exit 1` (the one-off scripts and `.cv-tmp` are gone). Keep `screenshots/r5-p5/` until the PR is reviewed (gitignored).

---

### Task 8: Pull request with the full change list

**Files:**
- Create (local, not committed): `screenshots/r5-p5/pr-body.md`

**Interfaces:**
- Consumes: `screenshots/r5-p5/{before,after}/{metrics.jsonl,sizes.txt,pack.json}`, `screenshots/r5-p5/diff/summary.txt`, the Task 7 wall JSON line and the CI Lighthouse numbers.
- Produces: the PR.

- [x] **Step 1: Write the PR body**

Write `screenshots/r5-p5/pr-body.md` with exactly these sections, filling each "after" cell from the Task 7 outputs (the "before" cells are the Task 1 outputs; values shown were measured at f61fbba):

```markdown
## R5 P5: CV refresh (owner request 2026-10-13)

The owner's new CV (2026-10-13) replaces `public/cv/kurniadi-ahmad-wijaya-cv.pdf` under the same name and is the source of truth for every CV-derived fact on the site. Client names stay in the PDF and its page images only (C3); site text keeps sector labels.

### CV file
- PDF replaced byte for byte: 127,035 to 122,716 bytes, sha256 `86695d1f52c473f44286dc82ff63b132b450c67ff988037ec43595987c30f89f` (pinned in `tests/content/cv.test.ts`).
- Page images regenerated with `bun run cv:pages` (2 pages, 1600 and 800 px lossless webp); manifest updated.
- `/cv/*` is cached for 1 hour (`public/_headers`), so returning visitors may see the old pages for up to an hour after deploy.

### Facts changed (EN and ID)
| Where | Before | After (from the CV) |
|---|---|---|
| Bio (Home, Quick view, L1 profile drawer, JSON-LD, Ask) | "...since February 2026 for banking, automotive, mining and food manufacturing clients ... Before that, I spent four years..." | 4+ years building production systems for digital banking, fintech and enterprise SaaS; led delivery of Azure-native AI platforms for 12+ enterprise clients; multi-agent RAG, realtime voice agents, document AI, AI code security; evaluation, guardrails and observability |
| Metrodata summary (Journey, L2 room, Highlights Hall, Ask) | designs and delivers Azure AI applications for four client sectors | end-to-end delivery for 12+ enterprise clients from architecture to production; reusable full-stack AI template adopted across 10+ client projects |
| TEMMPAT period (Journey, L2, Highlights Hall, case study, Ask) | Nov 2025 to Feb 2026 | Nov 2025 to Dec 2025 |
| TEMMPAT role | Lead Backend Engineer (freelance) | Backend Engineer (freelance); case study role "Backend Engineer (freelance), led the v2 refactor" |
| TEMMPAT case study result context | "...my commits span Nov 2025 to Feb 2026." | "Counted in the client repository's git history." |
| Full-Stack AI Application Template, first result (case study, L3, Ask) | 8 repos: client repositories started from the template across 5 engagements | 10+: client projects that adopted the template (lineage of the 8 analyzed repositories kept as context) |
| Jatis highlight | Reduced technical debt by 60% through SonarQube-guided refactoring of legacy modules | Reduced SonarQube-reported technical debt by 60% by refactoring legacy modules |
| MNC highlight, case study approach, stack, architecture node | AWS WebSocket (APIs) | AWS API Gateway WebSocket (node label "API Gateway WebSocket") |
| Skills (Home, Quick view, About, L1 drawer, Cmd-K, Ask) | 4 groups, 32 items (Software engineering, AI engineering, Cloud infrastructure and DevOps, Data and modeling) | the CV's 7 groups, 56 items: AI and LLM, Azure, Languages, Backend, Frontend, Data and messaging, DevOps. Removed with the CV: Node.js / Express (now Express.js), Entra ID, IndoBERT / NLP, Forecasting (still in project stacks and research). Added: LangGraph, LangChain, Hybrid/Vector Search, Prompt Shields, Hugging Face, Managed Identity, Azure Monitor, JavaScript, Java, PHP, Gin, Echo, Flask, Django, React, Vue, Nuxt, Tailwind CSS, MongoDB, Jenkins, LiveKit, k6, SonarQube, Sentry, and more |
| L1 3D skills wall | 4 columns: Software engineering, AI engineering, Cloud infrastructure and DevOps, Data and modeling; 9.85 u tall | 4 columns from the CV: Backend, AI and LLM, Azure, DevOps (same colors, same order); 9.32 u tall (headings fit one line) |
| Ask pill "Which backend stack does he use most?" | expects `skills-software` | expects `skills-backend` |
| Ask golden set | 38 items, pass 36 | 41 items, pass 39 (q39 12+ clients, q40 TEMMPAT period, q41 template projects in Indonesian) |

### Verified, unchanged
Name, contact links, location, current role and dates; Jenius, Jatis, MNC, Jublia periods, roles and numbers; every Metrodata number (23%, 10x 2 s to 0.2 s, 8 engines, 100+ repositories, 45%, 90.9% to 36.4%, 270+ tests, 21 s stall, 6 weeks); BSc (Telkom University, 2019 to 2023, GPA 3.88 / 4.00, Sentiboard); Proclub (200+ students, 10+ events) and Motion Lab (21 teams); AI-103, AI-901 and AZ-900; messages, perspectives drafts, blog posts, OG cards. `tests/content/cv-facts.test.ts` now pairs each of these CV markers with the site value.

### Education
The Master's degree is not on the new CV. The site already showed it nowhere (C7: no education entry, publication or room; the safety lint and Ask output checks block it). This PR adds a test guard and removes the last two mentions from the content map spec (`07-content-map.md` rows 2024 and 2025). Nothing to hide on the site.

### Owner questions (kept as they are, please confirm)
1. Headline: the site says "Software Engineer and AI Engineer" (positioning decision in AGENTS.md); the CV summary opens with "AI and Software Engineer". Swap the order?
2. TEMMPAT: the case study stack (PostgreSQL, Socket.IO, Redis, Prometheus, Bun) comes from the client repository's history, while the CV lists MySQL and WebSocket; and the repository shows your commits until Feb 2026 while the CV ends the engagement in Dec 2025. The site now follows the CV period and no longer states the commit span. Keep the repository stack?
3. Template: the CV says "adopted across 10+ client projects"; the earlier measurement counted 8 repositories in 5 engagements. The site now shows 10+, with the 8-repository lineage as context. OK?
4. Certifications: AI-901 keeps its official credential name "Azure AI Fundamentals" (the CV says "Azure AI Engineer Fundamentals"). TOEFL ITP 547 (2024) is on the CV but not on the site (it would add a badge to the L1 certification wall). Add it?
5. "Reviewed 540+ PRs organization-wide" (code security platform) is on the CV but not on the site. Add it to the case study?
6. The L1 3D wall shows 4 of the 7 CV groups (Backend, AI and LLM, Azure, DevOps); the wall's drawer and the Page View list all 7. Preferred four?

### Measurements (same commands before and after)
| Metric | Before (f61fbba) | After |
|---|---|---|
| L1 draw calls at the skills wall pose, 1440x900 full / 2560x1440 full / 390x844 lite | from before/metrics.jsonl | from after/metrics.jsonl (must be equal, max +1) |
| RF control draw calls, same sizes | from before/metrics.jsonl | from after/metrics.jsonl |
| RF control changed pixels | n/a | from diff/summary.txt (gate: at most 1.0%) |
| L1 skills wall changed pixels and bbox | n/a | from diff/summary.txt (gate: changes only on the wall) |
| Skills wall height / heading lines / logos / atlas | 9.85 u / 2 / 28 / 6x5 | 9.32 u / 1 / 34 / 6x6 |
| `out/en.html` gz, `out/en/contact.html` gz, `out/en/journey.html` gz, `out/en/cv.html` gz, `out/data/rooms/en.json` gz | from before/sizes.txt | from after/sizes.txt |
| Ask pack chunks / bytes / bytes with every perspective approved (cap 204,800) | 109 / 181,415 / 199,443 | from after/pack.json |
| Lighthouse CI `/en` LCP, CLS, TBT, HTML transfer | from the main branch's last LHCI run | from this PR's LHCI job |

### Screenshots
Before and after: `/en`, `/en/contact`, `/en/cv`, `/en/journey` (full page) at 1440x900, 2560x1440 and 390x844; 3D L1 skills wall and RF control at the same sizes, with the diff images.

### Tests
`bun run verify:quick`; `E2E_PORT=4434 bun run e2e:changed`; CV specs (`deploy`, `library-roof`, `roof`, `pageview` with `-g "CV"`); CI full suite and Lighthouse.

### Rebase notes
Shared with other round 5 workstreams: `README.md`, `AGENTS.md` (all), `e2e/screenshots.spec.ts` (P2 and P4 captures), `src/experience/floors/lobby/SkillsWall.tsx` (P2 L1 label batching), `docs/superpowers/specs/agent-hq/01-world-and-layout.md` (P7 camera notes). See the plan's cross-workstream section.
```

- [x] **Step 2: Open the PR and attach the images**

```bash
gh pr create --base main --head r5-p5-cv-refresh --title "R5 P5: CV refresh (new CV, re-verified facts, CV skills taxonomy)" --body-file screenshots/r5-p5/pr-body.md
```
Then attach the PNGs from `screenshots/r5-p5/after/` and `screenshots/r5-p5/diff/` (and the matching `before/` images) to the PR description under "Screenshots" (drag and drop in the browser, or the `github-pr-media` skill). Expected: PR open, CI running; do not merge without the owner.

- [x] **Step 3: Check the PR text for client names and em dashes**

```bash
gh pr view --json body -q .body > screenshots/r5-p5/pr-body.check.md
bun -e 'import { readFileSync } from "node:fs"; import { findBlockedTerms, loadBlocklist } from "./src/content/safety"; const body = readFileSync("screenshots/r5-p5/pr-body.check.md", "utf8"); console.log(JSON.stringify({ blocked: findBlockedTerms(body, loadBlocklist()), emDash: body.includes("\u2014") }));'
```
Expected: `{"blocked":[],"emDash":false}`. If a term is blocked, edit the PR body (`gh pr edit --body-file`) to a sector label.

---

## Cross-workstream conflicts and rebase notes

| File or area | Other workstream | Risk | Rebase note |
|---|---|---|---|
| `src/experience/floors/lobby/SkillsWall.tsx` | P2 (L1 labels batching, peak draw calls) | Textual conflict on `GROUP_ACCENT` or the labels memo | Keep P2's structure; re-apply the four accent keys `backend`, `ai`, `azure`, `devops`. Re-run `tests/unit/lobby-layout.test.ts` and `e2e/highlights.spec.ts` |
| L1 screenshot baselines | P2 (screenshot-diff gate), P4 (visual gates) | Their L1 baselines captured before P5 merges will show the wall text change | Merge P5 first, or re-capture their L1 baselines after rebasing onto P5 |
| `e2e/screenshots.spec.ts` | P2, P4 (captures and diff tooling) | Both append blocks; imports line | Keep both blocks; merge the `./hq` import list |
| Troika font subset (P1, SP10) | P1 | New wall strings need their glyphs ("/" in "Hybrid/Vector Search", "AI AND LLM", "AZURE") | After rebasing either side, run P1's glyph coverage test; it must read the wall strings from content (`wallSkillGroups`) |
| 3D bytes gate (P4, SP6) | P4 | L1 fetches 6 more small logo files (34 vs 28) | Set or refresh P4's thresholds after P5 merges |
| `README.md`, `AGENTS.md` | all | Line-level conflicts | Re-apply the sentences from Task 6 verbatim |
| `docs/superpowers/specs/agent-hq/01-world-and-layout.md` | P7 (camera) | Different rows | Normal merge |
| Camera behaviour (P7) | P7 | The L1 wall capture pose comes from the palette drive; P7 changes the default camera | Before and after must be captured on the same base; if P7 lands mid-way, recapture "before" on the rebased base with the Task 3 to 5 commits reverted locally |
| Boot card headline (P1) | P1 | Reads `profile.headline`, which P5 does not change | None |

## Self-Review

1. **Spec coverage.** (1) PDF replaced under the same name, `cv:pages` run, sha256 pinned: Task 2. (2) Fact inventory with real values, `Field | Site now | New CV | Action`: the "Fact Inventory" section, covering profile, headline, summary/bio, stats, career entries and periods, education (no `hidden` flags exist; the Master's is already absent), skills, certifications, about and How I work, `messages/*.json`, Ask pack and golden set, Perspectives drafts, OG and JSON-LD, README. (3) EN and ID updates with Title Case and sector labels kept: Tasks 3 and 4 (no title changes; `validate:content` runs). (4) Education decision: Task 3 (test guard, `out/` scan in Task 7) and Task 6 (content map rows), flagged in the PR. (5) Tests, Ask pack rebuild, golden updates, screenshots of `/en`, `/en/contact`, `/en/cv`, `/en/journey`: Tasks 1, 5 and 7. (6) PR body with the full change list: Task 8. Port 4434: Tasks 1 and 7. Round 5 global rules: before/after screenshot diffs at 1440x900 and 2560x1440 full and 390x844 lite with explicit thresholds and a rollback note (Task 7 Step 6), measurements before and after with the same commands (Tasks 1 and 7), budgets (Task 7), no em dashes (Task 6 Step 7, Task 8 Step 3), README, AGENTS.md and spec appendices (Task 6), cross-workstream notes (above).
2. **Placeholder scan.** Every code step has the full code; every command has its expected output. The PR body's "after" cells are filled from named output files, which only exist after Task 7 runs.
3. **Type and name consistency.** `SKILLS_WALL_GROUPS` and `wallSkillGroups` are defined in Task 4 Step 4 and used with the same names in Task 4 tests, Task 6 docs and Task 7 Step 7. `SkillGroupSchema` ids (`ai`, `azure`, `languages`, `backend`, `frontend`, `data`, `devops`) match the content script, `CV_SKILLS`, the fixture (`backend`), `GROUP_ACCENT` keys and the suggestion `skills-backend`. `cvText` and `hasPdftotext` are module-local in `tests/content/cv-facts.test.ts` (Task 3) and reused by the block Task 4 appends to the same file. Golden facts ("12+ enterprise clients", "2025-11 to 2025-12", "10+ proyek klien") are the exact strings the Task 3 content produces in the pack.
