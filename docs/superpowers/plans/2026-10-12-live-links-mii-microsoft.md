# R4-J: Live Links for the MII Microsoft Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the owner's two public MII Microsoft sites (https://mii-microsoft.azurewebsites.net and https://mii-microsoft-ai.azurewebsites.net) as named, refreshed L3 projects with a guarded "Visit live site" link on the case study page, the project rows and the 3D Glass Drawer, and keep every derived surface (L3 placement, Ask pack and golden set, OG titles, docs) in step.

**Architecture:** One optional field, `Pod.liveUrl`, validated by the zod schema against a hard-coded public host allowlist (`PUBLIC_LIVE_HOSTS` in a new pure module `src/content/live-links.ts`: https, site root only, no credentials or port), so an internal app can never get a link through a content edit. Every surface reads the link through one selector, `podLiveLink(pod)` in `src/content/selectors.ts` (re-checks the allowlist), and renders one shared component, `LiveSiteLink` (new tab, `rel="noopener noreferrer"`, external-link icon, EN/ID label from `common.visitLive`). The public-safety lint keeps forbidding Azure hostnames everywhere except an allowlisted `liveUrl` leaf; the Ask knowledge pack says a live site exists but never ships the hostname, because Ask output checks block Azure hostnames.

**Tech Stack:** TypeScript strict, Next.js 16 static export, React 19, zod 4, next-intl, Vitest + Testing Library, Playwright, Bun.

## Global Constraints

- Repo: `ShinyQ/ShinyQ-HQ`, planned against `main` @ `e2a6c53`. Read `AGENTS.md` (Hard rules, Content style, Public-safety lint, Ask the HQ) and `README.md` before starting.
- Owner request (verbatim): "Also have the web documented my projects https://mii-microsoft.azurewebsites.net and https://mii-microsoft-ai.azurewebsites.net".
- Slugs, ids, room ids and URLs MUST NOT change: `solutions-marketing-site` and `ai-solutions-assistant` stay (`/{locale}/labs/solutions-marketing-site`, `L3:ai-solutions-assistant`).
- Live link field: optional, https only, host in `PUBLIC_LIVE_HOSTS` (exactly `mii-microsoft.azurewebsites.net` and `mii-microsoft-ai.azurewebsites.net`), site root only (no path such as `/dashboard`, no query, no hash, no credentials, no port). Internal apps (the vendor portal, internal assistants such as SITA, admin dashboards) must never get a link; adding a host is an owner decision made in code review, never a content-only edit.
- "Visit live site" (ID: "Kunjungi situs live") always opens a new tab with `target="_blank"` and `rel="noopener noreferrer"`, shows an external-link icon (`aria-hidden`) and a screen reader hint from `common.external` ("opens in a new tab" / "terbuka di tab baru").
- Glass Drawer footer order (round-3 convention): primary action ("Read case study"), then "Visit live site", then the cross-floor link (amber), then View architecture.
- Title Case for titles (`titleCase` in `src/content/title-case.ts`, both locales); the new titles are already in Title Case.
- No client company names anywhere (C3). Employer and product names are fine: MII, Metrodata, Microsoft Solutions, Microsoft AI. Never claim work the owner did not do; role stays "Sole engineer" (owner-confirmed).
- Copy sources are read-only: `/Users/shinyq/Workspace/Work/AI-ME-MII-Microsoft-Web` (MII-Microsoft-Data-AI/AI-ME-MII-Microsoft-Web) and `/Users/shinyq/Workspace/Work/AI-ME-MII-Web-Portofolio` (MII-Microsoft-Data-AI/AI-ME-MII-Microsoft-AI-Web). Never modify them, never `git pull` them, never quote their private resource names (App Service plan, API app, resource groups) in this repo.
- Ask the HQ never ships the hostnames: `FORBIDDEN_OUTPUT` in `functions/_lib/checks.ts` blocks `.azurewebsites.net` in answers and red-team item `rt39` expects that. Golden and pack facts use the site names, not the URLs.
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text. Every content string stays `{ en, id }`; UI strings live in `messages/en.json` and `messages/id.json` with identical keys.
- Gallery first (`orderPods` / `comparePods`): never hard-code slugs to reorder; ordering follows `tier`, `order` and the gallery.
- `tests/content/dataset.test.ts` allows at most 6 featured pods per wing. Promoting the solutions site to `featured` in Product Engineering makes 7, so this plan demotes `event-tech-search-backend` (featured, order 8, no gallery, 2023 freelance) to `listed`. It keeps its page, its L2 career link and its place on the Product Engineering board; only its L3 dock moves to the board. Flag it in the PR for the owner.
- Coordination: a parallel plan builds the L1 "Highlights Hall"; its top-3 projects station consumes `podLiveLink(pod)` and `LabPod.liveUrl` from this plan. Do not touch `src/experience/floors/lobby/**`.
- Bun is the package manager. Prefix git with `rtk` (`rtk git add`, `rtk git commit`). Conventional commits. One PR; do not merge without the owner.
- `site-content.json` is written as `JSON.stringify(data, null, 2) + "\n"` (byte-identical round trip, verified by the round-3 plan), so the scripted edit in Task 3 keeps formatting.

---

## Before you start

- [ ] Work in your own checkout (never the read-only reference clone `files/hq-local`), branched from the latest `main`:

```bash
rtk git fetch origin && rtk git switch -c feat/r4-live-links-mii-microsoft origin/main
bun install
```

- [ ] If `main` moved past `e2a6c53`, re-run these checks; the Task 3 script refuses to run when the starting titles differ:

```bash
jq -r '.floors.labs.pods[] | select(.id=="solutions-marketing-site" or .id=="ai-solutions-assistant" or .id=="event-tech-search-backend") | [.id,.wing,.tier,.order,.title.en] | @tsv' content/site-content.json
```

Expected:

```
event-tech-search-backend	software	featured	8	Event Matchmaking and Feedback Analytics
ai-solutions-assistant	ai	featured	7	Bilingual RAG Assistant with Citations
solutions-marketing-site	ai	listed	17	Bilingual AI Solutions Site
```

## Decisions made in this plan

| Question | Decision | Why |
|---|---|---|
| `links: [{ kind, url, label }]` or a single field? | `Pod.liveUrl?: string` | The schema uses flat optional URL fields everywhere (`SideProject.url` / `repo`, `TimelineEntry.url`, `Publication.pdf` / `code`, `Certification.credentialUrl`). Only live links exist today (YAGNI). |
| Where is the host allowlist? | `PUBLIC_LIVE_HOSTS` in `src/content/live-links.ts`, enforced by `PodSchema` and re-checked by `podLiveLink` | Schema failure stops `getContent()`, `validate:content` and the build; the selector check protects the 3D payload too. |
| The safety lint forbids `.azurewebsites.net` | New `leafForbiddenPatterns(leaf)` exempts only a `[n].liveUrl` leaf whose URL passes `isPublicLiveUrl`; the same host anywhere else (taglines, alt text, messages) still fails | Keeps the rule's intent (no resource hostnames in copy) while allowing the two owner-approved links. |
| The private blocklist (local file, CI secret) may name the app names | Add `mii-microsoft` and `mii-microsoft-ai` to `content/safety-allowlist.txt` | `loadBlocklist` drops plain terms equal to an allowlist entry, so neither the content test nor `e2e/deploy.spec.ts` (`scanBuildOutput`) can flag the public URLs; other names (the API app, the plan) stay blocked. |
| Ask and URLs | Pack chunks say "Live site: public; the case study page links to it." plus site keywords; golden q31 asks for the names | Ask output checks reject Azure hostnames, so a URL answer would be blocked. |
| Solutions site order in Product Engineering | `order: 11` | Appends to the wing; gallery-first puts it third on the road (after the two featured gallery pods), so both wings keep 9 docked pods and stay mirror images. |
| AI site theme claim | "dark and light themes" | The repo switched from dark-by-default to following the OS (`defaultTheme="system"`); both themes are designed. |

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/content/live-links.ts` | Create | `PUBLIC_LIVE_HOSTS`, `liveUrlProblem(url)`, `isPublicLiveUrl(url)`: the public live link rules. Pure, no imports. |
| `src/content/schema.ts` | Modify | `Pod.liveUrl` (optional https URL) checked with `liveUrlProblem` in the `PodSchema` refinement. |
| `src/content/safety.ts` | Modify | `leafForbiddenPatterns(leaf)`: forbidden patterns per dataset leaf, with the allowlisted `liveUrl` exemption. |
| `scripts/validate-fragment.ts` | Modify | Uses `leafForbiddenPatterns`. |
| `content/safety-allowlist.txt` | Modify | `mii-microsoft`, `mii-microsoft-ai`. |
| `content/site-content.json` | Modify | Two pods renamed and refreshed with `liveUrl`; solutions site to `software` / `featured` / order 11; `event-tech-search-backend` to `listed`. |
| `content/ask/suggestions.json` | Modify | The `ai-solutions-assistant` pill names the MII Microsoft AI portfolio. |
| `src/content/selectors.ts` | Modify | `PodLiveLink`, `podLiveLink(pod)`. |
| `src/experience/types.ts`, `src/content/experience.ts` | Modify | `LabPod.liveUrl` in the 3D payload (L1 Highlights Hall, L3). |
| `src/content/room-views/types.ts`, `src/content/room-views/labs.ts` | Modify | `RoomView.live` for pods. |
| `src/lib/jsonld.ts` | Modify | Pod CreativeWork gets `sameAs: [liveUrl]`. |
| `src/components/LiveSiteLink.tsx` | Create | `LiveSiteLink` and `ExternalIcon`, no hooks (server pages and the client drawer). |
| `messages/en.json`, `messages/id.json` | Modify | `common.visitLive`. |
| `src/app/[locale]/labs/[slug]/page.tsx` | Modify | Primary "Visit live site" button under the tagline. |
| `src/components/page/Work.tsx`, `src/components/page/Featured.tsx` | Modify | `PodLiveCta` on rows and cards, lifted over the stretched title link. |
| `src/hud/drawer/RoomDrawer.tsx` | Modify | Footer "Visit live site" right of "Read case study". |
| `src/ask/pack.ts` | Modify | Live site line and keywords in project chunks (no hostname). |
| `tests/ask/golden.json`, `tests/ask/pipeline.test.ts` | Modify | q31, 31 items, threshold 29. |
| `tests/unit/live-links.test.ts` | Create | Allowlist rules. |
| `tests/hud/LiveSiteLink.test.tsx` | Create | Link attributes and accessible name. |
| `tests/unit/schema.test.ts`, `tests/unit/safety.test.ts`, `tests/content/safety.test.ts`, `tests/content/dataset.test.ts`, `tests/unit/labs-layout.test.ts`, `tests/unit/selectors.test.ts`, `tests/unit/experience-data.test.ts`, `tests/unit/room-views.test.ts`, `tests/unit/seo.test.ts`, `tests/hud/RoomDrawer.test.tsx`, `tests/ask/pack.test.ts` | Modify | Guards described per task. |
| `e2e/routes.ts`, `e2e/pageview.spec.ts`, `e2e/labs.spec.ts`, `e2e/screenshots.spec.ts` | Modify | `livePods`; page, rows and drawer open a new tab without an opener; opt-in captures. |
| `AGENTS.md`, `README.md`, `docs/ask-runbook.md`, `scripts/ask-eval.ts` (comment), `docs/superpowers/specs/agent-hq/06-data-contracts.md`, `docs/superpowers/specs/agent-hq/07-content-map.md` | Modify | Field, selector, lint exemption, drawer footer, golden count, content map. |
| `docs/superpowers/plans/2026-10-12-live-links-mii-microsoft.md` | Create | Copy of this plan (repo convention). |

Deliberately unchanged: slugs, `src/experience/floors/labs/layout.ts` (docking derives from content), `src/lib/og-cards.ts` (OG cards read titles from content at build time), `functions/_lib/checks.ts` (Azure hostnames stay forbidden in Ask answers), the anime e-commerce pod (its shop is also live, but the owner asked for the two MII sites only; adding a host is a later owner decision).

---

### Task 1: Live link rules and the `Pod.liveUrl` schema field

**Files:**
- Create: `src/content/live-links.ts`
- Modify: `src/content/schema.ts:3-10` (header comment), `src/content/schema.ts:168-201` (`PodSchema`)
- Test: `tests/unit/live-links.test.ts` (create), `tests/unit/schema.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PUBLIC_LIVE_HOSTS: readonly string[]` (`["mii-microsoft.azurewebsites.net", "mii-microsoft-ai.azurewebsites.net"]`)
  - `liveUrlProblem(url: string): string | null` (null when valid)
  - `isPublicLiveUrl(url: string): boolean`
  - `Pod["liveUrl"]: string | undefined` (via `z.infer`)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/live-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPublicLiveUrl, liveUrlProblem, PUBLIC_LIVE_HOSTS } from "@/content/live-links";

describe("public live links (R4-J)", () => {
  it("allows exactly the two public MII Microsoft sites", () => {
    expect([...PUBLIC_LIVE_HOSTS].sort()).toEqual(["mii-microsoft-ai.azurewebsites.net", "mii-microsoft.azurewebsites.net"]);
  });

  it.each(["https://mii-microsoft.azurewebsites.net", "https://mii-microsoft-ai.azurewebsites.net/"])("accepts the site root %s", (url) => {
    expect(liveUrlProblem(url)).toBeNull();
    expect(isPublicLiveUrl(url)).toBe(true);
  });

  it.each([
    ["http://mii-microsoft.azurewebsites.net", "https"],
    ["https://vendor-portal.azurewebsites.net", "PUBLIC_LIVE_HOSTS"],
    ["https://mii-microsoft.azurewebsites.net.evil.example", "PUBLIC_LIVE_HOSTS"],
    ["https://mii-microsoft-ai.azurewebsites.net/dashboard", "site root"],
    ["https://mii-microsoft.azurewebsites.net/?ref=hq", "site root"],
    ["https://mii-microsoft.azurewebsites.net/#top", "site root"],
    ["https://visitor@mii-microsoft.azurewebsites.net", "credentials"],
    ["https://mii-microsoft.azurewebsites.net:8443", "credentials"],
    ["mii-microsoft.azurewebsites.net", "absolute URL"],
  ])("rejects %s", (url, reason) => {
    expect(liveUrlProblem(url)).toContain(reason);
    expect(isPublicLiveUrl(url)).toBe(false);
  });
});
```

