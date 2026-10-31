# 3D experience

- Date: 2026-10-26

Phone-first 3D (sub-project D, spec `docs/superpowers/specs/2026-10-25-phone-first-3d-design.md`): on a portrait phone the boot card docks at the bottom with one rolling log line, L1 opens on a phone landing view at every session start (primed only), and a 6-step phone tour docks its choice lines at the bottom while the joystick, Boost and Reset view step aside. Budgets (parent session under the owner's delegation, 2026-10-25): the tour script moves into its own chunk, loaded only by a session that plays the tour, outside both session totals like the intro chunk, with a new cap `BYTES_3D_BUDGET.tour` at measured + 614 B (measured 1,211 B, cap 1,825 B). Measured: first frame full 476,911 B and lite 460,777 B (main 477,249 B and 461,115 B), session totals full 543,606 B and lite 527,472 B (main 543,944 B and 527,810 B), 338 B less on each; no existing cap changed, and the freed bytes stay as shared headroom.
