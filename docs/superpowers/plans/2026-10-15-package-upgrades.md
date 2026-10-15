# Package Upgrades (Round 7, sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade every package to its latest version in tiers (A1 minor and patch, then one PR per major) and leave no open Dependabot PR without a decision.

**Architecture:** One PR per tier step, each from `main` after the previous one merged. A1 takes every minor and patch upgrade at once. Each major is tried on its own branch; it ships when every gate is green, otherwise it is pinned (Dependabot PR closed with the reason, `ignore` entry with a revisit date in `.github/dependabot.yml`, row in `docs/deploy.md` section 17) and a unit test keeps the YAML and the doc in sync.

**Tech Stack:** Bun 1.4.1 (package manager, `bun.lock`), Next.js 16, TypeScript, ESLint flat config (`eslint-config-next`), Vitest, Playwright, three.js with @react-three/*, wrangler, GitHub Actions, Dependabot.

Spec: Round 7 design (2026-10-15), sections 1, 2, 3 and 11 (coordinator session files, `plans/2026-10-15-round-7-design.md`).

## Global Constraints

- Owner request (verbatim): "lets upgrade all of our package version and close the bump dependabot pr". Owner decision: tiered.
- A1: every minor and patch upgrade in one PR (`bun update` within ranges, then widen ranges where only minors moved), regenerate `bun.lock`, all gates green.
- A2..An: one PR per major, in this order: `@types/node` 26 (closes #80), ESLint 10 (closes #31), TypeScript 7 (closes #30), then any major for three, @types/three, drei, fiber, postprocessing, @react-three/postprocessing, Next, next-intl, vitest, jsdom.
- 3D library majors pass only with the strict visual gate, the perf lane and the memory gates green.
- A major that cannot pass its gates is pinned: close its Dependabot PR with the reason, and add an `ignore` entry with a revisit date in `.github/dependabot.yml`.
- Success: no open Dependabot PR without a decision; `bun outdated` lists only deliberately pinned majors, each documented.
- No em dashes anywhere (code, docs, commits, PR text). A unit test scans the repo.
- Budgets stay green: 3D JS gate 450 KB gzip, Classic JS gate 240 KB, L1 at most 125 draw calls, every floor under 150 draw calls and the triangle cap, no new shader program, Lighthouse asserted routes, memory gates.
- Every PR updates docs where conventions change, plus unit tests.
- `wrangler` stays an exact devDependency and `deploy.yml` `wranglerVersion` equals it (`tests/unit/workflows.test.ts`). `next`, `eslint-config-next`, `react`, `react-dom`, `sharp` stay exact pins (bumped to the exact new patch, never turned into ranges).
- CI capacity is shared: before every push or rerun run `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `gh run list -R ShinyQ/ShinyQ-HQ -s queued`; if another PR's run is active, wait (poll every 5 minutes). One CI run of ours at a time. No measurement CI.
- Do not merge. After each PR is green, report to the coordinator (PR link, versions before and after, gate results, anything pinned with the reason) and wait for "merge" (squash, then `deploy.yml`, then confirm the `main` CI run).

## Baseline (2026-10-15, `bun outdated` on `main` e822be38)

| Package | Current | In range | Latest | Tier |
|---|---|---|---|---|
| @react-three/fiber | 9.8.1 | 9.8.2 | 9.8.2 | A1 |
| @react-three/postprocessing | 3.1.3 | 3.2.0 | 3.2.0 | A1 (3D minor) |
| next (exact) | 16.4.0 | 16.4.0 | 16.4.1 | A1 |
| eslint-config-next (exact) | 16.4.0 | 16.4.0 | 16.4.1 | A1 |
| react, react-dom (exact) | 19.3.0 | 19.3.0 | 19.3.1 | A1 |
| zod | 4.6.5 | 4.6.7 | 4.6.7 | A1 |
| @playwright/test | 1.64.0 | 1.64.1 | 1.64.1 | A1 |
| @testing-library/user-event | 14.6.7 | 14.6.8 | 14.6.8 | A1 |
| @types/bun | 1.4.2 | 1.4.3 | 1.4.3 | A1 |
| jsdom | 30.1.2 | 30.1.3 | 30.1.3 | A1 |
| vitest | 5.0.3 | 5.0.4 | 5.0.4 | A1 |
| wrangler (exact) | 4.150.0 | 4.150.0 | 4.151.0 | A1 |
| @types/node | 20.19.43 | 20.19.43 | 26.6.5 | A2 (#80) |
| eslint | 9.39.5 | 9.39.5 | 10.12.0 | A3 (#31) |
| typescript | 5.9.3 | 5.9.3 | 7.0.2 | A4 (#30) |

three, @types/three, drei, postprocessing, next-intl and every other package are on their latest version; no 3D, Next, next-intl, vitest or jsdom major exists today. Task 5 re-checks this before closing the sub-project.

Known risks from peer ranges (checked with `npm view`, 2026-10-15):
- ESLint 10: `eslint-config-next` 16.4.1 depends on `eslint-plugin-react` 7.37.5, `eslint-plugin-import` 2.32.0 and `eslint-plugin-jsx-a11y` 6.10.2, whose peer ranges stop at ESLint `^9`. ESLint 10 removed the deprecated `context` methods these plugins may still call.
- TypeScript 7: `typescript-eslint` 8.71.2 (via `eslint-config-next`) declares `typescript >=4.8.4 <6.1.0`, and TypeScript 7 is the native port whose JS API differs; `next build` and `next typegen` load `typescript` programmatically.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `package.json` | dependency ranges and exact pins | 1, 2, 3, 4 |
| `bun.lock` | resolved versions (always regenerated by Bun, never hand edited) | 1, 2, 3, 4 |
| `.github/workflows/deploy.yml` | `wranglerVersion` for the hq-stats Worker deploy | 1 |
| `.github/dependabot.yml` | `ignore` entries for pinned majors, each with a `# revisit YYYY-MM-DD: reason` comment | 3, 4 (only when pinned) |
| `docs/deploy.md` | new section 17 "Dependency upgrades and pinned majors" (policy and the pin table) | 1, then each pin |
| `tests/unit/dependabot.test.ts` | keeps `dependabot.yml` ignores and the doc table in sync, every ignore has a revisit date | 1, then each pin |
| `docs/features.md` | "Dependencies" subsection under "CI and deploys" (policy summary) | 1 |
| `README.md` | Tooling row only if a tool name or version shown there changes | as needed |
| code fixes | only what a major requires (type errors, lint rule changes) | 2, 3, 4 |

---

### Task 1: A1, every minor and patch upgrade

**Branch:** `feat/r7a-package-upgrades` (this session's branch, from `main` e822be38).

**Files:**
- Modify: `package.json`, `bun.lock`, `.github/workflows/deploy.yml:334`
- Create: `tests/unit/dependabot.test.ts`
- Modify: `docs/deploy.md` (append section 17), `docs/features.md` ("Dependencies" subsection)
- Commit: this plan file

**Interfaces:**
- Produces: `docs/deploy.md` section 17 with a table headed `| Package | Pinned to | Latest | Reason | Revisit |` (empty body row `| none | | | | |` while nothing is pinned), and `tests/unit/dependabot.test.ts`, which later pin tasks extend only through data (YAML plus doc row), never through code.

- [ ] **Step 1: Write the failing guard test**

`tests/unit/dependabot.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// Every `ignore` entry in dependabot.yml: its dependency name and the comment right above it.
function ignores(yaml: string) {
  const lines = yaml.split("\n");
  const out: { name: string; comment: string }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*-\s*dependency-name:\s*"?([^"\s]+)"?\s*$/);
    if (m) out.push({ name: m[1], comment: (lines[i - 1] ?? "").trim() });
  });
  return out;
}

// Rows of the pin table in docs/deploy.md section 17.
function pinnedRows(doc: string) {
  const start = doc.indexOf("## 17. Dependency upgrades and pinned majors");
  expect(start).toBeGreaterThan(-1);
  const section = doc.slice(start).split("\n## ")[0];
  return section
    .split("\n")
    .filter((l) => l.startsWith("| `"))
    .map((l) => l.split("|")[1].trim().replace(/`/g, ""));
}

describe("dependabot pins", () => {
  const yaml = read(".github/dependabot.yml");
  const entries = ignores(yaml);

  it("gives every ignored dependency a revisit date and a reason", () => {
    for (const { name, comment } of entries) {
      expect(comment, name).toMatch(/^# revisit \d{4}-\d{2}-\d{2}: \S.+$/);
    }
  });

  it("ignores only major updates", () => {
    const blocks = yaml.split(/\n\s*-\s*dependency-name:/).slice(1);
    for (const block of blocks) {
      expect(block.split("\n").slice(0, 3).join("\n")).toContain('update-types: ["version-update:semver-major"]');
    }
  });

  it("documents every pin in docs/deploy.md section 17 and nothing else", () => {
    const rows = pinnedRows(read("docs/deploy.md"));
    expect([...rows].sort()).toEqual(entries.map((e) => e.name).sort());
  });

  it("keeps a pinned package below the ignored major in package.json", () => {
    const pkg = JSON.parse(read("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    for (const { name } of entries) expect(all[name], name).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/dependabot.test.ts`
Expected: FAIL in "documents every pin" (`expect(start).toBeGreaterThan(-1)`: section 17 does not exist yet). The other three pass vacuously (no ignore entries).

- [ ] **Step 3: Add `docs/deploy.md` section 17**

Append after section 15 (end of file):

```markdown
## 17. Dependency upgrades and pinned majors

Policy (Round 7, owner decision 2026-10-15: tiered). Minor and patch updates land together (Dependabot group `minor-and-patch`, or one PR with `bun update` plus widened ranges). Each major gets its own PR and ships only with every gate green; 3D library majors (three, @types/three, @react-three/drei, @react-three/fiber, postprocessing, @react-three/postprocessing) also need the strict visual gate (`bun scripts/visual-gate.ts --base main --profile strict`), the perf lane (`bun run e2e:perf`) and the memory gates. `next`, `eslint-config-next`, `react`, `react-dom`, `sharp` and `wrangler` stay exact pins; bump `wranglerVersion` in `deploy.yml` with `wrangler`.

A major that cannot pass is pinned: its Dependabot PR is closed with the reason, `.github/dependabot.yml` gets an `ignore` entry for `version-update:semver-major` with a `# revisit YYYY-MM-DD: reason` comment on the line above, and the table below gets a row (`tests/unit/dependabot.test.ts` keeps both in sync). On the revisit date, try the major again; extend the date with a new reason or remove the pin.

| Package | Pinned to | Latest | Reason | Revisit |
|---|---|---|---|---|
| none | | | | |
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/unit/dependabot.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Upgrade within ranges**

```bash
bun update
```

Expected `bun.lock` moves: @react-three/fiber 9.8.2, @react-three/postprocessing 3.2.0, zod 4.6.7, @playwright/test 1.64.1, @testing-library/user-event 14.6.8, @types/bun 1.4.3, jsdom 30.1.3, vitest 5.0.4, plus transitive updates. `bun update` without `--latest` keeps majors.

- [ ] **Step 6: Bump exact pins and widen floors**

Edit `package.json` (exact pins to the new patch, caret floors to the resolved version so the range states what is tested):

```json
"@react-three/fiber": "^9.8.2",
"@react-three/postprocessing": "^3.2.0",
"next": "16.4.1",
"react": "19.3.1",
"react-dom": "19.3.1",
"zod": "^4.6.7",
"@playwright/test": "^1.64.1",
"@testing-library/user-event": "^14.6.8",
"@types/bun": "^1.4.3",
"eslint-config-next": "16.4.1",
"jsdom": "^30.1.3",
"vitest": "^5.0.4",
"wrangler": "4.151.0"
```

Edit `.github/workflows/deploy.yml` line 334: `wranglerVersion: "4.151.0"`.

```bash
bun install
bun outdated
```

Expected `bun outdated`: only `@types/node` (26.6.5), `eslint` (10.12.0) and `typescript` (7.0.2) remain, each with Update equal to Current. If a newer patch appeared since the baseline, take it the same way.

- [ ] **Step 7: Playwright browser**

`@playwright/test` moved a patch, so the cached Chromium may differ:

```bash
bunx playwright install chromium
```

- [ ] **Step 8: Quick gates**

```bash
rm -rf .next && bun run verify:quick
```

Expected: typecheck, lint, all unit tests (including `tests/unit/workflows.test.ts` with the new `wranglerVersion`), build, `og:check` pass.

- [ ] **Step 9: Full e2e (package.json changed, so `e2e:changed` runs the full suite)**

```bash
E2E_PORT=4517 bun run e2e:changed
```

Expected: all specs pass (about 6 to 10 minutes; one suite at a time on this machine).

- [ ] **Step 10: 3D gates (fiber patch and @react-three/postprocessing minor touch the render path)**

```bash
E2E_PORT=4517 bun run e2e:perf
E2E_PORT=4518 bun scripts/visual-gate.ts --base main --profile strict
```

Expected: perf lane green (3D bytes under 450 KB gzip per tier, floors within `e2e/perf/baseline.json` + 2 programs, peaks, `memory-full`); visual gate within strict thresholds (per-pixel 0.1, at most 0.1% of pixels). If the program count changes because postprocessing compiles a different effect pass, stop and report instead of regenerating the baseline.

- [ ] **Step 11: Docs**

Add a "Dependencies" subsection to "CI and deploys" in `docs/features.md`: weekly grouped minor and patch PR, one PR per major, 3D majors need the strict visual gate, perf lane and memory gates, pins with a dated reason in `.github/dependabot.yml` and `docs/deploy.md` section 17.

- [ ] **Step 12: Commit**

```bash
rtk git add docs/superpowers/plans/2026-10-15-package-upgrades.md tests/unit/dependabot.test.ts docs/deploy.md docs/features.md package.json bun.lock .github/workflows/deploy.yml
rtk git commit -m "chore(deps): A1 minor and patch upgrades, dependency pin policy"
```

- [ ] **Step 13: Push and open the PR (CI capacity check first)**

```bash
gh run list -R ShinyQ/ShinyQ-HQ -s in_progress; gh run list -R ShinyQ/ShinyQ-HQ -s queued
# wait while another PR's run is active (poll every 5 minutes)
rtk git push -u origin HEAD
gh pr create -R ShinyQ/ShinyQ-HQ --title "chore(deps): Round 7 A1, minor and patch upgrades" --body-file <body>
```

PR body: before and after table, local gate results (verify:quick, full e2e, perf lane, strict visual gate), the plan link, and "Supersedes nothing; majors follow in A2 to A4".

- [ ] **Step 14: Watch CI, report, wait**

`gh pr checks <n> --watch`. Fix failures (one rerun at a time, capacity check first). When green, message the coordinator and wait for "merge". On "merge": `gh pr merge <n> --squash`, then `gh workflow run deploy.yml -R ShinyQ/ShinyQ-HQ --ref main`, watch it, and confirm the `main` CI run is green.

---

### Task 2: A2, `@types/node` 26 (closes #80)

**Branch:** new branch from the updated `main` after Task 1 merged: `rtk git fetch origin && rtk git checkout -B feat/r7a2-types-node-26 origin/main`.

**Files:**
- Modify: `package.json` (`"@types/node": "^26"`), `bun.lock`
- Modify: any file with a new type error (Node 26 typings: `Buffer` generic, `fetch`/`Response` globals, timer return types)

- [ ] **Step 1: Upgrade**

```bash
bun add -d @types/node@^26
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: pass. If errors appear, fix each at its source with the narrowest change (for example `ReturnType<typeof setTimeout>` instead of `NodeJS.Timeout`, `Uint8Array` where Node 26 tightened `Buffer`), never with `any` or `@ts-expect-error`. Bun's own types (`@types/bun`) depend on `@types/node`; if they conflict, record the error and pin (Step 6b).

- [ ] **Step 3: Quick gates**

```bash
rm -rf .next && bun run verify:quick
```

Expected: pass. Types do not reach the bundle, so the e2e and 3D lanes are not needed beyond CI; still run `E2E_PORT=4517 bun run e2e:smoke` (fast) because `package.json` changed.

- [ ] **Step 4: Commit**

```bash
rtk git add package.json bun.lock <fixed files>
rtk git commit -m "chore(deps): @types/node 26"
```

- [ ] **Step 5: PR, close #80**

Capacity check, push, `gh pr create` with body "Replaces Dependabot #80." After CI is green, close the Dependabot PR: `gh pr close 80 -R ShinyQ/ShinyQ-HQ --comment "Superseded by #<n> (Round 7 A2), which upgrades @types/node to 26 with the gates green."` Report to the coordinator and wait for "merge" (then squash, deploy, main CI, as in Task 1 Step 14).

- [ ] **Step 6b (only if it cannot pass): pin**

Revert the upgrade (`rtk git checkout origin/main -- package.json bun.lock`), then follow "Pin procedure" below with package `@types/node`, Dependabot PR 80.

---

### Task 3: A3, ESLint 10 (closes #31)

**Branch:** `feat/r7a3-eslint-10` from `main` after Task 2 merged.

**Files:**
- Modify: `package.json` (`"eslint": "^10"`), `bun.lock`, `eslint.config.mjs` (only if ESLint 10 needs a config change), `README.md` Tooling row only if it names a version
- Or (pin): `.github/dependabot.yml`, `docs/deploy.md` section 17

- [ ] **Step 1: Upgrade**

```bash
bun add -d eslint@^10
```

Bun prints peer warnings for `eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y` (peers stop at `^9`). Note them for the PR.

- [ ] **Step 2: Lint with every plugin loaded**

Run: `bun run lint`
Expected outcomes:
- Pass with the same findings as on `main` (zero): continue to Step 3.
- Crash such as `TypeError: context.getFilename is not a function`, `context.getScope is not a function`, `sourceCode.getAncestors` or a config schema error from a bundled plugin: ESLint 10 is not supported by `eslint-config-next` 16.4.1's plugins. Do not patch `node_modules`, do not drop the Next.js rule sets, do not add `@eslint/compat` shims (that would silently weaken the gate). Go to Step 5b and pin.
- New findings from ESLint 10 rule changes (for example `no-unused-vars` defaults, `eslint:recommended` additions): fix the code where the rule is right; never disable a rule globally.

- [ ] **Step 3: Prove the rules still fire**

A crash-free run is not enough; make sure the plugins actually lint:

```bash
printf 'import { useEffect } from "react";\nexport function X({ a }: { a: number }) {\n  useEffect(() => { console.log(a); }, []);\n  return <img src="/x.png" />;\n}\n' > src/__lint_probe.tsx
bunx eslint src/__lint_probe.tsx; rm src/__lint_probe.tsx
```

Expected: `react-hooks/exhaustive-deps` and `@next/next/no-img-element` (and `jsx-a11y/alt-text`) are reported. If any is missing, the plugin is not running correctly under ESLint 10: pin (Step 5b).

- [ ] **Step 4: Quick gates**

```bash
rm -rf .next && bun run verify:quick
```

- [ ] **Step 5: Docs, commit, PR, close #31**

Commit `chore(deps): ESLint 10`. Capacity check, push, PR body "Replaces Dependabot #31." After green: `gh pr close 31 -R ShinyQ/ShinyQ-HQ --comment "Superseded by #<n> (Round 7 A3)."` Report and wait.

- [ ] **Step 5b (if it cannot pass): pin**

Follow "Pin procedure" with package `eslint`, Dependabot PR 31, reason naming the failing plugin and error (for example "eslint-config-next 16.4.1 bundles eslint-plugin-react 7.37.5, eslint-plugin-import 2.32.0 and eslint-plugin-jsx-a11y 6.10.2, which support ESLint up to 9; lint crashes with <error>"), revisit `2027-01-15`.

---

### Task 4: A4, TypeScript 6.0 and a TypeScript 7 pin (closes #30)

Probe result (2026-10-15, scratch worktree with A1 to A3 applied): TypeScript 7.0.2 cannot pass. `bun run lint` stops with "typescript-eslint does not support TS 7.0" (typescript-eslint 8.71.2 supports `>=4.8.4 <6.1.0`, tracking typescript-eslint#10940), and `bun run typecheck` fails in `tests/unit/three-disposal.test.ts`, which uses the classic compiler API (`ts.forEachChild`, `ts.isIdentifier`) that TypeScript 7's package no longer exports (its main export is `lib/version.cjs`). TypeScript 6.0.3, the last release with that API, passes typecheck, lint, every unit test and the build once `tsconfig.json` lists `"types": ["bun"]` (TypeScript 6 no longer includes every `@types/*` package by default; `bun-types` brings the Node types too).

**Branch:** `feat/r7a4-typescript-6` from `main` after Task 3 merged.

**Files:**
- Modify: `package.json` (`"typescript": "~6.0.3"`: tilde, because typescript-eslint stops below 6.1), `bun.lock`, `tsconfig.json` (`"types": ["bun"]`)
- Modify: `.github/dependabot.yml` (ignore `typescript` majors), `docs/deploy.md` section 17 (pin row)

- [ ] **Step 1: Upgrade to 6.0**

```bash
bun add -d typescript@~6.0.3
```

- [ ] **Step 2: Typecheck fails without `types`**

Run: `bun run typecheck`
Expected: FAIL with `TS2868: Cannot find name 'Bun'` in `scripts/*.ts` and `TS2339: Property 'dir' does not exist on type 'ImportMeta'`.

- [ ] **Step 3: Name the global types**

In `tsconfig.json` `compilerOptions`, after `"incremental": true,`:

```json
    "types": ["bun"],
```

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Pin TypeScript 7** (Pin procedure Steps 1 to 3)

`.github/dependabot.yml` entry:

```yaml
    ignore:
      # revisit 2027-01-15: typescript-eslint 8 supports TypeScript below 6.1 and TypeScript 7 drops the compiler API tests use
      - dependency-name: "typescript"
        update-types: ["version-update:semver-major"]
```

`docs/deploy.md` section 17 row (replaces `| none | | | | |`):

```markdown
| `typescript` | 6.0.x (`~6.0.3`) | 7.0.2 | typescript-eslint 8.71 (via eslint-config-next) throws "does not support TS 7.0" and supports TypeScript below 6.1 (typescript-eslint#10940); TypeScript 7 also drops the classic compiler API that `tests/unit/three-disposal.test.ts` uses. 6.1 is held back by the tilde range for the same reason | 2027-01-15 |
```

Run: `bunx vitest run tests/unit/dependabot.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates, commit, PR, close #30**

`rm -rf .next && bun run verify:quick` and `E2E_PORT=4517 bun run e2e:smoke`. Commit `chore(deps): TypeScript 6.0, pin TypeScript 7`. Capacity check, push, PR. After green: `gh pr close 30 -R ShinyQ/ShinyQ-HQ --comment "Pinned in #<n>: <reason>. TypeScript moves to 6.0.3 instead; Dependabot ignores typescript majors until the revisit on 2027-01-15 (docs/deploy.md section 17)."` Report and wait.

---

### Pin procedure (used by Tasks 2 to 4 and any later major)

**Files:** `.github/dependabot.yml`, `docs/deploy.md` section 17

- [ ] **Step 1: Add the ignore entry**

Under the `bun` ecosystem in `.github/dependabot.yml`, after `groups:` (keep 4-space indentation):

```yaml
    ignore:
      # revisit 2027-01-15: <one-line reason>
      - dependency-name: "<package>"
        update-types: ["version-update:semver-major"]
```

(One `ignore:` key; add further entries under it, each with its own comment line.)

- [ ] **Step 2: Add the doc row** (replace the `| none | | | | |` row the first time)

```markdown
| `<package>` | <current major, for example 9.x> | <latest, for example 10.12.0> | <reason> | 2027-01-15 |
```

- [ ] **Step 3: Run the guard**

Run: `bunx vitest run tests/unit/dependabot.test.ts`
Expected: PASS (the entry has a dated reason, ignores only majors, and the doc lists exactly the ignored names).

- [ ] **Step 4: Gates, commit, PR, close the Dependabot PR**

`bun run verify:quick`. Commit `chore(deps): pin <package> major (<short reason>)`. Capacity check, push, PR. Close the Dependabot PR with the reason: `gh pr close <dependabot n> -R ShinyQ/ShinyQ-HQ --comment "Pinned in #<n>: <reason>. Dependabot now ignores <package> majors until the revisit on 2027-01-15 (docs/deploy.md section 17)."` Report and wait.

---

### Task 5: Close-out check

- [ ] **Step 1:** On `main` after the last merge: `bun outdated`. Expected: only the pinned majors, each in `docs/deploy.md` section 17. If a new major appeared for three, @types/three, drei, fiber, postprocessing, @react-three/postprocessing, Next, next-intl, vitest or jsdom, give it its own Task (3D libraries: strict visual gate, `bun run e2e:perf`, memory gates) or pin it.
- [ ] **Step 2:** `gh pr list -R ShinyQ/ShinyQ-HQ --author app/dependabot --state open`. Expected: empty, or only PRs opened after this round, each answered by a merge or a pin.
- [ ] **Step 3:** Final report to the coordinator: every PR, before and after versions, pins with reasons and revisit dates.