Append to `tests/unit/schema.test.ts` (it already imports `PodSchema` and `makePod`):

```ts
describe("Pod.liveUrl (R4-J)", () => {
  it("accepts an allowlisted public site root and leaves it optional", () => {
    expect(PodSchema.safeParse(makePod({ liveUrl: "https://mii-microsoft.azurewebsites.net" })).success).toBe(true);
    expect(PodSchema.safeParse(makePod()).success).toBe(true);
  });

  it.each([
    "https://vendor-portal.azurewebsites.net",
    "https://mii-microsoft-ai.azurewebsites.net/dashboard",
    "http://mii-microsoft.azurewebsites.net",
  ])("rejects %s on the liveUrl path", (liveUrl) => {
    const result = PodSchema.safeParse(makePod({ liveUrl }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["liveUrl"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/live-links.test.ts tests/unit/schema.test.ts`
Expected: FAIL. `live-links.test.ts` with `Failed to resolve import "@/content/live-links"`; `schema.test.ts` fails to compile `makePod({ liveUrl })` or reports `Unrecognized key: "liveUrl"` (strict object).

- [ ] **Step 3: Write the implementation**

Create `src/content/live-links.ts`:

```ts
/**
 * Public live links for L3 pods (`Pod.liveUrl`, R4-J). Only these hosts may ever be linked: public
 * sites the owner asked to show. Internal apps (admin dashboards, client portals, internal assistants)
 * must never get a link, so adding a host here is an owner decision made in review, never a content
 * edit. Pure and dependency-free: the schema, the safety lint, the selectors and the 3D chunk share it.
 */
export const PUBLIC_LIVE_HOSTS: readonly string[] = ["mii-microsoft.azurewebsites.net", "mii-microsoft-ai.azurewebsites.net"];

/** Why `url` cannot be a pod's live link, or null when it can: https, an allowlisted host, the site root only. */
export function liveUrlProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Live link must be an absolute URL";
  }
  if (parsed.protocol !== "https:") return "Live link must use https";
  if (parsed.username || parsed.password || parsed.port) return "Live link must not carry credentials or a port";
  if (!PUBLIC_LIVE_HOSTS.includes(parsed.hostname)) {
    return `Live link host "${parsed.hostname}" is not in PUBLIC_LIVE_HOSTS (src/content/live-links.ts)`;
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) return "Live link must point to the site root (no path, query or hash)";
  return null;
}

export function isPublicLiveUrl(url: string): boolean {
  return liveUrlProblem(url) === null;
}
```

In `src/content/schema.ts`, add the import under `import { z } from "zod";`:

```ts
import { liveUrlProblem } from "./live-links";
```

Extend the header comment line ` * Certification.code/credentialId/expires/featured and status "expired", TimelineEntry.url/confidence, Pod.client, PostRef.url,` to:

```ts
 * Certification.code/credentialId/expires/featured and status "expired", TimelineEntry.url/confidence, Pod.client, Pod.liveUrl, PostRef.url,
```

In `PodSchema`, replace

```ts
    hologram: z.enum(["waveform", "shield", "documents", "graph", "chart", "template", "pipeline"]),
    assets: z.array(AssetSchema),
  })
  .superRefine((pod, ctx) => {
```

with

```ts
    hologram: z.enum(["waveform", "shield", "documents", "graph", "chart", "template", "pipeline"]),
    assets: z.array(AssetSchema),
    /** Public live site (R4-J): https, site root only, host in `PUBLIC_LIVE_HOSTS`. Read it through `podLiveLink`. */
    liveUrl: httpsUrl.optional(),
  })
  .superRefine((pod, ctx) => {
    if (pod.liveUrl) {
      const problem = liveUrlProblem(pod.liveUrl);
      if (problem) ctx.addIssue({ code: "custom", path: ["liveUrl"], message: problem });
    }
```

