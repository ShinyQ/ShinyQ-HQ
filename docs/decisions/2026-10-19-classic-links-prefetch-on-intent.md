# Classic site

- Date: 2026-10-19

Owner request: set prefetch off on the header and nav links and prefetch on hover, focus or touchstart instead, keeping navigation snappy. `QuietLink` (header, nav bar and mobile tabs, crumbs, hero and section "more" links) renders `prefetch={false}` and calls next-intl's `router.prefetch(href)` once on `pointerenter`, `focus` or `touchstart`, never while the boot cover or the 3D tower hides the page; a link that passes its own `prefetch` keeps Next's behavior. On `/en` with no interaction, RSC requests went from 11 to 0 and the JS transferred in the first 8 s from 17 files (233.5 KB) to 13 files (213.4 KB) at 412x915 and 1440x900; hovering Work still fetches the `/labs` payload and chunk before the click, and the click stays a client-side navigation.
