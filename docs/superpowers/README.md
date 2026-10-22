# Superpowers plans and specs

This folder holds the design specs and the implementation plans that built ShinyQ HQ, written with the superpowers workflow (brainstorm, spec, plan, execute task by task).

- **Specs** (`specs/`) describe what to build and why: the Agent HQ design with its appendices 01 to 08, and the design notes for later rounds. The appendices are living documents and win over the main spec for their topic.
- **Plans** (`plans/`) are step-by-step implementation plans, one per pull request or round. Each plan has a status line under its title, and its checkboxes are ticked once it shipped.

Plans are history: they record what was decided and built at the time, and later work may have changed or removed parts of them (the status line says where). For the current state of the code, read `AGENTS.md` and `docs/agents/`; for features and content, `docs/features.md` and `docs/content.md`.

## Plans

Each plan's own `Status:` line (under the title or the agentic-workers note, within its first 12 lines) is the only
record of its state, so parallel PRs never edit a shared table or count:

- `Status: in review ...` or `Status: in progress ...` while it is open (a multi-PR plan may start with
  `part N in progress`);
- `Status: shipped in #N (sha), YYYY-MM-DD ...` once merged, in the plan's own file (the merging PR or the next
  one updates it);
- `Later removed in #N: ...`, `Later replaced in #N: ...` or `reverted` on the same line when later work changed
  part of it.

Browse [`plans/`](plans/) (file names start with the date), or print the table with status, PRs and counts:
`bun scripts/docs-index.ts plans`. `tests/unit/docs-index.test.ts` fails on a plan without a readable status line.

## Specs