(The existing hero architecture check stays below it inside the same `superRefine`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/live-links.test.ts tests/unit/schema.test.ts tests/content/dataset.test.ts`
Expected: PASS (the dataset has no `liveUrl` yet, so it stays valid).

- [ ] **Step 5: Commit**

```bash
rtk git add src/content/live-links.ts src/content/schema.ts tests/unit/live-links.test.ts tests/unit/schema.test.ts
rtk git commit -m "feat(content): optional Pod.liveUrl guarded by a public host allowlist"
```

---

### Task 2: Public-safety lint accepts allowlisted live links only

**Files:**
- Modify: `src/content/safety.ts` (after `findForbiddenPatterns`, around line 98-100), `scripts/validate-fragment.ts:39-46`, `tests/content/safety.test.ts:19-26`, `content/safety-allowlist.txt`
- Test: `tests/unit/safety.test.ts` (append two blocks)

**Interfaces:**
- Consumes: `isPublicLiveUrl(url)` from Task 1.
- Produces: `leafForbiddenPatterns(leaf: StringLeaf): string[]` in `@/content/safety`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/safety.test.ts`, add `leafForbiddenPatterns` to the existing `import { ... } from "@/content/safety";` list, then append:

```ts
describe("leafForbiddenPatterns (public live links, R4-J)", () => {
  it("exempts a pod liveUrl on an allowlisted host from the Azure hostname rule", () => {
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].liveUrl", value: "https://mii-microsoft.azurewebsites.net" })).toEqual([]);
    expect(leafForbiddenPatterns({ path: "$[0].liveUrl", value: "https://mii-microsoft-ai.azurewebsites.net" })).toEqual([]);
  });

  it("still flags other Azure hosts in liveUrl and allowlisted hosts in any other field", () => {
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].liveUrl", value: "https://vendor-portal.azurewebsites.net" })).toContain("Azure resource hostname");
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].liveUrl", value: "https://mii-microsoft-ai.azurewebsites.net/dashboard" })).toContain(
      "Azure resource hostname",
    );
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].tagline.en", value: "See https://mii-microsoft.azurewebsites.net" })).toContain(
      "Azure resource hostname",
    );
  });
});

describe("public MII Microsoft app names (R4-J)", () => {
  it("drops the two public app names from the merged blocklist but keeps other private resource names", () => {
    const terms = loadBlocklist({ SAFETY_BLOCKLIST: "mii-microsoft, mii-microsoft-ai, example-internal-api" });
    expect(terms).toContain("example-internal-api");
    expect(terms).not.toContain("mii-microsoft");
    expect(terms).not.toContain("mii-microsoft-ai");
    expect(findBlockedTerms("https://mii-microsoft-ai.azurewebsites.net", terms)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/safety.test.ts`
Expected: FAIL with `leafForbiddenPatterns is not a function` (or a TS import error), and the allowlist block fails with `expected [...] not to include 'mii-microsoft'`.

- [ ] **Step 3: Write the implementation**

In `src/content/safety.ts`, add under the existing imports:

```ts
import { isPublicLiveUrl } from "./live-links";
```

Add after `findForbiddenPatterns`:

```ts
/**
 * Forbidden patterns for one dataset string. A pod's `liveUrl` on an allowlisted public host
 * (`PUBLIC_LIVE_HOSTS`, R4-J) is exempt from the Azure hostname rule; the same host in any other
 * field, or any other host in `liveUrl`, still fails.
 */
export function leafForbiddenPatterns(leaf: StringLeaf): string[] {
  if (/\[\d+\]\.liveUrl$/.test(leaf.path) && isPublicLiveUrl(leaf.value)) return [];
  return findForbiddenPatterns(leaf.value);
}
```

In `tests/content/safety.test.ts`, change the import to include `leafForbiddenPatterns` and replace the site-content test body

```ts
    const hits = collectStrings(content).flatMap(({ path: at, value }) => {
      const found = [...findBlockedTerms(value, terms), ...findForbiddenPatterns(value)];
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
```

with

```ts
    const hits = collectStrings(content).flatMap((leaf) => {
      const found = [...findBlockedTerms(leaf.value, terms), ...leafForbiddenPatterns(leaf)];
      return found.length ? [`${leaf.path}: ${found.join(", ")}`] : [];
    });
```

(The messages test below it keeps `findForbiddenPatterns`: UI strings never carry live links.)

In `scripts/validate-fragment.ts`, change the import to

```ts
import { collectStrings, findBlockedTerms, leafForbiddenPatterns, loadBlocklist } from "../src/content/safety";
```

and replace

```ts
  const hits = [...findBlockedTerms(leaf.value, terms), ...findForbiddenPatterns(leaf.value)];
```

with

```ts
  const hits = [...findBlockedTerms(leaf.value, terms), ...leafForbiddenPatterns(leaf)];
```

Append to `content/safety-allowlist.txt`:

```
# Public App Service names of the owner's two public MII Microsoft sites (R4-J). Their URLs are
# Pod.liveUrl values on the PUBLIC_LIVE_HOSTS allowlist; other resource names stay private and blocked.
mii-microsoft
mii-microsoft-ai
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/safety.test.ts tests/content/safety.test.ts && bun run validate:content`
Expected: PASS, then `OK: content/site-content.json is a valid full fragment (N blocklist terms checked)`.

- [ ] **Step 5: Commit**

```bash
rtk git add src/content/safety.ts scripts/validate-fragment.ts content/safety-allowlist.txt tests/unit/safety.test.ts tests/content/safety.test.ts
rtk git commit -m "feat(safety): allow allowlisted public live links, keep Azure hostnames forbidden elsewhere"
```

---
### Task 3: Content: name and refresh the two MII Microsoft pods, add live links, move the solutions site to Product Engineering

**Files:**
- Modify: `content/site-content.json` (pods `solutions-marketing-site`, `ai-solutions-assistant`, `event-tech-search-backend`), `content/ask/suggestions.json` (pill `ai-solutions-assistant`)
- Create then delete (never committed): `r4j-content.ts` at the repo root
- Test: `tests/content/dataset.test.ts` (inside the existing `describe`), `tests/unit/labs-layout.test.ts` (inside `describe("L3 Project Roads layout")`)

**Interfaces:**
- Consumes: `Pod.liveUrl` (Task 1), `leafForbiddenPatterns` (Task 2), `isPublicLiveUrl` (Task 1).
- Produces (data later tasks rely on):
  - `solutions-marketing-site`: `wing "software"`, `tier "featured"`, `order 11`, `liveUrl "https://mii-microsoft.azurewebsites.net"`, title EN "MII Microsoft Solutions Website".
  - `ai-solutions-assistant`: `wing "ai"`, `tier "featured"`, `order 7`, `liveUrl "https://mii-microsoft-ai.azurewebsites.net"`, title EN "MII Microsoft AI Portfolio and Assistant".
  - `event-tech-search-backend`: `tier "listed"`.

Copy (verified against the two repos, read-only: README, AGENTS, `specs/`, `.agents/ai-architecture.md`, `frontend/package.json`, `backend/requirements.txt`, git history):

| Field | `solutions-marketing-site` before | after |
|---|---|---|
| title EN | Bilingual AI Solutions Site | MII Microsoft Solutions Website |
| title ID | Situs Solusi AI Dwibahasa | Situs Web MII Microsoft Solutions |
| wing / tier / order | ai / listed / 17 | software / featured / 11 |
| liveUrl | (none) | https://mii-microsoft.azurewebsites.net |

| Field | `ai-solutions-assistant` before | after |
|---|---|---|
| title EN | Bilingual RAG Assistant with Citations | MII Microsoft AI Portfolio and Assistant |
| title ID | Asisten RAG Dwibahasa dengan Sitasi | Portofolio dan Asisten MII Microsoft AI |
| wing / tier / order | ai / featured / 7 | unchanged |
| liveUrl | (none) | https://mii-microsoft-ai.azurewebsites.net |

The full text of every field is in the script below; results, period, role, accent, hologram, timelineRef and assets stay as they are.

- [ ] **Step 1: Write the failing content tests**

In `tests/content/dataset.test.ts`, add to the import block:

```ts
import { isPublicLiveUrl } from "@/content/live-links";
```

and insert inside `describe("content/site-content.json", ...)`, right after the `it("has 3 hero pods per wing (hologram view) and at most 6 featured per wing", ...)` block:

```ts
  it("links exactly the two public MII Microsoft sites, never an internal app (R4-J)", () => {
    const live = Object.fromEntries(pods.filter((p) => p.liveUrl).map((p) => [p.slug, p.liveUrl]));
    expect(live).toEqual({
      "solutions-marketing-site": "https://mii-microsoft.azurewebsites.net",
      "ai-solutions-assistant": "https://mii-microsoft-ai.azurewebsites.net",
    });
    for (const p of pods) if (p.liveUrl) expect(isPublicLiveUrl(p.liveUrl), p.slug).toBe(true);
    expect(pods.find((p) => p.slug === "vendor-management-portal")?.liveUrl).toBeUndefined();
  });

  it("names the MII Microsoft sites and places them in their wings (R4-J)", () => {
    const site = pods.find((p) => p.slug === "solutions-marketing-site")!;
    const ai = pods.find((p) => p.slug === "ai-solutions-assistant")!;
    expect([site.title.en, site.title.id, site.wing, site.tier, site.role.en]).toEqual([
      "MII Microsoft Solutions Website",
      "Situs Web MII Microsoft Solutions",
      "software",
      "featured",
      "Sole engineer",
    ]);
    expect([ai.title.en, ai.title.id, ai.wing, ai.tier, ai.role.en]).toEqual([
      "MII Microsoft AI Portfolio and Assistant",
      "Portofolio dan Asisten MII Microsoft AI",
      "ai",
      "featured",
      "Sole engineer",
    ]);
    expect(ai.tagline.en).toMatch(/multi-agent RAG assistant/);
    expect(ai.tagline.en).toMatch(/\/dashboard Studio/);
    expect(pods.find((p) => p.slug === "event-tech-search-backend")?.tier).toBe("listed");
  });
```

In `tests/unit/labs-layout.test.ts`, insert inside `describe("L3 Project Roads layout", ...)` after the `it("sends listed pods and overflow to the wing directory only", ...)` block:

```ts
  it("docks the MII Microsoft Solutions Website on the Product Engineering road, third in site order (R4-J)", () => {
    const software = layout.placed.filter((p) => p.pod.wing === "software").map((p) => p.pod.slug);
    const ai = layout.placed.filter((p) => p.pod.wing === "ai").map((p) => p.pod.slug);
    expect(software.slice(0, 3)).toEqual(["anime-figure-ecommerce", "vulnerability-scanning-automation", "solutions-marketing-site"]);
    expect(ai).toContain("ai-solutions-assistant");
    expect(software).toHaveLength(ai.length);
    expect(layout.directory.ai.map((p) => p.slug)).not.toContain("solutions-marketing-site");
    expect(layout.directory.software.map((p) => p.slug)).toContain("event-tech-search-backend");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/content/dataset.test.ts tests/unit/labs-layout.test.ts`
Expected: FAIL: `expected {} to deeply equal { 'solutions-marketing-site': ... }`, the title assertion shows `"Bilingual AI Solutions Site"`, and the layout test shows `solutions-marketing-site` missing from the software dock.

- [ ] **Step 3: Apply the content change with a one-off script**

Create `r4j-content.ts` at the repo root (do not commit it):

```ts
import { readFileSync, writeFileSync } from "node:fs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FILE = "content/site-content.json";
const data = JSON.parse(readFileSync(FILE, "utf8"));
const pods: Record<string, any>[] = data.floors.labs.pods;
const pod = (id: string) => {
  const found = pods.find((p) => p.id === id);
  if (!found) throw new Error(`pod ${id} not found`);
  return found;
};
const expectTitle = (p: Record<string, any>, en: string) => {
  if (p.title.en !== en) throw new Error(`${p.id}: expected title "${en}", found "${p.title.en}" (main moved; re-check the plan)`);
};

const site = pod("solutions-marketing-site");
expectTitle(site, "Bilingual AI Solutions Site");
Object.assign(site, {
  order: 11,
  tier: "featured",
  wing: "software",
  title: { en: "MII Microsoft Solutions Website", id: "Situs Web MII Microsoft Solutions" },
  tagline: {
    en: "The public bilingual website of MII's Microsoft Solutions division, covering its practices, delivered engagements, products, licensing and promotions, built from 17 written specs.",
    id: "Situs web publik dwibahasa untuk divisi Microsoft Solutions di MII, mencakup practice, engagement yang telah dikerjakan, produk, lisensi, dan promosi, dibangun dari 17 spec tertulis.",
  },
  problem: {
    en: "MII's Microsoft Solutions division needed one public site in English and Indonesian for its three practices (Microsoft 365, Azure and Power Platform), delivered engagements, MII products, device and CSP licensing catalogues and promotions, with content that stays accurate as offers change.",
    id: "Divisi Microsoft Solutions di MII membutuhkan satu situs publik dalam bahasa Inggris dan Indonesia untuk tiga practice-nya (Microsoft 365, Azure, dan Power Platform), engagement yang telah dikerjakan, produk MII, katalog perangkat dan lisensi CSP, serta promosi, dengan konten yang tetap akurat saat penawaran berubah.",
  },
  approach: [
    {
      en: "I built the site alone through 17 GitHub Spec Kit specs, from the first landing page to the practice pages, the promotions catalogue and the devices experience.",
      id: "Saya membangun situs ini sendiri melalui 17 spec GitHub Spec Kit, dari landing page pertama hingga halaman practice, katalog promosi, dan pengalaman perangkat.",
    },
    {
      en: "I kept every page as typed bilingual content validated at build time, so a missing translation or a broken content rule fails the build instead of shipping.",
      id: "Saya menyimpan setiap halaman sebagai konten dwibahasa bertipe yang divalidasi saat build, sehingga terjemahan yang hilang atau aturan konten yang dilanggar menggagalkan build alih-alih terbit.",
    },
    {
      en: "I built an outcome navigator that maps a business goal to the matching practice and capabilities, plus searchable engagement, licensing and promotion catalogues.",
      id: "Saya membangun outcome navigator yang memetakan tujuan bisnis ke practice dan kapabilitas yang sesuai, serta katalog engagement, lisensi, dan promosi yang bisa dicari.",
    },
    {
      en: "I moved media to Azure Blob Storage with a synced manifest, fixed production 404s, and shipped the standalone build to App Service with a deploy script that clears stale files and checks every route on the live site.",
      id: "Saya memindahkan media ke Azure Blob Storage dengan manifest yang tersinkron, memperbaiki error 404 di produksi, dan merilis build standalone ke App Service dengan skrip deploy yang membersihkan file lama dan memeriksa setiap route di situs live.",
    },
  ],
  stack: ["Next.js", "TypeScript", "Tailwind CSS", "Azure Blob Storage", "App Service", "GitHub Spec Kit"],
});
site.liveUrl = "https://mii-microsoft.azurewebsites.net";

const ai = pod("ai-solutions-assistant");
expectTitle(ai, "Bilingual RAG Assistant with Citations");
Object.assign(ai, {
  title: { en: "MII Microsoft AI Portfolio and Assistant", id: "Portofolio dan Asisten MII Microsoft AI" },
  tagline: {
    en: "The bilingual portfolio site of MII's Microsoft AI practice, in dark and light themes, with a multi-agent RAG assistant that answers with citations and a /dashboard Studio for content and analytics.",
    id: "Situs portofolio dwibahasa untuk praktik Microsoft AI di MII, dengan tema gelap dan terang, asisten RAG multi-agent yang menjawab dengan sitasi, dan Studio /dashboard untuk konten dan analitik.",
  },
  problem: {
    en: "MII's Microsoft AI practice needed a public portfolio of its non-confidential work, an assistant that answers only from curated content with citations and resists prompt injection within an enforceable daily budget, and a studio where the team publishes projects and reads analytics without an engineer.",
    id: "Praktik Microsoft AI di MII membutuhkan portofolio publik untuk karya yang tidak rahasia, asisten yang hanya menjawab dari konten terkurasi dengan sitasi dan tahan terhadap prompt injection dalam batas anggaran harian yang dapat ditegakkan, serta studio tempat tim menerbitkan proyek dan membaca analitik tanpa engineer.",
  },
  approach: [
    {
      en: "I built the bilingual Next.js site and its BFF: a dark and light themed portfolio with a project matcher that ranks published projects for a visitor's business challenge.",
      id: "Saya membangun situs Next.js dwibahasa beserta BFF-nya: portofolio bertema gelap dan terang dengan project matcher yang mengurutkan proyek yang sudah terbit sesuai tantangan bisnis pengunjung.",
    },
    {
      en: "I built the assistant on a FastAPI backend: a deterministic router and three YAML agents using Microsoft Agent Framework, with a guarded fallback tier when a model path fails.",
      id: "Saya membangun asisten di backend FastAPI: router deterministik dan tiga YAML agent menggunakan Microsoft Agent Framework, dengan tier fallback yang terjaga saat jalur model gagal.",
    },
    {
      en: "I combined Cosmos DB vector search and Azure AI Search hybrid retrieval with citation gating, Prompt Shields and sentence-level output checks.",
      id: "Saya menggabungkan vector search Cosmos DB dan hybrid retrieval Azure AI Search dengan citation gating, Prompt Shields, serta pemeriksaan output per kalimat.",
    },
    {
      en: "I built the /dashboard Studio behind Microsoft Entra ID: a project catalogue editor, document indexing, consultation reservations, cookieless analytics and reviews of assistant conversations.",
      id: "Saya membangun Studio /dashboard di balik Microsoft Entra ID: editor katalog proyek, pengindeksan dokumen, reservasi konsultasi, analitik tanpa cookie, dan peninjauan percakapan asisten.",
    },
    {
      en: "I fixed production failures that were not being surfaced: broken stream framing, telemetry reporting zero requests and a daily spend cap that undercounted tokens.",
      id: "Saya memperbaiki kegagalan produksi yang tidak terdeteksi: framing stream yang membuat asisten tidak berfungsi, telemetry yang melaporkan nol request, dan spend cap harian yang menghitung token terlalu rendah.",
    },
  ],
  stack: ["Next.js", "FastAPI", "Microsoft Agent Framework", "Cosmos DB", "Azure AI Search", "Azure OpenAI", "Azure AI Content Safety", "Microsoft Entra ID", "App Service"],
});
if (!ai.architecture.nodes.some((n: { id: string }) => n.id === "studio")) {
  ai.architecture.nodes.push({ id: "studio", label: "Studio dashboard", sublabel: { en: "Entra ID admin", id: "Admin Entra ID" }, layer: 0, row: 1, kind: "client" });
  ai.architecture.edges.push({ from: "studio", to: "retrieval", label: "publish" });
}
ai.liveUrl = "https://mii-microsoft-ai.azurewebsites.net";

const eventTech = pod("event-tech-search-backend");
if (eventTech.tier !== "featured") throw new Error(`event-tech-search-backend: expected featured, found ${eventTech.tier}`);
eventTech.tier = "listed";

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log("R4-J content applied");
```

Run it, then delete it:

```bash
bun r4j-content.ts && rm r4j-content.ts
rtk git diff --stat
```

Expected: `R4-J content applied`, and the diff touches only `content/site-content.json`.

- [ ] **Step 4: Update the Ask pill that names the old title**

In `content/ask/suggestions.json`, replace

```json
      "q": { "en": "How does his bilingual RAG assistant work?", "id": "Bagaimana cara kerja asisten RAG dwibahasanya?" },
```

with

```json
      "q": { "en": "How does the assistant on his MII Microsoft AI portfolio work?", "id": "Bagaimana cara kerja asisten di portofolio MII Microsoft AI miliknya?" },
```

(`id`, `tags`, `followUps` and `expect: ["project-ai-solutions-assistant"]` stay.)

- [ ] **Step 5: Run the content, layout and Ask guards**

Run:

```bash
bun run validate:content && bun scripts/title-case.ts && bunx vitest run tests/content tests/unit/labs-layout.test.ts tests/unit/walk.test.ts tests/unit/selectors.test.ts tests/unit/tech.test.ts tests/unit/room-views.test.ts tests/unit/missions-rooms.test.ts tests/ask
```

Expected: `OK: content/site-content.json is a valid full fragment`, `title-case.ts` exits 0 with no titles listed, and all Vitest files PASS (the new dataset and layout tests included; `tests/ask/suggestions.test.ts` still finds `project-ai-solutions-assistant` for the new pill text in EN and ID; `tests/unit/tech.test.ts` resolves every new stack name: TypeScript, Tailwind CSS and FastAPI have logos, Microsoft Entra ID is in `TEXT_ONLY_TECH`). If `suggestions.test.ts` reports that the new pill no longer retrieves `project-ai-solutions-assistant`, use this wording instead (every content word is in that chunk's title or tagline) and re-run: EN "How does the multi-agent RAG assistant on his MII Microsoft AI portfolio work?", ID "Bagaimana cara kerja asisten RAG multi-agent di portofolio MII Microsoft AI miliknya?".

- [ ] **Step 6: Confirm no test or spec matches the old titles**

Run: `rg -n "Bilingual AI Solutions Site|Bilingual RAG Assistant with Citations|Situs Solusi AI Dwibahasa|Asisten RAG Dwibahasa dengan Sitasi" --glob '!docs/superpowers/plans/**' .`
Expected: no output (old plans keep their history).

- [ ] **Step 7: Commit**

```bash
rtk git add content/site-content.json content/ask/suggestions.json tests/content/dataset.test.ts tests/unit/labs-layout.test.ts
rtk git commit -m "feat(content): name the MII Microsoft sites, add live links, move the solutions site to Product Engineering"
```

---

### Task 4: `podLiveLink` and live links in derived data (3D payload, drawer views, JSON-LD)

**Files:**
- Modify: `src/content/selectors.ts` (imports, new export after `clientKeywords`), `src/experience/types.ts:99-112` (`LabPod`), `src/content/experience.ts:28-41` (`labPods`), `src/content/room-views/types.ts` (`RoomView`), `src/content/room-views/labs.ts` (`podView`), `src/lib/jsonld.ts:47-69` (`podJsonLd`)
- Test: `tests/unit/selectors.test.ts`, `tests/unit/experience-data.test.ts`, `tests/unit/room-views.test.ts`, `tests/unit/seo.test.ts`

**Interfaces:**
- Consumes: `isPublicLiveUrl` (Task 1); real `liveUrl` data (Task 3).
- Produces:
  - `interface PodLiveLink { href: string; host: string }` and `podLiveLink(pod: { liveUrl?: string }): PodLiveLink | null` in `@/content/selectors`. Works on `Pod` and on the 3D `LabPod`. The parallel L1 Highlights Hall plan calls it for its top-3 projects station.
  - `LabPod.liveUrl?: string` (only set when the pod has one).
  - `RoomView.live?: string` (absolute https URL, already allowlisted).
  - `podJsonLd(pod, locale).sameAs: string[]` when the pod has a live site.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/selectors.test.ts`, change the selectors import to

```ts
import { adjacent, comparePods, groupEntriesByYear, orderPods, podHasGallery, podLiveLink, sortTimeline, type PodRank } from "@/content/selectors";
```

and append:

```ts
describe("podLiveLink (R4-J)", () => {
  it("returns the public site and its host", () => {
    expect(podLiveLink(makePod({ liveUrl: "https://mii-microsoft.azurewebsites.net" }))).toEqual({
      href: "https://mii-microsoft.azurewebsites.net",
      host: "mii-microsoft.azurewebsites.net",
    });
  });

  it("returns null without a link, or for a host outside the allowlist (stale or hand-made payloads)", () => {
    expect(podLiveLink(makePod())).toBeNull();
    expect(podLiveLink({ liveUrl: "https://internal-portal.azurewebsites.net" })).toBeNull();
    expect(podLiveLink({ liveUrl: "https://mii-microsoft-ai.azurewebsites.net/dashboard" })).toBeNull();
  });

  it("finds exactly the two MII Microsoft sites in the dataset", () => {
    expect(getPods().filter((p) => podLiveLink(p)).map((p) => p.slug).sort()).toEqual(["ai-solutions-assistant", "solutions-marketing-site"]);
  });
});
```

Append inside `describe("buildExperienceData", ...)` in `tests/unit/experience-data.test.ts`:

```ts
  it("carries live links to the 3D chunk only for pods that have one (R4-J)", () => {
    const pods = buildExperienceData("en", names).labs.pods;
    expect(pods.filter((p) => p.liveUrl).map((p) => [p.slug, p.liveUrl])).toEqual(
      expect.arrayContaining([
        ["solutions-marketing-site", "https://mii-microsoft.azurewebsites.net"],
        ["ai-solutions-assistant", "https://mii-microsoft-ai.azurewebsites.net"],
      ]),
    );
    expect(pods.filter((p) => p.liveUrl)).toHaveLength(2);
    expect(pods.filter((p) => !p.liveUrl).every((p) => !("liveUrl" in p))).toBe(true);
  });
```

In `tests/unit/room-views.test.ts`, add imports:

```ts
import { podView } from "@/content/room-views/labs";
import { makePod } from "../fixtures/minimal-content";
```

and append a new block at the end of the file:

```ts
describe("pod live links (R4-J)", () => {
  it("gives a pod view the live site exactly when the pod has one", () => {
    for (const locale of LOCALES) {
      const views = buildRoomViews(locale);
      for (const pod of getPods()) expect(views[`L3:${pod.slug}`].live, pod.slug).toBe(pod.liveUrl);
    }
    expect(podView(makePod({ liveUrl: "https://mii-microsoft-ai.azurewebsites.net" }), "en").live).toBe("https://mii-microsoft-ai.azurewebsites.net");
    expect(podView(makePod(), "en").live).toBeUndefined();
  });
});
```

In `tests/unit/seo.test.ts`, append inside `describe("JSON-LD", ...)`:

```ts
  it("links a pod's public live site with sameAs, and only then (R4-J)", () => {
    const live = floors.labs.pods.find((p) => p.liveUrl)!;
    expect(podJsonLd(live, "en").sameAs).toEqual([live.liveUrl]);
    expect(podJsonLd(floors.labs.pods.find((p) => !p.liveUrl)!, "en")).not.toHaveProperty("sameAs");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/selectors.test.ts tests/unit/experience-data.test.ts tests/unit/room-views.test.ts tests/unit/seo.test.ts`
Expected: FAIL: `podLiveLink is not a function` / not exported, `expected [] to have a length of 2`, `.live` is `undefined` for `solutions-marketing-site`, and `sameAs` is `undefined`.

- [ ] **Step 3: Write the implementation**

`src/content/selectors.ts`: add the import after the existing ones

```ts
import { isPublicLiveUrl } from "./live-links";
```

and add after `clientKeywords`:

```ts
/** A pod's public live site, for every "Visit live site" surface (case study, rows, Glass Drawer, L1 Highlights Hall). */
export interface PodLiveLink {
  href: string;
  /** Host name for compact labels, e.g. "mii-microsoft.azurewebsites.net". */
  host: string;
}

/**
 * The live link of a `Pod` or a 3D `LabPod`, or null. Re-checks `PUBLIC_LIVE_HOSTS` so a stale or
 * hand-built payload can never render a link to an internal app.
 */
export function podLiveLink(pod: { liveUrl?: string }): PodLiveLink | null {
  if (!pod.liveUrl || !isPublicLiveUrl(pod.liveUrl)) return null;
  return { href: pod.liveUrl, host: new URL(pod.liveUrl).hostname };
}
```

`src/experience/types.ts`, in `LabPod` after `hasGallery: boolean;`:

```ts
  /** Public live site (R4-J), only on pods that have one; read it with `podLiveLink`. */
  liveUrl?: string;
```

`src/content/experience.ts`, in `labPods`, replace

```ts
    hasGallery: podHasGallery(p),
  }));
```

with

```ts
    hasGallery: podHasGallery(p),
    ...(podLiveLink(p) ? { liveUrl: p.liveUrl } : {}),
  }));
