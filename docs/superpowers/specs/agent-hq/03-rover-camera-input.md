# Appendix 03: Rover, Camera and Input

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

## 1. Screen Rover

### Geometry (procedural)

| Part | Shape | Size (u) | Material |
|---|---|---|---|
| Treads | Rounded box plus 3 cylinder wheels per side | 1.7 × 0.45 × 1.1 | Graphite `#27272a`, rim `#71717a` |
| Chassis | Rounded box | 1.3 × 0.55 × 1.0 | Light grey `#d4d4d8` |
| Head | Rounded box | 1.2 × 1.1 × 0.9 | Off-white `#e5e7eb` |
| Screen | Plane with a `CanvasTexture` | 0.9 × 0.7 | Emissive green `#34d399` on `#03140e` |
| Antenna | Thin cylinder plus a sphere tip | 0.6 tall | Tip emissive pink `#f472b6` |
| Flag (arrival) | Thin pole plus a triangle | 0.8 tall | Amber `#fbbf24` |
| Shadow | Blob decal | Radius 1.0 | |

The screen is a 128 × 96 `CanvasTexture`, redrawn only when the face or text changes.

### Faces

| State | Face | Animation |
|---|---|---|
| idle | `^_^` with blinks to `-_-` | Blink every 3 to 6 s (random) |
| driving | `>>>` | Characters scroll |
| autopilot | `>>>` plus a 1-line status (`to L3`) | |
| thinking (terminal open) | `...` | Dots cycle |
| arrived | `^_^` | Flag pops up, small hop |
| blocked or cancelled | `o_o` | 600 ms |
| elevator | `▲` / `▼` | |

### Movement

| Parameter | Fine pointer | Coarse pointer |
|---|---|---|
| Max speed (manual) | 9 u/s | 8 u/s |
| Max speed (autopilot) | 12 u/s | 12 u/s |
| Acceleration | 18 u/s² | 18 u/s² |
| Braking | 26 u/s² | 26 u/s² |
| Turn rate | 3.5 rad/s | 3.5 rad/s |
| Collision radius | 1.0 u | 1.0 u |
| Body tilt into turns | up to 8° | up to 8° |

- Keyboard steering is camera-relative (W = away from the camera).
- Click or tap to move uses A* on the floor navgrid with 8-way movement, then string-pulling to smooth the path. Unreachable targets snap to the nearest reachable cell.
- Collision: circle versus inflated AABBs, resolved by sliding along walls.
- Door triggers: a 2 × 2 u zone in front of each room door. Entering it opens the room, except while autopilot is heading to a different target.

## 2. Cameras

| Rig | Used on | Desktop | Tablet | Mobile portrait |
|---|---|---|---|---|
| Follow (3/4 iso-ish) | L1, L3, L4, RF | FOV 38°, offset (14, 15, 14) | FOV 42°, offset (16, 18, 16) | FOV 50°, offset (18, 24, 18) |
| Rail (side view) | L2 | FOV 40°, camera at (roverX, 13, 24), looking at (roverX + 4, 0, 0); yaw around the rover limited to ±35° | FOV 45°, (roverX, 15, 28) | FOV 55°, (roverX, 18, 34) |
| Elevator dolly | Floor change | Tweens the rig's y by `FLOOR_GAP` per floor, easeInOutCubic, 0.8 s | Same | Same |
| Hologram fly-in | Hero pods | 9 u in front of the pod stage at eye height 4 u, FOV 35° | FOV 42° | FOV 50° |
| Intro orbit | Boot | Radius 70 u around the tower, 120°, 2.5 s | Radius 80 u | Radius 90 u |

- Smoothing: critically damped spring with a 0.18 s half-life.
- Landscape phones use the tablet values.
- **Free orbit (follow rig, every floor except the L2 rail).** The camera orbits the rover a full 360° in yaw, with pitch clamped to 17° to 72° of elevation and zoom within 0.6× to 1.5× of the offset. The chosen view persists while driving (keyboard steering stays camera-relative) and never springs back on its own.
- **Reset view.** The HUD reset button, `0` or `Home` ease back to the default angle, pitch and zoom (nearest full turn, about 0.5 s; instant under reduced motion).
- **Rail.** L2 keeps its side view; the same rotate inputs swing it around the rover by at most ±35°.
- **Auto-face.** When the rover walks into a wall's view zone (Lobby skills wall, certifications wall), the camera eases to face the wall head on. Any manual rotation inside the zone cancels it until the rover leaves. Off under reduced motion.
- The mouse wheel's vertical axis is reserved for the elevator. Horizontal wheel (trackpad two-finger swipe, Shift+wheel) rotates. Ctrl+wheel (trackpad pinch) or a two-finger pinch zooms.

### Controls per device

| Action | Mac / PC (mouse) | Mac trackpad | Keyboard | Tablet and phone |
|---|---|---|---|---|
| Rotate | Drag with the left or right button (past 6 px) on empty floor | Two-finger horizontal swipe | `Q` / `E` (hold `Shift` for 2× speed) | One-finger drag past 8 px on empty space, or two-finger twist |
| Tilt | Vertical part of a mouse drag | | | Two-finger vertical drag |
| Zoom | Ctrl+wheel | Pinch | | Pinch |
| Reset view | HUD reset button | HUD reset button | `0` or `Home` | HUD reset button |
| Rotate step (45°) | HUD rotate buttons | HUD rotate buttons | Tab to the HUD rotate buttons | HUD rotate buttons (bottom right) |
| Move | Click without drag | Click | WASD / arrows | Tap, or the joystick (its area never rotates) |

## 3. Input layer

Every device input maps to an **intent**. Floors and the HUD only consume intents.

| Intent | Payload | Sources |
|---|---|---|
| `move` | Normalized 2D vector | WASD/arrows, virtual joystick |
| `goto` | World point or `RoomId` | Click/tap on the floor, click a room label |
| `elevator` | `up`, `down` or `FloorId` | Wheel, PageUp/PageDown, vertical swipe (> 60 px, < 400 ms), elevator panel |
| `scrub` | Δx | Horizontal swipe on L2 (rail), mapped to rover x |
| `orbit` | Δyaw, optional Δpitch, `smooth` for eased steps, `source` (`mouse`, `touch`, `twist`, `wheel`, `keys`, `button`) | Drag (mouse, one finger), two-finger twist, trackpad deltaX, HUD rotate buttons. Held `Q`/`E` are polled each frame by the camera. |
| `zoom` | factor | Ctrl+wheel, trackpad pinch, two-finger pinch |
| `view` | `reset` | HUD reset button, `0`, `Home` |
| `open` | `RoomId` | Door trigger, Enter near a door, drawer link |
| `cancel` | | Esc, any `move` during autopilot |
| `palette` | | ⌘K, Ctrl+K, `/`, search button |
| `terminal` | | Click the rover, Enter when the rover is focused |
| `toggle` | `sound`, `lang`, `readme` | HUD buttons, keys `m`, `l`, `t` |

- Gestures inside HUD panels never reach the world (pointer capture at the panel root).
- The joystick appears only on coarse pointers: bottom-left, 120 px diameter, 12% dead zone.
- Held keys emit `move` every frame, with no dependency on OS key repeat.
- A press becomes a drag only after it travels past the threshold (6 px mouse or pen, 8 px touch). A shorter press stays a click or tap (click to move); a longer one only rotates.
- Keyboard shortcuts are ignored while focus is in a text input (palette search).
