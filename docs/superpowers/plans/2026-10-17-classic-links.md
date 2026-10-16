# Shareable Classic and 3D Links Implementation Plan

Status: shipped in #181, 2026-10-17

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `?view=classic` opens the Classic site, stays in the URL through navigation and copy-paste, and the visitor's choice is remembered across tabs, while an explicit `?view=` always wins (Round 8 sub-project L).

**Architecture:** Pure, self-contained URL helpers (`src/lib/view-param.ts`) decide the view from the URL, this tab's choice (sessionStorage) and the remembered preference (localStorage); the inline head script inlines them via `toString()`. A small client module (`src/lib/view-pref.ts`) owns storage and the in-place URL rewrite; a layout island (`ViewParamSync`) keeps `?view=classic` on the URL after client navigations and on every internal `<a href>`. Share buttons copy canonical Classic and 3D URLs.

**Tech Stack:** Next.js 16 static export, React 19, next-intl, Vitest (node and jsdom), Playwright.

Spec: Round 8 design, section 6 (session-state plan `2026-10-17-round-8-design.md`).

## Global Constraints

- No em dashes (U+2014) anywhere, including commits and PR text.
- EN and ID for every user-facing string; `messages/en.json` and `messages/id.json` keep identical keys.
- Static export: no server runtime; the boot script stays inline and is re-hashed by `scripts/csp-hashes.ts`; no inline event handlers.
- Canonical and `og:url` stay without the parameter; the sitemap does not list `?view=` URLs.
- Bots and no-WebGL visitors keep getting the Classic site.
- Budgets: Classic JS 240 KB, HTML 80 KB; 3D first-frame path under 450 KB gzip.
- Touch targets at least 44 px; label-in-name rule.

## Model (decided)

- Values: `"page"` (Classic) and `"3d"`. Storage key `hq:view` in both sessionStorage (this tab) and localStorage (remembered preference).
- Precedence: explicit `?view=` (`classic` or `page` is Classic; `3d` or `architecture` is 3D) > this tab (session) > preference (local) > 3D.
- The head script pins the resolved view into sessionStorage on every load, so a tab keeps its view; the preference only decides new tabs and visits. Only Classic site / Back to 3D (and the settings entry) write the preference; a shared link does not.
- URL: Classic always shows `?view=classic` (`?view=page` is normalized to it); 3D shows no view choice (`?view=3d` is removed, `?view=architecture` is kept).
- Share: Classic link is `SITE_URL + path + ?view=classic + hash`; 3D link is the same path without the parameter (keeps the hash and `?view=architecture`); routes without a 3D landing map to their floor (`/blog/<slug>` to `/library`, others to the locale home).

---

### Task 1: Pure view helpers

**Files:**
- Create: `src/lib/view-param.ts`
- Test: `tests/unit/view-param.test.ts`

**Interfaces:**
- Produces: `type ViewChoice = "page" | "3d"`, `VIEW_KEY = "hq:view"`, `decideView(search, session, local): { view: ViewChoice; explicit: ViewChoice | null }`, `normalizeViewSearch(search, view): string`, `viewHref(href, view, base): string | null`, `threeDPath(pathname): string`, `shareUrls(origin, loc: { pathname; search; hash }): { classic: string; threeD: string }`.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { decideView, normalizeViewSearch, shareUrls, threeDPath, viewHref } from "@/lib/view-param";

describe("decideView", () => {
  it("an explicit parameter wins over the tab and the preference", () => {
    expect(decideView("?view=classic", "3d", "3d")).toEqual({ view: "page", explicit: "page" });
    expect(decideView("?tier=lite&view=page", null, null)).toEqual({ view: "page", explicit: "page" });
    expect(decideView("?view=3d", "page", "page")).toEqual({ view: "3d", explicit: "3d" });
    expect(decideView("?view=architecture", "page", "page")).toEqual({ view: "3d", explicit: "3d" });
  });
  it("then this tab, then the preference, then 3D", () => {
    expect(decideView("", "page", "3d")).toEqual({ view: "page", explicit: null });
    expect(decideView("", null, "page")).toEqual({ view: "page", explicit: null });
    expect(decideView("", "junk", "junk")).toEqual({ view: "3d", explicit: null });
    expect(decideView("?view=other", null, null)).toEqual({ view: "3d", explicit: null });
  });
});

