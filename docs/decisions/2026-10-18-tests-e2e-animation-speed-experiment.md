# Tests

- Date: 2026-10-18

Owner experiment D: "a test-only animation time scale ... applied to elevator rides, rover drive, camera tweens and the intro, used by functional e2e only. Perf gates and memory tests must always run at real speed." Functional specs opt in with `fastAnimations` (4x, `window.__hqE2ESpeed`, honoured only under `navigator.webdriver`); the perf lane, the memory gates and every render-peak window run at real speed; tests that assert pacing or sample a trajectory stay at real speed (`realAnimations`). No test is dropped. Merge only after 3 consecutive green full CI runs with no new flakes.
