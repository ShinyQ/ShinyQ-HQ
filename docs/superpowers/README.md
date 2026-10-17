# Superpowers plans and specs

This folder holds the design specs and the implementation plans that built ShinyQ HQ, written with the superpowers workflow (brainstorm, spec, plan, execute task by task).

- **Specs** (`specs/`) describe what to build and why: the Agent HQ design with its appendices 01 to 08, and the design notes for later rounds. The appendices are living documents and win over the main spec for their topic.
- **Plans** (`plans/`) are step-by-step implementation plans, one per pull request or round. Each plan has a status line under its title, and its checkboxes are ticked once it shipped.

Plans are history: they record what was decided and built at the time, and later work may have changed or removed parts of them (the status line says where). For the current state of the code, read `AGENTS.md` and `docs/agents/`; for features and content, `docs/features.md` and `docs/content.md`.

## Plans

71 plans: 46 shipped and still current, 23 shipped with a part later removed or replaced, 2 in review (see each plan's status line).

| Plan | Status | PR |
|---|---|---|
| [Launch Infrastructure Implementation Plan](plans/2026-10-09-launch-infra.md) | shipped | [#4](https://github.com/ShinyQ/ShinyQ-HQ/pull/4) |
| [Tech Logos and Project Galleries Implementation Plan](plans/2026-10-09-logos-and-galleries.md) | shipped | [#9](https://github.com/ShinyQ/ShinyQ-HQ/pull/9) |
| [Missions HUD Implementation Plan](plans/2026-10-09-missions-hud.md) | shipped | [#3](https://github.com/ShinyQ/ShinyQ-HQ/pull/3) |
| [Phase 0: Foundation and Content Implementation Plan](plans/2026-10-09-phase-0-foundation.md) | shipped, later removed | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1); later [#24](https://github.com/ShinyQ/ShinyQ-HQ/pull/24), [#142](https://github.com/ShinyQ/ShinyQ-HQ/pull/142) |
| [Phase 1-2: Tower Shell, Screen Rover and Lobby Implementation Plan](plans/2026-10-09-phase-1-2-tower-rover-lobby.md) | shipped, later removed | [#5](https://github.com/ShinyQ/ShinyQ-HQ/pull/5); later [#142](https://github.com/ShinyQ/ShinyQ-HQ/pull/142) |
| [Phase 3: Career Archive Corridor Implementation Plan](plans/2026-10-09-phase-3-career-corridor.md) | shipped, later removed | [#11](https://github.com/ShinyQ/ShinyQ-HQ/pull/11); later [#40](https://github.com/ShinyQ/ShinyQ-HQ/pull/40) |
| [Phase 4: Labs, Glass Drawer and Hologram Implementation Plan](plans/2026-10-09-phase-4-labs-drawer-hologram.md) | shipped, later removed | [#8](https://github.com/ShinyQ/ShinyQ-HQ/pull/8); later [#41](https://github.com/ShinyQ/ShinyQ-HQ/pull/41) |
| [Phase 5a: L4 Library and RF Roof Implementation Plan](plans/2026-10-09-phase-5a-library-roof.md) | shipped, later removed | [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12); later [#56](https://github.com/ShinyQ/ShinyQ-HQ/pull/56), [#58](https://github.com/ShinyQ/ShinyQ-HQ/pull/58) |
| [Agent HQ: Game-First Load, Prototype Look and Feel, and Page View Revamp: Implementation Plan](plans/2026-10-10-game-first-lookfeel-pageview.md) | shipped, later removed | [#16](https://github.com/ShinyQ/ShinyQ-HQ/pull/16), [#17](https://github.com/ShinyQ/ShinyQ-HQ/pull/17), [#18](https://github.com/ShinyQ/ShinyQ-HQ/pull/18), [#19](https://github.com/ShinyQ/ShinyQ-HQ/pull/19), [#20](https://github.com/ShinyQ/ShinyQ-HQ/pull/20); later [#62](https://github.com/ShinyQ/ShinyQ-HQ/pull/62) |
| [Page View revamp Implementation Plan](plans/2026-10-10-pageview-revamp.md) | shipped, later removed | [#16](https://github.com/ShinyQ/ShinyQ-HQ/pull/16); later [#142](https://github.com/ShinyQ/ShinyQ-HQ/pull/142) |
| [L3 Project Roads and "Tour my projects"](plans/2026-10-11-l3-project-roads.md) | shipped, later removed | [#41](https://github.com/ShinyQ/ShinyQ-HQ/pull/41); later [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [R4-L: Ask the HQ Perspectives Implementation Plan](plans/2026-10-12-ask-perspectives.md) | shipped, later removed | [#59](https://github.com/ShinyQ/ShinyQ-HQ/pull/59); later [#94](https://github.com/ShinyQ/ShinyQ-HQ/pull/94) |
| [R3-D: Title Case Titles and Gallery-First Project Order Implementation Plan](plans/2026-10-12-content-casing-ordering.md) | shipped, later removed | [#52](https://github.com/ShinyQ/ShinyQ-HQ/pull/52); later [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [L1 Highlights Hall Implementation Plan](plans/2026-10-12-highlights-hall.md) | shipped, later removed | [#65](https://github.com/ShinyQ/ShinyQ-HQ/pull/65); later [#88](https://github.com/ShinyQ/ShinyQ-HQ/pull/88), [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [R3-B: HUD, Boost, Unskippable Intro, Drawer Footer and Centered Lobby Implementation Plan](plans/2026-10-12-hud-drawer-lobby.md) | shipped, later removed | [#55](https://github.com/ShinyQ/ShinyQ-HQ/pull/55); later [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [L4 Writing Revamp (Reading Room, Newsroom or Constellation) Implementation Plan](plans/2026-10-12-l4-writing.md) | shipped, later removed | [#56](https://github.com/ShinyQ/ShinyQ-HQ/pull/56); later [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [Cinematic Landing (Page View Home) Implementation Plan](plans/2026-10-12-landing.md) | shipped, later removed | [#54](https://github.com/ShinyQ/ShinyQ-HQ/pull/54); later [#141](https://github.com/ShinyQ/ShinyQ-HQ/pull/141) |
| [R4-J: Live Links for the MII Microsoft Sites Implementation Plan](plans/2026-10-12-live-links-mii-microsoft.md) | shipped | [#60](https://github.com/ShinyQ/ShinyQ-HQ/pull/60) |
| [Rover Dialog, First-Session Onboarding, Hint Bubbles and Floor Lines Implementation Plan](plans/2026-10-12-onboarding-dialog.md) | shipped, later removed | [#64](https://github.com/ShinyQ/ShinyQ-HQ/pull/64); later [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [Elevator Call Pads and L2 Year Teleporters Implementation Plan](plans/2026-10-12-pads-teleporters.md) | shipped | [#53](https://github.com/ShinyQ/ShinyQ-HQ/pull/53) |
| [Point-and-Go Interactables Implementation Plan](plans/2026-10-12-point-and-go.md) | shipped | [#62](https://github.com/ShinyQ/ShinyQ-HQ/pull/62) |
| [RF Roof Revamp Implementation Plan](plans/2026-10-12-rf-roof-revamp.md) | shipped, later removed | [#58](https://github.com/ShinyQ/ShinyQ-HQ/pull/58); later [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [R4-K: Serupa and DariOrdal Ticketing Projects Implementation Plan](plans/2026-10-12-serupa-dariordal.md) | shipped | [#61](https://github.com/ShinyQ/ShinyQ-HQ/pull/61) |
| [R5 P10: Accent Stripes Replaced Sitewide Implementation Plan](plans/2026-10-13-accent-stripes.md) | shipped | [#72](https://github.com/ShinyQ/ShinyQ-HQ/pull/72) |
| [Free Camera Rotation, Wheel Zoom and First-Person View Implementation Plan (Round 5, P7)](plans/2026-10-13-camera-freedom-first-person.md) | shipped | [#66](https://github.com/ShinyQ/ShinyQ-HQ/pull/66) |
| [Round 5 P3: CPU, lifecycle and memory Implementation Plan](plans/2026-10-13-cpu-lifecycle-memory.md) | shipped | [#81](https://github.com/ShinyQ/ShinyQ-HQ/pull/81) |
| [R5 P5: CV Refresh Implementation Plan](plans/2026-10-13-cv-refresh.md) | shipped | [#67](https://github.com/ShinyQ/ShinyQ-HQ/pull/67) |
| [R5 P6: Elevator Ride Smoothness, Page View Icon and Owner Photo Implementation Plan](plans/2026-10-13-elevator-ride-icon-photo.md) | shipped, later removed | [#74](https://github.com/ShinyQ/ShinyQ-HQ/pull/74); later [#88](https://github.com/ShinyQ/ShinyQ-HQ/pull/88) |
| [R5 P6 measurements](plans/2026-10-13-elevator-ride-icon-photo-measurements.md) | shipped | [#74](https://github.com/ShinyQ/ShinyQ-HQ/pull/74) |
| [Floating Floor Signs and Floor Ends (Session B) Implementation Plan](plans/2026-10-13-floating-signs-floor-ends.md) | shipped, later removed | [#87](https://github.com/ShinyQ/ShinyQ-HQ/pull/87); later [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| [P2 GPU and Rendering (look-preserving) Implementation Plan](plans/2026-10-13-gpu-look-preserving.md) | shipped | [#75](https://github.com/ShinyQ/ShinyQ-HQ/pull/75) |
| [Highlights Hall gallery rebuild (Session A) Implementation Plan](plans/2026-10-13-highlights-hall-gallery.md) | shipped | [#88](https://github.com/ShinyQ/ShinyQ-HQ/pull/88) |
| [R5 P8: L3 Layout Consolidation Implementation Plan](plans/2026-10-13-l3-consolidation.md) | shipped, later removed | [#71](https://github.com/ShinyQ/ShinyQ-HQ/pull/71); later [#164](https://github.com/ShinyQ/ShinyQ-HQ/pull/164), [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| [R5-P4: Measurement and CI Gates Implementation Plan](plans/2026-10-13-measurement-gates.md) | shipped | [#79](https://github.com/ShinyQ/ShinyQ-HQ/pull/79) |
| [Motion setting and "Classic site" rename Implementation Plan](plans/2026-10-13-motion-setting-classic-site.md) | shipped, later removed | [#86](https://github.com/ShinyQ/ShinyQ-HQ/pull/86); later [#97](https://github.com/ShinyQ/ShinyQ-HQ/pull/97) |
| [Round 5 P1: Page View and Delivery Implementation Plan](plans/2026-10-13-pageview-delivery.md) | shipped | [#83](https://github.com/ShinyQ/ShinyQ-HQ/pull/83) |
| [Realistic Boost Implementation Plan](plans/2026-10-13-realistic-boost.md) | shipped | [#82](https://github.com/ShinyQ/ShinyQ-HQ/pull/82) |
| [Ride Triangles Under 30k Implementation Plan](plans/2026-10-13-ride-triangles.md) | shipped | [#85](https://github.com/ShinyQ/ShinyQ-HQ/pull/85) |
| [R5 P9: SEO Wording and Neon Cinematic OG Images Implementation Plan](plans/2026-10-13-seo-og.md) | shipped | [#68](https://github.com/ShinyQ/ShinyQ-HQ/pull/68) |
| [Data and ML Project Cluster Implementation Plan](plans/2026-10-14-data-ml-cluster.md) | shipped, later removed | [#96](https://github.com/ShinyQ/ShinyQ-HQ/pull/96); later [#164](https://github.com/ShinyQ/ShinyQ-HQ/pull/164), [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [F1 Fast Return Implementation Plan](plans/2026-10-14-f1-fast-return.md) | shipped | [#91](https://github.com/ShinyQ/ShinyQ-HQ/pull/91) |
| [L2 Workshop rebuild (F3) Implementation Plan](plans/2026-10-14-l2-workshop-rebuild.md) | shipped | [#93](https://github.com/ShinyQ/ShinyQ-HQ/pull/93) |
| [L3 Tech Reactor Implementation Plan](plans/2026-10-14-l3-tech-reactor.md) | shipped | [#92](https://github.com/ShinyQ/ShinyQ-HQ/pull/92) |
| [L4 Topic Constellation Implementation Plan](plans/2026-10-14-l4-topic-constellation.md) | shipped | [#98](https://github.com/ShinyQ/ShinyQ-HQ/pull/98) |
| [Observability Showcase Implementation Plan](plans/2026-10-14-observability-showcase.md) | shipped | [#95](https://github.com/ShinyQ/ShinyQ-HQ/pull/95) |
| [Visitor Observatory to the L1 Lobby, radial kiosk, kiosk spawn: Implementation Plan](plans/2026-10-14-observatory-to-lobby.md) | shipped | [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| [Public Visit Stats, Layer 1: Data Pipeline (S1) Implementation Plan](plans/2026-10-14-public-visit-stats-pipeline.md) | shipped | [#89](https://github.com/ShinyQ/ShinyQ-HQ/pull/89) |
| [Public Visit Stats, Layer 1: Display (S2) Implementation Plan](plans/2026-10-14-visit-stats-display.md) | shipped, later removed | [#90](https://github.com/ShinyQ/ShinyQ-HQ/pull/90); later [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104), [#141](https://github.com/ShinyQ/ShinyQ-HQ/pull/141) |
| [CSP Script Hashes Implementation Plan](plans/2026-10-15-csp-script-hashes.md) | shipped | [#147](https://github.com/ShinyQ/ShinyQ-HQ/pull/147) |
| [Floor Chunks (Round 7 B: 3D bundle split) Implementation Plan](plans/2026-10-15-floor-chunks.md) | shipped | [#157](https://github.com/ShinyQ/ShinyQ-HQ/pull/157) |
| [L2 Workshop window text removal (Round 7 H)](plans/2026-10-15-l2-window-text.md) | shipped | [#154](https://github.com/ShinyQ/ShinyQ-HQ/pull/154) |
| [Package Upgrades (Round 7, sub-project A) Implementation Plan](plans/2026-10-15-package-upgrades.md) | shipped | [#149](https://github.com/ShinyQ/ShinyQ-HQ/pull/149), [#151](https://github.com/ShinyQ/ShinyQ-HQ/pull/151), [#153](https://github.com/ShinyQ/ShinyQ-HQ/pull/153), [#155](https://github.com/ShinyQ/ShinyQ-HQ/pull/155), [#158](https://github.com/ShinyQ/ShinyQ-HQ/pull/158) |
| [Uptime and Error Alerts Implementation Plan](plans/2026-10-15-uptime-alerts.md) | shipped | [#146](https://github.com/ShinyQ/ShinyQ-HQ/pull/146) |
| [Ask Dock Polish Implementation Plan](plans/2026-10-16-ask-dock-polish.md) | shipped | [#162](https://github.com/ShinyQ/ShinyQ-HQ/pull/162) |
| [Ask the HQ: "ShinyQ" Is Kurniadi's Nickname Implementation Plan](plans/2026-10-16-ask-shinyq-nickname.md) | shipped | [#160](https://github.com/ShinyQ/ShinyQ-HQ/pull/160) |
| [Blog Architecture Diagrams Implementation Plan](plans/2026-10-16-blog-architecture-diagrams.md) | shipped | [#172](https://github.com/ShinyQ/ShinyQ-HQ/pull/172) |
| [Clearbox and Sewise Fashion Labs Pods Implementation Plan](plans/2026-10-16-clearbox-and-sewise.md) | shipped | [#173](https://github.com/ShinyQ/ShinyQ-HQ/pull/173) |
| [Deep Space Ambient Background Music Implementation Plan](plans/2026-10-16-deep-space-ambient.md) | shipped | [#175](https://github.com/ShinyQ/ShinyQ-HQ/pull/175) |
| [L3 Neat Entrance and Symmetric End Implementation Plan](plans/2026-10-16-l3-neat-entrance-symmetric-end.md) | shipped | [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| [L3 Three Paths (Round 7 G) Implementation Plan](plans/2026-10-16-l3-three-paths.md) | shipped, later removed | [#164](https://github.com/ShinyQ/ShinyQ-HQ/pull/164); later [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| [L4 Declutter (Round 7 F) Implementation Plan](plans/2026-10-16-l4-declutter.md) | shipped | [#165](https://github.com/ShinyQ/ShinyQ-HQ/pull/165) |
| [Landing Key Projects and Project Placeholders Implementation Plan](plans/2026-10-16-landing-key-projects.md) | shipped | [#159](https://github.com/ShinyQ/ShinyQ-HQ/pull/159) |
| [MII Cowork and MII Deck Implementation Plan](plans/2026-10-16-mii-cowork-and-deck.md) | shipped | [#163](https://github.com/ShinyQ/ShinyQ-HQ/pull/163) |
| [Remove Guided Walks Implementation Plan](plans/2026-10-16-remove-guided-walks.md) | shipped | [#167](https://github.com/ShinyQ/ShinyQ-HQ/pull/167) |
| [Public Visit Stats Every 4 Hours Implementation Plan](plans/2026-10-16-stats-every-4h.md) | shipped | [#161](https://github.com/ShinyQ/ShinyQ-HQ/pull/161) |
| [Shareable Classic and 3D Links Implementation Plan](plans/2026-10-17-classic-links.md) | shipped | [#181](https://github.com/ShinyQ/ShinyQ-HQ/pull/181) |
| [Smart CI Implementation Plan](plans/2026-10-17-smart-ci.md) | in review | [#176](https://github.com/ShinyQ/ShinyQ-HQ/pull/176) |
| [Day and Night with a Moving Sun and Moon Implementation Plan](plans/2026-10-17-day-and-night.md) | shipped | [#182](https://github.com/ShinyQ/ShinyQ-HQ/pull/182), [#185](https://github.com/ShinyQ/ShinyQ-HQ/pull/185) |
| [HUD Corners, Minimap and Settings Implementation Plan](plans/2026-10-17-hud-corners-minimap-settings.md) | shipped | [#183](https://github.com/ShinyQ/ShinyQ-HQ/pull/183) |
| [Round 8 J: L3-Style Arrivals Implementation Plan](plans/2026-10-17-l3-style-arrivals.md) | shipped | [#184](https://github.com/ShinyQ/ShinyQ-HQ/pull/184) |
| [Rover Idle Animations Implementation Plan](plans/2026-10-17-rover-idle.md) | in review | [#188](https://github.com/ShinyQ/ShinyQ-HQ/pull/188) |

## Specs

| Spec | Status | PR |
|---|---|---|
| [ShinyQ HQ: Agent HQ Portfolio Design](specs/2026-10-09-agent-hq-design.md) | implemented | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), then later rounds to [#173](https://github.com/ShinyQ/ShinyQ-HQ/pull/173) |
| [Page View revamp: editorial Neon Grid (design spec)](specs/2026-10-10-pageview-revamp-design.md) | implemented | [#16](https://github.com/ShinyQ/ShinyQ-HQ/pull/16), [#54](https://github.com/ShinyQ/ShinyQ-HQ/pull/54), [#83](https://github.com/ShinyQ/ShinyQ-HQ/pull/83), [#159](https://github.com/ShinyQ/ShinyQ-HQ/pull/159) |
| [Ask the HQ: design and implementation plan](specs/2026-10-11-ask-hq-design.md) | implemented | [#28](https://github.com/ShinyQ/ShinyQ-HQ/pull/28), [#38](https://github.com/ShinyQ/ShinyQ-HQ/pull/38), [#59](https://github.com/ShinyQ/ShinyQ-HQ/pull/59), [#94](https://github.com/ShinyQ/ShinyQ-HQ/pull/94), [#139](https://github.com/ShinyQ/ShinyQ-HQ/pull/139), [#143](https://github.com/ShinyQ/ShinyQ-HQ/pull/143), [#160](https://github.com/ShinyQ/ShinyQ-HQ/pull/160), [#162](https://github.com/ShinyQ/ShinyQ-HQ/pull/162) |
| [Certifications at scale: design](specs/2026-10-11-certifications-layout-design.md) | implemented | [#46](https://github.com/ShinyQ/ShinyQ-HQ/pull/46) |
| [Spectacle round: floor ends, Highlights Hall gallery, floating floor text (design)](specs/2026-10-13-spectacle-floor-ends-hall-design.md) | implemented | [#87](https://github.com/ShinyQ/ShinyQ-HQ/pull/87), [#88](https://github.com/ShinyQ/ShinyQ-HQ/pull/88) |
| [Appendix 01: World and Layout](specs/agent-hq/01-world-and-layout.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| [Appendix 02: Interaction Model and State Machine](specs/agent-hq/02-interaction-and-states.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| [Appendix 03: Rover, Camera and Input](specs/agent-hq/03-rover-camera-input.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| [Appendix 04: HUD, Responsive Layout and Internationalization](specs/agent-hq/04-hud-responsive-i18n.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#97](https://github.com/ShinyQ/ShinyQ-HQ/pull/97) |
| [Appendix 05: Visual and Audio Design Tokens](specs/agent-hq/05-visual-audio-tokens.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#83](https://github.com/ShinyQ/ShinyQ-HQ/pull/83) |
| [Appendix 06: Data Contracts](specs/agent-hq/06-data-contracts.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#171](https://github.com/ShinyQ/ShinyQ-HQ/pull/171) |
| [Appendix 07: Content Map](specs/agent-hq/07-content-map.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#173](https://github.com/ShinyQ/ShinyQ-HQ/pull/173) |
| [Appendix 08: Quality, Performance and Acceptance](specs/agent-hq/08-quality-acceptance.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#157](https://github.com/ShinyQ/ShinyQ-HQ/pull/157) |