describe("normalizeViewSearch", () => {
  it("Classic keeps other parameters and ends with view=classic", () => {
    expect(normalizeViewSearch("", "page")).toBe("?view=classic");
    expect(normalizeViewSearch("?view=page&tier=lite", "page")).toBe("?tier=lite&view=classic");
    expect(normalizeViewSearch("?wing=ai&view=classic", "page")).toBe("?wing=ai&view=classic");
    expect(normalizeViewSearch("?view=architecture", "page")).toBe("?view=classic");
  });
  it("3D drops the view choice but keeps the hologram view", () => {
    expect(normalizeViewSearch("?view=classic&tier=lite", "3d")).toBe("?tier=lite");
    expect(normalizeViewSearch("?view=3d", "3d")).toBe("");
    expect(normalizeViewSearch("?view=architecture", "3d")).toBe("?view=architecture");
    expect(normalizeViewSearch("", "3d")).toBe("");
  });
});

describe("viewHref", () => {
  const base = "https://kurniadi.pages.dev/en/labs?view=classic";
  it("adds view=classic to internal page links, keeping query and hash", () => {
    expect(viewHref("/en/journey", "page", base)).toBe("/en/journey?view=classic");
    expect(viewHref("/id/labs/clearbox#gallery", "page", base)).toBe("/id/labs/clearbox?view=classic#gallery");
    expect(viewHref("?wing=ai", "page", base)).toBe("/en/labs?wing=ai&view=classic");
  });
  it("leaves files, hashes, other origins and already-right links alone", () => {
    expect(viewHref("/cv/kurniadi.pdf", "page", base)).toBeNull();
    expect(viewHref("/og/en.jpg", "page", base)).toBeNull();
    expect(viewHref("#main", "page", base)).toBeNull();
    expect(viewHref("https://github.com/ShinyQ", "page", base)).toBeNull();
    expect(viewHref("mailto:a@b.c", "page", base)).toBeNull();
    expect(viewHref("/en?view=classic", "page", base)).toBeNull();
  });
  it("3D strips the parameter again", () => {
    expect(viewHref("/en/journey?view=classic", "3d", base)).toBe("/en/journey");
    expect(viewHref("/en/journey", "3d", base)).toBeNull();
  });
});

describe("threeDPath", () => {
  it("keeps gated routes and maps the rest to their floor", () => {
    expect(threeDPath("/en/labs/clearbox")).toBe("/en/labs/clearbox");
    expect(threeDPath("/id")).toBe("/id");
    expect(threeDPath("/en/blog/some-post")).toBe("/en/library");
    expect(threeDPath("/en/quick")).toBe("/en");
  });
});

describe("shareUrls", () => {
  const origin = "https://kurniadi.pages.dev";
  it("case study: Classic with the parameter, 3D without", () => {
    expect(shareUrls(origin, { pathname: "/en/labs/clearbox", search: "?view=classic&tier=lite", hash: "" })).toEqual({
      classic: "https://kurniadi.pages.dev/en/labs/clearbox?view=classic",
      threeD: "https://kurniadi.pages.dev/en/labs/clearbox",
    });
  });
  it("3D keeps the hash and the hologram view", () => {
    expect(shareUrls(origin, { pathname: "/en/labs/clearbox", search: "?view=architecture", hash: "" }).threeD).toBe(
      "https://kurniadi.pages.dev/en/labs/clearbox?view=architecture",
    );
    expect(shareUrls(origin, { pathname: "/en", search: "", hash: "#visits" })).toEqual({
      classic: "https://kurniadi.pages.dev/en?view=classic#visits",
      threeD: "https://kurniadi.pages.dev/en#visits",
    });
  });
  it("posts open the Writing floor in 3D", () => {
    expect(shareUrls(origin, { pathname: "/en/blog/some-post", search: "", hash: "" }).threeD).toBe("https://kurniadi.pages.dev/en/library");
  });
});
```

- [x] **Step 2: Run it to see it fail**: `bunx vitest run tests/unit/view-param.test.ts` (module not found).

- [x] **Step 3: Implement**

```ts
/**
 * Shareable Classic and 3D links (Round 8 L). `?view=classic` opens the Classic site and stays in the URL
 * (`?view=page` is its old alias); `?view=3d` or no choice opens the 3D HQ. Precedence: an explicit `?view=`,
 * then this tab (sessionStorage `hq:view`), then the remembered preference (localStorage `hq:view`), then 3D.
 * `decideView` and `normalizeViewSearch` are self-contained (no imports, no closures) so the head script
 * inlines them via toString().
 */
