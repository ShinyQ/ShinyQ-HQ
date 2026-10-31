# 3D experience

- Date: 2026-10-18

Owner report: the whole canvas flickered pure black for single frames on L1, worst with a low camera ("when we view from bottom side"). Root cause, reproduced on the owner's M4 in Brave and Chrome with an in-page probe: the glass shader's fresnel `pow(1.-abs(dot(n, v)), 2.2)` returns NaN when rounding puts `abs(dot)` above 1 (a glass face seen almost head-on); one NaN pixel in the full tier's HDR buffer spreads through the mipmap bloom and blacks out the frame. Fix: every GLSL `pow()` takes a non-negative base (glass, the hologram stage scan, the road chevrons), enforced by a unit test; no look change (only values that were NaN change). `?gfx=probe` logs black frames and names the object behind a NaN on a visitor's device. The Round 9 M camera clamp fixed a different symptom (a void band at the bottom of a low view) and stays. Bloom threshold and intensity unchanged.
