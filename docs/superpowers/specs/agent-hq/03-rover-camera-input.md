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
| Max speed (boost: hold Shift or the boost button, manual driving only) | 18 u/s | 16 u/s |
| Acceleration while boosting | 36 u/s² | 36 u/s² |
| Acceleration | 18 u/s² | 18 u/s² |
| Braking | 26 u/s² | 26 u/s² |
| Turn rate | 3.5 rad/s | 3.5 rad/s |
| Collision radius | 1.0 u | 1.0 u |
| Body tilt into turns | up to 8° | up to 8° |

- Keyboard steering is camera-relative (W = away from the camera).
- Point-and-go (owner request, October 2026; replaces click and tap to move): hovering a glowing target (door, elevator call pad, L2 teleporter, station, kiosk, board) highlights it with its name; a click (on touch: a first tap selects, a second tap or the Go chip goes) drives the rover along the road (`roadRoute`, with A* on the navgrid for the legs off the road) and runs the target's action on arrival. A click or tap on empty floor never moves the rover. Targets come from one registry (`src/experience/interact/registry.ts`).
- Collision: circle versus inflated AABBs, resolved by sliding along walls.
- Door triggers: a 2 × 2 u zone in front of each room door. Entering it opens the room, except while autopilot is heading to a different target.

## 2. Cameras

| Rig | Used on | Desktop | Tablet | Mobile portrait |
|---|---|---|---|---|
| Follow (3/4 iso-ish) | L1, L3, L4, RF | FOV 40°, offset (16, 18, 16), aiming 6 u ahead of the rover (pulled back from 38° / (14, 15, 14) so the re-spaced Lobby plaza fits) | FOV 42°, offset (16, 18, 16) | FOV 50°, offset (18, 24, 18) |
| Rail (side view) | L2 | FOV 40°, camera at (roverX, 22, 30), looking at (roverX + 4, 0, road z); orbits all the way around the rover (the look-ahead turns with it) and tilts like the follow rig | FOV 45°, (roverX, 24, 34) | FOV 55°, (roverX, 26, 38) |
| First person | Any floor, after zooming all the way in | Eye 1.55 u above the floor at the rover, FOV 65°, look 60° down to 31° up, near plane 0.1, far 72, fog 14 to 64 u | FOV 70° | FOV 80° |
| Elevator dolly | Floor change | Tweens the rig's y by `FLOOR_GAP` per floor, easeInOutCubic, 0.8 s of ride time; each frame adds at most `rideCap` (1/30 s at 60 fps, up to 1/20 s on steadily slow devices), so stalls pause the dolly and the camera spring uses the same cap during rides | Same | Same |
| Hologram fly-in | Hero pods | 9 u in front of the pod stage at eye height 4 u, FOV 35° | FOV 42° | FOV 50° |
| Intro orbit | Boot | Radius 70 u around the tower, 120°, 2.5 s | Radius 80 u | Radius 90 u |

- Smoothing: critically damped spring with a 0.18 s half-life.
- Landscape phones use the tablet values. Portrait screens of any width (height above 1.15× the width, for example a 1024 × 1366 tablet) use the mobile portrait values.
- **Orbit (every floor, L2 included; owner request, round 5).** The camera turns all the way around the rover (unrestricted yaw; L2 keeps its own yaw, so it opens on its side view). It tilts from just above the floor (about 3° elevation) to near top-down (about 83°), never under the floor. Zoom stays within 0.6× to 1.5× of the offset. A low camera stays above the floor, on the slab and out of obstacles: it is pulled in along its view ray (`camera/collision.ts`); cameras above 3.2 u never move. The chosen view persists while driving (keyboard steering stays camera-relative) and never springs back on its own.
- **Reset view.** The HUD reset button, `0` or `Home` ease back to the default angle, pitch and zoom and leave first person (nearest full turn, about 0.5 s; instant under reduced motion).
- **L2.** The same orbit around the rover; steering follows the view, and a one-finger swipe scrubs toward the side it pulls from (reversed when the view faces the other way). One-finger drags never rotate on L2; a two-finger twist does. Room labels, year signs, floor digits and the type icons turn half a turn when the camera is behind them, so they never read mirrored.
- **Wheel and zoom.** The mouse wheel, trackpad two-finger scrolling, Ctrl+wheel (trackpad pinch), a two-finger pinch and `+`/`-` zoom. The wheel never changes floors. Horizontal wheel (trackpad two-finger swipe, Shift+wheel) rotates.
- **First person.** Zooming in past the closest distance (a further 15%) glides into the rover's eyes in 0.45 s (a cut under reduced motion); the body fades out and hides, and the ghost floors above fade out too (no ceiling over the eyes). Drag and Q/E look around, R/F or a vertical drag tilt the look (60° down to 31° up), WASD drives where you look, and zooming out (about 18%), `0`, `Home` or the reset button return to third person at the closest distance. Point-and-go, the "!" hints and the dialog work as usual. Autopilot drives (missions, walks, point-and-go, scrubs, arrival roll-ons), elevator rides, teleport beams, open rooms and the hologram hold third person; first person returns afterwards.
- **Auto-face.** When the rover walks into a wall's view zone (Lobby skills wall, certifications wall), the camera eases to face the wall head on. Any manual rotation inside the zone cancels it until the rover leaves. Off under reduced motion.