export type ViewChoice = "page" | "3d";
export const VIEW_KEY = "hq:view";

export function decideView(search: string, session: string | null, local: string | null): { view: ViewChoice; explicit: ViewChoice | null } {
  const m = /[?&]view=([^&#]*)/.exec(search);
  const v = m ? m[1] : "";
  const explicit: ViewChoice | null = v === "classic" || v === "page" ? "page" : v === "3d" || v === "architecture" ? "3d" : null;
  const pick = (s: string | null): ViewChoice | null => (s === "page" || s === "3d" ? s : null);
  return { view: explicit || pick(session) || pick(local) || "3d", explicit };
}

export function normalizeViewSearch(search: string, view: string): string {
  const parts = search
    .replace(/^\?/, "")
    .split("&")
    .filter((p) => p !== "" && p !== "view=classic" && p !== "view=page" && p !== "view=3d" && !(view === "page" && p.indexOf("view=") === 0));
  if (view === "page") parts.push("view=classic");
  return parts.length ? "?" + parts.join("&") : "";
}

const PAGE_PATH = /^\/(en|id)(\/[^.]*)?$/;
const GATED = /^\/(en|id)(\/(journey|labs)(\/[^/]+)?|\/(library|contact))?\/?$/;

/** The root-relative href with the view applied, or null when the link is not an internal page or is already right. */
export function viewHref(href: string, view: ViewChoice, base: string): string | null {
  if (!href || href.startsWith("#")) return null;
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.origin !== new URL(base).origin || !PAGE_PATH.test(url.pathname)) return null;
  const search = normalizeViewSearch(url.search, view);
  return search === url.search ? null : url.pathname + search + url.hash;
}

/** Where a path opens in 3D: gated routes stay, posts open the Writing floor, everything else the Lobby. */
export function threeDPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (GATED.test(path)) return path;
  const m = /^\/(en|id)(\/blog\/)?/.exec(path);
  if (!m) return "/en";
  return m[2] ? `/${m[1]}/library` : `/${m[1]}`;
}

/** Canonical share URLs for the current location (spec section 6): other query parameters are dropped. */
export function shareUrls(origin: string, loc: { pathname: string; search: string; hash: string }): { classic: string; threeD: string } {
  const path = loc.pathname.length > 1 ? loc.pathname.replace(/\/$/, "") : loc.pathname;
  const td = threeDPath(path);
  const same = td === path;
  const arch = same && /[?&]view=architecture(&|$)/.test(loc.search) ? "?view=architecture" : "";
  return { classic: `${origin}${path}?view=classic${loc.hash}`, threeD: `${origin}${td}${arch}${same ? loc.hash : ""}` };
}
```

- [x] **Step 4: Run tests**: `bunx vitest run tests/unit/view-param.test.ts` PASS.
- [x] **Step 5: Commit** `feat(view): pure helpers for shareable Classic and 3D links`.

### Task 2: Head script keeps `?view=classic`

**Files:**
- Modify: `src/lib/boot-first.ts` (remove `takePageViewParam`, use `decideView` and `normalizeViewSearch`, read localStorage `hq:view`, pin the tab).
- Modify: `tests/unit/boot-first.test.ts` (replace the `takePageViewParam` and `?view=page` blocks; `runScript` gets `local` entries and session `getItem`/`setItem`).

**Interfaces:**
- Consumes: `decideView`, `normalizeViewSearch`, `VIEW_KEY` from Task 1.

- [x] **Step 1: Failing tests** in `tests/unit/boot-first.test.ts`:

```ts
describe("bootFirstScript view choice", () => {
  it("?view=classic opens the Classic site, stays in the URL and pins the tab", () => {
    const r = runScript({ path: "/en/labs", search: "?view=classic" });
    expect(r.attrs.has("data-hq-boot")).toBe(false);
    expect(r.session.get("hq:view")).toBe("page");
    expect(r.replaced).toEqual([]);
  });
  it("?view=page is normalized to ?view=classic", () => {
    const r = runScript({ path: "/en", search: "?tier=lite&view=page" });
    expect(r.attrs.has("data-hq-boot")).toBe(false);
    expect(r.replaced).toEqual(["/en?tier=lite&view=classic"]);
  });
  it("the remembered Classic choice adds the parameter; an explicit ?view=3d wins and is dropped", () => {
    const classic = runScript({ path: "/en", local: { "hq:view": "page" } });
    expect(classic.attrs.has("data-hq-boot")).toBe(false);
    expect(classic.replaced).toEqual(["/en?view=classic"]);
    const game = runScript({ path: "/en", search: "?view=3d", local: { "hq:view": "page" }, stored: "page" });
    expect(game.attrs.get("data-hq-boot")).toBe("1");
    expect(game.session.get("hq:view")).toBe("3d");
    expect(game.replaced).toEqual(["/en"]);
  });
  it("a plain visit pins 3D and leaves the URL alone", () => {
    const r = runScript({ path: "/en" });
    expect(r.attrs.get("data-hq-boot")).toBe("1");
    expect(r.session.get("hq:view")).toBe("3d");
    expect(r.replaced).toEqual([]);
  });
});
```

- [x] **Step 2: Run**: `bunx vitest run tests/unit/boot-first.test.ts`, expect FAIL.
- [x] **Step 3: Implement**: the first two lines of `bootFirstScript()` become

```ts
  return `(function(){try{var s=null,l=null,p=null;try{s=sessionStorage.getItem("${VIEW_KEY}");p=sessionStorage.getItem("${PROBE_KEY}")}catch(e){}try{l=localStorage.getItem("${VIEW_KEY}")}catch(e){}
var v=(${decideView.toString()})(location.search,s,l);s=v.view;try{sessionStorage.setItem("${VIEW_KEY}",s)}catch(e){}var q=(${normalizeViewSearch.toString()})(location.search,s);if(q!==location.search){try{history.replaceState(history.state,"",location.pathname+q+location.hash)}catch(e){}}
```

