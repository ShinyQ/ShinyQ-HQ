# 3D HUD

- Date: 2026-10-21
- PR: [#278](https://github.com/ShinyQ/ShinyQ-HQ/pull/278)

On desktops the elevator rail never overlaps the bottom-right corner stack (minimap, settings gear, view controls) or the top bar. The rail stays centred on the screen where there is room and rises only on short screens: it sits between two equal flex spacers whose minimum heights are measured from the top bar and the corner stack (8 px gap). Before, the rail (284 px since the B1 row) was centred on its own and collided with the minimap below about 744 px of viewport height (1280 x 720, 1024 x 640, a 1440 x 900 screen with browser chrome). After: unchanged at 1366 x 768 and taller, 20 px higher at 1280 x 720, 60 px higher at 1024 x 640; tablets and phones (Corners) are unchanged. `e2e/hud.spec.ts` checks the HUD boxes at eight desktop, tablet and landscape phone sizes in both locales.
