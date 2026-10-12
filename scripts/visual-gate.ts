/**
 * Look-preserving gate (round 5, P2): captures e2e/visual-gate.spec.ts baselines from a base ref and
 * compares the working tree (or `--head <ref>`) against them. Local only (unset CI so Playwright reuses
 * this server). Builds of refs are cached per commit in sibling worktrees (`../<repo>-visual-<sha>`).
 * Usage: bun scripts/visual-gate.ts [--base origin/main] [--head <ref>] [--profile strict|msaa|batching|release] [--self] [--grep <text>] [--no-build]
 *   --base     ref to compare against (each task uses HEAD, the release check uses origin/main)
 *   --head     ref to compare (default: the working tree, built here unless --no-build)
 *   --self     compares the base with itself (noise floor of the harness)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(process.env.E2E_PORT ?? 4431);
const base = opt("base", "origin/main");
const head = opt("head", "");
const profile = opt("profile", "strict");
const grep = opt("grep", "");
const root = process.cwd();
const run = (cmd: string[], cwd = root, env: Record<string, string> = {}) => {
  const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "inherit", stderr: "inherit" });
  return r.exitCode ?? 1;
};
const must = (cmd: string[], cwd = root) => {
  if (run(cmd, cwd) !== 0) throw new Error(`failed: ${cmd.join(" ")} (in ${cwd})`);
};

/** Builds `ref` once in its own sibling worktree and returns its `out/` directory. */
function buildRef(ref: string): { sha: string; out: string } {
  const sha = Bun.spawnSync(["git", "rev-parse", ref]).stdout.toString().trim();
  if (!sha) throw new Error(`unknown ref ${ref}`);
  const dir = path.resolve(root, "..", `${path.basename(root)}-visual-${sha.slice(0, 8)}`);
  const marker = path.join(dir, "out", ".visual-gate-sha");
  if (!existsSync(marker) || readFileSync(marker, "utf8").trim() !== sha) {
    if (!existsSync(dir)) must(["git", "worktree", "add", "--detach", dir, sha]);
    else must(["git", "checkout", "--detach", sha], dir);
    must(["bun", "install", "--frozen-lockfile"], dir);
    must(["bun", "run", "build"], dir);
    writeFileSync(marker, sha);
  }
  return { sha, out: path.join(dir, "out") };
}

const baseBuild = buildRef(base);
const sha = baseBuild.sha;
const headOut = flag("self") ? baseBuild.out : head ? buildRef(head).out : path.join(root, "out");
if (!head && !flag("no-build") && !flag("self")) must(["bun", "run", "build"]);

async function serve(dir: string) {
  const server = Bun.spawn(["bun", "scripts/serve-static.ts", "--port", String(PORT), "--dir", dir], { cwd: root, stdout: "ignore", stderr: "inherit" });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/en`)).ok) return server;
    } catch {
      // not listening yet
    }
    await Bun.sleep(100);
  }
  server.kill();
  throw new Error(`server on ${PORT} did not start`);
}

function capture(label: string, update: boolean) {
  const cmd = ["bunx", "playwright", "test", "e2e/visual-gate.spec.ts", "--workers=1", "--reporter=list"];
  if (update) cmd.push("--update-snapshots");
  if (grep) cmd.push("-g", grep);
  return run(cmd, root, { VISUAL_GATE: "1", VISUAL_GATE_PROFILE: profile, VISUAL_GATE_LABEL: label, E2E_PORT: String(PORT), CI: "" });
}

const baseServer = await serve(baseBuild.out);
const updated = capture("base", true);
baseServer.kill();
if (updated !== 0) throw new Error("baseline capture failed");

const headServer = await serve(headOut);
const code = capture(flag("self") ? "base-again" : head ? `head-${head}` : "head", false);
headServer.kill();
console.log(code === 0 ? `visual gate: PASS (profile ${profile}, base ${base} ${sha.slice(0, 8)})` : `visual gate: FAIL (profile ${profile}); diffs in test-results/`);
process.exit(code);
