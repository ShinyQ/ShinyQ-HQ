# Lucide icons (vendored subset)

Line icons for the floating holograms on L2 and L4 (`docs/agents/floors.md`, icon system). Only the icons the content
names (`icon` ids in `content/site-content.json`) are vendored here, byte for byte from the `lucide-static` npm package
(version 1.61.0, `icons/<id>.svg`). They are never shipped as SVG or bundled into JS: `scripts/build-shapes.ts`
converts them at build into the 24 x 24 stroke format of `src/experience/fx/holoIcons.ts` and writes the per-floor
JSON under `public/shapes/`.

Attribution: [Lucide](https://lucide.dev), Copyright (c) 2026 Lucide Icons and Contributors, ISC License; icons derived
from Feather, Copyright (c) 2013-present Cole Bemis, MIT License. The full licence text is in [`LICENSE`](LICENSE).

To add an icon: copy `icons/<id>.svg` from the same `lucide-static` version (`npm pack lucide-static`), name it in the
content, and run `bun run validate:content`.