`shouldBootFirst` keeps `storedView` (it now receives `"page"` or `"3d"`). Update its doc comment and the file comment of `takePageViewParam`'s former place. The test helper's `localStorage` stub gains `setItem`.

- [x] **Step 4: Run** `bunx vitest run tests/unit/boot-first.test.ts tests/unit/view-param.test.ts` PASS.
- [x] **Step 5: Commit** `feat(view): head script keeps ?view=classic and pins the tab's view`.

### Task 3: Client view state and the gate

**Files:**
- Create: `src/lib/view-pref.ts`
- Modify: `src/experience/ExperienceGate.tsx` (drop `VIEW_KEY`/`readView`; use `currentView`, `chooseView`)
- Modify: `src/hud/drawer/DrawerHost.tsx` (`setTabView("page")` instead of `sessionStorage.setItem(VIEW_KEY, "page")`)
- Modify: `src/components/BootCover.tsx`, `src/hud/BootOverlay.tsx`, `src/components/BootCard.tsx` comment (`href: "?view=classic"`)
- Modify: `src/components/page/EnterHqButton.tsx` (`data-hq-view="3d"`, so link sync skips it)
- Test: `tests/unit/view-pref.test.ts` (jsdom), `tests/hud/BootOverlay.test.tsx` (href)

**Interfaces:**
- Produces: `VIEW_EVENT = "hq:view"`, `PREF_EVENT = "hq:view-pref"`, `currentView(): ViewChoice`, `syncViewUrl(view?: ViewChoice): void`, `chooseView(view: ViewChoice): void`, `setTabView(view: ViewChoice): void`, `getViewPreference(): ViewChoice | null`, `setViewPreference(view: ViewChoice): void`, `subscribeViewPreference(listener: () => void): () => void`.

- [x] **Step 1: Failing test** (`// @vitest-environment jsdom`):

```ts
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); history.replaceState(null, "", "/en/labs"); });

it("currentView follows the URL, then the tab, then the preference, and pins the tab", () => {
  history.replaceState(null, "", "/en/labs?view=classic");
  expect(currentView()).toBe("page");
  expect(sessionStorage.getItem("hq:view")).toBe("page");
  history.replaceState(null, "", "/en/labs");
  expect(currentView()).toBe("page");
  sessionStorage.clear();
  localStorage.setItem("hq:view", "page");
  expect(currentView()).toBe("page");
});
it("chooseView writes the tab, the preference and the URL, and tells listeners", () => {
  const seen: string[] = [];
  window.addEventListener(VIEW_EVENT, () => seen.push("tab"));
  const off = subscribeViewPreference(() => seen.push("pref"));
  history.replaceState(null, "", "/en/labs?tier=lite#all");
  chooseView("page");
  expect(location.search).toBe("?tier=lite&view=classic");
  expect(location.hash).toBe("#all");
  expect(getViewPreference()).toBe("page");
  chooseView("3d");
  expect(location.search).toBe("?tier=lite");
  expect(sessionStorage.getItem("hq:view")).toBe("3d");
  expect(seen).toContain("tab");
  expect(seen).toContain("pref");
  off();
});
it("setViewPreference only changes new tabs", () => {
  sessionStorage.setItem("hq:view", "3d");
  setViewPreference("page");
  expect(currentView()).toBe("3d");
  expect(getViewPreference()).toBe("page");
});
```

