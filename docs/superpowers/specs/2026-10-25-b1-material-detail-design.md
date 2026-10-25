# B1 Material Detail: Gunmetal Panels, Lit Seams and Vents

Status: in review

Owner goal (sub-project C of the 2026-10-25 brainstorm): make the B1 Engine Room look richer through material and
surface detail, so a visitor who unlocks it feels the reward.

Builds on the B1 Engine Room, the living machine ([spec](2026-10-22-b1-living-machine-design.md), #290, #291) and the
WOW pass ([spec](2026-10-23-b1-wow-illustration-design.md), #307); the current rules are in
`docs/agents/floor-b1-engine-room.md`. Nothing here changes the stations, the holograms, the reactor or the halo.

## 1. Problem

Captured from production on 2026-10-25 (arrival, aisle, every bay, reactor; 1440x900 full): every solid (bay shells,
racks, props, the reactor plinth, the workbench) is the one merged `MergedBoxes` mesh, near-black `#0c0a09` with an
amber emissive of 0.06, which reads as flat brown under bloom, outlined by amber wire edges. The floor is the shared
blue `GridFloor`. All the richness comes from screens and holograms; no surface carries any detail.

## 2. Owner decisions (2026-10-25)

| # | Question | Choice |
|---|---|---|
| 1 | Surface character | Dark machined steel with lit seams: gunmetal panels, recessed seams and vents that glow faintly amber or cyan; a real engine room that stays in the neon style |
| 2 | Scope | Bay shells and the floor deck first (what fills the screen on arrival and in every bay view), then the reactor plinth. Racks, the workbench and the ceiling keep their look apart from the material retune |
| 3 | Budget | Raise the B1 chunk cap once, to measured + 0.6 KB, for an expected growth of about 0.4 to 0.6 KB gzip (cap about 16.9 KB). No new shader program; the main 3D path and the session total unchanged |
| 4 | Approach | A, the panel kit on the existing holo program (over B, geometry only, and C, a procedural surface shader) |

Rejected approaches, for the record:

- B, geometry only (ribs, seam gaps, slats and plinth steps as boxes in the merged mesh): 0 draws and about 0.3 KB, but
  seams could only be amber wire lines, the wireframe gets busier and the flat brown stays between the ribs.
- C, a procedural surface shader (`onBeforeCompile` on the standard material with world-space seams and vent glow):
  covers every face for 0 draws, but compiles a new program (B1 lite would sit at 45, its last slack), costs about
  0.6 KB of GLSL and adds precompile and ride-cull risk.

## 3. Design

Everything lives in the B1 chunk. `src/experience/fx/holoFx.ts` (main path) and `src/experience/floors/roof/kit.tsx`
(also in the RF chunk, which counts in the 3D session total) are not edited.

### 3.1 Gunmetal solids

- `EngineRoom` passes new values through the existing `MergedBoxes` props only: `color` from `#0c0a09` to a cool
  gunmetal (a dark zinc grey in the `#1c1d22` range, tuned on the captures) and `emissiveIntensity` roughly halved
  (0.06 to about 0.03), so walls, racks and props stop reading brown. Roughness and metalness stay at the kit's values
  (changing them would edit `roof/kit`).
- `MergedEdges` (amber wire) stays as is. One draw, as today.

### 3.2 Panel cladding (`PlateMesh`)

- New `PlateMesh` in `src/experience/floors/engine/EngineFx.tsx`: one instanced draw (name `engine-plates`) on the holo
  `plate` mode, the program the B1 floating signs already compile, so no new program. A plate is a dark inset panel
  (the mode's fixed fill) with a thin lit rim in the instance color; the rims read as glowing seams.
- Built like `FlowMesh` and `PanelMesh`: the shared `useInstances` hook sets the matrices and colors at creation
  (precompile sees the final program), an `aAlpha` instanced attribute filled with 1, `depthWrite` on, `fade` [40, 110] like the other
  B1 holo draws, `useDispose` on the geometry and the material, no frame loop and no uniform time.
- Draw order: the panels are almost opaque (alpha 0.9) while screens and holograms are additive without depth writes,
  so `PlateMesh` sets `renderOrder` -1 and draws first among the transparents; nothing additive can be covered by a
  panel behind it.
- Placement (pure, `src/experience/floors/engine/scenery.ts`): `engineScenery` returns `plates: PlateInstance[]`
  (`x`, `y`, `z`, `w`, `h`, `yaw`, `flat?`, `color`, the same shape as `PanelInstance` without `roll`), computed from
  `buildEngineLayout()` and `ENGINE`, never hard-coded per bay:
  - bay walls: each bay's back wall inner face in 4 x 2 panels and each side wall's inner face in 2 x 2 (16 a bay,
    112 in all), 0.02 u off the face, the rows starting at the bay floor top (y 0.12); the back-wall screens already
    stand 0.05 u off it, so they stay in front;
  - floor deck: flat plates 0.02 u over the floor on the open strips between the aisle edge and the bay fronts (on
    both sides of each spur) and between the aisle edge and the rack rows, plus each bay's floor (0.01 u over the
    0.12 u bay floor (`PLATE.bayFloor`, under the projector discs at 0.16)); a deck plate never covers the aisle, a
    spur, a door pad, the elevator call pad, the Express Return pad, the reactor spur or the workbench (plates never
    take a raycast, so the point-and-go targets work as before);
  - reactor plinth: the faces of its two steps (8 u and 5.6 u, to y 0.4 and 0.8) clad upright, and a ring of flat
    plates on the hall floor round the plinth, kept outside the glow pool and off the reactor spur;
  - seam tones: dim amber (`ENGINE_TONES.tray`) on walls and deck, dim cyan (`ENGINE_TONES.data`) on the plinth;
    faint on purpose, so the signs, screens and holograms still lead.
- The same plates on both tiers (two triangles each); `neonColor` handles the tier as for the other instances.

### 3.3 Vents

- One vent grille per side wall of each bay (two a bay), mid-height on the inner face, clear of the bay's props and
  hologram: slim slats as dim cyan (`ENGINE_TONES.data`) holo `strip` instances appended to `flows`, so they ride in the
  existing `FlowMesh` (0 draws). The strip mode's slow pulse reads as air moving through the grille.
- Lite draws half the slats, like the rack LEDs (`engineDetail` gains a `slats` count).
- Reduced motion freezes `uTime` as for every flow, so the vents hold still.

### 3.4 What does not change

- No new light, texture, program, frame loop or `AudioContext`; no words painted on any surface.
- The stations, the holograms, the Stack Halo, the reactor's draws, the signs, the drawers and the access rules.
- The main 3D path, the first-frame bytes and the session total.

## 4. Budgets

| Measure | Today | Expected (measured 2026-10-25) | Cap |
|---|---|---|---|
| B1 scene calls, settled (full / lite) | 56 / 53 | 55 / 53 | 100, unchanged |
| B1 triangles, settled (full / lite) | 12,809 / 11,702 | 14,355 / 12,744 | under 30k |
| Shader programs on B1 (lite / full) | 44 / 81 | 44 / 66, no new program | baseline + 2, `e2e/perf/baseline.json` unchanged |
| B1 chunk (gzip) | 16,337 B | 16,946 B (269 plates; 84 vent slats full, 42 lite) | reset once to measured + 0.6 KB: 17,560 B (owner, 2026-10-25) |
| 3D first frame and session total | unchanged | unchanged | unchanged |

- A measure over these numbers blocks the PR; the cap is never raised beyond the approved reset without a new owner
  note.
- If the B1 floating signs ever stopped compiling the plate program, `PlateMesh` would compile it alone and the
  program gate would fail: the fix is to share the program, not to raise the baseline.

## 5. Verification

- Unit, `tests/unit/engine-scenery.test.ts` (extended):
  - every plate lies on a bay wall, a bay floor, a deck strip or the plinth;
  - no deck plate overlaps the aisle, a spur, a door pad, the call pad, the Express Return pad, the reactor spur or the
    workbench (plates never take a raycast, so the point-and-go targets work as before);
  - wall panels stand behind every screen of their bay, and no plate or slat crosses a station sign seen from its
    door pad;
  - plate and slat counts per tier.
- E2E: `bun run e2e:changed` (`e2e/engine-room.spec.ts`, `e2e/memory.spec.ts`), with a check that `engine-plates`
  mounts on B1 with the expected instance count.
- Perf lane: `E2E_PORT=<port> bun run e2e:perf` for the B1 bytes, scene calls, triangles, programs and the memory gate
  (Lobby to B1 round trips: zero growth in geometries, textures and programs).
- Look: `bun scripts/visual-gate.ts --base HEAD --profile strict` must show zero diff on every existing pose (the gate
  has no B1 pose, so this proves nothing leaks outside B1). B1 itself goes to the owner as before and after captures
  from `bun scripts/b1-reactor-shots.ts` (arrival, aisle, each bay, the reactor; 1440x900, 820x1180 and 390x844; full
  and lite).
- `bun run verify:quick` before pushing.

## 6. Docs in the implementation PR

- `docs/agents/floor-b1-engine-room.md`: Scenery (the gunmetal retune, `PlateMesh`, the vents), Draw calls and the
  chunk numbers.
- `docs/agents/performance.md` and `AGENTS.md` budget rows only if they list the B1 cap.
- `docs/features.md`: the B1 bullet.
- A decision file `docs/decisions/2026-10-25-b1-material-cap.md` for the cap reset.

## 7. Delivery

One pull request, released by the parent session when the shared 3D byte headroom and the CI cap allow it.
