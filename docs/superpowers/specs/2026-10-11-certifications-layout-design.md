# Certifications at scale: design

Status: implemented in #46 (3b82309), 2026-10-11

Date: 2026-10-11. Owner request: "And also can you do other layout for certification if i had lots certif current board might be not hold and its not really agoo ui ux". Follow-up: certification links may not be framed (security); show our own preview instead.

## Decision

Three directions were prototyped at 7 and 30 certifications (A: badge gallery by issuer, B: timeline by year, C: featured + filterable grid). The owner picked the **hybrid**:

- **Page View: C.** Up to 3 featured cards, then a dense two-column list. From 10 certifications on, the full list (About and Quick view) gets issuer chips with counts, a status select and a search box. The home page shows the featured cards and the 6 newest rows, then links to the full list.
- **3D Lobby: A.** A curved holo-wall on an arc around the plaza (radius 19.6), every badge facing the hologram. Tabs: All, up to 3 issuers with 2 or more certifications, Other. Two rows of up to 6 (12 per page), a pager past 12. The panel sizes to the All tab's first page, so 7 certifications do not leave it half empty, and switching tabs never resizes it.
- **Shared preview card.** Every card, row and badge opens one in-site card (`CertDialog` in the site-wide `DialogHost`, on the shared `Modal`): issuer logo, exam code, full name, status, issued or planned month, renewal or expiry month, credential ID, and "Open credential" (new tab, `rel="noopener noreferrer"`). No iframe: Microsoft Learn, HackerRank and similar send `X-Frame-Options` / `frame-ancestors`, and the site CSP keeps `frame-src` to self.

## Data

`Certification` gains optional `credentialId`, `expires` (YYYY-MM) and `featured` (pin to the featured cards), and `status` allows `expired`. Order everywhere: earned newest first, then in progress, then expired. Issuer logos resolve through `getTechLogo` (`microsoft.svg` and `hackerrank.svg` added); joint programs ("Kominfo x IBM") render a letter mark. No "Verified" style labels (owner decision, sitewide).

## Units

| Unit | Role |
|---|---|
| `src/content/certs.ts` | Pure helpers: sort, featured, issuer counts, wall tabs, filter, query parsing, logos, short names |
| `src/content/cert-views.ts` | `certViews(locale)`: serializable, locale-resolved `CertView[]` |
| `src/components/certs/Certifications.tsx` | Server: featured cards and rows (data attributes for the island) |
| `src/components/certs/CertIndex.tsx` | Client island: delegated preview clicks (`openCert`), filter bar, toggles `hidden` |
| `src/components/certs/CertDialog.tsx` | Lazy preview modal, shown by `DialogHost` (locale layout, outside `#site-shell`) on the `hq:hud` "cert" command |
| `src/experience/floors/lobby/CertWall.tsx` + `layout.ts` | 3D wall and its pure arc layout |
| `src/experience/prototype/certs/` | Dev-only 30-entry fixture (23 fictional) and harness at `/{locale}/dev/certs` |

## Accessibility and performance

Cards and rows are buttons (`aria-haspopup="dialog"`, 44 px targets). The shared `Modal` traps focus, closes on Esc or backdrop click, becomes a full-screen sheet on phones, and `DialogHost` returns focus to the opener; its `aria-modal` pauses 3D input. The dialog chunk preloads on the first hover or focus of the list. Filters announce "Showing X of Y" politely. The wall uses instanced badge bodies and glows, one line mesh for outlines and one atlas mesh for logos (about 30 to 55 draw calls at any count); glow easing snaps under reduced motion. Page View ships one small island; rows stay server-rendered.

Featured cards keep the neutral card hairline and light up with `hq-glow` on hover and keyboard focus; neither the cards nor the preview card carry a colored top rule (R5 P10, owner decision 2026-10-13). The preview's status color lives in the status chip next to its label.

## Tests

`tests/hud/CertDialog.test.tsx` (no top rule, status chip per status), `tests/unit/certs.test.ts` (helpers against the live data and the 30-entry fixture), the certification wall block in `tests/unit/lobby-layout.test.ts` (footprint, no overlaps, paging, facing), `e2e/pageview.spec.ts` (preview card, keyboard, no frame, axe, Indonesian strings) and `e2e/experience.spec.ts` (preview over the tower holds the world keys).