- [x] **Step 2: Run**, FAIL.
- [x] **Step 3: Implement** `src/lib/view-pref.ts`:

```ts
import { decideView, normalizeViewSearch, VIEW_KEY, type ViewChoice } from "./view-param";

/** Fired on window when this tab switches between the Classic site and 3D. */
export const VIEW_EVENT = "hq:view";
/** Fired on window when the remembered preference changes ("Open links in"). */
export const PREF_EVENT = "hq:view-pref";

const get = (s: () => Storage) => { try { return s().getItem(VIEW_KEY); } catch { return null; } };
const put = (s: () => Storage, v: ViewChoice) => { try { s().setItem(VIEW_KEY, v); } catch { /* storage can be unavailable */ } };
const session = () => window.sessionStorage;
const local = () => window.localStorage;

export function currentView(): ViewChoice {
  const view = decideView(window.location.search, get(session), get(local)).view;
  put(session, view);
  return view;
}

export function syncViewUrl(view: ViewChoice = currentView()): void {
  const { pathname, search, hash } = window.location;
  const next = normalizeViewSearch(search, view);
  if (next !== search) window.history.replaceState(window.history.state, "", pathname + next + hash);
}

export function chooseView(view: ViewChoice): void {
  put(session, view);
  put(local, view);
  syncViewUrl(view);
  window.dispatchEvent(new Event(VIEW_EVENT));
  window.dispatchEvent(new Event(PREF_EVENT));
}

export function setTabView(view: ViewChoice): void {
  put(session, view);
}

export function getViewPreference(): ViewChoice | null {
  const v = get(local);
  return v === "page" || v === "3d" ? v : null;
}

export function setViewPreference(view: ViewChoice): void {
  put(local, view);
  window.dispatchEvent(new Event(PREF_EVENT));
}

export function subscribeViewPreference(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === VIEW_KEY && e.storageArea === window.localStorage) listener(); };
  window.addEventListener(PREF_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(PREF_EVENT, listener); window.removeEventListener("storage", onStorage); };
}
```

Gate: `useState(() => typeof window === "undefined" ? "3d" : currentView())`; `back3D` calls `chooseView("3d")`, `toPage` calls `chooseView("page")` (then `setView`). DrawerHost `onLeave`: `setTabView("page")`.

- [x] **Step 4: Run** `bunx vitest run tests/unit/view-pref.test.ts tests/hud` PASS.
- [x] **Step 5: Commit** `feat(view): Classic site and Back to 3D remember the choice and keep the URL`.

### Task 4: Links keep `?view=classic` (layout island)

**Files:**
- Create: `src/lib/view-links.ts`, `src/components/ViewParamSync.tsx`
- Modify: `src/app/[locale]/layout.tsx` (mount `<ViewParamSync />` inside the provider, after `DialogHost`)
- Test: `tests/unit/view-links.test.ts` (jsdom)

**Interfaces:**
- Consumes: `viewHref` (Task 1), `currentView`, `syncViewUrl`, `VIEW_EVENT` (Task 3).
- Produces: `syncViewLinks(root: ParentNode, view: ViewChoice, base: string): void`.

- [x] **Step 1: Failing test**:

```ts
// @vitest-environment jsdom
it("adds and removes the parameter on internal page links only", () => {
  document.body.innerHTML = `<a id="a" href="/en/journey">J</a><a id="b" href="/cv/x.pdf">CV</a><a id="c" href="/en?tier=lite" data-hq-view="3d">3D</a><a id="d" href="?view=classic" data-hq-page-link>C</a><a id="e" href="https://x.dev/en">X</a>`;
  syncViewLinks(document.body, "page", "https://kurniadi.pages.dev/en/labs");
  const href = (id: string) => document.getElementById(id)!.getAttribute("href");
  expect(href("a")).toBe("/en/journey?view=classic");
  expect(href("b")).toBe("/cv/x.pdf");
  expect(href("c")).toBe("/en?tier=lite");
  expect(href("d")).toBe("?view=classic");
  expect(href("e")).toBe("https://x.dev/en");
  syncViewLinks(document.body, "3d", "https://kurniadi.pages.dev/en/labs");
  expect(href("a")).toBe("/en/journey");
});
```

