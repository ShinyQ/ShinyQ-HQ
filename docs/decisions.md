# Owner decisions log

Dated owner decisions and the history behind the current rules. The rules themselves (current state only) live in
[`AGENTS.md`](../AGENTS.md) and [`docs/agents/`](agents/); content decisions C1 to C9 are in appendix 07 section 7
([`superpowers/specs/agent-hq/07-content-map.md`](superpowers/specs/agent-hq/07-content-map.md)).

Add a row in the same PR as any new owner decision. Dates are when the decision was made (`2026-10` when only the
month is known); the PR column links the PR that shipped it, when known.

| Date | Area | Decision | PR |
|---|---|---|---|
| 2026-10-09 | Glass Drawer | Phase 4: every room on every floor renders through one shared drawer (the Glass Drawer), with the hologram view for hero pods. | [#8](https://github.com/ShinyQ/ShinyQ-HQ/pull/8) |
| 2026-10-10 | Audio | Sound is on by default; a missing `hq:sound` means on. | [#21](https://github.com/ShinyQ/ShinyQ-HQ/pull/21) |
| 2026-10-10 | Content | C3 revised: clients of the owner's employers never appear on the site; they get a sector label, while employers, freelance clients (C8) and product names stay named. | [#26](https://github.com/ShinyQ/ShinyQ-HQ/pull/26) |
| 2026-10-10 | Content: CV | The site uses the owner's own CV PDF as-is (English only, no web export). | [#24](https://github.com/ShinyQ/ShinyQ-HQ/pull/24) |
| 2026-10-11 | Content: CV | Every CV entry point opens the in-site CV viewer modal instead of downloading. | [#43](https://github.com/ShinyQ/ShinyQ-HQ/pull/43) |
| 2026-10-11 | Content: confidence | Confidence values stay internal review data: no page, drawer, OG card, JSON-LD or Ask chunk renders or ships them. | [#44](https://github.com/ShinyQ/ShinyQ-HQ/pull/44) |
| 2026-10-11 | Content: galleries | SITA (`mining-coa-assistant`) and FREDDY (`automotive-fraud-dashboard`) stay text only, with no gallery. |  |
| 2026-10-11 | Floors | Career type icons use the "Neon line" style, and the walkable floors prototype picks the meander road. | [#36](https://github.com/ShinyQ/ShinyQ-HQ/pull/36) |
| 2026-10-11 | HUD modals | Paper, credential and post previews use in-site modals with no third-party iframes (credential, Medium and IEEE pages refuse framing or are paywalled); the CSP keeps `frame-src 'self'`. | [#43](https://github.com/ShinyQ/ShinyQ-HQ/pull/43) |
| 2026-10-11 | L2 Career | Walkable floors plan Part 2: the Career Road uses the meander road and the Neon line type icons (owner picks). | [#40](https://github.com/ShinyQ/ShinyQ-HQ/pull/40) |
| 2026-10-12 | 3D experience | Boost: hold Shift (or the touch boost button) for 2x top speed and acceleration, manual driving only. | [#55](https://github.com/ShinyQ/ShinyQ-HQ/pull/55) |
| 2026-10-12 | Content | Titles (pods, posts, publications, talks, side projects, awards, principles) are stored in Title Case in both locales by the `titleCase` rules. | [#52](https://github.com/ShinyQ/ShinyQ-HQ/pull/52) |
| 2026-10-12 | Content | Gallery first: every project list uses `orderPods` / `comparePods` (pods with a gallery first, then tier, then `order`). | [#52](https://github.com/ShinyQ/ShinyQ-HQ/pull/52) |
| 2026-10-12 | Content: papers | Paper PDFs are hosted on the site through `Publication.document` (redacted thesis, authors' manuscripts for IEEE papers). | [#63](https://github.com/ShinyQ/ShinyQ-HQ/pull/63) |
| 2026-10-12 | Content: perspectives | Kurniadi's own professional Q&A answers become Ask the HQ knowledge with guard rails; drafts need owner approval. | [#59](https://github.com/ShinyQ/ShinyQ-HQ/pull/59) |
| 2026-10-12 | Floors | Every floor gets an elevator call pad and L2 gets a teleporter on every year plaza, with floor and year pickers (`nav/pads.ts`). | [#53](https://github.com/ShinyQ/ShinyQ-HQ/pull/53) |
| 2026-10-12 | L4 Library | The L4 concepts prototype pick is the newsroom concept. | [#56](https://github.com/ShinyQ/ShinyQ-HQ/pull/56) |
| 2026-10-12 | L4 Writing | Walkable floors plan part 3: the L4 Writing floor uses the newsroom concept (owner pick); the other two concepts stay for the dev prototype only. | [#56](https://github.com/ShinyQ/ShinyQ-HQ/pull/56) |
| 2026-10-12 | Onboarding | Round 4: "proper on boarding so the user have simple guidance at first (some kind like ... chat like old pokemon games)"; Rover's dialog, onboarding and hint bubbles answer it. | [#64](https://github.com/ShinyQ/ShinyQ-HQ/pull/64) |
| 2026-10-12 | Onboarding | The first-session onboarding replaces the Director's first-visit terminal auto-open; nothing opens the terminal on its own. | [#64](https://github.com/ShinyQ/ShinyQ-HQ/pull/64) |
| 2026-10-12 | RF Roof | The roof deck uses Signal Garden with the courier drone from the Helipad concept, picked from three concepts (RF revamp plan, Task 1 captures); the old roof drew 113 calls on lite at 1440x900. | [#58](https://github.com/ShinyQ/ShinyQ-HQ/pull/58) |
| 2026-10-12 | Safety | Live links (R4-J): a pod's `liveUrl` on an allowlisted public host may carry an Azure hostname, and the public host names are dropped from private blocklists. | [#60](https://github.com/ShinyQ/ShinyQ-HQ/pull/60) |
| 2026-10-13 | 3D experience | The touch boost button toggles (one tap on, the next off) instead of being held; boost feel is trails, squat and lean, camera kick, streaks and sparks. | [#82](https://github.com/ShinyQ/ShinyQ-HQ/pull/82) |
| 2026-10-13 | 3D experience | Store writes only on a real change; per-frame state lives in runtime objects (round 5, P3). | [#81](https://github.com/ShinyQ/ShinyQ-HQ/pull/81) |
| 2026-10-13 | 3D experience | Elevator smoothness: capped ride clock, per-floor precompile on commit, the car holds at closed doors until the destination is ready (round 5, P6). | [#74](https://github.com/ShinyQ/ShinyQ-HQ/pull/74) |
| 2026-10-13 | 3D experience | Memoized three.js resources are disposed with `useDispose`, shared resources release on canvas unmount (round 5, P3). | [#81](https://github.com/ShinyQ/ShinyQ-HQ/pull/81) |
| 2026-10-13 | 3D experience | Camera: unbounded yaw on every floor, pitch from just above the floor to near top-down, wheel and pinch zoom, and first person past the closest zoom (round 5, P7). | [#66](https://github.com/ShinyQ/ShinyQ-HQ/pull/66) |
| 2026-10-13 | 3D experience | In-world text never reads mirrored: `Readable` signs flip, L3 road signs turn with `yawTowards` (round 5, P8). | [#71](https://github.com/ShinyQ/ShinyQ-HQ/pull/71) |
| 2026-10-13 | 3D experience | Frame loop capped at 60 fps with its own rAF pacer; rendering pauses while an opaque panel covers the canvas (round 5, P3). | [#81](https://github.com/ShinyQ/ShinyQ-HQ/pull/81) |
| 2026-10-13 | 3D experience | WebGL crash recovery: one automatic remount, then the static tier with a "Retry 3D" button (round 5, P3). | [#81](https://github.com/ShinyQ/ShinyQ-HQ/pull/81) |
| 2026-10-13 | 3D experience | A runtime quality safety net steps a look-preserving ladder down and up from frame times (round 5). |  |
| 2026-10-13 | 3D experience | Shaders are precompiled and pinned per floor; the full tier warms other floors during boot (round 5). |  |
| 2026-10-13 | Content | No first person ("I", "my", "me", "saya", "aku") in the headline, the motto, pod titles and taglines, post titles, page titles or OG card text; body text and stories keep it. |  |
| 2026-10-13 | Content | The owner's own portrait (`public/og-assets/kurniadi-photo.png` and the web sizes under `public/brand/`) is the one exception to the no-photo rule. |  |
| 2026-10-13 | Content: CV | The CV is the source of truth for CV-derived facts on the site; a CV change updates `CV_SHA256`, `content/site-content.json` and the `tests/content/cv-facts.test.ts` markers in the same PR. | [#67](https://github.com/ShinyQ/ShinyQ-HQ/pull/67) |
| 2026-10-13 | Content: galleries | The vendor portal (eVendor) is no longer excluded from galleries: it is shown as Metrodata work with a gallery captured from a masked local demo instance. | [#99](https://github.com/ShinyQ/ShinyQ-HQ/pull/99) |
| 2026-10-13 | Content: positioning | The headline is "AI and Software Engineer" (the CV's order) with no cloud vendor. | [#67](https://github.com/ShinyQ/ShinyQ-HQ/pull/67) |
| 2026-10-13 | Content: schema | `Pod.client` may name the employer itself when it was the customer, such as `"Metrodata"` for the vendor portal. |  |
| 2026-10-13 | Floors | Spectacle round: no words are painted on a floor; every floor word is an upright floating sign, and all effects share the one holo shader. | [#87](https://github.com/ShinyQ/ShinyQ-HQ/pull/87) |
| 2026-10-13 | Floors | L3 draws no road chevrons (`RoadNetwork.chevrons: false`, round 5). | [#71](https://github.com/ShinyQ/ShinyQ-HQ/pull/71) |
| 2026-10-13 | L1 Lobby | Spectacle round, Part 2 of the spectacle design: the Highlights Hall becomes a gallery (pedestal, monoliths, lit arch, beacon, gateway arch, fountain, stage lights); the shapes stay inside the old station footprints, so pads, doors, spurs and deep links did not move. | [#88](https://github.com/ShinyQ/ShinyQ-HQ/pull/88) |
| 2026-10-13 | L2 Career | Spectacle round (owner pick): the L2 floor ends get the east Horizon (light bridge, far skyline, sunrise glow, corner glow strips) and the west Origin light pillar. | [#87](https://github.com/ShinyQ/ShinyQ-HQ/pull/87) |
| 2026-10-13 | L3 Labs | The L3 Project Roads layout is consolidated (owner request): roads end at the last pod, no floor arrows or floor text, readable signs. | [#71](https://github.com/ShinyQ/ShinyQ-HQ/pull/71) |
| 2026-10-13 | Motion | A Motion setting (System / Full / Reduced) replaces following `prefers-reduced-motion` alone, because Windows reports reduce whenever animation effects are off. | [#86](https://github.com/ShinyQ/ShinyQ-HQ/pull/86) |
| 2026-10-13 | Page View | Featured project cards are equal height in one grid, never staggered or spanned (round 5). | [#83](https://github.com/ShinyQ/ShinyQ-HQ/pull/83) |
| 2026-10-13 | Performance | The lite, reduced-motion memory gate `e2e/memory.spec.ts` comes from R5 P3 and runs in the regular suite. | [#81](https://github.com/ShinyQ/ShinyQ-HQ/pull/81) |
| 2026-10-13 | Stats | Public visit stats Layer 1: public numbers with no thresholds, daily from complete UTC days, countries as dots only, the label "visits", and a "Don't count my visits" switch. | [#89](https://github.com/ShinyQ/ShinyQ-HQ/pull/89) |
| 2026-10-13 | Stats | Display S2 ships: Visitor Observatory, L1 visits tile, Classic ticker item and Contact "Visits" section. | [#90](https://github.com/ShinyQ/ShinyQ-HQ/pull/90) |
| 2026-10-13 | Styling | No colored edge stripes (R5 P10): state and selection use a dot or icon chip and the `hq-glow` outline glow. | [#72](https://github.com/ShinyQ/ShinyQ-HQ/pull/72) |
| 2026-10-13 | Styling | Blur policy (round 5): no `backdrop-filter` under near-opaque panels, hidden scrims or on coarse pointers; the round 5 P3 PR measured at most 0.11% of pixels moved. | [#81](https://github.com/ShinyQ/ShinyQ-HQ/pull/81) |
| 2026-10-14 | Ask | The `production` chunk ("How I run AI in production") joins the pack; featured pods keep one approach step to fit it. | [#95](https://github.com/ShinyQ/ShinyQ-HQ/pull/95) |
| 2026-10-14 | Ask | Cloudflare secrets live in the `production` environment, only jobs that declare it read them, and PR runs never receive one (security S3, H1, owner decision 4). | [#130](https://github.com/ShinyQ/ShinyQ-HQ/pull/130) |
| 2026-10-14 | Ask | `content-gap.yml` publishes counts and topics only, never question text (security S8, owner decision 7). | [#132](https://github.com/ShinyQ/ShinyQ-HQ/pull/132) |
| 2026-10-14 | Ask | Every workflow and the setup action pin each action by full commit SHA with a version comment (owner decision 5). | [#130](https://github.com/ShinyQ/ShinyQ-HQ/pull/130) |
| 2026-10-14 | CI | Security S5: `main` is protected by a repository ruleset with required checks; changes land only through a PR. | [#130](https://github.com/ShinyQ/ShinyQ-HQ/pull/130) |
| 2026-10-14 | Content: L3 wings | A third wing, `data` (Data and ML), is added (owner request). | [#96](https://github.com/ShinyQ/ShinyQ-HQ/pull/96) |
| 2026-10-14 | Content: indexes | The Tech Reactor index (`getTechIndex()`, six rings in `REACTOR_RINGS`) follows the 2026-10-14 design. |  |
| 2026-10-14 | Content: indexes | The Topic index (`getTopicIndex()`) feeds the L4 Topic Constellation (owner request). | [#98](https://github.com/ShinyQ/ShinyQ-HQ/pull/98) |
| 2026-10-14 | Content: perspectives | All 15 engineering perspectives are approved and published as Ask knowledge only (no page, section, anchor, sitemap or Cmd-K entry). | [#94](https://github.com/ShinyQ/ShinyQ-HQ/pull/94) |
| 2026-10-14 | Content: schema | Top-level `production` (`ProductionSchema`, "How I run AI in production") is owner approved. | [#95](https://github.com/ShinyQ/ShinyQ-HQ/pull/95) |
| 2026-10-14 | Content: side projects | `sideProjects` lists only work without a project pod; Sentiboard, e-wallet sentiment and the S&P 500 optimizer moved to Data and ML pods and their benches went to `RETIRED_SIDE_ROOMS`. | [#103](https://github.com/ShinyQ/ShinyQ-HQ/pull/103) |
| 2026-10-14 | Floors | Fast return (F1): floors can set an Express Return pad that beams the rover to the elevator call pad, and a far rover beams into the car at the start of a ride. | [#91](https://github.com/ShinyQ/ShinyQ-HQ/pull/91) |
| 2026-10-14 | Floors | `FAST_RETURN.beamDistance` is raised from 25 u to 40 u, so the L3 overview and the RF arrival drive to the car instead of beaming. | [#100](https://github.com/ShinyQ/ShinyQ-HQ/pull/100) |
| 2026-10-14 | HUD missions | The Visitor Observatory room is `L1:visits` in the Lobby's south-west corner (it was `RF:visits` on the roof); the old id resolves through `canonicalRoom`. | [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| 2026-10-14 | L1 Lobby | The L1 spawn sits in front of the Ask Rover kiosk (about 16.5 u from the call pad). |  |
| 2026-10-14 | L1 Lobby | Owner review "the rover kiosk not straight line into the circle": the kiosk stands on the radial kiosk axis toward the Visitor Observatory with a straight radial lane spoke. | [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| 2026-10-14 | L1 Lobby | Owner: "first rover placement should be infront of his kiosk"; the session spawn is the kiosk's point-and-go stop. | [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| 2026-10-14 | L2 Career | Plan item F3 (owner approved): the Workshop closes the Career Road with a forecourt and time console, a gateway arch, workbenches, the repo skyline and the Horizon deck. | [#93](https://github.com/ShinyQ/ShinyQ-HQ/pull/93) |
| 2026-10-14 | L3 Labs | The L3 Ops Control Room ("How I run AI in production") is owner approved. | [#95](https://github.com/ShinyQ/ShinyQ-HQ/pull/95) |
| 2026-10-14 | L3 Labs | The Data and ML wing is added to L3 (owner request). | [#96](https://github.com/ShinyQ/ShinyQ-HQ/pull/96) |
| 2026-10-14 | L3 Labs | The L3 Tech Reactor design: the reactor core's tech rings become a project filter. | [#92](https://github.com/ShinyQ/ShinyQ-HQ/pull/92) |
| 2026-10-14 | L4 Writing | Owner request: the end of the timeline becomes the end plaza (ring road around the Topic Constellation, research monument, Express Return pad, archive board, which is now drawn). | [#98](https://github.com/ShinyQ/ShinyQ-HQ/pull/98) |
| 2026-10-14 | Motion | Full is the default motion for every visitor on every OS; store version 3 migrates a stored `system` to `full`. | [#97](https://github.com/ShinyQ/ShinyQ-HQ/pull/97) |
| 2026-10-14 | Motion | The one-time "turn on full motion" Rover line (`MotionHintLayer`) is retired with the Full default. | [#97](https://github.com/ShinyQ/ShinyQ-HQ/pull/97) |
| 2026-10-14 | Page View | Perspectives get no Page View section; they are Ask knowledge only. | [#94](https://github.com/ShinyQ/ShinyQ-HQ/pull/94) |
| 2026-10-14 | Performance | Owner decision 16: the `memory-full` perf-lane gate runs `GPU_MEMORY_BUDGET.fullTierRoundTrips` (3) Lobby to Roof round trips on the full tier with Motion Full. | [#128](https://github.com/ShinyQ/ShinyQ-HQ/pull/128) |
| 2026-10-14 | Safety | The private blocklist gate (security S1, owner decision 3): `scripts/scan-export.ts` fails main and deploy runs without private terms and warns on pull requests. | [#121](https://github.com/ShinyQ/ShinyQ-HQ/pull/121) |
| 2026-10-14 | Safety | The export scan covers every text file of `out/`, client chunks included (security S9). | [#121](https://github.com/ShinyQ/ShinyQ-HQ/pull/121) |
| 2026-10-14 | Safety | Private blocklist terms are never printed, only labelled `private term #n` or redacted (security S2). | [#109](https://github.com/ShinyQ/ShinyQ-HQ/pull/109) |
| 2026-10-14 | Stats | The Visitor Observatory moves from RF to the Lobby's south-west corner; RF goes back to its pre-#90 deck. | [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| 2026-10-14 | Stats | `StatsSnapshotV1` gains an optional, backward-compatible `perf` block from Analytics Engine `perf_events`. | [#95](https://github.com/ShinyQ/ShinyQ-HQ/pull/95) |
| 2026-10-15 | 3D experience | L3, L4 and RF load as on-demand floor chunks (`floorChunks.ts`, `floors/chunks/`) (Round 7 B). | [#157](https://github.com/ShinyQ/ShinyQ-HQ/pull/157) |
| 2026-10-15 | Ask | About has no Ask section; the home hero ask bar is the landing entry point. |  |
| 2026-10-15 | Ask | Ask answers how ShinyQ HQ itself was built from `content/ask/site-build.json`, cited to the public repository. | [#139](https://github.com/ShinyQ/ShinyQ-HQ/pull/139) |
| 2026-10-15 | Ask | `PACK_MAX_BYTES` is 256 KiB (raised from 200 KB, measured and owner pre-approved) so every approved perspective fits. | [#143](https://github.com/ShinyQ/ShinyQ-HQ/pull/143) |
| 2026-10-15 | Ask | Scope routing is deterministic in `functions/_lib/scope.ts`: capability answers, general-assistant declines and lifestyle or policy questions routed to tagged perspectives only. | [#143](https://github.com/ShinyQ/ShinyQ-HQ/pull/143) |
| 2026-10-15 | Ask | Lead intent: project or hiring questions get matching projects and a contact card, never estimates, designs, code or requests for personal data. | [#143](https://github.com/ShinyQ/ShinyQ-HQ/pull/143) |
| 2026-10-15 | Brand | The rover brand mark is the site's brand mark (geometry in `src/lib/brand-mark.ts`, files in `public/brand/`); it replaces the KAW monogram. | [#142](https://github.com/ShinyQ/ShinyQ-HQ/pull/142) |
| 2026-10-15 | Content: perspectives | 30 owner-written, endorsed answers are added, each tagged with one topic from `PERSPECTIVE_TOPICS`; the `answer` cap rises from 520 to 640 characters. | [#143](https://github.com/ShinyQ/ShinyQ-HQ/pull/143) |
| 2026-10-15 | Content: schema | `Pod.selected` (1 to 3) sets the landing "Selected work" rank, independent of tier; the L1 Highlights Hall shares the pick. | [#141](https://github.com/ShinyQ/ShinyQ-HQ/pull/141) |
| 2026-10-15 | Dependencies | Round 7 dependency policy: minor and patch updates land together, each major in its own PR with every gate green; an unpassable major is pinned with a dated revisit ignore. | [#149](https://github.com/ShinyQ/ShinyQ-HQ/pull/149) |
| 2026-10-15 | Dependencies | Round 7 A4: TypeScript moves to `~6.0` with a TypeScript 7 pin until typescript-eslint supports 7. | [#155](https://github.com/ShinyQ/ShinyQ-HQ/pull/155) |
| 2026-10-15 | Docs | Documentation split: `README.md` is a short overview; feature detail goes into `docs/features.md` and content workflows into `docs/content.md`. |  |
| 2026-10-15 | Floors | L3, L4 and RF load on demand as floor chunks (Round 7 B) with owner-approved per-floor caps; the main 3D path went from 420.1 to 403.8 KB gzip on lite and from 443.7 to 427.4 KB on full. | [#157](https://github.com/ShinyQ/ShinyQ-HQ/pull/157) |
| 2026-10-15 | L2 Career | The "L3 Labs above" label at the Workshop window is retired; the window keeps glass and sight lines only, no text. | [#154](https://github.com/ShinyQ/ShinyQ-HQ/pull/154) |
| 2026-10-15 | Motion | The landing ticker has no pause switch; under reduced motion its duplicate track hides and the stats wrap. | [#141](https://github.com/ShinyQ/ShinyQ-HQ/pull/141) |
| 2026-10-15 | Page View | The landing stat ticker has no "Updated" stamp and no "Pause motion" switch; hover or focus holds it. | [#141](https://github.com/ShinyQ/ShinyQ-HQ/pull/141) |
| 2026-10-15 | Page View | Selected work comes from `Pod.selected` ranks, then other gallery pods, independent of `tier`. | [#141](https://github.com/ShinyQ/ShinyQ-HQ/pull/141) |
| 2026-10-15 | Stats | The Classic site footer drops the "Don't count my visits" switch and the privacy line; the opt-out stays in the L1:visits drawer. | [#141](https://github.com/ShinyQ/ShinyQ-HQ/pull/141) |
| 2026-10-16 | Ask | "ShinyQ" is Kurniadi's nickname, resolved by `resolveNickname` before scope and retrieval; "ShinyQ HQ" still means the site. | [#160](https://github.com/ShinyQ/ShinyQ-HQ/pull/160) |
| 2026-10-16 | Audio | Background music: the ambient hum becomes the procedural "Deep Space Ambient" track (owner pick after six auditions: "Deep Space Ambient will be good"), at the hum's loudness. | [#175](https://github.com/ShinyQ/ShinyQ-HQ/pull/175) |
| 2026-10-16 | Content | Sewise Fashion Labs is an approved 2026 hackathon entry, named openly as one and allowlisted in `tests/content/dataset.test.ts`; other 2026 hackathon entries stay excluded. | [#173](https://github.com/ShinyQ/ShinyQ-HQ/pull/173) |
| 2026-10-16 | Content: L3 wings | The `data` wing becomes the middle road, the spine from the hub to the Tech Reactor. | [#164](https://github.com/ShinyQ/ShinyQ-HQ/pull/164) |
| 2026-10-16 | Content: diagrams | Every architecture (case studies and posts) is drawn by `ArchitectureDiagram` as a real box and arrow diagram; `ArchitectureNode.group` draws an optional frame around related nodes. | [#172](https://github.com/ShinyQ/ShinyQ-HQ/pull/172) |
| 2026-10-16 | Content: missions | The mission `walk` step is removed with the guided walks (tours) (owner request). | [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| 2026-10-16 | Content: schema | `Pod.shortTitle` adds a one-line title for the L3 directory boards (owner request). | [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| 2026-10-16 | Docs | AGENTS.md becomes a short index (under 25 KB, guarded by `tests/unit/agents-md.test.ts`); detail rules move to `docs/agents/`, dated decisions to this log, and `CLAUDE.md` imports AGENTS.md. |  |
| 2026-10-16 | Floors | The guided tours (walks) that the walkable floors plan shipped are removed with their engine, HUD and URL flag; old links with the flag are ignored. | [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| 2026-10-16 | L3 Labs | "three paths" (Round 7 G, owner request): three roads leave the hub center (Data and ML spine east, Product Engineering north, AI Engineering south); the annex, the data plaza and the `directory` stub road are removed. | [#164](https://github.com/ShinyQ/ShinyQ-HQ/pull/164) |
| 2026-10-16 | L3 Labs | The L3 end is mirror-symmetric about the spine (owner request): both wing roads drop onto the reactor ring's north and south points, the spine enters at its west point. | [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| 2026-10-16 | L3 Labs | The directory is three free-standing boards for a neat entrance (owner request), with no joined wall or shared frame. | [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| 2026-10-16 | L3 Labs | L3 has no floating road signs (owner request): the `labs-wing-signs` are removed and the board titles are the one name per path. |  |
| 2026-10-16 | L3 Labs | The Data and ML pods move to the middle road, the spine from the hub to the reactor (Round 7 G). | [#164](https://github.com/ShinyQ/ShinyQ-HQ/pull/164) |
| 2026-10-16 | L3 Labs | The Fabric demand forecasting pod moves from AI Engineering to Data and ML (owner): on-premise data into Fabric with a medallion pattern. | [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| 2026-10-16 | L4 Writing | Round 7 F: the Writing floor is decluttered (one sign per section, placed labels, year posts); its timeline words replace one troika `Text` per station with one `FloatingSigns` group, and `e2e/library-labels.spec.ts` guards label overlap. | [#165](https://github.com/ShinyQ/ShinyQ-HQ/pull/165) |
| 2026-10-16 | L4 Writing | Round 7 F budgets held (main to branch): L4 settled full 74 to 72 scene calls and 9287 to 9157 triangles, lite 67 to 65 and 9008 to 8878, shader programs equal, floor chunk 9.9 KB gzip. | [#165](https://github.com/ShinyQ/ShinyQ-HQ/pull/165) |
| 2026-10-16 | Onboarding | The guided walks (tours) are removed; the legacy `hq:walk-prompt` list still counts as seen and stale `hq:walk:<id>` keys are ignored. | [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| 2026-10-16 | Performance | The 3D session total (main path plus all floor chunks) gets its own cap, `BYTES_3D_BUDGET.session`: full 470 KB (measured 455.0 KB plus a 15 KB margin), lite 446.4 KB (measured 431.4 KB plus 15 KB). |  |
| 2026-10 | 3D experience | The boot overlay and the intro play in full, unskippable, on the first 3D load of every browser session, on any route; later loads in the session open straight in. | [#55](https://github.com/ShinyQ/ShinyQ-HQ/pull/55) |
| 2026-10 | Floors | Point-and-go replaces click-to-move: the rover never drives to a clicked floor point, only to registry targets. | [#62](https://github.com/ShinyQ/ShinyQ-HQ/pull/62) |
| 2026-10 | HUD | 3D HUD layout: no Quick view in the top bar, Classic site is the one primary control with Ask AI at the far right, Motion right of Sound, one bottom flex band. | [#55](https://github.com/ShinyQ/ShinyQ-HQ/pull/55) |
| 2026-10 | HUD naming | The Rover Terminal and its missions are named Ask Rover (ID Tanya Rover) wherever a visitor reads them; code names stay. | [#55](https://github.com/ShinyQ/ShinyQ-HQ/pull/55) |
| 2026-10 | L1 Lobby | The Lobby gets the Highlights Hall: a lead road south of the certification wall into a plaza with four summary stations (about me, top projects, work experience, contact). | [#65](https://github.com/ShinyQ/ShinyQ-HQ/pull/65) |
| 2026-10 | L1 Lobby | Owner review "the line is not straight": the Ask Rover kiosk's body, stand and screen turn as one group by one yaw and lines never wrap. |  |
| 2026-10 | L4 Writing | Owner review: no label on the end plaza may cover another; signs are placed on screen every frame. |  |
| 2026-10 | Page View | The static pages are called Classic site (ID Situs klasik) wherever a visitor reads it; "Page View" stays the internal name. | [#86](https://github.com/ShinyQ/ShinyQ-HQ/pull/86) |
| 2026-10 | Page View | The landing hero has no illustration beside the name. |  |
| 2026-10-17 | Page View | `?view=classic` stays in the URL and carries through navigation (`?view=page` is an alias); case studies, posts and the drawer get Copy Classic link and Copy 3D link; the choice is remembered across tabs; an explicit `?view=` always wins. | [#181](https://github.com/ShinyQ/ShinyQ-HQ/pull/181) |
