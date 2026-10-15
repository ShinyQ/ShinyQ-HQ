# Brand assets

The ShinyQ HQ brand mark is the **Screen Rover** (owner pick, 2026-10-15): the mascot rover's head seen from
the front, with its `^_^` screen face, the antenna right of center with the pink tip, and a tread with three
wheels on each side. It replaced the KAW hexagon monogram.

| File | Use |
|---|---|
| `rover-mark.svg` | App tile (dark rounded square). Same artwork as the favicon `src/app/icon.svg`. |
| `rover-mark-glyph.svg` | The mark alone on a transparent background; reads on light and dark backgrounds. |
| `rover-mark-mono.svg` | One color (`currentColor`, black where nothing sets it): print, stamps, masks. |
| `rover-lockup.svg` | Mark plus the "ShinyQ HQ" wordmark (Archivo 800, outlined), for dark backgrounds. |
| `rover-lockup-light.svg` | The same lockup for light backgrounds. |
| `kurniadi-photo-*.webp` | The owner's portrait (see `src/lib/brand-photo.ts`). |

Palette: cyan `#22D3EE`, indigo `#6366F1`, lilac `#A78BFA`, pink `#F472B6`, tile `#070A16`.

Do not edit the SVG files by hand. The geometry lives in `src/lib/brand-mark.ts`; regenerate every file
(including `src/app/icon.svg`, `src/app/apple-icon.png` and `src/app/favicon.ico`) with:

```sh
bun scripts/brand-marks.ts   # the lockups need python3 with fonttools and brotli
```

`tests/unit/brand-mark.test.tsx` fails when a committed mark differs from the module. In 3D the L1 profile
hologram shows the same mark (`src/experience/floors/lobby/roverMark3d.ts`).
