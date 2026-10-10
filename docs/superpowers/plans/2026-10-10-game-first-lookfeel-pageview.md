# Agent HQ: Game-First Load, Prototype Look and Feel, and Page View Revamp: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This plan lives in the coordinator session (plan mode). At execution it is committed to the repo as `docs/superpowers/plans/2026-10-10-game-first-lookfeel-pageview.md`.

**Goal:** Make `kurniadi.pages.dev` open straight into the 3D HQ, give the tower the original prototype's look and feel (glow, glass, motion), polish every in-world component until it looks "wow", raise the Lobby skills wall, and redesign the Page View into a structured editorial site.

**Architecture:** Three independent sub-projects, each run as its own child session and PR:

- **A. Game-first load.** An inline head script hides the HTML shell behind an SSR boot cover on 3D-capable devices. The cover hands off to the 3D boot overlay without a flash.
- **B. 3D look and feel.** Port the prototype's shaders, bloom, lighting, motes, lanes and rover glow into shared primitives and apply them to every floor (B0 to B4). Then a component polish pass, including the taller skills wall (B5).
- **C. Page View revamp.** A design gate first: mockups and a design spec are approved in the visual companion. Then a dedicated implementation plan is written and executed.

**Tech Stack:** Next.js 16 (App Router, static export), React 19, React Three Fiber + drei + @react-three/postprocessing, three.js, zustand, Tailwind 4, next-intl (EN/ID), Vitest + Testing Library, Playwright (SwiftShader in CI), Bun.

**Reference prototype:** `/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/portfolio-game/prototypes/agent-hq.html` (with `content.js`). Task B0 copies it into the repo.

## Global Constraints

- Follow `AGENTS.md`. Run the required check suite before every push: `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`.
- Never use em dashes in code, comments, copy, commits or docs. A test enforces this for content.
- Keep the public-safety lint green: no internal codenames, private repo names, money amounts or Master's degree items.
- Make no requests to non-local hosts; the e2e `collectErrors` guard fails on them. Self-host every font and asset.
- GPU tiers:
  - `full`: bloom, point lights and motes.
  - `lite`: no bloom, no point lights, no motes, and DPR at most 1.5.
  - `static`: HTML only.
  - Respect `prefers-reduced-motion` on every tier.
- Budgets (appendix 08):
  - Initial JS under 350 KB gzipped.
  - 3D chunk under 600 KB gzipped.
  - Fewer than 150 draw calls per floor.
  - At least 55 fps on the `full` tier with a desktop GPU.
