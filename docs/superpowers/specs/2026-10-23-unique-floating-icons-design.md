# Unique Floating Icons on L2, L3 and L4 (design)

Status: in review (plan `2026-10-23-unique-floating-icons.md`).

Owner decision 2026-10-23 ([decision](../../decisions/2026-10-23-unique-floating-icons.md)).

## 1. Problem

The floating holograms on the walkable floors repeat. L2 draws one of five career type icons over each of its 36
rooms (eight identical briefcases, eight identical laptops), L4 one of four zone icons over each station, and L3 one of
seven kind holograms over each of its 39 pods (eleven identical templates, nine identical pipelines). A visitor cannot
tell two rooms apart by their hologram, and the hologram says nothing about what the room is.

## 2. Owner decisions (approved 2026-10-23)

- L2: each job, education and freelance entry gets its own unique line icon; milestones (14) and awards (4) cycle a
  few variants (4 milestone variants, 3 award variants).
- L4: each post (8), publication (7) and talk (6) gets a unique icon; the zones keep their color.
- L3: the box holograms stay (one instanced mesh), but each of the 39 pods gets its own semantic box sculpture hinting at
  the project. Similar projects may share a base shape with a distinct variant; no two pods are identical.
- Line icons come from a vendored, curated subset of Lucide (ISC licence, LICENSE text and attribution included),
  converted at build into the existing 24 x 24 stroke format (`Stroke` in `fx/holoIcons.ts`). No Lucide runtime
  dependency.
- Each content item names its icon or sculpture by id in the content data: optional `icon` on career entries, posts,
  publications and talks, `sculpture` on pods (the `hologram` kind stays as the fallback). Ids fit the item and never
  name a client (C3).
- Shapes ship as a static JSON asset per floor, never in JS: a build step (`scripts/build-shapes.ts`, before
  `next build`) writes `public/shapes/<floor>.<contenthash>.json` for L2, L3 and L4; the hashed URL reaches the client
  in the experience data. `_headers`: long immutable cache for `/shapes/*`.
- Loading: each floor fetches its shapes after its first frame, then crossfades the unique shapes in. Until then, or on
  a failed fetch, today's type icons and kind holograms show (never blank). Reduced motion swaps without a crossfade.
- Rendering: `HoloIcon` gains a batched mode (many icons in one geometry with a per-vertex color), same shader source
  for every user, so no new shader program; one draw call plus the halo per floor instead of one per type. L3 keeps one
  instanced box mesh with per-pod parts from the JSON, at most 16 boxes per sculpture.
- 3D only: the Classic site keeps its career type SVG icons (`TypeIcon`).
- Budgets: JS byte caps do not grow (main path, session total, floor chunks); draw calls equal or lower; programs at
  `e2e/perf/baseline.json`; triangles under 30k per frame.

## 3. Architecture

```
assets/icons/lucide/*.svg + LICENSE      vendored Lucide subset (only the ids the content names)
content/sculptures.json                  L3 box sculpture recipes (boxes, rings, bars), build-time only
content/site-content.json                icon / sculpture ids per item
        |
        v   src/lib/svg-strokes.ts (pure converter), src/content/sculptures.ts (pure recipe expander),
        |   src/content/shapes.ts (server only: per floor payloads, content hash, id checks)
        v
scripts/build-shapes.ts  ->  public/shapes/L2.<hash>.json, L3.<hash>.json, L4.<hash>.json (gitignored, rebuilt)
buildExperienceData      ->  career.shapes, labs.shapes, library.shapes = "/shapes/<floor>.<hash>.json"
        |
        v   client (3D only)
fx/shapes.ts: loadShapes(url) cached fetch; useShapes(floor, url, group): whenDrawn(group) starts the fetch,
             returns the items and the crossfade weights; __hq.probes.shapes[floor]
fx/HoloIcon.tsx: batched instances (per-instance strokes and color), aColor attribute always present
floors/career/CareerRooms.tsx, floors/library/decor/common.tsx (ZoneIcons), floors/labs/Pods.tsx
```

### 3.1 Converter (`src/lib/svg-strokes.ts`)

- Parses `<path d>` (M, L, H, V, C, S, Q, T, A, Z, absolute and relative, packed arc flags), `<line>`, `<polyline>`,
  `<polygon>`, `<circle>`, `<ellipse>` and `<rect>` (with `rx`/`ry` corners).
- Flattens curves into polylines: cubic and quadratic Beziers by control polygon length, arcs (endpoint to center
  parameterization) by sweep and radius, so a full 10 u circle is 16 segments and a 2 u corner 2.
