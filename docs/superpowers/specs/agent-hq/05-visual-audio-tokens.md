# Appendix 05: Visual and Audio Design Tokens

Status: living appendix, implemented across #1 to #12 (phases 0 to 5) and the later rounds, kept current with the code (last updated in #83)

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

## 1. Color tokens

| Token | Value | Use |
|---|---|---|
| `bg.void` | `#05050c` | Scene clear color, page background |
| `bg.vignette` | `#1e1b4b` at 0.7 → 0 radial | Scene background gradient |
| `grid.line` | `#6366f1` at 0.30 opacity | Floor grid |
| `lane` | `#818cf8` | Floor lanes |
| `packet` | `#c7d2fe` | Data packets |
| `glass.bg` | `rgba(15,15,25,0.82)` | HUD panels |
| `glass.border` | `#27272a` | HUD panel borders |
| `text.primary` | `#f4f4f5` | |
| `text.secondary` | `#a1a1aa` | |
| `text.muted` | `#71717a` | |
| `accent.cyan` | `#22d3ee` | Rover eyes, elevator, focus rings, links |
| `floor.L1` | `#34d399` | Lobby |
| `floor.L2` | `#fbbf24` | Career Archive |
| `floor.L3` | `#a78bfa` | Labs (Product Engineering wing tint `#22d3ee`, AI Engineering wing tint `#a78bfa`) |
| `floor.L4` | `#e5e7eb` | Library |
| `floor.RF` | `#60a5fa` | Roof |
| `pod.*` | violet `#a78bfa`, pink `#f472b6`, green `#34d399`, amber `#fbbf24`, cyan `#22d3ee`, blue `#60a5fa`, white `#e5e7eb` | Assigned per pod in content (`accent`) |
| `terminal.bg` | `#03140e` | Rover screen and terminal UI |
| `terminal.fg` | `#34d399` | |
| `terminal.hi` | `#ecfdf5` | Selected line |

All HUD text must meet WCAG AA contrast against `glass.bg`.

Blur: translucent `.glass` panels (64% fill) blur the canvas behind them on fine pointers only. Panels at least 94% opaque (`.glass-solid`, the terminal, the lightbox) and scrims hidden behind full-screen phone panels use no `backdrop-filter`, because a blur over the live canvas is recomputed every frame.

### Markers, selection and edges (R5 P10, owner decision 2026-10-13)

- Color marks state, category and selection only as a dot or icon chip next to the label (`AccentDot`: 6 px, 8 px in panel bars, a soft halo for the current or selected item) and as a full-outline glow on hover, keyboard focus, current and selected states (`hq-glow`: the whole hairline at 50% of the accent plus `0 0 24px -8px` of the accent).
- Never a colored left or top edge on a card, row, panel or dialog: no one-sided colored border, no thin bar on an edge, no inset edge shadow. Cards keep one uniform neutral hairline (`line`).
- Neutral structural rules (`line`, `line-2`, `glass.border`) and bottom tab indicators stay. In the 3D tower the L1 stats tiles mark their accent with a glowing dot beside the value instead of a top line; the other in-world neon edges are full outlines and part of the look.

## 2. Materials and lighting

| Item | Spec |
|---|---|
| Room edges | `LineSegments` with `LineBasicMaterial`, color = accent, opacity 0.95 |
| Room walls | Glass `ShaderMaterial` (fresnel, top band, scanline), accent color, `transparent`, `depthWrite: false`, `DoubleSide`, shared per color and opacity; full-tier fills scaled x0.4 (linear composer blending) |
| Room floors | Accent color, opacity 0.08 |
| Holograms | `MeshBasicMaterial`, `toneMapped: false`, neon colors pushed above 1.0 on the full tier so bloom picks them up |
| Lights | 1 hemisphere light, 1 directional (no shadows), 1 rover point light on the full tier |
| Shadows | Blob decals only, no shadow maps |
| Bloom (full tier) | threshold 0.6, intensity 0.9, radius 0.45, mipmap blur with 8 levels; the runtime safety net lowers levels only together with the DPR (same on-screen glow), and by 2 more only as its last step |
| Anti-aliasing | The canvas never multisamples. Full tier: composer MSAA 4 below DPR 1.5, none from DPR 1.5 up (the screen antialiases). Lite: none |
| Fog | Linear, color `bg.void`, per camera rig: follow 38 to 80, rail 40 to 95, intro 90 to 200 |

## 3. Typography

| Token | Font | Size / line height | Use |
|---|---|---|---|
| `display` | Inter 800 | 32 / 38 (mobile 26 / 32) | Drawer titles, hologram titles |
| `title` | Inter 700 | 20 / 26 | Section titles |
| `body` | Inter 400 | 15 / 24 | Drawer body, static pages |
| `small` | Inter 400 | 13 / 20 | Secondary text |
| `label` | JetBrains Mono 500 | 11 / 14, letter-spacing 0.08em, uppercase | Floor codes, metadata |
| `terminal` | JetBrains Mono 400 | 13 / 20 | Rover terminal, README view |
| `metric` | Inter 800 | 28 / 32 | Metric tiles |

Fonts are self-hosted (`next/font`), subset to Latin, `font-display: swap`. In-world 3D text uses drei `Text` (troika), which cannot read WOFF2: it loads separate WOFF cuts of Inter and JetBrains Mono, subset to the in-world characters and served under content-hashed names (about 58 KB, `src/assets/fonts/README.md`).

## 4. Motion

| Token | Value |
|---|---|
| `ease.standard` | cubic-bezier(0.2, 0.8, 0.2, 1) |
| `ease.inOut` | easeInOutCubic |
| `dur.fast` | 150 ms (HUD hovers) |
| `dur.base` | 300 ms (drawer, palette) |
| `dur.slow` | 800 ms (elevator dolly) |
| Hologram idle rotation | 0.4 rad/s |
| Packet speed | 2 u/s on lanes |

Reduced motion disables camera sway, idle rotations above 0.2 rad/s, particles and typing effects.

## 5. Audio

| Sound | Trigger | Length | Notes |
|---|---|---|---|
| Ambient hum | Loop while unmuted | 20 s seamless loop | Low-pass synth pad, -24 LUFS |
| Rover beep | Mission chosen, terminal open | < 150 ms | Two-tone chirp |
| Tread rumble | Rover speed > 1 u/s | Loop | Volume follows speed |
| Elevator ding | Elevator arrival | < 600 ms | |
| Drawer whoosh | Drawer open/close | < 250 ms | |
| Key click | Terminal typing | < 30 ms | Max 20 per second |

- On by default (owner decision, 2026-10-10; this spec said muted by default before). Browsers block autoplay, so the AudioContext and the ambient hum start on the first user gesture in the HQ (the Boot rover button or the first click, tap or key). The toggle (HUD, `m` key) persists the visitor's choice in `localStorage["hq:sound"]`; a stored mute is always respected. The ambient hum stays low (gain 0.04). Sound plays only while the 3D view is open: the static tier and the Page View are silent.
- All sounds are synthesized (Web Audio, `src/lib/audio`), no audio files; the engine starts paused, so the Page View and the static tier never create an AudioContext.
- Implemented with the Web Audio API through a small wrapper (no heavy dependency). Audio is suspended when the tab is hidden.
