# Tests

- Date: 2026-10-18
- PR: [#219](https://github.com/ShinyQ/ShinyQ-HQ/pull/219)

Owner request: "Turn the L4 timeline label overlap sweep into a unit test that computes label layout or overlap without rendering (same assertions: no overlap, title cap, each zone's labels), so it runs on every PR in about 1 s." `tests/unit/library-label-sweep.test.ts` replays the rendered sweep's poses with the scene's own placement (`decor/signFrame.ts`, now shared with the hooks) and the follow camera settled as `CameraDirector` does. The rendered `e2e/library-labels.spec.ts` (354 s desktop, 72 s phone per CI run) stays for now; a follow-up PR moves it to the nightly run only.
