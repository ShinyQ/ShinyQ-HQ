# L1 Lobby

The L1 Lobby floor: the certification wall, the Highlights Hall, the Ask Rover kiosk and the Lobby camera views.
Index: [AGENTS.md](../../AGENTS.md).

Related: floor rules shared by every floor live in [floors.md](floors.md); the Visitor Observatory (`L1:visits`) is described in [stats.md](stats.md) and [hud-and-drawer.md](hud-and-drawer.md).

## Certification wall

- Code: `floors/lobby/CertWall.tsx`; pure layout `CERT_WALL`, `certSlots`, `certPage`, `tabAngles`, `certPanelHalf` in `floors/lobby/layout.ts`.
- Shape: a curved holo-wall on an arc of radius 19.6 around the hologram, inside the `LOBBY.certWall` footprint.
  - A layout test keeps the widest panel inside the footprint.
- Tabs come from `issuerTabs`: All, up to 3 issuers with 2 or more certifications, Other.
- Paging: 12 badges per page in two rows sized to content, a pager past 12.
- Draw calls:
  - badge bodies and glows: two instanced meshes;
  - outlines: one line mesh;
  - issuer logos: one atlas mesh (`orientedQuadBuffers`);
  - title, tab, pager and badge texts: one `BatchedLabels`, rendered over the logos.
- A badge click calls `openCert`.

## Highlights Hall

Code: `floors/lobby/hallLayout.ts`. Design: [`docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md`](../superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md) Part 2.

### Layout

- The Lobby slab runs to x = 64.
- A lead road leaves the plaza south of the certification wall (z = 15) into a 24 x 26 u plaza.
  - The certification wall stays untouched and readable from the plaza.
- Four stations sit flush with the slab edges, rooms `L1:highlights-*`:

  | Station | Position |
  |---|---|
  | about me | north-west |
  | top projects | north-east |
  | work experience | east |
  | contact | south |

- Each station has a door pad 1.1 u in front and a camera zone that faces it.
- `FloorLayout.roadZone` limits the L1 road to drives into or out of the hall (`routeUsesRoad`), so Lobby trips keep the navgrid.

### Scenery (a gallery)

- Shapes live in `hallGallery.ts`, inside the station footprints, so pads, doors, spurs and deep links keep their places.
- About me: a round holo pedestal.
  - The portrait is a hologram disc.
  - The four stat tiles stand in an arc and drift on the full tier; their texts move through the `BatchedLabels` handle.
- Top projects: three monolith screens in a shallow arc.
- Work experience: a lit arch (columns on the pillars, the title on the lintel, an amber glow in the opening).
- Contact: beside a signal beacon with pulsing rings and a floating card.
- Gateway arch over the lead road at x = 33:
  - pillars are obstacles; the rover drives under the lintel;
  - the floating "Highlights Hall" sign (`FloatingSigns`, `gateSign`); nothing is written on the floor;
  - a light curtain sweeps once per browser session on the first eastward pass (`gateCrossed`, `sessionStorage["hq:hall-gate"]`, probe `__hq.probes.hallGate`), never under reduced motion.
- A light fountain (light only) marks the plaza center.
- Fake spotlight cones, uplights and glow pools are one instanced mesh; no real lights on any tier.

### Rendering

- Every hall effect draws with the shared holo program (`HOLO_MODE.stage` in `fx/holoFx.ts`, per-instance kind in `aStage`, instances from `hallStage.ts`), so the gallery adds no program of its own.
- `HighlightsHall.tsx` draws:
  - the road markings, one merged solid mesh, one line mesh, one `BatchedLabels`;
  - the screenshot atlas: black until it loads once the rover is east of `HALL.lazyX` (`shouldLoadShots`);
  - the portrait disc, the tiles, the lights, the portal, the beacon rings, the sign, and the curtain while it sweeps.