- URLs stay stable: `/{locale}`, `/journey[/slug]`, `/labs[/slug]`, `/library`, `/blog/[slug]`, `/contact`, `/quick`, `/cv`.
- Content and copy are final (PR #7 and PR #10). Change visuals and layout, not wording. Any new UI string needs both EN and ID.
- One child session per sub-project and one PR each. The coordinator merges after CI is green, then redeploys.

---

## Sub-project A: Game-first load (child session "Game-first load")

**Problem:** on `kurniadi.pages.dev`, visitors see the server-rendered Page View for a few seconds before the 3D HQ mounts. The cause: `ExperienceGate` probes WebGL in a `setTimeout` after hydration, and only then lazy-loads `Experience`.

**Fix:**
- Decide *before first paint* whether this visit will be 3D.
- If it will be, hide `#site-shell` and show an SSR boot cover styled like the prototype's "Boot agent" screen.
- Release the cover on the canvas's first rendered frame, or reveal the page when 3D is not possible.
- Start downloading the 3D chunk immediately.

### File structure

| Action | File | Purpose |
|---|---|---|
| Create | `src/lib/boot-first.ts` | Pure decision function and inline-script builder |
| Create | `src/components/BootCover.tsx` | SSR boot cover (static markup, CSS-animated log lines) |
| Modify | `src/app/[locale]/layout.tsx` | Inline head `<script>`, and `<BootCover>` before `#site-shell` |
| Modify | `src/app/globals.css` | `html[data-hq-boot]` rules |
| Modify | `src/experience/ExperienceGate.tsx` | Release the cover; preload the chunk early |
| Modify | `src/experience/Experience.tsx` | `onFirstFrame` callback |
| Modify | `src/hud/BootOverlay.tsx` | Visually identical to the cover, so the handoff is seamless |
| Test | `src/lib/boot-first.test.ts`, `e2e/boot-first.spec.ts` | |

### Task A1: Boot-first decision function

**Interfaces:**
- Produces: `shouldBootFirst(input: BootFirstInput): boolean`, `bootFirstScript(): string`, `releaseBootCover(reason: "ready" | "page" | "static" | "timeout"): void`, constants `BOOT_ATTR = "data-hq-boot"` and `BOOT_TIMEOUT_MS = 8000`.

- [ ] **Step 1: Write the failing test** (`src/lib/boot-first.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { bootFirstScript, shouldBootFirst, type BootFirstInput } from "./boot-first";

const base: BootFirstInput = { path: "/en", search: "", storedView: null, hasWebGL2: true, saveData: false };

describe("shouldBootFirst", () => {
  it("boots first on gated routes with WebGL2", () => {
    for (const path of ["/en", "/id/", "/en/journey", "/en/journey/jenius-2024", "/id/labs/voice-ai-contact-center", "/en/library", "/en/contact"]) {
      expect(shouldBootFirst({ ...base, path })).toBe(true);
    }
  });
  it("shows the page on non-gated routes", () => {
    for (const path of ["/en/quick", "/en/cv", "/en/blog/some-post", "/", "/en/unknown"]) {
      expect(shouldBootFirst({ ...base, path })).toBe(false);
    }
  });
  it("respects tier=static, stored page view, missing WebGL2 and saveData", () => {
    expect(shouldBootFirst({ ...base, search: "?tier=static" })).toBe(false);
    expect(shouldBootFirst({ ...base, storedView: "page" })).toBe(false);
    expect(shouldBootFirst({ ...base, hasWebGL2: false })).toBe(false);
    expect(shouldBootFirst({ ...base, saveData: true })).toBe(false);
  });
  it("still boots for tier=lite and tier=full", () => {
    expect(shouldBootFirst({ ...base, search: "?tier=lite" })).toBe(true);
    expect(shouldBootFirst({ ...base, search: "?tier=full" })).toBe(true);
  });
  it("inline script is valid JS that sets the attribute", () => {
    const attrs = new Map<string, string>();
    const documentElement = {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      hasAttribute: (k: string) => attrs.has(k),
      removeAttribute: (k: string) => attrs.delete(k),
    };
    const run = new Function("location", "sessionStorage", "navigator", "document", "WebGL2RenderingContext", "setTimeout", bootFirstScript());
    run({ pathname: "/en", search: "" }, { getItem: () => null }, {}, { documentElement }, function () {}, () => 0);
    expect(attrs.get("data-hq-boot")).toBe("1");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bunx vitest run src/lib/boot-first.test.ts`
Expected: FAIL with "Cannot find module './boot-first'".

- [ ] **Step 3: Implement** (`src/lib/boot-first.ts`)

```ts
export const BOOT_ATTR = "data-hq-boot";
export const BOOT_TIMEOUT_MS = 8000;

export interface BootFirstInput {
  path: string;
  search: string;
  storedView: string | null;
  hasWebGL2: boolean;
  saveData: boolean;
}

/** Self-contained (no imports, no closures, no TS-only syntax in the body) so it can be inlined via toString(). */
export function shouldBootFirst(i: BootFirstInput): boolean {
  if (!/^\/(en|id)(\/(journey|labs|library|contact)(\/[^/]+)?)?\/?$/.test(i.path)) return false;
  if (/[?&]tier=static(&|$)/.test(i.search)) return false;
  if (i.storedView === "page") return false;
  return i.hasWebGL2 && !i.saveData;
}

/** Inline head script: sets data-hq-boot before first paint and arms a safety timeout. */
export function bootFirstScript(): string {
  return `(function(){try{var s=null;try{s=sessionStorage.getItem("hq:view")}catch(e){}
var c=navigator.connection;var on=(${shouldBootFirst.toString()})({path:location.pathname,search:location.search,storedView:s,hasWebGL2:typeof WebGL2RenderingContext!=="undefined",saveData:!!(c&&c.saveData)});
if(!on)return;var d=document.documentElement;d.setAttribute("${BOOT_ATTR}","1");
setTimeout(function(){if(d.hasAttribute("${BOOT_ATTR}")){d.removeAttribute("${BOOT_ATTR}");d.setAttribute("data-hq-boot-released","timeout")}},${BOOT_TIMEOUT_MS});}catch(e){}})();`;
}

export function releaseBootCover(reason: "ready" | "page" | "static" | "timeout"): void {
  const d = document.documentElement;
  if (!d.hasAttribute(BOOT_ATTR)) return;
  d.removeAttribute(BOOT_ATTR);
  d.setAttribute("data-hq-boot-released", reason);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bunx vitest run src/lib/boot-first.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/boot-first.ts src/lib/boot-first.test.ts
rtk git commit -m "feat(boot): decide 3D-first before first paint"
```

### Task A2: SSR boot cover, shell hiding and handoff

**Interfaces:**
- Consumes: `bootFirstScript()`, `releaseBootCover()` and `BOOT_ATTR` from A1.
- Produces: `<BootCover locale name monogram />`, rendering `#hq-boot-cover` with `data-testid="boot-cover"`. `Experience` gains the prop `onFirstFrame?: () => void`.

- [ ] **Step 1: Write the failing e2e test** (`e2e/boot-first.spec.ts`)

```ts
import { expect, test } from "@playwright/test";

test("3D-capable visit never shows the Page View before the HQ", async ({ page }) => {
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await page.waitForSelector("#hq-boot-cover", { state: "attached" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBe("1");
  await expect(page.locator("#site-shell")).toBeHidden();
  await expect(page.getByTestId("boot-cover")).toBeVisible();
  await expect(page.getByTestId("hq")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).not.toHaveAttribute("data-hq-boot", "1");
});

test("static tier and stored page view show the page immediately", async ({ page }) => {
  await page.goto("/en?tier=static", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("hq:view", "page"));
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-shell")).toBeVisible();
  await expect(page.getByTestId("boot-cover")).toBeHidden();
});

test("non-gated pages are unaffected", async ({ page }) => {
  await page.goto("/en/quick", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-shell")).toBeVisible();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run e2e -- e2e/boot-first.spec.ts`
Expected: FAIL (no `#hq-boot-cover`).

- [ ] **Step 3: Create the cover** (`src/components/BootCover.tsx`), styled like the prototype intro

```tsx
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";

export async function BootCover({ locale, name, monogram }: { locale: Locale; name: string; monogram: string }) {
  const t = await getTranslations({ locale, namespace: "hud" });
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name }), t("bootLine5"), t("bootLine6")];
  return (
    <div id="hq-boot-cover" data-testid="boot-cover" aria-hidden="true" className="hq-boot-cover">
      <div className="hq-boot-card">
        <p className="eyebrow">{t("bootEyebrow")}</p>
        <p className="mt-3 font-mono text-sm text-cyan">{monogram}</p>
        <p className="mt-2 text-2xl font-extrabold text-ink">{t("bootTitle")}</p>
        <ol className="hq-boot-log mt-5">
          {lines.map((line, i) => (
            <li key={line} style={{ animationDelay: `${120 + i * 220}ms` }}>
              <span className="text-green">[ok]</span> {line}
            </li>
          ))}
        </ol>
        <div className="hq-boot-bar" />
      </div>
    </div>
  );
}
```

Add `hud.bootEyebrow` to `messages/en.json` ("Agent HQ · booting") and `messages/id.json` ("Agent HQ · memulai").

- [ ] **Step 4: Add the CSS** (append to `src/app/globals.css`)

```css
.hq-boot-cover { display: none; }
html[data-hq-boot] .hq-boot-cover {
  display: grid; place-items: center; position: fixed; inset: 0; z-index: 60;
  background: radial-gradient(ellipse at 50% 40%, rgb(30 27 75 / .7), var(--color-void) 70%);
}
html[data-hq-boot] #site-shell { visibility: hidden; }
.hq-boot-card { width: min(420px, 90vw); text-align: left; }
.hq-boot-log { font: 12px/1.8 var(--font-mono); color: #a5b4fc; min-height: 110px; }
.hq-boot-log li { opacity: 0; animation: hq-boot-line .25s ease-out forwards; }
.hq-boot-bar { margin-top: 18px; height: 2px; background: linear-gradient(90deg, transparent, var(--color-cyan), transparent); background-size: 200% 100%; animation: hq-boot-scan 1.4s linear infinite; }
@keyframes hq-boot-line { to { opacity: 1; } }
@keyframes hq-boot-scan { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .hq-boot-log li { animation: none; opacity: 1; } .hq-boot-bar { animation: none; } }
```

(`.eyebrow` comes from B5 step 7. If A lands first, define `.eyebrow { font: 11px var(--font-mono); letter-spacing: .3em; text-transform: uppercase; color: var(--color-ink-3); }` here and B reuses it.)

- [ ] **Step 5: Wire it into the layout** (`src/app/[locale]/layout.tsx`)
  - Add `suppressHydrationWarning` to `<html>`: the attribute is set before hydration.
  - Add `<head><script dangerouslySetInnerHTML={{ __html: bootFirstScript() }} /></head>`.
  - In `<body>`, before `#site-shell`, add `<BootCover locale={locale} name={profile.name} monogram={profile.monogram} />`.
  - Check `public/_headers`. If `script-src` disallows inline scripts, add a build step `scripts/csp-hash.ts` that computes the sha256 of `bootFirstScript()` and writes it into `out/_headers`.
  - Add a unit test asserting that the hash in the generated headers matches the current script.

- [ ] **Step 6: Release the cover from the gate** (`src/experience/ExperienceGate.tsx`, `src/experience/Experience.tsx`)

```tsx
// ExperienceGate.tsx, module scope: start the 3D chunk download right away on boot-first visits.
if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-hq-boot")) void import("./Experience");

// Inside ExperienceGate, after `tier` and `view` are known:
useEffect(() => {
  if (tier === "static") releaseBootCover("static");
  else if (tier && view === "page") releaseBootCover("page");
}, [tier, view]);
// ...and pass the prop: <Experience ... onFirstFrame={() => releaseBootCover("ready")} />
```

```tsx
// Experience.tsx: inside <Canvas>, render once.
function FirstFrame({ onFrame }: { onFrame?: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current || !onFrame) return;
    done.current = true;
    onFrame();
  });
  return null;
}
```

- [ ] **Step 7: Make the handoff seamless.** Keep `BootOverlay`'s behavior: the Boot button on a first visit, auto-skip on return visits. Restyle it to the same card, eyebrow, log and scan bar as `BootCover`, in the same position, so removing the cover reveals an identical overlay. Use the prototype's primary button style: `bg-[#6366f1] text-white shadow-[0_0_30px_rgba(99,102,241,.55)] rounded-xl px-6 py-3`.

- [ ] **Step 8: Run the tests**

Run: `bun run e2e -- e2e/boot-first.spec.ts e2e/experience.spec.ts`, then the full AGENTS.md suite.
Expected: PASS.

- [ ] **Step 9: Verify there's no flash.** Record a Playwright trace of `/en?tier=lite` with screenshots enabled, and confirm no frame shows `#site-shell` before `[data-testid=hq]`. Attach the filmstrip to the PR.

- [ ] **Step 10: Commit and open a PR** "Game-first load: boot cover before first paint".

---

## Sub-project B: Prototype look and feel in the tower (child session "3D look and feel")

### File structure

| Action | File | Purpose |
|---|---|---|
| Create | `docs/prototypes/agent-hq-v0.html`, `docs/prototypes/content.js`, `docs/prototypes/README.md` | Design reference and port inventory |
| Create | `src/experience/fx/materials.ts` | Glass, grid-floor and lane shader factories, plus `neonColor` |
| Create | `src/experience/fx/useUniformTime.ts` | Advance `uTime` once per frame |
| Create | `src/experience/fx/GridFloor.tsx`, `LaneStrip.tsx`, `Motes.tsx`, `ProximityGlow.tsx` | Shared FX components |
| Create | `src/experience/scene/settings.ts` | Lighting, fog, tone and bloom per tier |
| Modify | `src/experience/tower/primitives.tsx` | `GlassBox` uses the glass shader with neon rims |
| Modify | `src/experience/scene/Scene.tsx`, `Effects.tsx`, `src/experience/Experience.tsx` | Lights, fog, ACES, bloom |
| Modify | `src/experience/rover/Rover.tsx`, `src/experience/camera/*` | Rover glow, click marker, camera feel |
| Modify | `src/experience/floors/**`, `src/experience/tower/ElevatorShaft.tsx`, `FloorLevel.tsx` | Apply the primitives and the polish pass |
| Modify | `src/experience/config.ts`, `floors/lobby/SkillsWall.tsx`, `camera/orbit.ts` | Taller skills wall |
| Modify | `src/app/globals.css`, `src/hud/**` | HUD glass styling from the prototype |
| Test | `src/experience/fx/materials.test.ts`, `src/experience/scene/settings.test.ts`, `src/experience/camera/offset.test.ts`, `e2e/experience.spec.ts` | |

### Task B0: Commit the prototype reference

- [ ] Copy `agent-hq.html` (as `agent-hq-v0.html`) and `content.js` from the reference path into `docs/prototypes/`.
- [ ] Write `docs/prototypes/README.md` with the port inventory and exact values:
  - **Tone mapping:** ACES, exposure 1.05.
  - **Fog:** linear `#0a0a0f`, 38 to 80.
  - **Bloom (Unreal):** strength 0.5, radius 0.4, threshold 0.32.
  - **Hemisphere light:** `#8b8cff`/`#0a0a0f` at 0.7.
  - **Directional light:** `#dfe3ff` 1.4 at (10, 22, 12).
  - **Glass shader:** fresnel `pow(1-|N·V|, 2.2)`, top band, base band, moving scanline.
  - **Grid floor shader:** `fwidth` anti-aliased 1 u and 5 u lines, with a radial fade.
  - **Lane shader:** edge lines plus moving dashes, additive.
  - **Motes:** 260 points, `#818cf8`, size 0.06, additive.
  - **Robot:** radial glow pad 2.6 u, additive ring 0.55 to 0.82 at opacity 0.55, point light `#67e8f9` (8, 7, 2), neon eyes ×3.
  - **Click marker:** ring 0.3 to 0.42 that expands and fades.
  - **Camera:** smoothing `1-exp(-dt*4)`, offset scaled by aspect (×1, ×1.35, ×1.75).
  - **Boot screen:** eyebrow, `[ok]` log lines every 300 ms, indigo glowing button.
  - **HUD glass CSS:** blur 18 px with saturate 140%, radius 16, layered shadow, inset highlight.
- [ ] Commit: `docs: add Agent HQ v0 prototype as design reference`.

### Task B1: Shared FX materials

**Interfaces:**
- Produces:
  - `createGlassMaterial(color: string, opacity: number): ShaderMaterial`, with uniforms `uColor`, `uTime` and `uOp`.
  - `createGridFloorMaterial(opts: { line: string; bg: string; radius: number }): ShaderMaterial`.
  - `createLaneMaterial(color: string, length: number): ShaderMaterial`.
  - `neonColor(hex: string, k: number, tier: GpuTier): Color`, which boosts above 1.0 on `full` only so that only neon blooms.
  - `useUniformTime(materials: ShaderMaterial[]): void`.

- [ ] **Step 1: Write the failing test** (`src/experience/fx/materials.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { AdditiveBlending, Color } from "three";
import { createGlassMaterial, createGridFloorMaterial, createLaneMaterial, neonColor } from "./materials";

describe("fx materials", () => {
  it("glass material is transparent, no depth write, with time uniform", () => {
    const m = createGlassMaterial("#a78bfa", 0.035);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.uniforms.uTime.value).toBe(0);
    expect((m.uniforms.uColor.value as Color).getHexString()).toBe("a78bfa");
  });
  it("lane material is additive and scales dashes by length", () => {
    const m = createLaneMaterial("#6366f1", 12);
    expect(m.blending).toBe(AdditiveBlending);
    expect(m.uniforms.uLen.value).toBe(12);
  });
  it("grid floor fades by radius", () => {
    expect(createGridFloorMaterial({ line: "#4f46e5", bg: "#05050c", radius: 32 }).uniforms.uRadius.value).toBe(32);
  });
  it("neonColor boosts only on the full tier", () => {
    expect(neonColor("#67e8f9", 3, "full").g).toBeGreaterThan(1);
    expect(neonColor("#67e8f9", 3, "lite").g).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bunx vitest run src/experience/fx/materials.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`src/experience/fx/materials.ts`, ported from the prototype)

```ts
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from "three";
import type { GpuTier } from "../types";

const END = "\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}";

const GLASS_VS =
  "varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }";
const GLASS_FS =
  `uniform vec3 uColor; uniform float uTime; uniform float uOp; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ float f = pow(1.-abs(dot(normalize(vN),normalize(vV))), 2.2);
  float top = smoothstep(.86,1.,vUv.y), base = 1.-smoothstep(0.,.12,vUv.y);
  float scan = 1.-smoothstep(0.,.03,abs(fract(vUv.y*.7 - uTime*.12)-.5));
  float a = uOp + f*.16 + top*.16 + base*.08 + scan*.04;
  gl_FragColor = vec4(uColor*(.22 + f*.8 + top*1.1 + base*.5), a);` + END;

export function createGlassMaterial(color: string, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 }, uOp: { value: opacity } },
    vertexShader: GLASS_VS,
    fragmentShader: GLASS_FS,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function createGridFloorMaterial({ line, bg, radius }: { line: string; bg: string; radius: number }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uBg: { value: new Color(bg) }, uLine: { value: new Color(line) }, uRadius: { value: radius } },
    vertexShader:
      "varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader:
      `uniform vec3 uBg; uniform vec3 uLine; uniform float uRadius; varying vec2 vW;
float grid(vec2 p){ vec2 g = abs(fract(p-.5)-.5)/fwidth(p); return 1.-min(min(g.x,g.y),1.); }
void main(){ float l1 = grid(vW), l5 = grid(vW/5.); float d = length(vW)/uRadius; float fade = 1.-smoothstep(.45,1.,d);
  vec3 c = uBg + uLine*(l1*.07 + l5*.2)*fade + vec3(.012,.012,.03)*(1.-d); gl_FragColor = vec4(c,1.);` + END,
  });
}

