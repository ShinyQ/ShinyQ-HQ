# CI

- Date: 2026-10-17
- PR: [#176](https://github.com/ShinyQ/ShinyQ-HQ/pull/176)

Smart CI. Owner request: "can we actually remove testing from ci it takes very long since we've been do test on local too right"; after discussion the owner chose smart CI over removing tests. Every PR runs typecheck, lint, unit tests, the secret scan and the build (with `og:check`); e2e, the 3D perf gates and Lighthouse run only when the changed paths need them (`scripts/ci-plan.ts`). Pushes to `main`, dispatches and a nightly schedule (03:15 WIB, keeping a `ci-nightly` issue) run everything; the deploy reuses only complete CI runs (`ci-full` artifact).