| Spec | Status | PR |
|---|---|---|
| [ShinyQ HQ: Agent HQ Portfolio Design](specs/2026-10-09-agent-hq-design.md) | implemented | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), then later rounds to [#173](https://github.com/ShinyQ/ShinyQ-HQ/pull/173) |
| [Page View revamp: editorial Neon Grid (design spec)](specs/2026-10-10-pageview-revamp-design.md) | implemented | [#16](https://github.com/ShinyQ/ShinyQ-HQ/pull/16), [#54](https://github.com/ShinyQ/ShinyQ-HQ/pull/54), [#83](https://github.com/ShinyQ/ShinyQ-HQ/pull/83), [#159](https://github.com/ShinyQ/ShinyQ-HQ/pull/159) |
| [Ask the HQ: design and implementation plan](specs/2026-10-11-ask-hq-design.md) | implemented | [#28](https://github.com/ShinyQ/ShinyQ-HQ/pull/28), [#38](https://github.com/ShinyQ/ShinyQ-HQ/pull/38), [#59](https://github.com/ShinyQ/ShinyQ-HQ/pull/59), [#94](https://github.com/ShinyQ/ShinyQ-HQ/pull/94), [#139](https://github.com/ShinyQ/ShinyQ-HQ/pull/139), [#143](https://github.com/ShinyQ/ShinyQ-HQ/pull/143), [#160](https://github.com/ShinyQ/ShinyQ-HQ/pull/160), [#162](https://github.com/ShinyQ/ShinyQ-HQ/pull/162) |
| [Certifications at scale: design](specs/2026-10-11-certifications-layout-design.md) | implemented | [#46](https://github.com/ShinyQ/ShinyQ-HQ/pull/46) |
| [Spectacle round: floor ends, Highlights Hall gallery, floating floor text (design)](specs/2026-10-13-spectacle-floor-ends-hall-design.md) | implemented | [#87](https://github.com/ShinyQ/ShinyQ-HQ/pull/87), [#88](https://github.com/ShinyQ/ShinyQ-HQ/pull/88) |
| [Agent Office on L1 (design)](specs/2026-10-18-agent-office-design.md) | implemented, then revamped | [#233](https://github.com/ShinyQ/ShinyQ-HQ/pull/233), [#236](https://github.com/ShinyQ/ShinyQ-HQ/pull/236), [#239](https://github.com/ShinyQ/ShinyQ-HQ/pull/239), [#242](https://github.com/ShinyQ/ShinyQ-HQ/pull/242), [#251](https://github.com/ShinyQ/ShinyQ-HQ/pull/251), [#261](https://github.com/ShinyQ/ShinyQ-HQ/pull/261), [#264](https://github.com/ShinyQ/ShinyQ-HQ/pull/264), [#270](https://github.com/ShinyQ/ShinyQ-HQ/pull/270), [#275](https://github.com/ShinyQ/ShinyQ-HQ/pull/275), [#281](https://github.com/ShinyQ/ShinyQ-HQ/pull/281) |
| [L4 Study Vault and in-app study guide reader (design)](specs/2026-10-19-l4-study-vault-design.md) | implemented | [#243](https://github.com/ShinyQ/ShinyQ-HQ/pull/243), [#245](https://github.com/ShinyQ/ShinyQ-HQ/pull/245), [#247](https://github.com/ShinyQ/ShinyQ-HQ/pull/247), [#249](https://github.com/ShinyQ/ShinyQ-HQ/pull/249) |
| [Ask the HQ: Rover voice, adjacent grounded questions and the knowledge pack in Workers KV (design)](specs/2026-10-19-ask-kv-pack-and-rover-voice-design.md) | implemented | [#238](https://github.com/ShinyQ/ShinyQ-HQ/pull/238), [#241](https://github.com/ShinyQ/ShinyQ-HQ/pull/241), [#254](https://github.com/ShinyQ/ShinyQ-HQ/pull/254), [#256](https://github.com/ShinyQ/ShinyQ-HQ/pull/256) |
| [Classic site design refinement](specs/2026-10-19-classic-design-refinement.md) | implemented | [#240](https://github.com/ShinyQ/ShinyQ-HQ/pull/240) |
| [Agent Office revamp: living crew, ship-it pipeline, day replay (design)](specs/2026-10-20-agent-office-revamp-design.md) | implemented | [#274](https://github.com/ShinyQ/ShinyQ-HQ/pull/274), [#276](https://github.com/ShinyQ/ShinyQ-HQ/pull/276), [#279](https://github.com/ShinyQ/ShinyQ-HQ/pull/279), [#284](https://github.com/ShinyQ/ShinyQ-HQ/pull/284), [#287](https://github.com/ShinyQ/ShinyQ-HQ/pull/287) |
| [Appendix 01: World and Layout](specs/agent-hq/01-world-and-layout.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#168](https://github.com/ShinyQ/ShinyQ-HQ/pull/168) |
| [Appendix 02: Interaction Model and State Machine](specs/agent-hq/02-interaction-and-states.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| [Appendix 03: Rover, Camera and Input](specs/agent-hq/03-rover-camera-input.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#104](https://github.com/ShinyQ/ShinyQ-HQ/pull/104) |
| [Appendix 04: HUD, Responsive Layout and Internationalization](specs/agent-hq/04-hud-responsive-i18n.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#97](https://github.com/ShinyQ/ShinyQ-HQ/pull/97) |
| [Appendix 05: Visual and Audio Design Tokens](specs/agent-hq/05-visual-audio-tokens.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#83](https://github.com/ShinyQ/ShinyQ-HQ/pull/83) |
| [Appendix 06: Data Contracts](specs/agent-hq/06-data-contracts.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#171](https://github.com/ShinyQ/ShinyQ-HQ/pull/171) |
| [Appendix 07: Content Map](specs/agent-hq/07-content-map.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#173](https://github.com/ShinyQ/ShinyQ-HQ/pull/173) |
| [Appendix 08: Quality, Performance and Acceptance](specs/agent-hq/08-quality-acceptance.md) | living appendix | [#1](https://github.com/ShinyQ/ShinyQ-HQ/pull/1) to [#12](https://github.com/ShinyQ/ShinyQ-HQ/pull/12), last updated in [#157](https://github.com/ShinyQ/ShinyQ-HQ/pull/157) |