```

and extend that file's import `import { FIRST_CORRIDOR_YEAR, podHasGallery } from "./selectors";` to

```ts
import { FIRST_CORRIDOR_YEAR, podHasGallery, podLiveLink } from "./selectors";
```

`src/content/room-views/types.ts`, in `RoomView` after `external?: string;`:

```ts
  /** Pods with a public live site (R4-J): "Visit live site" in the footer, new tab. Already allowlisted. */
  live?: string;
```

`src/content/room-views/labs.ts`: change `import { clientLabel } from "../selectors";` to

```ts
import { clientLabel, podLiveLink } from "../selectors";
```

and in `podView`, after `page: \`/labs/${pod.slug}\`,` add:

```ts
    live: podLiveLink(pod)?.href,
```

`src/lib/jsonld.ts`: add `import { podLiveLink } from "@/content/selectors";` and in `podJsonLd` replace

```ts
  const url = absoluteUrl(localePath(locale, `/labs/${pod.slug}`));
  return {
```

with

```ts
  const url = absoluteUrl(localePath(locale, `/labs/${pod.slug}`));
  const live = podLiveLink(pod);
  return {
```

and after `keywords: pod.stack.join(", "),` add:

```ts
    ...(live ? { sameAs: [live.href] } : {}),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/selectors.test.ts tests/unit/experience-data.test.ts tests/unit/room-views.test.ts tests/unit/seo.test.ts tests/unit/labs-layout.test.ts tests/unit/walk.test.ts tests/unit/missions-host3d.test.ts && bun run typecheck`