- `HallView` hides the instanced effects while the hall's bounds are out of view.
- `HallReady` precompiles and pins every program (`precompileObject`) once the scene draws into its final target, before the hall shows.
- Shader materials are never culled by the ride cull ([3d-experience.md](3d-experience.md)).
- The tall shapes are in the camera collision (`hallTall`, `FloorLayout.tall` on L1).
- Reduced motion holds everything still.
- `Lobby.tsx` builds the hall only after the intro, once the rover is on L1 or riding there, then keeps it.
- The skills wall and certification wall texts are one `BatchedLabels` each, which pays for the hall.
- Budget: `RenderCounter` counts the full tier's composer passes apart from scene calls, and `e2e/highlights.spec.ts` caps L1 at 125 scene calls (`FLOOR_SCENE_CAPS`) from the plaza to the hall on both tiers.

### Content

- Projects come from `pickFeaturedPods` (the landing's three).
- Experience comes from timeline entries of type `job` and `freelance`, newest first (`highlightEntries`, `experienceRows`).
- The work experience columns use the career type labels (`common.type.job` "Employment", `common.type.freelance`).
- A project with `podLiveLink` gets "Visit live site": a tag in 3D, a `LiveSiteLink` in the drawer.

### Deep links and point-and-go

- `/{locale}#highlights(-<station>)` opens a station (`gateStartRoom` in the gate).
- An open station keeps `/{locale}` (`hasPage` false).
- The stations are point-and-go targets `L1:station:highlights-<station>` (kind `station`, `open-room`), registered by `HighlightsHall` with `registerExtraInteractables` (`hallInteract.ts`); see [floors.md](floors.md).
- The registry's L1 built-ins do not derive targets from L1 doors.

## Ask Rover kiosk

Code: `floors/lobby/kiosk.ts`. The kiosk lines up straight, radially into the hologram circle (owner decision).

- Body, stand and screen are one group turned by one yaw (`KIOSK.yaw`) that faces the hologram.
- The screen is centered on the body and only tilts back.
- Lines never wrap: `kioskFontSize` fits the longest line, `fitLine` ends longer ones in "...".
- Placement: on the kiosk axis (`LOBBY.kioskAxis`: the unit direction from the hologram to the Visitor Observatory), 19.2 u from the hologram.
- Lane spoke (`Lanes.tsx`): one straight radial segment ending 0.4 u in front of its front (`kioskLaneEnd`).
- Obstacle and pick volume: the axis-aligned box of the turned footprint (`kioskRect` in config.ts, `kioskBounds`).
- Point-and-go stop: `kioskStop()`, on the axis 3 u in front of the screen.
- Session spawn: that stop (`LOBBY.spawn`, heading `LOBBY.spawnHeading` toward the screen), so the first rover placement is in front of the kiosk (owner decision).
- `tests/unit/kiosk.test.ts` checks the shared yaw, the centering, the straight spoke and the spawn.

## Lobby views

Code: `floors/lobby/observatoryLayout.ts`.

| Zone | Where | Camera |
|---|---|---|
| `L1:kiosk` | the spawn | desktop 0.62 rad off the kiosk axis at zoom 1.5, so the hologram's name, the rover at the kiosk and the observatory panel all read; tablets and phones straight down the axis through `ViewZone.classView` |
| `L1:arrival` | the elevator arrival point `LOBBY.arrival` (-6, 0) | behind the rover, looking east at the hologram and the stats ring (`arrivalOnly`, `travel` east); zoom 1.03, phones 0.88, the widest views that keep the camera east of the glass shaft |
| `L1:visits` | the observatory door | |

- `CameraDirector` primes the zone under the rover when it is marked `prime` (only `L1:kiosk`; `primeZone`), on the first frame and through the boot and the intro.
- The intro's end pose is that follow pose (yaw, zoom, look-ahead, offset scale), so the intro lands on the spawn view with no jump.
- `resetView` returns to the default north-west look.
- The elevator rolls the rover on east from the shaft to `LOBBY.arrival`; the camera glides out of the car into the arrival zone ([Elevator arrival](3d-experience.md#elevator-arrival)). Under reduced motion the rover and the camera cut to it.
- The arrival zone is `arrivalOnly`: it applies only to an elevator arrival, never to a rover driving through later. The kiosk spawn and `L1:kiosk` are unchanged.
