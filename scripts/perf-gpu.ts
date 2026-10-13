/**
 * Real-GPU measurements for round 5 (P2 spikes SP4 and SP9). Headed Chrome on the machine you run it on.
 * Serve a build first: bun scripts/serve-static.ts --port 4431
 *   bun scripts/perf-gpu.ts sp4 [--size 1440x900] [--dpr 2] [--variants current,msaa0,dpr1.5,bloom5] [--channel chrome]
 *   bun scripts/perf-gpu.ts sp9 [--tier full|lite] [--cpu 4] [--size 1440x900] [--dpr 1]
 * Prints a markdown table and writes JSON to test-results/perf-gpu/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt("url", `http://127.0.0.1:${process.env.E2E_PORT ?? 4431}`);
const [W, H] = opt("size", "1440x900").split("x").map(Number);
const DPR = Number(opt("dpr", mode === "sp9" ? "1" : "2"));
const CHANNEL = opt("channel", "chrome");
const ROUTES: [string, string][] = [["L1", "/en"], ["L2", "/en/journey"], ["L3", "/en/labs"], ["L4", "/en/library"], ["RF", "/en/contact"]];
const VARIANT_GFX: Record<string, string> = { current: "", msaa0: "msaa0", "dpr1.5": "dpr1.5", bloom5: "bloom5" };

type Sample = { t: number; ms: number };
type PerfRead = { frames: number[]; gpu: Sample[]; longTasks: { start: number; duration: number }[]; stages: { t: number; stage: string }[] };

/** Init script: GPU timer queries around every rAF callback of the tower canvas, frame deltas, long tasks, ride stages. */
function probe() {
  const contexts: WebGL2RenderingContext[] = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
    const ctx = (getContext as unknown as (this: HTMLCanvasElement, t: string, a?: unknown) => unknown).call(this, type, attrs);
    if (type === "webgl2" && ctx) contexts.push(ctx as WebGL2RenderingContext);
    return ctx;
  } as typeof getContext;
  const frames: number[] = [];
  const gpu: { t: number; ms: number }[] = [];
  const longTasks: { start: number; duration: number }[] = [];
  const stages: { t: number; stage: string }[] = [];
  const pending: { q: WebGLQuery; t: number }[] = [];
  let main: WebGL2RenderingContext | null = null;
  let ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  let last = 0;
  let active = false;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    raf((t) => {
      if (t !== last) {
        if (last) frames.push(t - last);
        last = t;
        const s = (window as unknown as { __hq?: { store: { getState(): { phase: string; ride: { stage: string } | null } } } }).__hq?.store.getState();
        stages.push({ t, stage: s ? (s.ride ? `ride:${s.ride.stage}` : s.phase) : "loading" });
      }
      main ??= contexts.find((c) => (c.canvas as HTMLCanvasElement).closest?.('[data-testid="hq-world"]')) ?? null;
      if (main && !ext) ext = main.getExtension("EXT_disjoint_timer_query_webgl2");
      let q: WebGLQuery | null = null;
      if (main && ext && !active) {
        q = main.createQuery();
        if (q) {
          main.beginQuery(ext.TIME_ELAPSED_EXT, q);
          active = true;
        }
      }
      try {
        cb(t);
      } finally {
        if (q && main && ext) {
          main.endQuery(ext.TIME_ELAPSED_EXT);
          active = false;
          pending.push({ q, t });
        }
        while (main && ext && pending.length && main.getQueryParameter(pending[0].q, main.QUERY_RESULT_AVAILABLE)) {
          const done = pending.shift()!;
          if (!main.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push({ t: done.t, ms: main.getQueryParameter(done.q, main.QUERY_RESULT) / 1e6 });
          main.deleteQuery(done.q);
        }
      }
    });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: true });
  (window as unknown as { __perf: unknown }).__perf = {
    reset() {
      frames.length = 0;
      gpu.length = 0;
      longTasks.length = 0;
      stages.length = 0;
    },
    read: () => ({ frames: [...frames], gpu: [...gpu], longTasks: [...longTasks], stages: [...stages] }),
  };
}

const pct = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] * 10) / 10;
};
const perFrame = (gpu: Sample[]) => [...gpu.reduce((m, g) => m.set(g.t, (m.get(g.t) ?? 0) + g.ms), new Map<number, number>()).values()];
/** Render-target estimate (REPORT F7.4): MSAA 4 HalfFloat input about 48 B/px, resolve color + depth 12 B/px, canvas 8 B/px. */
const estimateMB = (px: number, msaa: number | null) => Math.round((px * ((msaa ? 48 : 0) + 12 + 8)) / 1e6);

const QUIET = () => {
  localStorage.setItem("hq:terminal-seen", "1");
  localStorage.setItem("hq:onboarded", "done");
  localStorage.setItem("hq:hints", "off");
  sessionStorage.setItem("hq:ask-teaser", "1");
};
const RETURNING = () => {
  QUIET();
  sessionStorage.setItem("hq:intro", "seen");
  if (!localStorage.getItem("hq:v1")) localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
};

