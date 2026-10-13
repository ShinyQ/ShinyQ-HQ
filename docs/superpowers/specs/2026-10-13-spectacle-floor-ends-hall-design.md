# Spectacle round: floor ends, Highlights Hall gallery, floating floor text (design)

Date: 2026-10-13. Owner-approved design. Repo: ShinyQ/ShinyQ-HQ (main 94fc885 or later).

## Owner requests (verbatim)
1. "Also i think we need to settle down the L2 and L3 end of the floor walkable. Currently its just empty which is weird i need you to think what could we add for WOW"
2. "I think the Floor for Highlight Hall feels so common and not WOW need a revamp on that so user interesting to go there."
3. "also the wording Highlight Halls was on floor i dont like wording on floor make it just like the AI Engineering & Product Engineering floating for all wording which on the floor"

## Owner decisions (verbatim choices)
- Direction: "Pure spectacle: dramatic decor (data waterfalls, holographic skyline beyond the slab edge, light shows) with no new content"
- Hall: "Rebuild as a gallery: each station gets its own shape (About on a holo pedestal, Projects as three tall monolith screens, Experience as a lit arch, Contact as a signal beacon), plus a gateway arch, a centerpiece and stage lighting (Recommended)"
- Floor ends: "Per-floor themes: L2 ends in a 'Horizon' (a light bridge running off the slab toward a distant holographic skyline and sunrise glow, plus a rising origin light pillar at the west end); L3's east plaza gets a spinning 'Reactor core' fed by the packet lanes, with data waterfalls pouring off the slab corners (Recommended)"
- Design approved: "Approve, go build it".

## Current state (measured on production at 94fc885)
Screenshots and layouts: `/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/floor-recon/` (PNG per area, `layouts.json`, capture scripts that drive `window.__hq`).
- L2 slab x -24..363, z -29..29. Road ends at (359,0) in the Workshop annex (x 341..363, z -9..9): repo wall x 344..363 at z about -11.5, bench rows z 7 and 14, glass window with violet sight lines at the slab edge x 363. Empty: NE about 19 x 17 u (x 344..363, z -29..-11.6), SE about 22 x 14.5 u (x 341..363, z 14.5..29), west end x -24..-8.5 at |z| 11..29 (only the call pad at (-21,0) and the 2019 teleporter at (-7.5,6.5)). Rail camera at z about +30, y 36 looking north; Q/E rail yaw turns east/west; rail fog 40..95 u. L2 annex frame is 67 calls / 25.6k triangles (full), 60 / 24.5k (lite): close to the 30k cap.
- L3 slab x -24..122, z -46..46. Wing roads at z +-24 (8 u wide) turn at x 107 into the round east plaza at (107,0), 18 u across. Empty: outer corners x 100..122, z +-28..+-46 (about 22 x 18 u each), east of the road x 111..122, |z| 9..28, east of the plaza x 116..122, inner pockets x 91..103, |z| 9..20. The packet-lane spine stops at the plaza rim. Wing ends render 44..49 calls / 10.4..10.8k triangles.
- L1 Highlights Hall x 28..64, z -21..21, plaza 24 x 26 u centered (46,3). Stations (plinth plus a 6 u panel, door pad 1.1 u in front): 01 About me x 32..42 z -21..-18 pad (37,-16.9) portrait, name, headline, 4 stat tiles, subheadline; 02 Top 3 projects x 48..64 z -21..-18 pad (56,-16.9) three screenshots; 03 Work experience x 61..64 z -8..10 pad (59.9,1) Employment and Freelance columns; 04 Contact x 40..54 z 18..21 pad (47,16.9). Lead road (14,15) to (36,15) with "HIGHLIGHTS HALL" painted flat on the floor at (22,15); entry passage x 28..36, z 11..19 has a camera zone. Hall group about 8 calls / 3.1k triangles. L1 spawn 90 calls full (+17 post) / 88 lite; hall plaza 80 / 78.
- Floor-painted words found so far: "HIGHLIGHTS HALL" (L1), the L2 year digits ("2019" to "2026") on the plazas, "L3 Labs above" (L2 annex), plus any wing or zone words on L4 and RF (audit all floors: `grep` for flat text meshes rotated -PI/2 on X, `RoadMarkings` labels, `Text` with floor rotation).

## Part 1: floor text becomes floating signs (all floors)
- Every word rendered flat on a floor becomes a floating sign in the style of the L3 wing signs from PR #71: it faces the camera (`yawTowards` in `src/experience/fx/facing.ts`, or `fx/Readable.tsx` from P7), dark backing plate, neon outline in the floor accent, never mirrored, placed at a readable height where the floor word was (or just beside the road so it does not block the view or the rover).
- Extract one shared component (for example `src/experience/fx/FloatingSign.tsx`) and use it everywhere, with batched text where several signs share a floor (see how P2 batched L2 labels).
- Road chevrons and non-text glyphs stay on the floor.
- L2 year digits: keep their role as plaza markers (big, bright, in the floor accent) but floating above the plaza edge, readable from the rail camera.
- Owner of the "HIGHLIGHTS HALL" sign: Part 2 (it becomes the gateway arch sign). Part 1 covers every other floor word.

