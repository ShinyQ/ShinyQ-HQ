import { defineConfig, devices, type ReporterDescription } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);
const CI = Boolean(process.env.CI);
const SCREENSHOTS = Boolean(process.env.SCREENSHOTS);
// Set by scripts/e2e-shard.ts in CI: each shard writes a blob report that the aggregate job merges.
const SHARD = process.env.E2E_SHARD;

/** Screenshot specs only run with SCREENSHOTS=1 (nightly workflow, `bun run screenshots`). */
const SCREENSHOT_SPECS = ["**/screenshots.spec.ts", "**/pageview-visual.spec.ts"];

function reporter(): ReporterDescription[] {
  if (SHARD) return [["list"], ["blob", { fileName: `report-${SHARD.replace("/", "-of-")}.zip` }]];
  if (CI) return [["list"], ["html", { open: "never" }]];
  return [["list"]];
}

export default defineConfig({
  testDir: "e2e",
  // Ignored (not just skipped) so they do not count toward sharding or the test list.
  testIgnore: SCREENSHOTS ? [] : SCREENSHOT_SPECS,
  fullyParallel: true,
  // Each worker renders WebGL on the CPU (SwiftShader); more workers starve each other.
  // CI runners have 4 vCPUs, so the default (half the cores) is also 2.
  workers: CI ? undefined : 2,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: reporter(),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // WebGL through SwiftShader so the 3D experience renders in headless CI.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun scripts/serve-static.ts --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/en`,
    reuseExistingServer: !CI,
    timeout: 30_000,
  },
});