### Controls per device

| Action | Mac / PC (mouse) | Mac trackpad | Keyboard | Tablet and phone |
|---|---|---|---|---|
| Rotate | Drag with the left or right button (past 6 px) on empty floor | Two-finger horizontal swipe | `Q` / `E` (hold `Shift` for 2× speed) | One-finger drag past 8 px on empty space, or two-finger twist |
| Tilt (just above the floor to near top-down) | Vertical part of a mouse drag | Vertical part of a drag | `R` / `F` (hold `Shift` for 2× speed) | Two-finger vertical drag (one-finger vertical swipes stay the elevator) |
| Zoom | Mouse wheel or Ctrl+wheel | Two-finger scroll or pinch | `+` / `-` | Pinch |
| First person | Zoom all the way in; zoom out to leave | Same | `+` until it switches, `-` to leave | Pinch out all the way; pinch in to leave |
| Reset view | HUD reset button | HUD reset button | `0` or `Home` | HUD reset button |
| Rotate step (45°) | HUD rotate buttons | HUD rotate buttons | Tab to the HUD rotate buttons | HUD rotate buttons (bottom right) |
| Move | WASD / arrows | WASD / arrows | WASD / arrows | The joystick (its area never rotates) |
| Go to a target | Hover to see its name, click to drive there | Same | Cmd-K or Ask Rover | Tap to select, tap again or press Go |

## 3. Input layer

Every device input maps to an **intent**. Floors and the HUD only consume intents.

| Intent | Payload | Sources |
|---|---|---|
| `move` | Normalized 2D vector | WASD/arrows, virtual joystick |
| `interact` | `Interactable` (registry entry) | Click on a hovered target, a second tap or the Go chip on touch |
| `elevator` | `up`, `down` or `FloorId` | PageUp/PageDown, vertical swipe (> 60 px, < 400 ms), elevator panel, call pads |
| `scrub` | Δx | Horizontal swipe on L2 (rail), mapped to rover x |
| `orbit` | Δyaw, optional Δpitch, `smooth` for eased steps, `source` (`mouse`, `touch`, `twist`, `wheel`, `keys`, `button`) | Drag (mouse, one finger), two-finger twist, trackpad deltaX, HUD rotate buttons. Held `Q`/`E` (yaw) and `R`/`F` (tilt) are polled each frame by the camera. |
| `zoom` | factor | Mouse wheel, trackpad scroll and pinch, two-finger pinch, `+`/`-`; past the closest distance it enters first person |
| `view` | `reset` | HUD reset button, `0`, `Home` |
| `open` | `RoomId` | Door trigger, Enter near a door, drawer link |
| `cancel` | | Esc, any `move` during autopilot |
| `palette` | | ⌘K, Ctrl+K, `/`, search button |
| `terminal` | | Click the rover, Enter when the rover is focused |
| `toggle` | `sound`, `lang`, `readme` | HUD buttons, keys `m`, `l`, `t` |

- Gestures inside HUD panels never reach the world (pointer capture at the panel root).
- The joystick appears only on coarse pointers: bottom-left, 120 px diameter, 12% dead zone, with a hold-to-boost button beside it (above it on phones). Keyboards boost with Shift. Physics sub-steps never travel more than 0.4 u, so boosting never tunnels through walls.
- Held keys emit `move` every frame, with no dependency on OS key repeat.
- A press becomes a drag only after it travels past the threshold (6 px mouse or pen, 8 px touch). A shorter press stays a click or tap (it picks a target, or does nothing on empty floor); a longer one only rotates.
- Keyboard shortcuts are ignored while focus is in a text input (palette search).
