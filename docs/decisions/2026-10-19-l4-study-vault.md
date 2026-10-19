# L4 Writing: Study Vault

- Date: 2026-10-19
- PR: [#247](https://github.com/ShinyQ/ShinyQ-HQ/pull/247)

Owner-approved placement and behavior of the 3D Study Vault (study guides PR 2): a small round plaza off the L4 end
plaza, reached by its own road from the ring road's south-east vertex, with its own stop and camera zone (`L4:vault`,
looking east). The four certification study guides stand there as tall holo books on an arc facing the stop, in their
issuers' tones with the exam code on the spine; each cover slides out and swings open as the rover comes near and
when a book is pointed at; clicking a book (tap, then Go, on touch screens) drives to the stop and opens that guide in
the same in-site reader as the Classic shelf, never a new tab. Instanced meshes on the shared holo program inside the
lazy L4 chunk; the spines and the STUDY VAULT sign join the end plaza label placement, so no label covers another;
reduced motion snaps the covers and lite drops the light pools.

Owner budget note (2026-10-19): the vault adds about 2 KB gzip to the 3D session after trimming, so the session caps
(`BYTES_3D_BUDGET.session`) are set to the measured totals on this branch, rebased on main, plus about 0.6 KB of
headroom: full 470 KB to 471 KB (measured 470.4 KB), lite 446.4 KB to 447.3 KB (measured 446.7 KB).
