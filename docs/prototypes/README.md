# Agent HQ v0 prototype (design reference)

`agent-hq-v0.html` is the single-file three.js prototype the owner liked ("effects and lots of things, the UI/UX was very good"). The tower keeps its floors, rover and missions; this file is the reference for their look and feel. `content.js` is its demo dataset, sanitized for this public repo (education history and money amounts removed). The prototype loads three.js from a CDN through an import map, so it is a design document only and is never served by the site.

Open it with any static server from this folder, for example `bunx serve docs/prototypes`.

## Port inventory (exact values)

| Effect | Prototype value | Ported to |
| --- | --- | --- |
| Tone mapping | ACES filmic, exposure 1.05 | `scene/settings.ts`, `Experience.tsx` |
| Fog | linear `#0a0a0f`, 38 to 80 | `scene/settings.ts` |
| Bloom (Unreal) | strength 0.5, radius 0.4, threshold 0.32 | `scene/Effects.tsx`: postprocessing mipmap `Bloom` at intensity 0.9, radius 0.45, threshold 0.6, so only `neonColor`-boosted neon blooms and body text stays crisp |
| Hemisphere light | `#8b8cff` / `#0a0a0f`, 0.7 | `scene/settings.ts` |
| Directional light | `#dfe3ff`, 1.4 at (10, 22, 12) | `scene/settings.ts` |
| Glass shader | fresnel `pow(1-abs(N.V), 2.2)`, top band, base band, moving scanline | `fx/materials.ts` `createGlassMaterial` |
| Grid floor shader | `fwidth` anti-aliased 1 u and 5 u lines, radial fade | `fx/materials.ts` `createGridFloorMaterial` |
| Lane shader | edge lines plus moving dashes, additive | `fx/materials.ts` `createLaneMaterial` |
| Neon | `color * k` on bloom tiers (k 1.4 rims, 2.2 packets, 2.5 to 3 rover accents), not tone mapped | `fx/materials.ts` `neonColor` |
| Motes | 260 points, `#818cf8`, size 0.06, additive, slow spin | `fx/Motes.tsx` |
| Robot glow | radial glow pad 2.6 u, additive ring 0.55 to 0.82 at 0.55, point light `#67e8f9` (8, 7, 2), neon eyes x3, thruster disc | `rover/Rover.tsx` |
| Click marker | ring 0.3 to 0.42, expands and fades | `rover/Rover.tsx` |
| Camera | smoothing `1-exp(-dt*4)`, offset scaled by aspect (x1, x1.35, x1.75) | `camera/offset.ts`, `camera/CameraDirector.tsx` |
| Boot screen | eyebrow, `[ok]` log lines every 300 ms, indigo glowing button | Sub-project A (`BootOverlay`) |
| HUD glass CSS | blur 18 px saturate 140%, radius 16, layered shadow, inset highlight | `src/app/globals.css` `.glass`, `.eyebrow`, `.chip`, `.card` |
