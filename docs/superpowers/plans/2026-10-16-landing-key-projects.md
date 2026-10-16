# Landing Key Projects and Project Placeholders Implementation Plan

Status: shipped in #159 (c03043f), 2026-10-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Classic landing lists only key projects that have screenshots, the Full-Stack AI Application Template becomes a key project, and every project thumbnail without a screenshot shows a designed placeholder instead of an empty box.

**Architecture:** One predicate (`isKeyProject`: hero tier with a gallery) in `src/content/pageview.ts` decides both the `/labs` Key projects grid and the landing "More key projects" rows. The template pod (`ai-app-accelerator`, AI wing, 6 redacted screenshots already committed) moves from `featured` to `hero`; the dataset test that pinned exactly 3 heroes per wing becomes AI 4, Software 3. A pure server component `ProjectPlaceholder` (inline SVG rover glyph plus initials on a wing-tinted gradient, CSS only, `aria-hidden`) replaces the dashed empty frame in `WorkRow` and the empty filmstrip slots of `FeaturedProject`.

**Tech Stack:** Next.js 16 static export, React server components, Tailwind 4 plus `src/app/pageview.css`, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text.
- Owner requests (verbatim): "Also on MORE KEY PROJECTS in landing i prefer with image non image should be just scrolled on work page"; "Also for key projects can you add Fullstack AI Application template"; "can you make image place holder if there is non exist image in the project since currently its only blank black square".
- `Pod.selected` ranks (landing "Selected work") stay untouched.
- Hero trade-off (reported to the coordinator 2026-10-16, option A): promote only `ai-app-accelerator` to `hero`; no other pod changes tier. The 3-per-wing rule is not a layout constraint (L3 slot pitch is a fixed 12 u, pod meshes are instanced), so AI gets 4 heroes.
- Placeholders: pure CSS and inline SVG (no network request per card), decorative (`aria-hidden="true"`, no alt text, no words to translate: initials only), wing tint through classes in `pageview.css` (no inline `style`, CSP), no colored edge stripes (`tests/unit/edge-accents.test.ts`), glyph from `roverMarkBody("glyph", id)` via `RoverMark` (unique `id` per instance).
- Client company names never appear; the safety lint applies.
- 3D L3 budgets stay (`e2e/perf/floors.spec.ts`, `e2e/labs.spec.ts`).

---

### Task 1: Key project predicate, landing filter, template promotion

**Files:**
- Modify: `src/content/pageview.ts` (add `isKeyProject`, `moreKeyProjects`)
- Modify: `src/app/[locale]/page.tsx:42-45` (use `moreKeyProjects`)
- Modify: `src/app/[locale]/labs/page.tsx:29-31` (use `isKeyProject`)
- Modify: `content/site-content.json` (pod `ai-app-accelerator`: `"tier": "featured"` to `"tier": "hero"`)
- Modify: `tests/content/dataset.test.ts:76-81` (hero counts)
- Test: `tests/unit/pageview.test.ts`

**Interfaces:**
- Produces: `isKeyProject(pod: Pick<Pod, "tier" | "assets">): boolean` and `moreKeyProjects<T extends Pick<Pod, "id" | "tier" | "assets">>(pods: readonly T[], featured: readonly Pick<Pod, "id">[]): T[]` (input order kept; callers pass `getPods()` site order).

- [x] **Step 1: Write the failing tests** in `tests/unit/pageview.test.ts`:

```ts
import { getPods } from "@/content/load";
import { isKeyProject, moreKeyProjects } from "@/content/pageview";

describe("key projects", () => {
  const asset = { src: "/x.webp", alt: { en: "x", id: "x" }, width: 1600, height: 1000, redacted: true };
  it("needs the hero tier and at least one screenshot", () => {
    expect(isKeyProject({ tier: "hero", assets: [asset] })).toBe(true);
    expect(isKeyProject({ tier: "hero", assets: [] })).toBe(false);
    expect(isKeyProject({ tier: "featured", assets: [asset] })).toBe(false);
  });
  it("lists only image key projects on the landing, outside Selected work (owner 2026-10-16)", () => {
    const pods = getPods();
    const featured = pickFeaturedPods(pods);
    const more = moreKeyProjects(pods, featured).map((p) => p.slug);
    expect(more).toEqual(["fraud-review-platform", "vendor-management-portal", "ai-app-accelerator"]);
    expect(more).not.toContain("digital-banking-integrations");
    expect(more).not.toContain("ticket-marketplace-backend");
  });
});
```

(`pickFeaturedPods` is already imported in that file; add `isKeyProject`, `moreKeyProjects` to the import, and `getPods` from `@/content/load`.)

- [x] **Step 2: Run** `bunx vitest run tests/unit/pageview.test.ts`. Expected: FAIL (`isKeyProject` not exported).

- [x] **Step 3: Implement** in `src/content/pageview.ts` (next to `pickFeaturedPods`; import `podHasGallery` from `./selectors` if not imported):

```ts
/** A key project (owner request 2026-10-15/16): a hero pod with screenshots. Decides /labs Key projects and the landing "More key projects". */
export function isKeyProject(pod: Pick<Pod, "tier" | "assets">): boolean {
  return pod.tier === "hero" && podHasGallery(pod);
}

/** Landing "More key projects": key projects that are not already in Selected work, in input order. Image-less pods stay on /labs only. */
export function moreKeyProjects<T extends Pick<Pod, "id" | "tier" | "assets">>(pods: readonly T[], featured: readonly Pick<Pod, "id">[]): T[] {
  const shown = new Set(featured.map((p) => p.id));
  return pods.filter((p) => isKeyProject(p) && !shown.has(p.id));
}
```

In `src/app/[locale]/page.tsx` replace the `featuredIds`/`more` lines with `const more = moreKeyProjects(pods, featured);`. In `src/app/[locale]/labs/page.tsx` replace the `.filter((p) => p.tier === "hero" && podHasGallery(p))` with `.filter(isKeyProject)` and drop the unused `podHasGallery` import.

- [x] **Step 4: Promote the template.** In `content/site-content.json` set `ai-app-accelerator` `"tier": "hero"` (keep `order` 5). Update `tests/content/dataset.test.ts`:

```ts
  it("has 3 Product Engineering and 4 AI Engineering hero pods (hologram view) and at most 6 featured per wing", () => {
    // AI has a fourth hero since the owner made the Full-Stack AI Application Template a key project (2026-10-16).
    const heroes = { software: 3, ai: 4 } as const;
    for (const wing of ["software", "ai"] as const) {
      expect(pods.filter((p) => p.wing === wing && p.tier === "hero")).toHaveLength(heroes[wing]);
      expect(pods.filter((p) => p.wing === wing && p.tier === "featured").length).toBeLessThanOrEqual(6);
    }
    expect(pods.find((p) => p.slug === "ai-app-accelerator")?.tier).toBe("hero");
  });
```

- [x] **Step 5: Run** `bunx vitest run tests/unit tests/content tests/ask`. Fix any test that pinned the old AI order or tier (L3 docking in `tests/unit/labs-*.test.ts`, the Ask "Projects summary" order, `tests/unit/highlights-data.test.ts`). A changed expectation must reflect the new tier only; never weaken a space rule.

- [x] **Step 6: Commit** `feat(landing): only image key projects on the landing; the AI template is a key project`.

### Task 2: Project placeholder

**Files:**
- Create: `src/components/page/ProjectPlaceholder.tsx`
- Modify: `src/components/page/Work.tsx` (`WorkRow` empty branch)
- Modify: `src/components/page/Featured.tsx` (`hx-film-empty` slot)
- Modify: `src/app/pageview.css` (`.pv-ph` styles), `src/app/landing.css` (drop `.hx-film-empty` if unused)
- Test: `tests/unit/project-placeholder.test.tsx`