Expected: PASS; `tsc` reports no errors (existing `LabPod` fixtures stay valid because `liveUrl` is optional).

- [ ] **Step 5: Commit**

```bash
rtk git add src/content/selectors.ts src/experience/types.ts src/content/experience.ts src/content/room-views/types.ts src/content/room-views/labs.ts src/lib/jsonld.ts tests/unit/selectors.test.ts tests/unit/experience-data.test.ts tests/unit/room-views.test.ts tests/unit/seo.test.ts
rtk git commit -m "feat(content): podLiveLink selector, live links in the 3D payload, drawer views and JSON-LD"
```

---
### Task 5: Page View: "Visit live site" on the case study page and the project rows and cards

**Files:**
- Create: `src/components/LiveSiteLink.tsx`, `tests/hud/LiveSiteLink.test.tsx`
- Modify: `messages/en.json` and `messages/id.json` (`common`), `src/app/[locale]/labs/[slug]/page.tsx` (imports, header after the tagline), `src/components/page/Work.tsx` (new `PodLiveCta`, `WorkFeature`, `WorkRow`), `src/components/page/Featured.tsx` (after the tagline), `e2e/routes.ts`, `e2e/pageview.spec.ts`

**Interfaces:**
- Consumes: `podLiveLink(pod)` (Task 4); real `liveUrl` data (Task 3).
- Produces:
  - `LiveSiteLink({ href, label, srHint, className?, testId? })` and `ExternalIcon({ className? })` from `@/components/LiveSiteLink` (no hooks; usable in server components and in the client drawer). Every rendered link carries `data-live-link=""`.
  - `PodLiveCta({ pod, locale, className? })` (async server component) from `@/components/page/Work`.
  - Message key `common.visitLive` (EN "Visit live site", ID "Kunjungi situs live").
  - `livePods` from `e2e/routes.ts` (`{ slug, tier, wing, liveUrl?: string }[]`, only pods with a live link).

- [ ] **Step 1: Write the failing component test**

Create `tests/hud/LiveSiteLink.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { LiveSiteLink } from "@/components/LiveSiteLink";

afterEach(cleanup);

describe("LiveSiteLink (R4-J)", () => {
  it("opens the site in a new tab without an opener, with an icon and a screen reader hint", () => {
    render(<LiveSiteLink href="https://mii-microsoft.azurewebsites.net" label={en.common.visitLive} srHint={en.common.external} />);
    const link = screen.getByRole("link", { name: "Visit live site (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://mii-microsoft.azurewebsites.net");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("data-live-link", "");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is labelled in Indonesian too", () => {
    render(<LiveSiteLink href="https://mii-microsoft-ai.azurewebsites.net" label={id.common.visitLive} srHint={id.common.external} />);
    expect(screen.getByRole("link", { name: "Kunjungi situs live (terbuka di tab baru)" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/hud/LiveSiteLink.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/LiveSiteLink"` (and `en.common.visitLive` is undefined).

- [ ] **Step 3: Add the messages and the component**

In `messages/en.json`, inside `"common"`, after `"external": "opens in a new tab",` add:

```json
    "visitLive": "Visit live site",
```

In `messages/id.json`, inside `"common"`, after `"external": "terbuka di tab baru",` add:

```json
    "visitLive": "Kunjungi situs live",
```

Create `src/components/LiveSiteLink.tsx`:

```tsx
/** External-link icon (a box with an arrow), drawn as SVG so no font glyph is needed. */
export function ExternalIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/**
 * "Visit live site" (R4-J): a pod's public site in a new tab with `rel="noopener noreferrer"`, the
 * external icon and a screen reader hint. No hooks, so server pages and the client Glass Drawer share
 * it. Pass `podLiveLink(pod).href` (or `RoomView.live`), never a raw content string.
 */
export function LiveSiteLink({
  href,
  label,
  srHint,
  className,
  testId,
}: {
  href: string;
  label: string;
  srHint: string;
  className?: string;
  testId?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} data-live-link="" data-testid={testId}>
      <span>{label}</span>
      <ExternalIcon />
      <span className="sr-only"> ({srHint})</span>
    </a>
  );
}
```

- [ ] **Step 4: Run the component and copy tests**

Run: `bunx vitest run tests/hud/LiveSiteLink.test.tsx tests/unit/ui-copy.test.ts tests/content/fonts.test.ts`
Expected: PASS (keys aligned in both locales, ASCII only).

- [ ] **Step 5: Write the failing e2e test**

In `e2e/routes.ts`, change the pods type in `interface Content` to

```ts
    labs: { pods: { slug: string; tier: string; wing: string; liveUrl?: string }[] };
```

and add after `hostedPost`:

```ts
/** Pods with a public live site (R4-J); `Pod.liveUrl` is allowlisted by the schema. */
export const livePods = content.floors.labs.pods.filter((p) => p.liveUrl);
```

In `e2e/pageview.spec.ts`, change `import { content, firstEntry, heroPod, hostedPost } from "./routes";` to

```ts
import { content, firstEntry, heroPod, hostedPost, livePods } from "./routes";
```

and append at the end of the file:

```ts
/** Stand-in for the public sites so the suite never depends on the network. */
const LIVE_SITE = /^https:\/\/mii-microsoft(?:-ai)?\.azurewebsites\.net\//;

test("Visit live site opens the public site in a new tab without an opener, on the case study and in the Work index", async ({ page, context }) => {
  expect(livePods.map((p) => p.slug).sort()).toEqual(["ai-solutions-assistant", "solutions-marketing-site"]);
  await context.route(LIVE_SITE, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Live site stub</title>" }));

  for (const pod of livePods) {
    await openPage(page, staticTier(`/en/labs/${pod.slug}`));
    const cta = page.locator("main").getByRole("link", { name: /^Visit live site/ });
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveAttribute("href", pod.liveUrl!);
    await expect(cta).toHaveAttribute("target", "_blank");
    await expect(cta).toHaveAttribute("rel", "noopener noreferrer");
    const [popup] = await Promise.all([page.waitForEvent("popup"), cta.click()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).origin).toBe(new URL(pod.liveUrl!).origin);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
  }
  await expectNoSeriousViolations(page);

  await openPage(page, staticTier("/en/labs/vendor-management-portal"));
  await expect(page.locator("[data-live-link]")).toHaveCount(0);

  await openPage(page, staticTier("/en/labs"));
  const rowLinks = page.locator("#all-projects [data-live-link]");
  await expect(rowLinks).toHaveCount(livePods.length);
  expect((await rowLinks.evaluateAll((els) => els.map((el) => el.getAttribute("href")))).sort()).toEqual(livePods.map((p) => p.liveUrl).sort());
  // The link sits above the row's stretched title link: clicking it opens the site, not the case study.
  const [popup] = await Promise.all([page.waitForEvent("popup"), rowLinks.first().click()]);
  await popup.close();
  await expect(page).toHaveURL(/\/en\/labs\?tier=static$/);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `bun run build && bunx playwright test e2e/pageview.spec.ts -g "Visit live site"`
Expected: FAIL at `expect(cta).toHaveCount(1)` (received 0).

- [ ] **Step 7: Render the link on the case study page, the rows and the cards**

`src/app/[locale]/labs/[slug]/page.tsx`: add the imports

```tsx
import { LiveSiteLink } from "@/components/LiveSiteLink";
```

and change `import { adjacent, clientLabel } from "@/content/selectors";` to

```tsx
import { adjacent, clientLabel, podLiveLink } from "@/content/selectors";
```

In `PodPage`, after `const images = toGalleryImages(pod.assets, locale);` add:

```tsx
  const live = podLiveLink(pod);
