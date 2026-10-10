# Appendix 05: Visual and Audio Design Tokens

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
| `floor.L3` | `#a78bfa` | Labs (Software Wing tint `#22d3ee`, AI Wing tint `#a78bfa`) |
| `floor.L4` | `#e5e7eb` | Library |
| `floor.RF` | `#60a5fa` | Roof |
| `pod.*` | violet `#a78bfa`, pink `#f472b6`, green `#34d399`, amber `#fbbf24`, cyan `#22d3ee`, blue `#60a5fa`, white `#e5e7eb` | Assigned per pod in content (`accent`) |
| `terminal.bg` | `#03140e` | Rover screen and terminal UI |
| `terminal.fg` | `#34d399` | |
| `terminal.hi` | `#ecfdf5` | Selected line |

All HUD text must meet WCAG AA contrast against `glass.bg`.

## 2. Materials and lighting

| Item | Spec |
|---|---|
| Room edges | `LineSegments` with `LineBasicMaterial`, color = accent, opacity 0.95 |
| Room walls | `MeshBasicMaterial`, accent color, opacity 0.05, `depthWrite: false` |
| Room floors | Accent color, opacity 0.08 |
| Holograms | Emissive `MeshStandardMaterial`, `emissiveIntensity` 1.6 (full tier) or 1.0 (lite) |
| Lights | 1 hemisphere light (`#c7d2fe` / `#05050c`, 0.6), 1 directional (0.4, no shadows), per-room point lights only on hero pods (full tier) |
| Shadows | Blob decals only, no shadow maps |
| Bloom (full tier) | threshold 0.2, strength 0.9, radius 0.6, mipmap blur |
| Fog | `FogExp2`, color `bg.void`, density 0.012 |

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

Fonts are self-hosted (`next/font`), subset to Latin, `font-display: swap`. In-world 3D text uses drei `Text` (troika) with the same font files.

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
- Audio files load lazily on the first unmute. Total budget under 300 KB (Opus/WebM with an AAC fallback).
- Sounds are original or CC0, with sources listed in `public/audio/CREDITS.md`.
- Implemented with the Web Audio API through a small wrapper (no heavy dependency). Audio is suspended when the tab is hidden.