## Part 2: Highlights Hall gallery (L1)
Content stays the same (hallContent.ts, the drawers, the CTAs). Only staging and architecture change.
- Gateway arch at the passage (x 28..36, z 11..19 area) spanning the lead road, with the "HIGHLIGHTS HALL" floating sign on it (EN, ID from messages). On the first pass per session the rover drives through a light curtain sweep (one shader plane, about 0.8 s); reduced motion: no sweep.
- 01 About me: round holo pedestal; the portrait as a floating hologram disc (scanlines, soft flicker on full); name and headline above; the 4 stat tiles hover in an arc around it (slow drift on full, static on lite and reduced motion); subheadline on the pedestal rim.
- 02 Top 3 projects: three tall monolith screens in a shallow arc, each showing its screenshot, title and wing label, a light beam at each base; keep "Visit live site" tag.
- 03 Work experience: a lit arch the visitor looks through; Employment and Freelance columns on the two pillars, the arch top carries the station title; keep "+N more in the drawer".
- 04 Contact: a signal beacon (antenna mast) with pulsing rings and the contact card floating beside it.
- Centerpiece: a light fountain in the plaza centre: vertical beams from a floor ring, slow sweep; full tier richer, lite simpler.
- Stage lighting: a fake volumetric spotlight cone per station (additive, no real lights on lite), a glow pool under each station.
- Keep: pads and their positions (adjust only if a new shape requires it, and keep deep links `#highlights-<station>`), point-and-go, station camera zones (re-tune framing to the new shapes), drawers, Quick tour, Cmd-K entries, onboarding "Want to see it?" drive, hint bubble, phone readability (phone text must be at least as legible as today).

## Part 3: L2 and L3 floor ends
- L2 east "Horizon": beyond the annex window at x 363, a light bridge runs off the slab into the void toward a distant holographic skyline with a sunrise glow gradient. The skyline and glow are fog-exempt (own distance fade) so they read from the rail camera; the window frames them. Fill the NE and SE empty corners with low-key horizon dressing (for example light rails or glow strips that lead the eye to the bridge), never covering the repo wall, benches or rooms.
- L2 west "Origin": a light pillar rising from the floor west of the 2019 plaza (clear of the call pad at (-21,0) and the 2019 teleporter at (-7.5,6.5)), slow upward flow.
- L3 east plaza "Reactor core": a tall spinning core with orbiting rings at (107,0); the packet-lane spine packets continue into it; wing roads route around it (update the navgrid and road network so point-and-go and autopilot path around it; keep the loop).
- L3 corners: data waterfalls pouring off the four slab corners (one instanced draw for all four, scrolling shader).
- Fill the inner pockets x 91..103, |z| 9..20 lightly if it helps the composition (optional).

## Constraints for all parts
- Budgets (spec 08, `e2e/budgets.ts`, P4's 3D perf gates): settled scene calls L1 at most 125, other floors under 150; post passes at most 20; triangles under 30,000 per frame at every peak (rides, hover, boost); programs at most baseline + 2 (regenerate the baseline deliberately and note it); 3D JS under 450 KB gzip; Page View or Classic site JS under 240 KB. Targets: L1 hall rebuild at most +20 calls; L2 at most +3k triangles and +6 calls; L3 at most +10 calls and +6k triangles. Use instancing, merged geometry and shader effects; no real lights on lite.
- Tiers: lite gets simpler versions (fewer beams and particles, no flicker, smaller textures).
- Reduced motion (effective `reducedMotion`, which may become a HUD setting in the parallel "Motion setting" PR): everything static: no spin above 0.2 rad/s, no flow, no sweeps, no particles.
- Precompile every new material with P2's API (`src/experience/scene/precompile.ts`), so nothing compiles on arrival or during rides; keep #85's ride cull working (new meshes must be cull-safe or flagged).
- Camera: add new tall obstacles (reactor, arches, monoliths, beacon) to P7's camera collision (`TALL` list in CameraDirector); the rover must drive under the gateway arch.
- No new content: text shown in 3D comes from existing content and messages; EN and ID for any new label; client company names never appear in 3D (CI blocklist).
- Visual gate (P2's `scripts/visual-gate.ts`): unchanged areas of each floor must stay within the gate; new areas get before and after captures at 1440x900 full, 2560x1440 full and 390x844 lite.
- Docs: README, AGENTS.md if conventions change, spec 01 (world and layout), spec 08 (budgets), and this design copied into `docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md` by whichever PR merges first (the other references it).
- No em dashes anywhere.

## Delivery
Two parallel sessions, one PR each:
- Session A: Part 2 (Highlights Hall gallery, including the gateway arch sign). Touches `src/experience/floors/lobby/*` and the L1 hall road and sign.
- Session B: Part 1 for every floor except the hall sign, plus Part 3. Touches L2, L3, L4, RF floor code and the new shared `fx/FloatingSign.tsx`.
Coordinate: B owns `fx/FloatingSign.tsx`. A may build its gateway sign with existing `yawTowards` and a local backing; after B merges, A switches to `FloatingSign` on rebase if trivial.