```

and replace

```tsx
            <p className="pv-lead mt-6">{pod.tagline[locale]}</p>
          </div>
```

with

```tsx
            <p className="pv-lead mt-6">{pod.tagline[locale]}</p>
            {live && (
              <p className="mt-8">
                <LiveSiteLink href={live.href} label={tc("visitLive")} srHint={tc("external")} className="pv-btn pv-btn-primary" />
              </p>
            )}
          </div>
```

`src/components/page/Work.tsx`: change the selectors import to `import { clientLabel, podLiveLink } from "@/content/selectors";`, add `import { LiveSiteLink } from "../LiveSiteLink";`, and add before `WorkFeature`:

```tsx
/**
 * "Visit live site" on a project card or row (R4-J). `relative z-10` lifts it over the card's
 * stretched title link (`pv-stretch`), so both stay clickable. Renders nothing without a live site.
 */
export async function PodLiveCta({ pod, locale, className = "" }: { pod: Pod; locale: Locale; className?: string }) {
  const live = podLiveLink(pod);
  if (!live) return null;
  const tc = await getTranslations({ locale, namespace: "common" });
  return (
    <LiveSiteLink
      href={live.href}
      label={tc("visitLive")}
      srHint={tc("external")}
      className={`pv-uline relative z-10 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-ink hover:text-cyan ${className}`}
    />
  );
}
```

In `WorkFeature`, replace

```tsx
      <p className="pv-body">{pod.tagline[locale]}</p>
      {size === "lead" && first && (
```

with

```tsx
      <p className="pv-body">{pod.tagline[locale]}</p>
      <PodLiveCta pod={pod} locale={locale} />
      {size === "lead" && first && (
```

In `WorkRow`, replace

```tsx
        <div className="mt-3">
          <TechLogoRow items={pod.stack} max={8} />
        </div>
      </div>
```

with

```tsx
        <div className="mt-3">
          <TechLogoRow items={pod.stack} max={8} />
        </div>
        <PodLiveCta pod={pod} locale={locale} className="mt-2" />
      </div>
```

`src/components/page/Featured.tsx`: add `import { PodLiveCta } from "./Work";` and replace

```tsx
      <p className="pv-body">{pod.tagline[locale]}</p>
      {result && (
```

with

```tsx
      <p className="pv-body">{pod.tagline[locale]}</p>
      <PodLiveCta pod={pod} locale={locale} />
      {result && (
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `bun run typecheck && bun run lint && bun run build && bunx playwright test e2e/pageview.spec.ts e2e/static-routes.spec.ts e2e/gallery.spec.ts`
Expected: PASS, including the new test and the existing axe checks per template (`TEMPLATES`), filters and gallery cards.

- [ ] **Step 9: Commit**

```bash
rtk git add src/components/LiveSiteLink.tsx tests/hud/LiveSiteLink.test.tsx messages/en.json messages/id.json "src/app/[locale]/labs/[slug]/page.tsx" src/components/page/Work.tsx src/components/page/Featured.tsx e2e/routes.ts e2e/pageview.spec.ts
rtk git commit -m "feat(pageview): Visit live site on the case study page and project rows"
```

---

### Task 6: Glass Drawer footer: "Visit live site" right of "Read case study"

**Files:**
- Modify: `src/hud/drawer/RoomDrawer.tsx` (imports, the doc comment above `RoomDrawer` around line 410, `hasFooter` around line 562, the footer around lines 704-740), `tests/hud/RoomDrawer.test.tsx`, `e2e/labs.spec.ts`, `e2e/screenshots.spec.ts`

**Interfaces:**
- Consumes: `RoomView.live` (Task 4), `LiveSiteLink` and `common.visitLive` (Task 5), `livePods` (Task 5).
- Produces: footer element `data-testid="drawer-live-link"`; footer order `[primary, live, cross-floor link, View architecture]`.

- [ ] **Step 1: Write the failing component tests**

In `tests/hud/RoomDrawer.test.tsx`, after `const skills = views["L1:skills"];` add:

```tsx
const liveView = views["L3:solutions-marketing-site"];
```

Add a test inside `describe("RoomDrawer", ...)`:

```tsx
  it("puts Visit live site right after Read case study and before the cross-floor link, in a new tab (R4-J)", () => {
    render(<Harness view={liveView} />);
    const footer = screen.getByTestId("drawer-footer");
    const visit = within(footer).getByRole("link", { name: `${en.common.visitLive} (${en.common.external})` });
    expect(footer.children[0]).toHaveTextContent(en.common.caseStudy);
    expect(footer.children[1]).toBe(visit);
    expect(visit).toHaveAttribute("href", liveView.live!);
    expect(visit).toHaveAttribute("target", "_blank");
    expect(visit).toHaveAttribute("rel", "noopener noreferrer");
    expect(footer.children[2]).toBe(within(footer).getByRole("button", { name: liveView.link!.label }));
  });

  it("shows no live link for rooms without a public site", () => {
    render(<Harness view={hero} />);
    expect(screen.queryByTestId("drawer-live-link")).toBeNull();
  });
```

In the existing test `it("uses the same footer order for every room type, custom bodies included", ...)`, replace

```tsx
      const primaries = (view.page ? 1 : 0) + (view.external ? 1 : 0);
```

with

```tsx
      const primaries = (view.page ? 1 : 0) + (view.external ? 1 : 0) + (view.live ? 1 : 0);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/hud/RoomDrawer.test.tsx`
Expected: FAIL: `Unable to find an accessible element with the role "link" and name "Visit live site (opens in a new tab)"`.

- [ ] **Step 3: Render the footer link**

In `src/hud/drawer/RoomDrawer.tsx`, add the import:

```tsx
import { LiveSiteLink } from "@/components/LiveSiteLink";
```

In the doc comment above `export function RoomDrawer`, replace

```tsx
 * then the tabs, which stick under the bar, then the tab body), and a footer row: the primary action,
 * the cross-floor link right of it (owner request: more room for the body), then View architecture.
```

with

```tsx
 * then the tabs, which stick under the bar, then the tab body), and a footer row: the primary action,
 * Visit live site for pods with a public site (R4-J, new tab), the cross-floor link right of them
 * (owner request: more room for the body), then View architecture.
```

Replace

```tsx
  const hasFooter = Boolean(view.page || view.external || link || showHologram);
```

with

```tsx
  const hasFooter = Boolean(view.page || view.external || view.live || link || showHologram);
```

In the footer, between the `{view.external && ( ... )}` block and the `{link && (` block, insert:

```tsx
          {view.live && (
            <LiveSiteLink
              href={view.live}
              label={tc("visitLive")}
              srHint={tc("external")}
              testId="drawer-live-link"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-cyan/50 px-3 text-[13px] font-semibold text-ink transition hover:border-cyan hover:bg-cyan/10"
            />
          )}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `bunx vitest run tests/hud/RoomDrawer.test.tsx tests/hud/LibraryRoofRooms.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the e2e drawer test**

In `e2e/labs.spec.ts`, change `import { content, heroPod } from "./routes";` to

```ts
import { content, heroPod, livePods } from "./routes";
```

and add inside `test.describe("L3 Labs in 3D", ...)`:

```ts
  test("the drawer footer offers Visit live site after Read case study and opens it in a new tab without an opener", async ({ page, context }) => {
    const pod = livePods.find((p) => p.slug === "solutions-marketing-site")!;
    await context.route(/^https:\/\/mii-microsoft(?:-ai)?\.azurewebsites\.net\//, (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Live site stub</title>" }),
    );
    await openPod(page, pod.slug);
    await waitForRoom(page, `L3:${pod.slug}`, 30_000);
    expect((await state(page)).floor).toBe("L3");
    const footer = page.getByTestId("drawer-footer");
    const items = footer.locator(":scope > *");
    await expect(items.nth(0)).toHaveText(en.common.caseStudy);
    await expect(items.nth(1)).toHaveAttribute("data-testid", "drawer-live-link");
    const visit = footer.getByTestId("drawer-live-link");
    await expect(visit).toHaveAttribute("href", pod.liveUrl!);
    await expect(visit).toHaveAttribute("target", "_blank");
    await expect(visit).toHaveAttribute("rel", "noopener noreferrer");
    const [popup] = await Promise.all([page.waitForEvent("popup"), visit.click()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).origin).toBe(new URL(pod.liveUrl!).origin);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    expect(await state(page)).toMatchObject({ phase: "room", activeRoom: `L3:${pod.slug}` });
  });
```

In `e2e/screenshots.spec.ts` (opt-in, `SCREENSHOTS=1`), append at the end of the file:

```ts
for (const vp of [
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true },
] as const) {
  test(`live site link on the case study and in the L3 drawer @ ${vp.width}x${vp.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch });
    const page = await context.newPage();
    await page.goto("/en/labs/solutions-marketing-site?tier=static");
    await expect(page.locator("main [data-live-link]").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `screenshots/live-link-page-${vp.width}x${vp.height}.png` });
    await asReturningVisitor(page);
    await page.goto("/en/labs/solutions-marketing-site?tier=lite");
    await waitForHQ(page);
    await waitForRoom(page, "L3:solutions-marketing-site");
    await expect(page.getByTestId("drawer-live-link")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `screenshots/live-link-drawer-${vp.width}x${vp.height}.png` });
    await context.close();
  });
}
```

- [ ] **Step 6: Run the e2e test**

Run: `bun run build && bunx playwright test e2e/labs.spec.ts -g "Visit live site"`
Expected: PASS (the drawer opens on the deep link because `openPod` marks the session as having seen the intro).

- [ ] **Step 7: Commit**

```bash
rtk git add src/hud/drawer/RoomDrawer.tsx tests/hud/RoomDrawer.test.tsx e2e/labs.spec.ts e2e/screenshots.spec.ts
rtk git commit -m "feat(drawer): Visit live site in the Glass Drawer footer next to Read case study"
```

---
### Task 7: Ask the HQ: live site facts without hostnames, golden question q31

**Files:**
- Modify: `src/ask/pack.ts` (import line 6, constants near `WING_NAME` line 34, the pod loop lines 239-268), `tests/ask/golden.json`, `tests/ask/pipeline.test.ts:153-155`, `tests/ask/pack.test.ts`, `scripts/ask-eval.ts:5` (comment), `docs/ask-runbook.md:173`, `README.md:56`, `AGENTS.md:128`

**Interfaces:**
- Consumes: `podLiveLink` (Task 4); new titles and `liveUrl` data (Task 3).
- Produces: project chunks `project-solutions-marketing-site` and `project-ai-solutions-assistant` with the sentence "Live site: public; the case study page links to it." (ID "Situs live: publik; halaman studi kasus menautkannya.") and keywords `live, site, sites, website, websites, situs`; golden item `q31`; golden set of 31 items with `passThreshold` 29.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ask/golden.json` `items` (after `q30`, keep one item per line like the others):

```json
    {"id": "q31", "lang": "en", "q": "What MII Microsoft sites did Kurniadi build?", "facts": ["MII Microsoft Solutions Website", "MII Microsoft AI Portfolio and Assistant"], "expect": {"any": ["mii microsoft solutions"], "any2": ["mii microsoft ai"], "none": ["azurewebsites"]}}
```

(add a comma after the `q30` line), change `"passThreshold": 28,` to `"passThreshold": 29,`, and in `$comment` change `18 benchmark questions plus 12 new.` to `18 benchmark questions plus 13 new.`

In `tests/ask/pipeline.test.ts`, replace

```ts
  it("has 30 unique items with a 28 pass threshold", () => {
    expect(golden.items).toHaveLength(30);
    expect(new Set(golden.items.map((i) => i.id)).size).toBe(30);
    expect(golden.passThreshold).toBe(28);
  });
```

with

```ts
  it("has 31 unique items with a 29 pass threshold", () => {
    expect(golden.items).toHaveLength(31);
    expect(new Set(golden.items.map((i) => i.id)).size).toBe(31);
    expect(golden.passThreshold).toBe(29);
  });
```

Append inside `describe("knowledge pack", ...)` in `tests/ask/pack.test.ts`:

```ts
  it("says the MII Microsoft sites are live without shipping their hostnames (R4-J, rt39)", () => {
    expect(JSON.stringify(pack)).not.toMatch(/azurewebsites\.net/i);
    for (const slug of ["solutions-marketing-site", "ai-solutions-assistant"]) {
      const chunk = pack.chunks.find((c) => c.id === `project-${slug}`)!;
      expect(chunk.text_en, slug).toContain("Live site: public");
      expect(chunk.text_id, slug).toContain("Situs live: publik");
      expect(chunk.keywords, slug).toEqual(expect.arrayContaining(["website", "sites", "situs"]));
    }
    const other = pack.chunks.find((c) => c.id === "project-vendor-management-portal")!;
    expect(other.text_en).not.toContain("Live site");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/ask/pack.test.ts tests/ask/pipeline.test.ts`
Expected: FAIL: the new pack test (`expected ... to contain "Live site: public"`); the drift check passes for q31 facts in the pack (the titles are in the chunk text since Task 3) but may report `retrieval no longer finds these golden facts: q31: ...` until the keywords exist.

- [ ] **Step 3: Write the implementation**

In `src/ask/pack.ts`, change `import { clientLabel } from "@/content/selectors";` to

```ts
import { clientLabel, podLiveLink } from "@/content/selectors";
```

After `const WING_NAME = { software: "Product Engineering", ai: "AI Engineering" } as const;` add:

```ts
/** Retrieval words for pods with a public live site (R4-J). The hostname itself never enters the pack: Ask output checks block Azure hostnames. */
const LIVE_KEYWORDS = ["live", "site", "sites", "website", "websites", "situs"];
```

In the `for (const pod of content.floors.labs.pods)` loop, after the `const client = ...` line add:

```ts
    const live = podLiveLink(pod);
```

replace

```ts
      keywords: ["project", pod.wing, ...pod.stack.map((s) => s.toLowerCase()), pod.hologram],
```

with

```ts
      keywords: ["project", pod.wing, ...pod.stack.map((s) => s.toLowerCase()), pod.hologram, ...(live ? LIVE_KEYWORDS : [])],
```

and replace

```ts
        label("Stack", "Stack", pod.stack.join(", ")),
      ]),
    });
  }
```

(the end of the pod chunk) with

```ts
        label("Stack", "Stack", pod.stack.join(", ")),
        live ? { en: "Live site: public; the case study page links to it.", id: "Situs live: publik; halaman studi kasus menautkannya." } : undefined,
      ]),
    });
  }
```

- [ ] **Step 4: Run the Ask tests and regenerate the pack**

Run: `bunx vitest run tests/ask && bun run build:knowledge`
Expected: all `tests/ask` files PASS (drift and retrieval checks include q31 in EN; `suggestions.test.ts` still passes), and `build-knowledge` prints the pack summary with no errors (it writes the gitignored `functions/_generated/`). If the retrieval check reports `q31` missing from the context, print the ranked chunk ids:

```bash
bun -e 'import { buildRepoPack } from "./src/ask/repo-pack"; import { retrieve } from "./functions/_lib/retrieve"; const { pack } = buildRepoPack("2026-10-12"); console.log(retrieve(pack, "What MII Microsoft sites did Kurniadi build?", "en").chunks.map((c) => c.id))'
```

Expected: the list contains `project-solutions-marketing-site` and `project-ai-solutions-assistant` (or `projects-summary`, which names both). If one is missing, add `"mii"` to `LIVE_KEYWORDS` (both live pods are MII sites) and re-run Step 4.

- [ ] **Step 5: Update the golden counts in docs and comments**

- `scripts/ask-eval.ts` line 5: ` *   bun scripts/ask-eval.ts golden    # 30 questions, fails below passThreshold (28)` to ` *   bun scripts/ask-eval.ts golden    # 31 questions, fails below passThreshold (29)`.
- `docs/ask-runbook.md` line 173: `golden set (fails below 28/30)` to `golden set (fails below 29/31)`.
- `README.md` line 56: `runs the golden set (30 questions)` to `runs the golden set (31 questions)`.
- `AGENTS.md` line 128: `golden.json (30) and redteam.json sets` to `golden.json (31) and redteam.json sets`.

Run: `rg -n "golden set \(30|golden.json \(30|28/30|30 questions" README.md AGENTS.md docs/ask-runbook.md scripts/ask-eval.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
rtk git add src/ask/pack.ts tests/ask/golden.json tests/ask/pipeline.test.ts tests/ask/pack.test.ts scripts/ask-eval.ts docs/ask-runbook.md README.md AGENTS.md
rtk git commit -m "feat(ask): live site facts for the MII Microsoft sites and golden question q31"
```

---

### Task 8: Docs: AGENTS, README, data contract, content map, plan copy

**Files:**
- Modify: `AGENTS.md`, `README.md`, `docs/superpowers/specs/agent-hq/06-data-contracts.md`, `docs/superpowers/specs/agent-hq/07-content-map.md`
- Create: `docs/superpowers/plans/2026-10-12-live-links-mii-microsoft.md`
- Test: `tests/content/safety.test.ts` (em dash scan over docs)

**Interfaces:**
- Consumes: the names from Tasks 1 to 7 (`Pod.liveUrl`, `PUBLIC_LIVE_HOSTS`, `podLiveLink`, `LabPod.liveUrl`, `RoomView.live`, `LiveSiteLink`, `leafForbiddenPatterns`, `common.visitLive`).
- Produces: documentation only.

- [ ] **Step 1: AGENTS.md**

1. Folder layout: after the line `  content/schema.ts             zod schemas, types via z.infer (appendix 06 + additions below)` add

```
  content/live-links.ts         PUBLIC_LIVE_HOSTS, liveUrlProblem, isPublicLiveUrl: the public live link allowlist for Pod.liveUrl (pure)
```

and after the line that starts with `  components/Modal.tsx` add

```
  components/LiveSiteLink.tsx   "Visit live site" link (new tab, noopener noreferrer, external icon, data-live-link), shared by pages and the drawer
```

2. Schema additions bullet: replace `render it with \`clientLabel(client, locale)\` from \`@/content/selectors\`); ` with

```
render it with `clientLabel(client, locale)` from `@/content/selectors`); `Pod.liveUrl` (optional public live site: https, site root only, host in `PUBLIC_LIVE_HOSTS` from `src/content/live-links.ts`, checked by the schema; today only the two MII Microsoft sites. Read it through `podLiveLink(pod)` from `@/content/selectors` (`{ href, host } | null`, re-checks the allowlist; works on `Pod` and the 3D `LabPod.liveUrl`), which every "Visit live site" surface uses: the case study page, project rows and cards (`PodLiveCta`), the Glass Drawer footer (`RoomView.live`), JSON-LD `sameAs`, and 3D stations such as the L1 Highlights Hall. Render it with `LiveSiteLink`. Ask chunks say a live site exists but never carry the hostname. Adding a host is an owner decision, never a content-only edit); 
```

3. Glass Drawer, "Structure" bullet: replace `a footer row (\`drawer-footer\`: primary action, the cross-floor link as a secondary amber button right of it, then View architecture; it wraps on phones)` with

```
a footer row (`drawer-footer`: primary action, then "Visit live site" for pods with `RoomView.live` (new tab, `drawer-live-link`), then the cross-floor link as a secondary amber button, then View architecture; it wraps on phones)
```

4. Public-safety lint: after `- Validate content edits quickly with \`bun run validate:content\`.` add

```
- Live links (R4-J): the Azure hostname pattern stays forbidden in all copy, except a pod's `liveUrl` leaf whose URL passes `isPublicLiveUrl` (`leafForbiddenPatterns(leaf)` in `src/content/safety.ts`, used by the content test and `validate:content`). The public App Service names `mii-microsoft` and `mii-microsoft-ai` are in `content/safety-allowlist.txt`, so a private list naming them cannot flag the public URLs; every other resource name stays private and blocked.
```

- [ ] **Step 2: README.md**

After the line `- Projects with a gallery come first in every project list ...` (Content section) add:

```
- Projects with a public live site (`liveUrl`, allowlisted hosts in `src/content/live-links.ts`; today the MII Microsoft Solutions Website and the MII Microsoft AI Portfolio and Assistant) show a "Visit live site" button on their case study, in the project rows and in the Glass Drawer footer. It opens a new tab with `rel="noopener noreferrer"`; internal apps never get a link.
```

- [ ] **Step 3: Data contract and content map**

`docs/superpowers/specs/agent-hq/06-data-contracts.md`, in `interface Pod`, replace `  assets: Asset[];` (the line inside `interface Pod`) with

```ts
  assets: Asset[];
  liveUrl?: string;                      // public live site (R4-J): https, site root, host in PUBLIC_LIVE_HOSTS
```

`docs/superpowers/specs/agent-hq/07-content-map.md`:

- Replace the row `| featured | Event-tech search relevance and feedback analytics backend | 2023 | Freelance (Singapore), anonymized unless C8 says otherwise |` with
  `| featured | MII Microsoft Solutions Website: MII's public bilingual Microsoft Solutions site, built from 17 specs | 2026 | Metrodata. Live link (R4-J). Moved from the AI list. |`
- Replace `| listed | Digital products and training e-commerce platform; University alumni and counseling platforms | | |` with
  `| listed | Digital products and training e-commerce platform; University alumni and counseling platforms; Event-tech search relevance and feedback analytics backend (listed since R4-J, at most 6 featured per wing) | | |`
- Replace `| featured | Grounded Bilingual RAG Assistant | Prompt tokens -23%, model calls per turn 3 to 2 |` with
  `| featured | MII Microsoft AI Portfolio and Assistant: portfolio site, multi-agent RAG assistant, /dashboard Studio (live link, R4-J) | Prompt tokens -23%, model calls per turn 3 to 2 |`
- In the AI `listed` row remove `Bilingual Solutions Marketing Site · `.

- [ ] **Step 4: Plan copy**

Copy this plan into the repo (convention: phase plans live in `docs/superpowers/plans/`):

```bash
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r4-j-live-links-mii-microsoft.md docs/superpowers/plans/2026-10-12-live-links-mii-microsoft.md
```

- [ ] **Step 5: Run the doc guards**

Run: `bunx vitest run tests/content/safety.test.ts && rg -n "\x{2014}" AGENTS.md README.md docs/superpowers/specs/agent-hq docs/superpowers/plans/2026-10-12-live-links-mii-microsoft.md`
Expected: PASS and no `rg` output.

- [ ] **Step 6: Commit**

```bash
rtk git add AGENTS.md README.md docs/superpowers/specs/agent-hq/06-data-contracts.md docs/superpowers/specs/agent-hq/07-content-map.md docs/superpowers/plans/2026-10-12-live-links-mii-microsoft.md
rtk git commit -m "docs: live links, podLiveLink and the MII Microsoft sites in AGENTS, README and the specs"
```

---

### Task 9: Full verification, Ask pack, built output checks, screenshots and PR

**Files:**
- No source changes unless a check fails (fix it in the task that owns the file, then re-run).

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch, screenshots and the PR.

- [ ] **Step 1: Quick verification**

Run: `rm -rf .next && bun run verify:quick`
Expected: typecheck, lint, all Vitest files and `next build` PASS (the build runs `build-knowledge` first).

- [ ] **Step 2: Check the built output**

```bash
grep -c 'href="https://mii-microsoft.azurewebsites.net"' out/en/labs/solutions-marketing-site.html
grep -c 'href="https://mii-microsoft-ai.azurewebsites.net"' out/id/labs/ai-solutions-assistant.html
grep -o '<title>[^<]*' out/en/labs/solutions-marketing-site.html out/en/labs/ai-solutions-assistant.html
grep -c 'data-live-link' out/en/labs/vendor-management-portal.html
ls out/og/en/labs/solutions-marketing-site.png out/og/id/labs/ai-solutions-assistant.png
```

Expected: the first two print at least `1`; the titles read `MII Microsoft Solutions Website` and `MII Microsoft AI Portfolio and Assistant` (with the site suffix from `pageMetadata`); the vendor portal page prints `0` (no live link rendered; its inlined 3D payload may still contain the two hostnames through `LabPod.liveUrl`, which is expected); both OG PNGs exist (rebuilt from the new titles).

- [ ] **Step 3: Targeted e2e**

Run: `bun scripts/e2e-changed.ts --dry && bun run e2e:changed`
Expected: the plan lists at least `pageview`, `static-routes`, `seo`, `gallery`, `labs`, `drawer-solid` and `deploy` (content and `src/hud/drawer` changes); all PASS, including `e2e/deploy.spec.ts` (`scanBuildOutput` finds no blocklisted term in `out/`) and both new live link tests.

- [ ] **Step 4: Screenshots**

```bash
SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "live site" --workers=1
ls screenshots/live-link-*.png
```

Expected: four PNGs (`live-link-page-1440x900`, `live-link-page-390x844`, `live-link-drawer-1440x900`, `live-link-drawer-390x844`). Attach them to the PR. Add the `screenshots` label to the PR so CI captures the L3 floor and wing boards (the Product Engineering board now lists the MII Microsoft Solutions Website among its top five; the AI board drops it).

- [ ] **Step 5: Full suite before the PR**

Run: `bun run e2e:full`
Expected: PASS (about 6 to 10 minutes locally). Do not run it in parallel with another e2e run.

- [ ] **Step 6: Push and open the PR**

```bash
rtk git push -u origin feat/r4-live-links-mii-microsoft
gh pr create --title "R4-J: live links for the MII Microsoft sites" --body-file - <<'BODY'
Documents the two public MII Microsoft sites as named L3 projects with a guarded "Visit live site" link.

- `Pod.liveUrl` (optional): https, site root only, host in `PUBLIC_LIVE_HOSTS` (`src/content/live-links.ts`). Internal apps can never get a link through a content edit.
- "Visit live site" (ID "Kunjungi situs live"): case study page, project rows and cards, Glass Drawer footer right of "Read case study". New tab, `rel="noopener noreferrer"`, external icon.
- `podLiveLink(pod)` in `src/content/selectors.ts` for every surface, including the L1 Highlights Hall (parallel plan) via `LabPod.liveUrl`.
- Content: `solutions-marketing-site` is now "MII Microsoft Solutions Website" (Product Engineering, featured); `ai-solutions-assistant` is now "MII Microsoft AI Portfolio and Assistant" (site, multi-agent RAG assistant, /dashboard Studio). Slugs unchanged.
- Owner check: `event-tech-search-backend` moves from featured to listed to keep at most 6 featured pods per wing.
- Safety: Azure hostnames stay forbidden everywhere except an allowlisted `liveUrl`; Ask never ships the hostnames (golden q31 asks for the site names).

Screenshots attached. Do not merge without the owner.
BODY
```

Expected: the PR URL is printed; CI starts (check, build, 4 e2e shards, Lighthouse).

---

## Self-review

**1. Spec coverage**

| Requirement | Task |
|---|---|
| Optional live link field, https, allowlist of public hosts, never internal apps (test/lint) | 1 (schema + `live-links.test.ts`), 2 (lint), 3 (dataset test pins the exact two links and the vendor portal has none) |
| "Visit live site" on `/[locale]/labs/[slug]` (new tab, noopener noreferrer, icon, EN/ID) | 5 |
| On project rows/cards where a CTA fits | 5 (`WorkRow`, `WorkFeature`, `FeaturedProject` via `PodLiveCta`) |
| In the 3D Glass Drawer footer next to "Read case study", cross-links right of the primary | 6 |
| `podLiveLink(pod)` helper for the L1 Highlights Hall, documented | 4 (selector, `LabPod.liveUrl`), 8 (AGENTS) |
| Rename, move and promote `solutions-marketing-site`; refresh copy from the repo | 3 |
| Rename `ai-solutions-assistant`, keep AI Engineering, mention dark theme site, multi-agent RAG assistant, /dashboard Studio, sole engineer | 3 |
| Slugs unchanged | Global Constraints; Task 3 edits by id and keeps `id`/`slug` |
| Ask pack and golden set (q31 with the names) | 7 |
| OG titles | Derived from content; checked in Task 9 Step 2 |
| L3 placement and ordering tests (gallery-first, wing change) | 3 (labs layout test), 4 (layout and walk tests re-run) |
| e2e text matches | 3 Step 6 (no old titles left), 5 and 6 (new e2e) |
| README/AGENTS/docs | 7 (counts), 8 |
| Unit/content tests, pack regeneration, e2e new tab + noopener, screenshots, PR | 1 to 7, 9 |

**2. Placeholder scan:** every code step has the code; every run step has the command and the expected result. The only conditional steps (pill wording fallback in Task 3, retrieval debugging in Task 7) give the exact fallback text and command.

**3. Type consistency:** `liveUrl` (Pod, LabPod), `RoomView.live`, `podLiveLink(pod: { liveUrl?: string }): PodLiveLink | null` with `{ href, host }`, `liveUrlProblem` / `isPublicLiveUrl` / `PUBLIC_LIVE_HOSTS`, `leafForbiddenPatterns(leaf: StringLeaf)`, `LiveSiteLink({ href, label, srHint, className?, testId? })`, `PodLiveCta({ pod, locale, className? })`, `common.visitLive`, `data-live-link`, `data-testid="drawer-live-link"`, `livePods` are spelled the same in every task.

## Open risks

- **Featured cap:** demoting `event-tech-search-backend` to listed is this plan's choice to satisfy "at most 6 featured per wing". The owner may prefer demoting another software pod without a gallery (for example `limited-quota-event-ticketing`) or raising the cap; either is a one-line content change plus the Task 3 layout test line.
- **Private blocklist:** if the CI secret `SAFETY_BLOCKLIST` or a local `.safety-blocklist.local.txt` names the apps with a pattern other than the plain terms `mii-microsoft` / `mii-microsoft-ai` (for example a regex that matches `mii-microsoft-ai.azurewebsites.net` without naming an allowlisted entry), the content test and `e2e/deploy.spec.ts` will fail; the owner then edits the secret. Also, `tests/unit/safety.test.ts` "lists no client company name" reads the local private list: if that file contains `mii-microsoft`, it fails locally; remove the term there.
- **Ask retrieval:** q31 depends on lexical retrieval ranking both project chunks (or the projects summary) in the top 6; Task 7 Step 4 checks it. The nightly real-model eval may still phrase answers without "MII Microsoft"; the threshold is 29 of 31.
- **Honesty of copy:** the AI repo history shows a second human contributor with a few commits; the copy keeps the owner-confirmed role "Sole engineer" but drops "alone" from the AI approach. The AI site follows the OS theme today, so the copy says "dark and light themes" rather than "dark theme". The owner should skim both pods before merge.
- **3D payload:** `LabPod.liveUrl` puts the two hostnames into the inlined `ExperienceData` of every gated page. The build scan checks blocklisted terms only, so this passes, but the URLs appear in page source site-wide (they are public).
- **Uptime:** the links point to live App Service sites outside this repo; if either goes down, the button still renders. Removing `liveUrl` from content is the switch.
- **Visual changes:** the Product Engineering wing board and road change (new dock third from the hub, `event-tech-search-backend` moves to the board); L3 screenshots and possibly `public/floors/L3.webp` (elevator picker thumbnail) differ. Regenerate with `bun run build && bun run floor:thumbs` if the owner wants an exact thumbnail.
- **Parallel work:** the L1 Highlights Hall plan must import `podLiveLink` from `@/content/selectors` and read `LabPod.liveUrl`; if it merges first, rebase it on this branch or merge this PR first.
