# Design: ShinyQ HQ, Classic site

The locked system for the Classic site (the static pages; the 3D tower and its HUD keep their own look). Every
Hallmark run reads this first and the pages share it. Change it on purpose; the file is the rule. Rules for people
and agents: [`docs/agents/styling-and-i18n.md`](docs/agents/styling-and-i18n.md#styling) and
[`docs/agents/page-view.md`](docs/agents/page-view.md).

## System

- Genre: atmospheric (dark, technical: the Neon Grid)
- Shape of the first page: Feature Stack (draw a485e6), hero Ledge
- Theme: brand, kept (the Neon Grid: void paper, one cyan signal, Archivo condensed display, Inter body)
- Axes: dark/display-condensed/chromatic-cyan · posture: Restrained (cyan only on the primary action, focus, links on
  hover and the current item's glow)

## Tokens

`src/app/tokens.css` maps the roles onto the Neon Grid names in the `@theme` block of `src/app/globals.css`; there is
one palette. Tailwind's own `text-*` and `ease-*` names are untouched, so the HUD does not move.

```css
:root {
  --color-paper: var(--color-void);      /* #05050c, oklch(12% 0.018 283) */
  --color-paper-2: oklch(15.5% 0.019 284);  /* bands and wells */
  --color-ink: #f4f4f5;  --color-ink-2: #a1a1aa;  --color-muted: var(--color-ink-3);  /* #8b8b94 */
  --color-line: rgb(255 255 255 / 0.09);  --color-line-2: rgb(255 255 255 / 0.16);  /* hairlines */
  --color-accent: var(--color-cyan);  /* #22d3ee, ink on it: --color-void; focus ring: --color-cyan */
  --font-display: Archivo (wght 600 to 800, font-stretch 72% to 92%);  --font-sans: Inter;  --font-mono: JetBrains Mono;
  --radius-card: 12px;  --radius-control: 10px;  --radius-pill: 999px;
}
```

The spacing scale (`--space-2xs` 4px to `--space-3xl` 96px), the type roles (`--text-display`, `--text-display-s`,
`--text-title`, `--text-body`, `--text-meta`; the hero name, section heads and leads set their clamps in
`pageview.css`), the container (`--container` 1440px, `--gutter` 64/24/16px, `--gap-columns` 32px), the section gaps
(120, 144, 176px, smaller on phones) and `--dur-micro` (120ms) live in `tokens.css`. The global stylesheet has a
20,480 B gzip budget: a new token or class replaces bytes, it never only adds them.

## Type

- Display: Archivo condensed, weight 800, tracking -0.015em, `text-wrap: balance`. Hero name `pv-d-xl`, page titles
  `pv-d-l`, section heads `pv-h2` (52px at 1440), item titles `pv-h3`, figures `pv-num` (weight 700, tabular).
- Body: Inter 16px, line-height 1.65; leads `pv-lead` at 52ch; prose 65ch.
- Labels, captions and meta: `pv-meta`, Inter 14px in sentence case, untracked. Never mono, never capitals, never an
  eyebrow over a heading.
- Mono (`--font-mono`): dates (`pv-date`) and code only.

## Controls

- One filled primary a page: `pv-btn pv-btn-primary`, solid cyan with void ink (View CV on the landing). Secondaries
  are `pv-btn-ghost` (a `line-2` outline). Controls stand 48px, labels never wrap.
- Links that lead on (`pv-go`) are a verb or a destination with an underline, never an arrow glued to the text.
- Hover is one signal: a colour step or the `hq-glow` hairline glow (waived Reflex 29: the brand's cyan glow, hover,
  focus and the current item only). Focus is the instant 2px cyan outline.

## Composition

- One container, centred, 1312px of measure at 1440 and held at 1920.
- Sections part by the section gaps and by hairlines; one band of `paper-2` on the landing (Credentials).
- Compositions in use: Feature Stack rows (Selected work, Key projects), ruled rows (`pv-rows`) for indexes and
  ledgers, a 7/5 split (In short), a statement close, a mast footer.
- The Neon Grid (48px, faded where people read) sits behind the first screen (waived Reflex 47c); one fixed indigo
  bloom on the landing hero. No colored edge stripes, no decorative dots, no glass on Classic surfaces.

## Motion

Still by default: colour transitions at `--dur-micro`, no loops, no entrance, no scroll effects. The Motion setting
(`html[data-motion]`) and `prefers-reduced-motion` collapse every transition.

## Exports

`tokens.css` is the source of truth; no other format is exported.