- [x] **Step 2: Run**, FAIL.
- [x] **Step 3: Implement**

`src/lib/view-links.ts`:

```ts
import { viewHref, type ViewChoice } from "./view-param";

/** Links that pick their own view (the boot card's Classic site, Enter the 3D HQ) or are downloads. */
const SKIP = "[data-hq-page-link],[data-hq-view],[download]";

export function syncViewLinks(root: ParentNode, view: ViewChoice, base: string): void {
  const links = root instanceof Element && root.matches("a[href]") ? [root] : [];
  for (const a of [...links, ...root.querySelectorAll("a[href]")]) {
    if (a.matches(SKIP)) continue;
    const next = viewHref(a.getAttribute("href") ?? "", view, base);
    if (next !== null) a.setAttribute("href", next);
  }
}
```

`src/components/ViewParamSync.tsx`:

```tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { syncViewLinks } from "@/lib/view-links";
import { currentView, syncViewUrl, VIEW_EVENT } from "@/lib/view-pref";

/**
 * Keeps `?view=classic` on the Classic site (Round 8 L): after every client navigation (Next links and
 * router.push drop it) it rewrites the URL in place, and it keeps every internal `<a href>` in step so
 * copy link, new tab and middle-click carry the view. Observes the DOM only while the tab is on the Classic site.
 */
function Sync() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    let observer: MutationObserver | null = null;
    const apply = () => {
      const view = currentView();
      syncViewUrl(view);
      syncViewLinks(document.body, view, window.location.href);
      if (view === "page" && !observer) {
        observer = new MutationObserver((records) => {
          const base = window.location.href;
          for (const r of records) {
            if (r.type === "attributes") syncViewLinks(r.target as Element, "page", base);
            else r.addedNodes.forEach((n) => n instanceof Element && syncViewLinks(n, "page", base));
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
      } else if (view === "3d" && observer) {
        observer.disconnect();
        observer = null;
      }
    };
    apply();
    window.addEventListener(VIEW_EVENT, apply);
    return () => {
      window.removeEventListener(VIEW_EVENT, apply);
      observer?.disconnect();
    };
  }, [pathname, search]);
  return null;
}

export function ViewParamSync() {
  return (
    <Suspense fallback={null}>
      <Sync />
    </Suspense>
  );
}
```

- [x] **Step 4: Run** unit tests, then `bun run build` (static export accepts `useSearchParams` under Suspense) PASS.
- [x] **Step 5: Commit** `feat(view): internal links and client navigation keep ?view=classic`.

### Task 5: Copy Classic link / Copy 3D link

**Files:**
- Create: `src/components/ShareLinks.tsx`
- Modify: `src/app/[locale]/labs/[slug]/page.tsx` (under the header actions), `src/app/[locale]/blog/[slug]/page.tsx` (after the tags), `src/hud/drawer/RoomDrawer.tsx` (Overflow menu items)
- Modify: `messages/en.json`, `messages/id.json` (`common.share`, `common.copyClassicLink`, `common.copy3dLink`, `common.linkCopied`)
- Test: `tests/hud/ShareLinks.test.tsx` (jsdom), extend `tests/hud/RoomDrawer.test.tsx`

**Interfaces:**
- Consumes: `shareUrls` (Task 1), `SITE_URL` from `@/lib/site`.
- Produces: `ShareLinks({ labels: { group: string; classic: string; threeD: string; copied: string }, variant?: "page" | "menu", itemClassName?: string })`.

Strings: EN `Share`, `Copy Classic link`, `Copy 3D link`, `Link copied`; ID `Bagikan`, `Salin tautan situs klasik`, `Salin tautan 3D`, `Tautan disalin`.