- Simplifies each polyline (Ramer-Douglas-Peucker, 0.12 grid units) and drops repeated points; a subpath shorter than
  0.5 u (Lucide's `h.01` dots) becomes a small closed diamond so it reads as a dot in the ribbon renderer.
- Output: `Stroke[]` on the 24 x 24 grid (Lucide's viewBox is already 24 x 24), coordinates rounded to 0.01.

### 3.2 Sculptures (`content/sculptures.json`, `src/content/sculptures.ts`)

- A recipe is a list of parts. A part is a box `[x, y, z, w, h, d, rollDeg?, pulse?]` or a macro: `ring` (n cubes on an
  arc in the xy or xz plane) and `bars` (bottom-aligned bars, optionally pulsing).
- `HologramPart` gains `r` (roll about the sculpture's z axis, radians), so handles, needles, fins and arrows can lean.
  The pod spin stays the only yaw (`rotation.set(0, angle, r)`, Euler order XYZ applies the roll first).
- Expanded sculptures: at most 16 boxes, inside x and z of plus or minus 1.25 and y from -0.8 to 0.9 (the old kinds
  span about the same), no two identical (sorted part signature).

### 3.3 Payloads (`src/content/shapes.ts`)

- `{ v: 1, floor, items }`: L2 and L4 `items` map an item key to `Stroke[]`, L3 maps a pod slug to `HologramPart[]`.
- Keys: L2 the career entry slug (`CareerEntryView.slug`); L4 the post slug, the publication id and the talk id; L3 the
  pod slug. Items without an id are left out (the client keeps the fallback for them).
- File name `<floor>.<first 10 hex of sha256(json)>.json`. The same pure function feeds the script and
  `buildExperienceData`, so the hash the client gets always names the file the build wrote.
- `shapeIssues(content)` (used by `validate:content`, the build step and the content tests): every named icon has a
  vendored SVG, every sculpture a recipe; icons unique across jobs, education and freelance; sculptures unique across
  pods; icons unique across posts, publications and talks; at most 4 milestone and 3 award variants.

### 3.4 Client

- `useShapes` registers `whenDrawn(group, start)` once: the fetch starts right before the first render that shows the
  floor's content (a floor warmed during boot or hidden as a neighbour never fetches). The parsed JSON is cached per URL
  for the session, so a later visit mounts with the unique shapes at once (no crossfade). A failed fetch leaves the
  fallback and is retried on the next mount.
- Crossfade 0.6 s: the fallback batch fades out while the unique batch fades in (`fade` weights on `uOpacity`); once
  done the fallback unmounts. Reduced motion: weight 1 at once. L3 crossfades by scale (fallback parts shrink, unique
  parts grow) inside the one instanced mesh, then remounts it with the unique parts only.
- Probe `__hq.probes.shapes[floor]`: `{ state: "loading" | "shown" | "failed", unique }` (unique = items drawn with
  their own shape).

### 3.5 HoloIcon batched mode

- Vertex shader gains `attribute vec3 aColor; varying vec3 vC;`, fragment `gl_FragColor = vec4(uColor * vC, uOpacity)`.
  Every `HoloIcon` (pads, Roof, Workshop, L2, L4) uses this one source, so the program count stays the same.
- `HoloIconInstance` gains optional `strokes` and `color`; the component's `strokes` and `color` become defaults.
  `uColor` carries the tier boost (`neonColor("#ffffff", 1.6)` on full, white on lite), `aColor` the item's hue, so
  the product equals today's `neonColor(color, k)`.
- L2: one batch (the 36 rooms) plus a halo on full: 2 draw calls instead of 10. L4: one batch (posts and desk items)
  plus a halo: 2 instead of 8.

### 3.6 L4 desk items

The Research, Models and Talks desks each show one icon per item instead of the zone icon: one row of up to 4 (Research
4, Models 3), two rows of 3 for Talks, left to right as seen from the road, smaller (size from the spacing, at most
2.4). The featured post keeps its turning book (its icon id is in the data for when it is no longer featured).

## 4. Data flow and fallback

| Moment | L2 / L4 | L3 |
|---|---|---|
| Floor first drawn | type / zone icons (batched), fetch starts | kind holograms, fetch starts |
| JSON arrives | 0.6 s crossfade to unique icons | 0.6 s scale morph to sculptures |
| Fetch fails or `/shapes/*` blocked | type / zone icons stay | kind holograms stay |
| Revisit in the session | unique at mount | sculptures at mount |
| Reduced motion | swap at once | swap at once |

## 5. Budgets

- JS: the converter, the recipes and the payload builder are build-time only (`check-client-chunks` forbids
  `svg-strokes` and `shapes` content modules in client chunks). Client additions are the fetch hook and the batched
  builder; HoloIcon's per-type loops go away. Main path, session total and floor chunk caps unchanged.
- JSON: reported by `bytes-3d` (`other.json`), not capped; about 25 KB raw for L2, 10 KB for L3 and 20 KB for L4.
- Draw calls: L2 full 10 to 2 for the room icons, L4 8 to 2; L3 unchanged (one instanced mesh). During the 0.6 s
  crossfade both batches draw (still fewer than before).
- Programs: unchanged (one HoloIcon program, one instanced basic material).
- Triangles: icons are flattened coarsely (about 30 to 80 segments each) and L3 caps sculptures at 16 boxes; every floor
  stays under 30k (L2 is the tightest).

## 6. Testing

- Unit: the converter (each command and element, packed flags, dots, bounds, segment counts), the recipe expander
  (bounds, box cap, uniqueness), the payload builder and `shapeIssues` (ids exist, uniqueness, the real content names an
  id on every item), the batched geometry builder (vertex colors, per-instance strokes), `useShapes` crossfade math.
- E2E `e2e/shapes.spec.ts`: on L2, L3 and L4 the probe reaches `shown` with every item unique; with `/shapes/*` aborted
  the probe reads `failed` and the fallback stays drawn. Waits on state only.
- Perf: `floors` (L2, L3, L4 both tiers) and `bytes-3d`, before and after.
- The strict visual gate changes on L2, L3 and L4 by design (decision file).