async function live(page: Page) {
  await page.waitForFunction(() => ((window as unknown as { __hq?: { rover: { drawCalls: number } } }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 120_000 });
}
const read = (page: Page) => page.evaluate(() => (window as unknown as { __perf: { read(): PerfRead } }).__perf.read());
const reset = (page: Page) => page.evaluate(() => (window as unknown as { __perf: { reset(): void } }).__perf.reset());

async function sp4() {
  const variants = opt("variants", "current,msaa0,dpr1.5,bloom5").split(",");
  const browser = await chromium.launch({ headless: false, channel: CHANNEL });
  const rows: Record<string, unknown>[] = [];
  for (const variant of variants) {
    for (const [floor, route] of ROUTES) {
      const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
      const page = await context.newPage();
      await page.addInitScript(probe);
      await page.addInitScript(RETURNING);
      const gfx = ["monitor-off", VARIANT_GFX[variant] ?? variant].filter(Boolean).join(",");
      await page.goto(`${BASE}${route}?tier=full&gfx=${gfx}`);
      await live(page);
      await page.waitForTimeout(3000);
      await reset(page);
      await page.waitForTimeout(5000);
      const r = await read(page);
      const g = await page.evaluate(() => {
        const render = (window as unknown as { __hq: { render: { gl: { getPixelRatio(): number; domElement: HTMLCanvasElement } | null; graphics?: () => { multisampling: number | null; bloomLevels: number | null } } } }).__hq.render;
        return { pixelRatio: render.gl?.getPixelRatio() ?? 0, px: (render.gl?.domElement.width ?? 0) * (render.gl?.domElement.height ?? 0), ...(render.graphics?.() ?? { multisampling: null, bloomLevels: null }) };
      });
      const gpuFrames = perFrame(r.gpu);
      rows.push({ variant, floor, frameP50: pct(r.frames, 0.5), frameP95: pct(r.frames, 0.95), gpuP50: pct(gpuFrames, 0.5), gpuP95: pct(gpuFrames, 0.95), pixelRatio: g.pixelRatio, msaa: g.multisampling, bloom: g.bloomLevels, estMB: estimateMB(g.px, g.multisampling), pass: pct(r.frames, 0.95) <= 18 });
      await context.close();
    }
  }
  await browser.close();
  return rows;
}

async function sp9() {
  const tier = opt("tier", "full");
  const cpu = Number(opt("cpu", "4"));
  const browser = await chromium.launch({ headless: false, channel: CHANNEL });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.addInitScript(probe);
  await page.addInitScript(QUIET);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.goto(`${BASE}/en?tier=${tier}`);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await start.waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="boot"] button[aria-disabled="true"]') === null, null, { timeout: 120_000 });
  const boot = await read(page);
  await reset(page);
  await page.evaluate(() => (window as unknown as { __hq: { render: { resetPeak(): void } } }).__hq.render.resetPeak());
  await start.click();
  await live(page);
  await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState(): { phase: string } } } }).__hq.store.getState().phase === "explore", null, { timeout: 120_000 });
  const introRead = await read(page);
  const counters = () => page.evaluate(() => {
    const r = (window as unknown as { __hq: { render: { peakCalls: number; programs(): number; programNames(): string[] } } }).__hq.render;
    return { peak: r.peakCalls, programs: r.programs(), names: r.programNames() };
  });
  const intro = await counters();
  const seen = new Set(intro.names);
  const rows: Record<string, unknown>[] = [
    { step: "boot", peakCalls: "", newPrograms: "", maxLongTask: pct(boot.longTasks.map((l) => l.duration), 1), longTasksOver50: boot.longTasks.filter((l) => l.duration > 50).length, movingLongTasks: "" },
    { step: "intro", peakCalls: intro.peak, newPrograms: "", maxLongTask: pct(introRead.longTasks.map((l) => l.duration), 1), longTasksOver50: introRead.longTasks.filter((l) => l.duration > 50).length, movingLongTasks: "" },
  ];
  for (const to of ["L2", "L3", "L4", "RF", "L1"]) {
    await reset(page);
    await page.evaluate(() => (window as unknown as { __hq: { render: { resetPeak(): void } } }).__hq.render.resetPeak());
    await page.evaluate((f) => (window as unknown as { __hq: { store: { getState(): { goToFloor(f: string): void } } } }).__hq.store.getState().goToFloor(f), to);
    await page.waitForFunction((f) => {
      const s = (window as unknown as { __hq: { store: { getState(): { floor: string; ride: unknown; phase: string } } } }).__hq.store.getState();
      return s.floor === f && s.ride === null && s.phase === "explore";
    }, to, { timeout: 120_000 });
    await page.waitForTimeout(1500);
    const r = await read(page);
    const c = await counters();
    const stageAt = (time: number) => [...r.stages].reverse().find((s) => s.t <= time)?.stage ?? "loading";
    const moving = r.longTasks.filter((l) => stageAt(l.start) === "ride:moving");
    rows.push({ step: `ride to ${to}`, peakCalls: c.peak, newPrograms: c.names.filter((n) => !seen.has(n)).length, maxLongTask: pct(r.longTasks.map((l) => l.duration), 1), longTasksOver50: r.longTasks.filter((l) => l.duration > 50).length, movingLongTasks: moving.length });
    for (const n of c.names) seen.add(n);
  }
  await browser.close();
  return rows;
}

if (mode !== "sp4" && mode !== "sp9") {
  console.error("usage: bun scripts/perf-gpu.ts sp4|sp9 [options]");
  process.exit(2);
}
const rows = mode === "sp4" ? await sp4() : await sp9();
mkdirSync("test-results/perf-gpu", { recursive: true });
const file = `test-results/perf-gpu/${mode}-${W}x${H}@${DPR}-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(rows, null, 2));
const cols = Object.keys(rows[0] ?? {});
console.log(`| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n${rows.map((r) => `| ${cols.map((c) => String(r[c])).join(" | ")} |`).join("\n")}`);
console.log(`\nJSON: ${file}`);