- [x] **Step 1: Failing test**: renders two buttons by name; clicking "Copy Classic link" on `/en/labs/clearbox` writes `${SITE_URL}/en/labs/clearbox?view=classic` to a mocked `navigator.clipboard.writeText` and shows "Link copied"; "Copy 3D link" writes `${SITE_URL}/en/labs/clearbox`.
- [x] **Step 2: Run**, FAIL.
- [x] **Step 3: Implement** a client component: a `role="group"` with `aria-label={labels.group}`; two `<button type="button">` (min 44 px); on click `navigator.clipboard.writeText(shareUrls(SITE_URL, window.location)[kind])`, then show `labels.copied` in an `aria-live="polite"` span for 2 s (same pattern as `CopyEmail`). `variant="page"` uses `pv-btn pv-btn-ghost`; `variant="menu"` renders `<li>` items with the caller's `itemClassName` (the drawer's `MENU_ITEM`). Pages pass labels from `getTranslations("common")`; the drawer from `useTranslations("common")`.
- [x] **Step 4: Run** `bunx vitest run tests/hud/ShareLinks.test.tsx tests/hud/RoomDrawer.test.tsx tests/unit` PASS.
- [x] **Step 5: Commit** `feat(view): Copy Classic link and Copy 3D link on case studies, posts and the drawer`.

### Task 6: "Open links in" setting (sibling I's registry)

**Files (only when `src/hud/settings/registry.ts` exists on main at rebase time):**
- Create: `src/hud/settings/defs/open-links.ts`; modify `src/hud/settings/defs/index.ts`; messages `hud.settings.openLinks.{label,hint,page,3d}` in EN and ID.

```ts
import { getViewPreference, setViewPreference, subscribeViewPreference } from "@/lib/view-pref";
import { defineSetting } from "../registry";

export const openLinks = defineSetting({
  id: "open-links",
  group: "general",
  order: 20,
  labelKey: "openLinks.label",
  hintKey: "openLinks.hint",
  control: {
    kind: "choice",
    options: [
      { value: "page", labelKey: "openLinks.page" },
      { value: "3d", labelKey: "openLinks.3d" },
    ],
    get: () => getViewPreference() ?? "3d",
    set: (value) => setViewPreference(value === "page" ? "page" : "3d"),
  },
  subscribe: subscribeViewPreference,
});
```

Strings: EN label `Open links in`, hint `New tabs and links without a view open here`, `Classic site`, `3D`; ID `Buka tautan di`, `Tab baru dan tautan tanpa pilihan tampilan terbuka di sini`, `Situs klasik`, `3D`. If the registry is not on main yet, skip; sibling I (or a follow-up) adds this file against the published `view-pref` API.

### Task 7: E2E and docs

**Files:**
- Create: `e2e/view-links.spec.ts`
- Modify: `e2e/boot-first.spec.ts` (Classic site link now keeps `?view=classic`), `e2e/experience.spec.ts` (`hq:view` is `3d` after Enter the 3D HQ)
- Docs: `docs/agents/page-view.md` (naming and a "Shareable links" section), `docs/agents/3d-experience.md` (head script and storage), `docs/agents/hud-and-drawer.md` (storage keys), `docs/features.md` (Classic site), `docs/decisions.md` (dated row), `README.md` (Classic site link uses `?view=classic`), `docs/superpowers/README.md` (plan status).

E2E cases (spec section 6), all with `?tier=lite` where 3D must be possible under automation:
1. Fresh context, `/en/labs?view=classic&tier=lite`: no `[data-testid=hq]`, `#site-shell` visible, URL keeps `view=classic`, `back-to-3d` visible; canonical link has no `view`.
2. Navigation: click the header "Journey" link, then a case-study card: URL has `view=classic` each time, no HQ; every `#site-shell a[href^="/en/"]` page link carries `view=classic`; the language switch href carries it.
3. Alias: `/en?view=page&tier=lite` ends on `/en?tier=lite&view=classic` with the Classic site.
4. Precedence: a context with `localStorage["hq:view"]="page"` opens `/en?tier=lite` as Classic (URL gains the parameter); `/en?view=3d&tier=lite` in a new tab of that context opens 3D and the URL drops `view=3d`; Back to 3D removes the parameter and stores `3d`.
5. Copy buttons: with clipboard permissions, "Copy Classic link" on `/en/labs/<slug>?view=classic` reads `.../en/labs/<slug>?view=classic`, "Copy 3D link" reads `.../en/labs/<slug>`; a post's 3D link reads `.../en/library`.

- [x] Run `bun run verify:quick`, `bun run e2e:changed`, commit `test(e2e): shareable Classic links` and `docs: shareable Classic and 3D links`.
