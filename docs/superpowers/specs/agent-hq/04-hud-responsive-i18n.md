# Appendix 04: HUD, Responsive Layout and Internationalization

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

## 1. Breakpoints

| Name | Width | Orientation rules |
|---|---|---|
| `mobile` | < 640 px | Portrait-first. Landscape phones use `tablet` camera values but keep mobile HUD sizes. |
| `tablet` | 640 to 1023 px | Drawer is a bottom sheet in portrait, a side panel in landscape (≥ 900 px wide) |
| `desktop` | ≥ 1024 px | Side panel drawer, full HUD |

Input type is detected separately with `matchMedia("(pointer: coarse)")` and updated on change (e.g. a laptop with touch).

## 2. HUD layout

| Element | Desktop | Tablet | Mobile |
|---|---|---|---|
| Profile card | Top-left, 280 px, round photo badge, name, title, floor | Same, 240 px | Collapsed pill: photo badge plus floor; tap to expand |
| Quick view | Not in the 3D HUD (Page View footer, Home hero and About) | Same | Same |
| Page view and Ask AI | Top-right, last in the bar: Page view (primary, solid cyan, a document icon left of the label), then Ask AI at the far right | Own row under the bar, same order | Second row under the menu row, same order |
| Search (⌘K) | Top-right icon button with a `⌘K` hint | Icon button | Icon button next to the menu |
| Language toggle | Top-right `EN / ID` segmented control | Same | Inside the menu |
| Sound toggle | Top-right speaker icon (on by default, starts on the first gesture; appendix 05 section 5) | Same | Inside the menu |
| Elevator panel | Right edge, vertical, 5 pill buttons "L3 · Work" (code circle plus the Page View name: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About), current floor highlighted; code-only circles while a room drawer is open | Same pills | Right edge, compact: 32 px code circle over a 9 px short name, 52 px buttons in a 52 px column (the old footprint, so horizontal swipes keep their area); every button has the accessible name "Go to L3, Work (Labs)" |
| Room drawer | Right side panel, 480 px (560 px from 1280 px wide, 600 px from 1400 px), full height minus margins | Portrait: bottom sheet. Landscape: side panel. | Bottom sheet with snap points at 55% and 92% height; scrolling the body expands it |
| Rover Terminal | Anchored next to the rover, 360 px | Same | Bottom sheet |
| Command palette | Centered modal, 640 px | Centered, 90% width | Full-screen sheet |
| Joystick and boost | Hidden (hold Shift to boost) | Bottom band, left, boost button beside the joystick (coarse pointers) | Bottom band, left, boost button above the joystick |
| Hint bar and walk pill | Bottom band, center: walk pill above keyboard hints | Same, touch hints, between the joystick and the view controls | Same, hints auto-hide after 6 s |
| View controls | Bottom band, right | Same | Bottom band, right, vertical |

- All HUD panels use the glass style (appendix 05) and must not cover the rover: the follow camera's screen-space target shifts left by 15% when the side drawer is open, and up by 20% when a bottom sheet is open.
- Safe areas: honor `env(safe-area-inset-*)` on iOS.
- Touch targets are at least 44 × 44 px.

## 3. Quick view and static pages

- `/quick` shows the full content on one page: profile, stats, software engineering highlights, AI highlights, timeline, projects, certifications, awards, library, contact.
- Every route under section 4.2 of the main spec renders full content as HTML at build time. When WebGL is available and the tier is not `static`, the route mounts the experience and opens the matching floor and room.
- A "Back to HQ" link is always visible on static pages, and an "Explore in 3D" banner appears when the device supports it.

## 4. Internationalization (EN / ID)

| Topic | Decision |
|---|---|
| Locales | `en` (default) and `id` |
| Routing | Locale prefix: `/en/...` and `/id/...`. `/` redirects by `navigator.language` (static redirect page), with the choice remembered in `localStorage`. The redirect runs before the stylesheet loads (post-build hoist) and `/` sends hreflang alternates as an HTTP `Link` header. |
| Library | `next-intl` (works with static export using `generateStaticParams` per locale) |
| UI strings | `messages/en.json` and `messages/id.json`, including rover terminal lines, faces captions, hints and mission labels |
| Content | Every user-facing text field in `site-content.json` is `LocalizedText = { en: string; id: string }`. Build fails if any `id` value is missing, unless the field is marked `untranslated: true`. |
| Blog posts | One MDX file per language (`slug.en.mdx`, `slug.id.mdx`). If a translation is missing, show the original with a language badge and a note. |
| Toggle | HUD control plus key `l`. Switching keeps the current floor and room (same path, other prefix). |
| Formatting | Dates and numbers with `Intl` per locale (`id-ID`: "Okt 2026", "1.250") |
| SEO | `hreflang` alternates on every page, localized `<title>` and description |

Tone: the EN voice is concise and confident. The ID voice is natural, professional Indonesian (not literal translation), using "saya", with English technical terms kept as-is (e.g. "RAG", "barge-in").

## 5. Copy guidelines

- Headline positioning: **AI and Software Engineer** (the CV's order since 2026-10-13; earlier "Software Engineer and AI Engineer"). Software engineering (2019 to 2025: backend, full-stack, fintech, SaaS) and AI engineering (2026: Azure AI platforms) are presented as one continuous craft, not as "old job vs new job".
- Write outcomes first, then how. Example: "Callers can interrupt the agent naturally (2 s to 0.2 s, controlled A/B)".
- Use "I" in EN and "saya" in ID. No buzzword stacks, no em dashes.
- Rover microcopy is playful but short (max 40 characters per line on the rover screen).
- Availability message (Roof beacon): "Open to interesting software and AI engineering conversations" / "Terbuka untuk diskusi menarik seputar software dan AI engineering".