export function createLaneMaterial(color: string, length: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: length }, uColor: { value: new Color(color) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader:
      `uniform vec3 uColor; uniform float uTime; uniform float uLen; varying vec2 vUv;
void main(){ float y = abs(vUv.y-.5); float edge = smoothstep(.28,.44,y)*(1.-smoothstep(.44,.5,y));
  float dash = step(.55, fract(vUv.x*uLen*.5 - uTime*.9)) * (1.-smoothstep(.06,.14,y));
  float a = edge*.7 + dash*.45 + .05; gl_FragColor = vec4(uColor*a*1.8, a);` + END,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

export function neonColor(hex: string, k: number, tier: GpuTier): Color {
  return new Color(hex).multiplyScalar(tier === "full" ? k : 1);
}
```

`src/experience/fx/useUniformTime.ts`:

```ts
import { useFrame } from "@react-three/fiber";
import type { ShaderMaterial } from "three";
import { useHQStore } from "@/store/useHQStore";

export function useUniformTime(materials: ShaderMaterial[]): void {
  const reduced = useHQStore((s) => s.reducedMotion);
  useFrame((_, dt) => {
    if (reduced) return;
    for (const m of materials) if (m.uniforms.uTime) m.uniforms.uTime.value += dt;
  });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bunx vitest run src/experience/fx/materials.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/fx
rtk git commit -m "feat(fx): prototype glass, grid floor and lane shaders"
```

### Task B2: Scene lighting, fog, tone mapping and bloom

**Interfaces:**
- Produces: `sceneSettings(tier: GpuTier): SceneSettings`, where `SceneSettings = { fog: { color: string; near: number; far: number }; exposure: number; hemisphere: [string, string, number]; directional: { color: string; intensity: number; position: [number, number, number] }; bloom: { intensity: number; threshold: number; radius: number } | null }`.

- [ ] **Step 1: Write the failing test** (`src/experience/scene/settings.test.ts`)

```ts
import { expect, it } from "vitest";
import { sceneSettings } from "./settings";

it("matches the prototype on full and drops bloom on lite", () => {
  expect(sceneSettings("full")).toMatchObject({
    fog: { color: "#0a0a0f", near: 38, far: 80 },
    exposure: 1.05,
    hemisphere: ["#8b8cff", "#0a0a0f", 0.7],
    directional: { color: "#dfe3ff", intensity: 1.4, position: [10, 22, 12] },
    bloom: { intensity: 1.0, threshold: 0.32, radius: 0.4 },
  });
  expect(sceneSettings("lite").bloom).toBeNull();
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `bunx vitest run src/experience/scene/settings.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `src/experience/scene/settings.ts`

```ts
import type { GpuTier } from "../types";

export interface SceneSettings {
  fog: { color: string; near: number; far: number };
  exposure: number;
  hemisphere: [string, string, number];
  directional: { color: string; intensity: number; position: [number, number, number] };
  bloom: { intensity: number; threshold: number; radius: number } | null;
}

export function sceneSettings(tier: GpuTier): SceneSettings {
  return {
    fog: { color: "#0a0a0f", near: 38, far: 80 },
    exposure: 1.05,
    hemisphere: ["#8b8cff", "#0a0a0f", 0.7],
    directional: { color: "#dfe3ff", intensity: 1.4, position: [10, 22, 12] },
    bloom: tier === "full" ? { intensity: 1.0, threshold: 0.32, radius: 0.4 } : null,
  };
}
```

Then wire it in:
- **`Scene.tsx`:** replace `<fogExp2>` with `<fog attach="fog" args={[fog.color, fog.near, fog.far]} />` (for the L2 rail, use near 30 and far 70). Replace the two lights with the settings values, and set the background to `fog.color`.
- **`Experience.tsx`:** remove `flat`. In `onCreated`, set `gl.toneMapping = ACESFilmicToneMapping` and `gl.toneMappingExposure = settings.exposure`.
- **`Effects.tsx`:** render `<Bloom mipmapBlur luminanceThreshold={b.threshold} intensity={b.intensity} radius={b.radius} />` from the settings.
- **Neon materials:** keep `toneMapped={false}` and take their color from `neonColor(hex, k, tier)`. Body text keeps `toneMapped` true and unboosted, so it does not wash out.

- [ ] **Step 4: Run the test (PASS).** Then screenshot L1 at 1440×900 with `?tier=full` on a real GPU and attach it to the PR.
- [ ] **Step 5: Commit** `feat(scene): prototype lighting, fog, ACES and bloom`.

### Task B3: Grid floors, glass rooms, lanes and motes on every floor

**Interfaces:**
- Consumes: the B1 factories, `useUniformTime`, and `sceneSettings`.
- Produces:
  - `<GridFloor width depth radius line />`
  - `<GlassBox size position color fillOpacity edgeOpacity rim />`: same props as today plus `rim?: boolean` (default true). Side faces now use the glass shader.
  - `<LaneStrip from={[x, z]} to={[x, z]} color />`
  - `<Motes count={260} area={50} height={6} />`
  - `getGlassMaterial(color, opacity)`: a module-level cache keyed by `${color}|${opacity}`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/experience/tower/primitives.test.ts
import { expect, it } from "vitest";
import { getGlassMaterial } from "./primitives";

it("shares one glass material per color and opacity", () => {
  expect(getGlassMaterial("#a78bfa", 0.04)).toBe(getGlassMaterial("#a78bfa", 0.04));
  expect(getGlassMaterial("#a78bfa", 0.04)).not.toBe(getGlassMaterial("#f472b6", 0.04));
});
```

Extend the existing e2e draw-call test so every floor (L1 to RF, `?tier=lite`) asserts `__hq.renderer.calls < 150` after this change.

- [ ] **Step 2: Run them and confirm the unit test fails.** The e2e budget test may still pass at this point.
- [ ] **Step 3: Implement**
  - **`GridFloor`:** a `planeGeometry` rotated -90° on x, using `createGridFloorMaterial({ line: "#4f46e5", bg: "#0a0a0f", radius })`. Replace `GridLines` in `FloorLevel.tsx`, with radius equal to half the floor diagonal.
  - **`GlassBox`:**
    - Render four side planes, not top or bottom, sharing `getGlassMaterial(color, fillOpacity)`, with `renderOrder={2}`.
    - When `rim` is set, add top and base rim loops (`BoxEdges` at y = h and y = 0.02) in `neonColor(color, 1.4, tier)`, using `tier` from the store.
    - Register the cached materials with a single `useUniformTime` in `Scene.tsx` (export `allGlassMaterials()` from the cache).
  - **`LaneStrip`:** a plane of length `|to - from|` and width 0.75 at y 0.015, rotated along the segment, using `createLaneMaterial("#6366f1", length)`.
    - Replace `FloorLine` lanes in `floors/lobby/Lanes.tsx` and `floors/labs/PacketLanes.tsx` (keep the packets).
    - Add lanes between doors on L4 (`floors/library/layout.ts` door points) and RF (`floors/roof/layout.ts`).
  - **`Motes`:** a `points` object with `count` random positions in the `area × height` box, `pointsMaterial` color `#818cf8`, size 0.06, additive, `depthWrite={false}`, and `rotation.y += dt * 0.01`. Render it only when `tier === "full" && !reducedMotion`, with one instance on the current floor.
- [ ] **Step 4: Run the unit and e2e tests (PASS)**, then take screenshots of L1, L2, L3, L4 and RF at 3 viewports.
- [ ] **Step 5: Commit** `feat(floors): glass shader rooms, AA grid floors, animated lanes and motes`.

### Task B4: Rover glow, click marker and camera feel

**Interfaces:**
- Produces: `cameraOffsetScale(aspect: number): number` in `src/experience/camera/offset.ts`, and `__hq.marker: { visible: boolean; opacity: number }` for tests.

- [ ] **Step 1: Write the failing tests**

```ts
// src/experience/camera/offset.test.ts
import { expect, it } from "vitest";
import { cameraOffsetScale } from "./offset";

it("pulls the camera back on narrow screens like the prototype", () => {
  expect(cameraOffsetScale(16 / 9)).toBe(1);
  expect(cameraOffsetScale(1)).toBe(1.35);
  expect(cameraOffsetScale(390 / 844)).toBe(1.75);
});
```

```ts
// e2e/experience.spec.ts (new test)
test("click marker appears and fades", async ({ page }) => {
  await page.goto("/en?tier=lite");
  await page.getByTestId("hq").waitFor();
  await page.mouse.click(700, 600);
  await expect.poll(() => page.evaluate(() => (window as any).__hq.marker.visible)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__hq.marker.opacity), { timeout: 2000 }).toBeLessThan(0.05);
});
```

- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**
  - **`offset.ts`:** `export const cameraOffsetScale = (a: number) => (a < 0.8 ? 1.75 : a < 1.2 ? 1.35 : 1);`. Multiply the follow-rig offset by it. Target easing uses `1 - Math.exp(-dt * (reduced ? 8 : 4))`. Keep the PR #13 orbit and pitch clamp.
  - **`Rover.tsx`:**
    - **Glow pad:** an additive glow pad from a 128 px radial `CanvasTexture` (`rgba(103,232,249,.55)` to transparent) on a 2.6 u plane at y 0.025.
    - **Ring:** additive, radius 0.55 to 0.82 at opacity 0.55. Opacity rises with speed: `0.4 + 0.3 * speed / 12`.
    - **Point light:** `#67e8f9`, intensity 8, distance 7, decay 2, at y 0.6, on the `full` tier only.
    - **Neon accents:** boost the screen face and antenna tip with `neonColor(..., 3, tier)`. Add a thruster disc (cylinder 0.22 to 0.12, neon ×2.5) under the chassis.
    - **Idle bob:** amplitude 0.04 at 1.6 Hz, added to the existing tilt.
  - **Click marker:** a ring 0.3 to 0.42, opacity 1 at click, `scale *= 1 + dt * 1.5`, `opacity -= dt * 1.2`. Expose it as `__hq.marker`.
- [ ] **Step 4: Run the tests (PASS)** and take screenshots.
- [ ] **Step 5: Commit** `feat(rover): prototype glow, click marker and camera feel`.

### Task B5: Polish pass ("wow") and taller skills wall

Each step attaches before/after screenshots at 1440×900 and 390×844 to the PR and stays within the draw-call budget.

- [ ] **Step 1: Taller skills wall (owner request)**
  - **Write the failing test** (`src/experience/floors/lobby/layout.test.ts`): `expect(LOBBY.skillsWall.h).toBeGreaterThanOrEqual(8.5)`, plus the text block bottom: `h - ITEM_TOP - maxItems * ITEM_SIZE * ITEM_LINE >= 0.6`.
  - **`config.ts`:** `skillsWall: { x: 6, z: -22.5, w: 40, d: 1, h: 8.5, plinth: 0.35 }`.
  - **`SkillsWall.tsx`:** `ITEM_SIZE = 0.4`, `ITEM_LINE = 1.35`, `ITEM_TOP = 1.4`, `ICON = 0.4`, `ICON_GAP = 0.55`, `LABEL_SIZE = 0.46`. Raise the whole wall group by `plinth` onto a glowing plinth: a `GlassBox` 40 × 0.35 × 1.4 in green with the rim on.
  - **`camera/orbit.ts`:** raise the `L1:skills` zone `zoom` until a screenshot on arrival shows the full wall at 1440×900 and 390×844.
  - Update appendix 01 section 2. The Lobby overlap test stays green, since the footprint does not change.
  - **Commit** `feat(lobby): taller, more readable skills wall`.
- [ ] **Step 2: Shared proximity glow**
  - **Write the failing test** for the `proximityLevel(distance)` helper: it returns 0.15 at 6 u or more, 0.8 at 1.5 u or less, and is linear between.
  - **Implement** `ProximityGlow.tsx`: a floor pad (ring plus fill) whose opacity is `proximityLevel(distance from roverRuntime)`.
  - Put one at every `FloorLayout.doors[]` entry on every floor (it replaces the static door pads).
  - **Commit.**
- [ ] **Step 3: Lobby**
  - **Stats tiles:**
    - Glass shader panels with an accent top glow line.
    - **Count-up animation**, via a `countUp(value: string, t: number): string` helper with a unit test: `"800+"` at t=0.5 gives `"400+"`, `"7,350"` at t=1 gives `"7,350"`. Numeric parts animate from 0 over 900 ms on the first view of L1, and are instant under reduced motion.
    - Lift 0.15 u when the rover is within 4 u.
  - **Profile hologram:** two counter-rotating halo rings (0.4 and -0.25 rad/s), a scanline shimmer from the glass shader, and a 400 ms flicker-in when you arrive on L1.
  - **Cert wall:** a badge plate per certification with an issuer logo (`getTechLogo` or org logos) and a verify glyph. A plate brightens when the rover is within 5 u.
  - **Mission kiosk:** a screen texture that slowly scrolls the mission labels.
  - **Commit.**
- [ ] **Step 4: L2 Career corridor**
  - **Year gates:** neon arches boosted ×2 on full. They pulse once (`scale 1 → 1.04 → 1`, 400 ms) when the rover crosses the gate x.
  - **Trophy cups:** rotate at 0.3 rad/s with a glint sweep (an additive plane sliding across).
  - **Workshop bench screens:** a subtle glow.
  - **Commit.**
- [ ] **Step 5: L3 Labs**
  - **Pods:** use `GlassBox` with the shader. Add a lit door frame (neon ×1.6). Holograms brighten from 0.6 to 1 and rotate from 0.4 to 0.9 rad/s when the rover is within 6 u.
  - **Atrium boards:** a scanline.
  - **Hologram view:** nodes pop in with a scale ease over 180 ms, staggered by 60 ms, with brighter packets.
  - **Commit.**
- [ ] **Step 6: L4, Roof and elevator**
  - **Book spines:** lift 0.1 u and add an edge glow when hovered or near.
  - **Research plates:** a slow DOI shimmer.
  - **Roof beacon:** an additive cone (open cylinder, gradient alpha) plus expanding pulse rings every 2 s.
  - **Comms terminals:** blinking status LEDs.
  - **Elevator shaft:** the glass shader, light bands that travel with the cab while riding, and a floor indicator on each landing.
  - **Commit.**
- [ ] **Step 7: HUD glass from the prototype**
  - **Add to `globals.css`:**
    - `.glass { background: rgb(14 14 24 / .62); backdrop-filter: blur(18px) saturate(140%); border: 1px solid var(--color-glass-border); border-radius: 16px; box-shadow: 0 12px 40px rgb(0 0 0 / .45), inset 0 1px 0 rgb(255 255 255 / .05); }`, with `@media (pointer: coarse) { .glass { backdrop-filter: none; background: rgb(14 14 24 / .9); } }`.
    - `.eyebrow { font: 11px var(--font-mono); letter-spacing: .3em; text-transform: uppercase; color: var(--color-ink-3); }`
    - `.chip { padding: 6px 11px; border-radius: 999px; border: 1px solid var(--color-glass-border); background: rgb(255 255 255 / .04); font-size: 12px; }`
    - `.card { border: 1px solid var(--color-glass-border); border-radius: 12px; padding: 12px 14px; background: rgb(255 255 255 / .025); }`
  - **Apply them to:** ProfileCard, ElevatorPanel, ViewControls, RoomDrawer, RoverTerminal (prototype trace-panel styling for the mission list), CommandPalette and Controls.
  - **Accessibility:** axe must stay at zero serious violations.
  - **Commit.**
- [ ] **Step 8: Verify**
  - Run the full AGENTS.md suite and the per-floor draw-call budget.
  - On a real GPU (Chrome, `?tier=full`), record fps for each floor in the PR; target at least 55.
- [ ] **Step 9: Open a PR** "3D look and feel: prototype effects and component polish".

---

## Sub-project C: Page View revamp (design gate, then its own plan)

The Page View covers the `static` tier and the "Page view" toggle (`src/app/[locale]/**`, `src/components/**`).

**Decisions so far:**
- **Visual direction:** an editorial Neon Grid. It is dark, with strong typography and a clear grid, plus cards and sections that match the HUD glass from B5 step 7.
- **Restructured IA:**
  - **Home:** hero, summary, featured work from both wings, journey teaser, writing, contact CTA.
  - **Work:** `/labs`, an index filterable by wing and stack.
  - **Case study:** `/labs/[slug]` with problem, approach, architecture, results, gallery, stack and related work.
  - **Journey:** `/journey`, a readable timeline with filters.
  - **Writing:** `/library`, with the blog, research and talks.
  - **About and Contact:** `/contact`, plus restyled `/quick` and `/cv`.
- **URLs stay the same.** Only the nav labels and page structure change.

### Task C1: Design exploration and spec (coordinator session, with the owner)
- [ ] Use superpowers:brainstorming with the visual companion, using real content:
  - the nav and IA map
  - mockups for Home, Work index, Case study, Journey, Writing, and About/Contact, on desktop and mobile
  - iterate until the owner approves
- [ ] Write `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md`, covering:
  - IA and nav
  - grid, type scale and spacing
  - color tokens shared with the HUD
  - the component inventory: header/nav, footer, hero, section header, work card, case-study blocks, timeline row, metric tile, logo chip, gallery and CTA
  - page templates and responsive rules
  - accessibility
  - placement of "Explore in 3D" and "Back to 3D"
  - empty and loading states
- [ ] Get the owner's approval of the spec.

### Task C2: Page View implementation plan
- [ ] Use superpowers:writing-plans on the approved spec to write `docs/superpowers/plans/2026-10-10-pageview-revamp.md`. It must include task-by-task code and tests (Testing Library, axe, and Playwright visuals at 3 viewports) and keep URLs stable.

### Task C3: Build (child session "Page View revamp")
- [ ] Execute the C2 plan, in a PR titled "Page View revamp: editorial Neon Grid". It reuses the `.glass`, `.eyebrow`, `.chip` and `.card` tokens from B5 step 7. If B has not merged yet, C adds those tokens first and B rebases onto them.

---

## Execution order and sessions

| Session | Tasks | Depends on | Parallel with |
|---|---|---|---|
| Game-first load | A1, A2 | none | B, C1 |
| 3D look and feel | B0 to B5 | none | A, C1 |
| Page View design (this session, with the owner) | C1, C2 | none | A, B |
| Page View revamp build | C3 | C2 (and B5 step 7 tokens, or ships them itself) | after C2 |
| QA, performance and redeploy | full suite, real-GPU fps, LCP 2.5 s budget, prod smoke, redeploy | A, B, C3 | none |

## Self-review
- **Coverage:**
  - "Render the game first": A1 and A2.
  - "Skills wall height up a little": B5 step 1.
  - "Polish other components so it looks wow": B5 steps 2 to 7.
  - "Old prototype design, effects, UI/UX": B0 to B4 and B5 step 7.
  - "Page View revamp, structured UX, good design": C1 to C3.
- **Placeholders:** none in A and B. C intentionally gates its code-level plan on the approved design spec, per the writing-plans scope rule (a separate subsystem gets a separate plan).
- **Type consistency:**
  - `GpuTier` (existing)
  - `createGlassMaterial`, `createGridFloorMaterial`, `createLaneMaterial`, `neonColor`, `useUniformTime` (B1)
  - `sceneSettings` (B2)
  - `getGlassMaterial` (B3)
  - `cameraOffsetScale` (B4)
  - `proximityLevel`, `countUp` (B5)
  - `shouldBootFirst`, `bootFirstScript`, `releaseBootCover`, `onFirstFrame` (A)
