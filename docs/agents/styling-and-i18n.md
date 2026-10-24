# Styling and i18n

Locales, client messages, links, dates and page metadata, plus the design tokens, CSS layers, fonts, accessibility naming and the 3D HUD layout. Index: [AGENTS.md](../../AGENTS.md).

## i18n

### Locales and the root redirect

- Locales `en` (default) and `id`, always prefixed.
- `/` is a static page that redirects using `localStorage["hq:locale"]`, then `navigator.language`.
  - `scripts/root-redirect.ts` (part of `build`) copies the redirect above the stylesheet in `out/index.html`.
  - `public/_headers` sends hreflang `Link` alternates for `/`.

### Server components

- Call `assertLocale((await params).locale)`, then `setRequestLocale(locale)`.
- Use `getTranslations({ locale, namespace })`.

### Client messages

- The locale layout passes only `LAYOUT_NAMESPACES` to `NextIntlClientProvider`: what its client islands read (MissionHud, AskDock, DialogHost), as namespaces or dotted sub-paths.
  - Every Classic page carries this list, so keep it narrow: it names `hud.launcher`, `hud.palette`, `hud.status`, `hud.terminal` and `dialog.menu`, never all of `hud` or `dialog` (the 3D HUD's settings, pads, rooms and dialog layers reach the gate pages through `ClientMessages`).
  - A new string read by a layout island goes under one of those paths, or adds its own path to the list; `pickMessages` keeps the original objects, so React dedupes them against a gate page's full namespaces.
- Pages whose client islands read more (the 3D gate, Page View islands) wrap their content in `<ClientMessages>` (`src/components/ClientMessages.tsx`, all of `CLIENT_NAMESPACES`).
- Both lists live in `src/i18n/client-messages.ts`.
- Strings that only the 3D tower reads go in a namespace that is in `CLIENT_NAMESPACES` but not in `LAYOUT_NAMESPACES` (`engine`, the B1 Engine Room; `office`, the Agent Office: shared keys `office.agent`, `office.state`, `office.activity` and `office.clientProject` for the 3D office and the Classic card, 3D keys under `office.3d`, of which the Classic card also resolves `office.3d.offDuty` and `office.3d.drawer.disabled` on the server; the Classic card's `office.classic` is server-only, see below). The layout namespaces ride in every page's HTML, and `/en/quick` is at its 82 KB HTML budget (83,968 B, `lighthouserc.json`), so a layout namespace never gets 3D-only text. Components in the layout read such text through a resolved label passed in (see [Unlock moment](hud-and-drawer.md#unlock-moment)).
- A lazy dialog may fetch its own strings with its data and pass them through a nested `NextIntlClientProvider`: the study guide dialog reads `guides` (plus the shared `reader` strings, since the nested provider replaces the layout's messages) from `/data/guides/{locale}.json`. Such namespaces are listed in `FETCHED_NAMESPACES`, never in `LAYOUT_NAMESPACES` or `CLIENT_NAMESPACES` (no island under `ClientMessages` reads `guides`, so it would only add bytes to every wrapped page; the `/library` shelf is a server component and reads it with `getTranslations`). The namespace check exempts them per file, not per namespace: only the fetching files listed in `FETCHING_FILES` (`tests/unit/client-namespaces.test.ts`: `GuideDialog.tsx`) may read `guides` from the layout or an unwrapped page; any other island that reads it needs the namespace back in `CLIENT_NAMESPACES` and a `ClientMessages` wrapper.
- Server-only namespaces (`seo`, `meta`, `nav`, `footer`, ...) never reach the RSC payload.
- Server-only sub-paths of a client namespace are listed in `SERVER_PATHS` (`office.classic`: the Classic office card resolves them on the server and passes them as props); `ClientMessages` drops them with `omitMessages`, and no client module may read them.
- In client modules call `useTranslations` with a literal namespace (never `useMessages`).
- `tests/unit/client-namespaces.test.ts` walks the client import graph and fails when a list misses a namespace or path, lists one nothing reads, or a page needs `ClientMessages`.

### Links and dates

- Use `Link` from `@/i18n/navigation` for internal links (it adds the locale prefix).
- Dates go through `src/lib/format.ts` (`formatYearMonth`, `formatPeriod`, `formatDate`).
- Ranges are written "X to Y" / "X hingga Y", never with dashes.

### Metadata

- Every `generateMetadata` returns `seoMetadata(locale, path)` from `src/lib/seo.ts`.
  - Titles lead with the owner's name; the role comes from `profile.headline`.
  - Descriptions are 140 to 160 characters: a lead from content or the `seo` messages, plus the longest closing line from `seo.more.<page>` or the case-study facts that fits.
  - So descriptions adapt when the headline, the motto or a tagline changes.
  - `tests/unit/seo-copy.test.ts` checks every page in both locales.
- It goes through `pageMetadata` (`src/lib/site.ts`: canonical, `hreflang`, Open Graph, Twitter, `title.absolute`).
  - A page that sets `openGraph` replaces the parent's, so never build metadata by hand.
- Pages render `<JsonLd data={pageJsonLd(locale, path)} />` for their BreadcrumbList (and the pod or post item).
- `seoFor` returns two titles:
  - `title`: share copy (Open Graph, Twitter, card alt, JSON-LD).
  - `searchTitle`: the `<title>`, at most `SEARCH_TITLE_MAX` 60 characters via `fitTitle` (full name, then first name, then the bare content title). Home's is `{name}: {role}` (the headline; the city stays in the description, since with it the title passes 60).
  - Search titles are unique per locale, and so are share titles.
- `og:url` always equals the canonical, and `/` declares `/en` as both (`src/app/(root)/layout.tsx`).
- Search engine verification comes only from the `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` build variables (`searchVerification`, on `/`, `/en`, `/id`); never commit a token in code.
- The sitemap's `lastmod` comes from content dates only (`lastModified` in `src/lib/routes.ts`).

### Share cards

- `ogImagePath(...)`: 1200x630 baseline JPEG with a JFIF header, at most 300 KB.
  - Satori PNG re-encoded with sharp at build time.
  - `og:image:secure_url` from `shareImage`.
  - Share tags within the first 8 KB (`lateShareTags`).
- Backgrounds are committed floor stills (`bun run og:stills`, re-run after a large floor change), never WebGL at build.
- No edge stripes: an accent dot chip and a full-outline glow instead.

### New routes

- New page routes must be added to `src/lib/routes.ts` (sitemap).
- New pods and hosted posts get OG cards and sitemap entries automatically.

## Styling

### Tokens and utility classes

- Neon Grid tokens from appendix 05 live in `src/app/globals.css` (`@theme`):
  - `void`, `glass`, `glass-border`, `ink`, `ink-2`, `ink-3`
  - accents `cyan violet pink green amber blue white`
- `ink-3` is `#8b8b94` (not `#71717a`) to keep AA contrast on the void.
- Utility classes: `.glass`, `.label` (mono uppercase metadata), `.link`, `.prose-hq` (MDX).
- Accent classes must come from the static maps in `src/lib/accent.ts` so Tailwind can see them.
- Tailwind generates utilities only from shipped sources: `globals.css` excludes `docs`, `e2e`, `tests`, `scripts`, `workers`, `functions` and the root guides with `@source not` (their words, such as Playwright `:visible` selectors or edge-stripe examples, used to add dead utilities to the shared stylesheet). A class written only in those folders is never generated.
- CSS modules (`*.module.css`, today only the shared PDF reader's `PdfReader.module.css`) skip the Tailwind loader (`turbopack.rules` in `next.config.ts`) and keep Next's scoped class names. They get no Tailwind processing: no `@apply`, `@variant`, `@theme` or `theme()`, and Tailwind utilities written inside them are not generated. Use plain CSS with the `var(--...)` tokens. The reader module has no motion today; motion in a CSS module must follow the Motion setting by hand, with the same two selectors the `motion-reduce` variant expands to in `globals.css` (`:root[data-motion="reduced"] .x` and `:root:not([data-motion="full"]) .x` inside `@media (prefers-reduced-motion: reduce)`), never a bare media query alone. A CSS module ships with the chunk that imports it, so styles used only by a lazy chunk stay out of the global stylesheet and its 20,480 B budget.
- HUD tokens shared with the 3D overlay (prototype values):
  - `.glass` (blur 18 px, drops the blur on coarse pointers), `.eyebrow`, `.chip` (+ `.chip-count`, `aria-pressed` inverts), `.card`
  - colors `line`, `line-2`, `surface`, `surface-2`

### No colored edge stripes (owner decision)

- Never mark state, category or selection with:
  - a colored left or top border
  - a thin bar on an edge (an absolute `h-0.5`/`w-1` element or a `::before`/`::after` bar)
  - an inset edge shadow
- Instead, put a dot or icon chip next to the label:
  - `AccentDot` from `src/components/AccentDot.tsx`: `tone` is an accent or `muted`/`line`; `size` `sm` 6 px or `md` 8 px; `glow` for the current or selected item.
  - CSS `.hq-dot`, `.hq-dot-md`, `.hq-dot-glow`.
  - Or the existing `Marker`/`TypeMarker`, `IssuerMark` and `TypeIcon`.
- Use `hq-glow` for interaction:
  - The whole hairline lights up with a soft glow on hover, `:focus-visible`, `aria-current="true"` and `aria-selected="true"`.
  - `[--hq-glow:var(--color-violet)]` recolors it; the global focus outline stays.
- What stays:
  - Cards keep the neutral `--color-line` hairline.
  - Neutral rules in `line`, `line-2` or `glass-border`, and bottom tab indicators.
- Cmd-K rows show their dot only when selected or hovered (the slot stays for alignment).
- In 3D the L1 stats tiles follow the same rule (a glowing dot beside the value, no top line); the other in-world neon edges are full outlines and stay.
- Guards:
  - `tests/unit/edge-accents.test.ts` (static scan of `src`, scanner in `tests/helpers/edge-accents.ts`).
  - `findEdgeAccents` (`e2e/edge-audit.ts`): `pageview.spec.ts` runs it on every template, Cmd-K, the Ask dock and the certification preview; `drawer-solid.spec.ts` on the drawer and the HUD.
- Before/after captures for visual changes: `captureShot` and `diffShotDirs` in `e2e/region-diff.ts`.
  - Example: the `P10_SHOTS` block in `e2e/pageview-visual.spec.ts`, which also diffs the 3D stats tiles through `__hq.interact.project`.

### Solid panels

- `.glass-solid` (add next to `.glass`) makes a panel near-opaque (`rgb(10 10 18 / .94)`, solid on coarse pointers) while keeping the glass edge, and drops the backdrop blur.
- Every HUD panel and pill over the 3D world uses it, so in-world text never shows through: top bar, profile card, Glass Drawer, palette, hologram cards, terminal.
- The side drawer starts below the HUD top bar: `top-[124px]` below 1024 px (under the Classic site and Ask AI row) and `lg:top-[76px]`.
- Hints hide while a room is open.

### Blur policy

- No `backdrop-filter`:
  - under a panel that is at least 94% opaque (`.glass-solid`, the Rover menu, the lightbox)
  - on a scrim that a full-screen panel hides (the palette and non-sheet modals below 640 px use `sm:backdrop-blur-sm`)
  - on coarse pointers
- `.glass` (64% fill) keeps its 18 px blur on fine pointers.
- Verify blur changes with a screenshot diff of the panel over a fixed background, or with `bun scripts/visual-gate.ts`.

### Page View layer

- `src/app/pageview.css` (`pv-` classes):
  - type scale `pv-d-xl pv-d-l pv-h2 pv-h3 pv-h3-card pv-lead pv-body pv-card-text pv-small pv-data pv-date pv-num`
  - `pv-mark`, `pv-btn`, `pv-go`, `pv-rows`, `pv-result`, `pv-stretch`, header, flat filter bar (`pv-filters`), ToC
- Grid spans use Tailwind utilities with the default `md`/`lg` breakpoints.
- Page View structure: [page-view.md](page-view.md).

### Fonts

| Font | Use | Range |
|---|---|---|
| Inter | body | wght 400 to 800 |
| JetBrains Mono | data only | 400 to 700 |
| Archivo (`--font-display`) | condensed titles and numerals | wght 600 to 800, `font-stretch` 72% to 92% |

- Self-hosted with `next/font/local` (`src/app/fonts.ts`) as cuts narrowed to:
  - those ranges
  - ASCII plus typographic punctuation (Inter also Latin-1 letters)
  - the OpenType features in use
- About 55 KB for all three; they are kept small because all three are preloaded and count toward LCP.
- A weight or width outside a range is clamped.
- A character outside the cut falls back to a system font; `tests/content/fonts.test.ts` fails on one in content, messages or components.
  - Regenerate the cut instead (`src/assets/fonts/README.md`).
- Touch targets at least 44 px (`min-h-11`).
  - Exception for dense mouse UI: a target may shrink to 36 px only under `pointer-fine:` (`pointer-fine:min-h-9 pointer-fine:min-w-9`), so it stays 44 px on any coarse pointer. Used by the shared PDF reader (`COMPACT_BUTTON` and `PILL_BUTTON` in `src/components/pdf-reader/ui.tsx`).

### Label in name

- WCAG 2.5.3, axe `label-content-name-mismatch` (serious since axe-core 4.14).
- An `aria-label` starts with the control's visible text, including a shortcut or `Esc` chip outside parentheses (axe drops parenthetical text).
- Context goes after it: `"L3 Work: go to floor (Labs)"`, `"⌘K, open search"`, `"Esc, close search"`.
- axe joins adjacent elements' text without a space, so put a `{" "}` text node between visible spans (flex and grid collapse it).
- `tests/unit/label-in-name.test.ts` guards the elevator, search and palette close names.

### 3D HUD layout (owner decision)

- Layout per device (`hudLayout` in `src/hud/layout.ts`; `Hud` sets `html[data-hq-hud="phone|tablet|desktop"]`):
  - desktop (fine pointer, at least 1024 px): the profile card, the top bar and the elevator rail;
  - phones and tablets (any coarse pointer counts as a tablet) get the "Corners" HUD:
    - top left the floor chip (`FloorChip`, opens the floor sheet; tablets also show the floor name);
    - top right `hud-topbar`: Ask AI (icon only on phones), search on tablets, then the menu button (`HudMenu`, `data-testid="hud-menu"`, it carries the `rover-menu` onboarding spotlight);
    - the menu opens a side sheet (`menu-sheet`, a bottom sheet on phones): the profile, the actions (Classic site `page-view` as the primary, Search on phones, Rover menu, Rotate left and right, Map, Controls) and the settings panel;
    - under the top right cluster the minimap (`hud-minimap`: phones `top-[64px] right-3`, tablets `top-[76px] right-4`), hidden on phones while a room is open;
    - `FloorNotice` and the L2 `YearChip` place by the HUD layout (never the viewport): under the floor chip on phones, clear of the minimap.
    - no profile card or elevator rail; the key `,` opens the menu sheet.
- Desktop settings: a round gear (`settings-open`) above the view controls in the bottom right opens the settings sheet (`settings-sheet`); the key `,` toggles it. The minimap sits above the gear in the same column (`hud-corner`).
- Desktop elevator rail (`ElevatorPanel`): centred on the right edge between two equal flex spacers (`elevator-column`) whose minimum heights, `--hq-rail-top` and `--hq-rail-bottom`, `useRailRoom` in `Hud.tsx` measures from the top bar and the `hud-corner` stack (8 px gap, ResizeObserver). Where there is room it stays centred on the screen; on short screens it rises clear of the minimap instead of covering it. Never place the rail or the corner stack with fixed offsets.
- Minimap (`src/hud/minimap/`): `model.ts` is pure (no React, no three; `tests/unit/minimap-model.test.ts` guards the import graph). `Minimap` is a round button (`minimap`, phone 72 px, tablet 112 px, desktop 96 px) with an aria-hidden SVG centred on the rover (`windowBox(rover, MINIMAP_RADIUS)`), north-up (SVG y is world z); it re-renders from the store's 10 Hz `rover` mirror, never its own loop, and reads `interactRuntime.items` through `useSyncExternalStore`. Hidden when `minimapPref` is off or in boot, intro and hologram.
  - The overview (`map-overview`, `MapOverview`) opens from the minimap, the `N` key and the menu's Map action (`useHudToggle("map")`): the floor SVG with labels (aria-hidden) and the room list (`map-room` buttons, name starts with the label, visited ones add "visited"). A room closes it and emits `{ type: "interact", item }` (point-and-go).
- Desktop top bar:
  - No Quick view (it stays in the Page View footer, the Home hero and About).
  - Classic site (`hud.pageView`, the Page View button) is the one primary (solid cyan) control, with the Ask AI pill on its right at the far right.
  - The Motion button ("Motion setting") sits right of Sound.
- Rows by width:
  - From 1024 px everything is one row.
  - From 1024 to 1099 px the search button drops its "Ctrl K" chip on Windows and Linux (never "⌘K"), so the Indonesian row clears the profile card.
    - `compactShortcut` on `HudLaunchers`, checked by `e2e/hud.spec.ts` for both chips and both locales.
- Bottom band: the screen bottom is one flex band (`BottomBand` in `Hud.tsx`):
  - left: the joystick and the Boost button on coarse pointers (beside it on tablets, above it on phones; a joystick double tap toggles boost too)
  - center: point-and-go's `InteractStatus` above the controls hint (no hint on phones)
  - right: desktops the minimap and the settings gear above the three view controls; Corners one reset button (`ResetView`)
  - Nothing in the band can overlap; it hugs the bottom edge above the safe area.
  - `e2e/hud.spec.ts` checks the boxes at 834 x 1112 and 390 x 844, and that no HUD box overlaps another (the rail, the minimap, the gear, the view controls, the top bar, the profile card or floor chip, the joystick, the Boost button) at 1024 x 640, 1280 x 720, 1366 x 768, 1440 x 900, 1920 x 1080, 1180 x 820, 820 x 1180 and 844 x 390 in both locales.
- The profile card shows no rooms-visited counter; the store still records `visited`.
