# Highlights Hall: one gate and B4 premium redesign

Status: approved by the owner (direction, design, budget and written spec) on 2026-11-04; look approved after the B4 rework. Decision: [2026-11-04-highlights-hall-one-gate-premium](../../decisions/2026-11-04-highlights-hall-one-gate-premium.md).

## Problem

The Highlights Hall (L1, `floors/lobby/hallLayout.ts`) has two ways in: the gateway arch on the Lobby lead road and a second road from the Agent Office plaza (`HALL.officeRoad`, added with the hall extension, #394). The hall reads as open floor rather than a destination, and its stations look like simple holo props. The owner wants:

- exactly one entrance into the hall, from the Lobby;
- a hall and stations that look premium on first entry ("WOW"), in the neon direction, without glare;
- a modest budget increase is acceptable.

## Owner decisions

| Topic | Decision |
|---|---|
| Entrance | One grand entrance from the Lobby. Remove the Agent Office road; the hall becomes a dead-end gallery. |
| Direction | B, the neon cathedral, at the **B4 "balanced"** intensity from the 3D preview. B2 had too much glare, B3 felt empty. |
| Glare | Glow concentrates on the stations and the gate; ceiling ribs, runway and walls sit one step lower. |
| Station internals | Must look premium inside each component, not only the hall shell. |
| Budget | Lazy premium chunk. The first frame stays close to today; station internals load at idle on L1, capped at about 12 KB gzip. |

## Design

### 1. One gate

- Remove `HALL.officeRoad` / `hallOfficeRoad`, its network part link and its road zone. The Agent Office keeps its own lead road from the Lobby plaza, unchanged.
- Enclose the hall's west edge (x = 32, `HALL.zone.minX`) with low glass partitions topped by a violet rail, for the full depth (z -27 to 59), except the gateway opening on the lead road (the existing arch at x = 36, lead road on z = 21, 8 u wide).
- The partitions are collision obstacles and navgrid blockers. They are low and translucent, so the certification wall stays readable from the plaza (existing requirement) and the camera is not occluded. They are not in `hallTall`.
- The former link floor between the office wing and the hall (`HALL.link`) no longer leads into the hall. It stays part of the L1 rectangle as open floor, with existing light decoration only.
- Routing: Rover drives, point-and-go targets, Cmd-K and deep links to any `L1:highlights-*` station path through the gate. Station deep links and room ids keep their current URLs.
- Minimap: the office-to-hall road disappears; the partition line is drawn; labels unchanged.
- Every walkway keeps the 6 u space rule.

### 2. Hall shell (B4)

- **Ceiling ribs:** thin light arches spanning the hall every 12 u, alternating cyan `#6ee7ff` and violet `#a78bfa`, breathing slowly (one cycle about 9 s). One instanced draw.
- **Walls:** a faint indigo grid on the east, north and south edges and the new partitions, at low intensity.
- **Floor:** dark indigo with a faint grid; a narrow cyan runway from the gate into the plaza's spine (`hall-spine`), two soft light packets travelling inward.
- **Gate:** a three-ring neon tunnel in front of the existing arch, cyan and violet alternating, pulsing gently in sequence. The floating "Highlights Hall" sign and the once-per-session light curtain (`gateCrossed`) are kept.
- **Motes:** about 280 sparse light motes rising slowly, full tier only.
- **Palette:** cyan and violet for structure. Station accents alternate cyan and violet; meaning-bearing colours inside stations (win tiers) are allowed.
- **Glare control:** stations and the gate are the brightest elements. Ribs, runway and walls render one step lower, matching the B4 preview. The existing full-tier bloom (`postComposer.ts`) is reused unchanged.
- The two light fountains are removed; the ribs, runway and station cones replace their role.

### 3. Station internals

Common frame for all seven stations:

- a glass display case (thin light edges, faint tinted faces) inside the existing footprint;
- a light cone from above and a halo ring on the floor;
- the station number and title above (`0N  TITLE`);
- a **wake** on arrival: when Rover parks on the station's door pad, the case edges brighten and the content assembles (about 0.8 s), then idles calmly. Leaving lets it settle back.

Per station:

| Station | Inside |
|---|---|
| About me | Portrait hologram inside a slow two-ring gyroscope. The four stat tiles become glass cards; their numbers count up on wake. |
| Top projects | Three glass slabs. Each screenshot gets a soft scan shimmer, a light trace circling the frame and a glowing headline metric beneath. |
| Work experience | The arch gets an inner light curtain with each role as a horizontal light bar (newest on top, org and period). Title on the lintel. |
| Wins | "24" floats above the pedestal. 24 tokens orbit in three tilted rings grouped by tier: first places larger in gold, second silver, third bronze, honors as violet points. A highlight sweep passes over the first places. |
| Now | Smaller arch with two role cards, each with a breathing "current" dot and its start date. |
| Results | Three glass slabs. Each verified result shows a faint "before" bar and a solid "after" bar that grows to its proportion on wake, with value text and the case study name. "+N more" kept. |
| Contact | The beacon's signal rings ripple across the floor; a glass card shows availability and the email action. |

Content rules:

- Every value comes from the existing sources (`pickFeaturedPods`, `highlightEntries`, `winTiers`/`winCounts`, `beforeAfterResults`, `currentRoles`, the profile stats). No new claims, numbers or copy beyond existing dictionary labels.
- Result bars use only the parsed before and after values of results already shown (`confidence: "verified"`). Bar lengths are proportional within each result (log scale when the ratio exceeds 20x). A result whose values cannot be parsed into two comparable numbers shows text only.
- Labels use existing dictionary keys; any new visible string is added to both `messages/en.json` and `messages/id.json`.

### 4. Rendering, chunks and budgets

**Main path (first frame):** the one-gate layout (partitions, routing, minimap), the shell (ribs, walls, runway, gate rings) and today's station silhouettes. Target growth at most about 2 KB gzip; the main-path cap rises by measured plus 0.6 KB per the existing rule.

**Premium chunk (new, lazy):** all station internals from section 3.

- Loads at idle on any L1 visit after the first frame, immediately on an `L1:highlights-*` deep link, Cmd-K or point-and-go to a station, or when Rover heads onto the hall lead road.
- Never on the first-frame path; never imported by Classic pages (`check-client-chunks`).
- Until it loads, stations show today's look; the swap is seamless (no layout change, door pads unchanged).
- Its own cap `BYTES_3D_BUDGET.hallPremium` = measured plus 0.6 KB, target at most 12 KB gzip. Counted in the session total; the session caps rise by the same measured amount (owner approved this budget).
- Exposed for tests like the office (`__hq.hall.loadPremium()`, probe `__hq.probes.hallPremium`).

**Draw calls and triangles:**

- The hall with every part in view may add up to about 10 scene calls over today (about 17). Every L1 settled pose in the perf lane stays under 125 on both tiers.
- The hall's three `HallView` parts keep hiding off-view and during elevator rides; the ride triangle peak must not rise above main's.

**Programs:** effects use the shared holo program (`HOLO_MODE.stage`, new per-instance kinds as needed). At most one new program (for example the glass case), within `e2e/perf/baseline.json` plus 2. `HallReady` precompiles everything, including the premium chunk's materials when it loads.

**Tiers and motion:**

- Full tier: existing bloom, motes, orbits, shimmers and wakes.
- Lite tier: no bloom, so glow comes from additive halos; no motes; win tokens static in their rings; wake reduced to an edge brighten.
- Reduced motion: everything still, including ribs, rings, orbits, packets, curtain and wakes.

**Memory:** every GPU resource disposed (`useDispose`); full-tier and lite memory gates stay flat.

### 5. Verification and review

- Unit tests: hall enclosure (the interior is reachable on the navgrid only through the gate; the office road is gone; 6 u walkways), result-bar ratio parsing including the text-only fallback, win token grouping totals equal the award count.
- E2E: deep links and point-and-go to all seven stations route through the gate; the office plaza no longer connects to the hall; `e2e/highlights.spec.ts` L1 caps; byte caps including the new chunk; perf lane L1 poses (spawn, plaza, every station, gate) and ride peaks; strict visual gate with new poses (gate, each station before and after wake); memory specs.
- Run the **full** E2E suite locally before opening the PR (the English rewrite's rollback came from a spec outside `e2e:changed`).
- **Early look:** before the full gates, the implementing session posts captures (gate from the Lobby, the walk in, all seven stations on full and lite, phone) and a local preview for the owner to review. Final local preview before the PR.
- Docs: update `docs/agents/floor-l1-lobby.md` (layout, one gate, scenery, rendering, budgets), `docs/agents/performance.md` and `e2e/budgets.ts` notes, `docs/features.md`; add `docs/decisions/2026-11-04-highlights-hall-one-gate-premium.md`, this spec under `docs/superpowers/specs/2026-11-04-highlights-hall-premium-design.md` and the plan under `docs/superpowers/plans/`.

### 6. Feedback rounds (owner, 2026-11-04)

- About me 0.75 u east with a wing wall; the Now cards inside their case; the floor's life (inlay rings, glows, pools, pulse paths).
- The WOW round: two centrepieces in the plaza (Impact Orbit, Signal Spire), a new exhibit in every station (particle portrait, floating screens, light elevator, light trophy with stars, live terminals, metric reactor, contact portal) and a revamp of the shared pieces, all in the interiors chunk (9,441 B, under the 12 KB target), the first frame inside the accepted +3.4 KB.
- The west wall and the gateway on one straight line (x 36.6 to 37, the gate at x 36.8); one camera-facing copy of each centrepiece label.
- Current detail: [floor-l1-lobby.md](../../agents/floor-l1-lobby.md#interiors-lazy-chunk); numbers: the [decision](../../decisions/2026-11-04-highlights-hall-one-gate-premium.md).

## Out of scope

- Classic page changes (the drawers and Classic sections keep their content).
- New content, metrics or awards.
- Changes to other floors, the Agent Office scene, or the Lobby spawn and intro orbit beyond what the gate enclosure requires.

## Risks

- **Certification wall readability:** partitions must stay low and translucent; verify with the existing plaza captures.
- **Draw-call headroom:** L1 spawn is at 102 full of 125. The premium chunk's station internals must batch (instancing, merged geometry, `BatchedLabels`) to stay within about +10.
- **Ride triangles:** about 1,600 of headroom; `HallView` hiding must cover the new shell and chunk.
- **Routing regressions:** removing the office road changes `partsPath` hops; point-and-go from the office to a station must route back through the Lobby and the gate.
- **CI stability:** run the full E2E suite and the visual gate locally; the last deploy was rolled back by a stale spec.