**Interfaces:**
- Produces: `ProjectPlaceholder({ id, title, wing, size }: { id: string; title: string; wing: Wing; size: "row" | "film" | "card" })` (sync, no hooks) and `projectInitials(title: string): string`.

- [x] **Step 1: Write the failing test** `tests/unit/project-placeholder.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectPlaceholder, projectInitials } from "@/components/page/ProjectPlaceholder";

describe("ProjectPlaceholder", () => {
  it("takes initials from the first two significant words", () => {
    expect(projectInitials("Digital Banking Integrations")).toBe("DB");
    expect(projectInitials("Event Ticket Marketplace Backend")).toBe("ET");
    expect(projectInitials("E-Commerce for Digital Products and Training")).toBe("ED");
    expect(projectInitials("Sentiboard: IndoBERT University Sentiment Dashboard")).toBe("SI");
  });
  it("is decorative, local and wing tinted", () => {
    const html = renderToStaticMarkup(<ProjectPlaceholder id="ph-x" title="Digital Banking Integrations" wing="software" size="row" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-wing="software"');
    expect(html).toContain("data-project-placeholder");
    expect(html).toContain(">DB<");
    expect(html).not.toMatch(/<img|url\(|https?:/);
  });
});
```

- [x] **Step 2: Run** `bunx vitest run tests/unit/project-placeholder.test.tsx`. Expected: FAIL (module missing).

- [x] **Step 3: Implement** `src/components/page/ProjectPlaceholder.tsx`:

```tsx
import type { Wing } from "@/content/schema";
import { RoverMark } from "../RoverMark";

const MINOR = new Set(["a", "an", "and", "of", "for", "the", "to", "in", "on", "with", "dan", "di", "ke", "untuk", "yang", "dengan"]);

/** Initials of a project title: the first letters of its first two significant words. */
export function projectInitials(title: string): string {
  const words = title.split(/[\s:/-]+/).filter((w) => /^\p{L}/u.test(w) && !MINOR.has(w.toLowerCase()));
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/**
 * Stand-in for a project screenshot when the pod has no gallery (owner request 2026-10-16): the rover
 * glyph and the title's initials on a wing-tinted gradient. CSS and inline SVG only, decorative.
 */
export function ProjectPlaceholder({ id, title, wing, size }: { id: string; title: string; wing: Wing; size: "row" | "film" | "card" }) {
  return (
    <span className={`pv-ph pv-ph-${size}`} data-wing={wing} data-project-placeholder="" aria-hidden="true">
      <RoverMark id={id} size={size === "film" ? 22 : size === "row" ? 30 : 56} variant="glyph" className="pv-ph-mark" />
      {size !== "film" && <span className="pv-ph-initials">{projectInitials(title)}</span>}
    </span>
  );
}
```

Styles in `src/app/pageview.css` (inside the same layer as `.pv-shot`):

```css
  .pv-ph {
    --ph: var(--color-cyan);
    position: relative;
    display: flex;
    aspect-ratio: 16 / 10;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid var(--color-line);
    background:
      radial-gradient(120% 90% at 85% 0%, color-mix(in oklab, var(--ph) 30%, transparent), transparent 60%),
      radial-gradient(90% 80% at 0% 100%, color-mix(in oklab, var(--color-violet) 16%, transparent), transparent 70%),
      linear-gradient(160deg, #10101c, #0b0b14);
  }
  .pv-ph[data-wing="ai"] { --ph: var(--color-violet); }
  .pv-ph[data-wing="data"] { --ph: var(--color-amber); }
  .pv-ph::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: linear-gradient(color-mix(in oklab, var(--ph) 10%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in oklab, var(--ph) 10%, transparent) 1px, transparent 1px);
    background-size: 14px 14px;
    mask-image: radial-gradient(closest-side, black, transparent);
  }
  .pv-ph-mark { position: relative; z-index: 1; opacity: 0.9; }
  .pv-ph-initials {
    position: relative;
    z-index: 1;
    font-family: var(--font-display);
    font-weight: 800;
    font-stretch: 80%;
    font-size: clamp(16px, 2.2vw, 26px);
    letter-spacing: 0.02em;
    color: color-mix(in oklab, var(--ph) 55%, white);
  }
  .pv-ph-card .pv-ph-initials { font-size: 40px; }
  .pv-ph-film { border-radius: 6px; }
```

The `::after` grid is a full-surface pattern, not an edge stripe; confirm `bunx vitest run tests/unit/edge-accents.test.ts` stays green. Check every glyph of the initials font exists in the Archivo cut (`tests/content/fonts.test.ts` covers ASCII letters).

In `WorkRow` replace the dashed `<span ... border-dashed ...>` with `<ProjectPlaceholder id={`ph-row-${pod.slug}`} title={pod.title[locale]} wing={pod.wing} size="row" />` and add `data-row-placeholder=""` on the wrapper when there is no cover (keep `data-row-thumb` for covers). In `FeaturedProject` replace `<span className="hx-film-empty" />` with `<ProjectPlaceholder id={`ph-film-${pod.slug}-${i}`} title={pod.title[locale]} wing={pod.wing} size="film" />`; remove the `.hx-film-empty` rule from `landing.css`. Rover glyph gradient ids must be unique per page: the id includes the slug (and the slot index), and a pod renders at most once per list.

- [x] **Step 4: Run** `bunx vitest run tests/unit/project-placeholder.test.tsx tests/unit/edge-accents.test.ts tests/content/fonts.test.ts`. Expected: PASS.

- [x] **Step 5: Commit** `feat(pageview): designed placeholder for projects without screenshots`.

### Task 3: e2e, docs, captures

**Files:**
- Modify: `e2e/pageview.spec.ts` (landing rows and placeholder assertions)
- Modify: `docs/features.md` (Classic site landing and Work sections), `AGENTS.md` ("Landing" bullet: More key projects are `moreKeyProjects`; placeholder), `docs/superpowers/plans/2026-10-16-landing-key-projects.md` (tick boxes)

- [x] **Step 1: e2e.** In the landing test of `e2e/pageview.spec.ts`, after the "More key projects" width check, add:

```ts
    // Owner 2026-10-16: the landing lists only key projects with screenshots; image-less pods live on /labs.
    await expect(page.locator("#work .pv-rows [data-row-placeholder]")).toHaveCount(0);
    expect(await page.locator("#work .pv-rows [data-row-thumb] img").count()).toBe(await page.locator("#work .pv-rows > li").count());
```

and after `page.goto(staticTier("/en/labs"))`:

```ts
    // Rows without screenshots show the designed placeholder, never an empty frame.
    const placeholders = page.locator("#all-projects [data-row-placeholder] [data-project-placeholder]");
    expect(await placeholders.count()).toBeGreaterThan(0);
    await expect(placeholders.first()).toHaveAttribute("aria-hidden", "true");
```

- [x] **Step 2: Docs.** Update `docs/features.md` (landing: "More key projects" lists key projects with screenshots only; /labs, Quick view: placeholders) and the AGENTS.md "Landing (home hero)" bullet (one sentence each). No em dashes.

- [x] **Step 3: Verify.** `bun run verify:quick`, then `E2E_PORT=<port> bun run e2e:changed` (pageview, static-routes, gallery, labs), then `E2E_PORT=<port> bun run e2e:perf e2e/perf/floors.spec.ts` (L3 hero footprint). If the floors program baseline moved because of the hero, regenerate it per AGENTS.md and say why.

- [x] **Step 4: Captures.** Before (production) and after (served `out/`) of `#work` on `/en`, `#all-projects` on `/en/labs` and `/en/quick` at 1440x900 and 390x844; attach to the PR.

- [x] **Step 5: Commit** `test(e2e): landing key projects with screenshots and project placeholders` and `docs: key projects and placeholders`.
