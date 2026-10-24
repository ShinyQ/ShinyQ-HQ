import { BatchedText, configureTextBuilder, GlyphsGeometry, Text } from "troika-three-text";
import { trackTextSync } from "./tower/textSync";
import troikaFonts from "./troika-fonts.json";

/**
 * The site CSP has no blob: workers (`worker-src 'self'`), but WebKit refuses one only after
 * `new Worker(blob:)` returns, so troika's worker probe passes and its glyph SDF fallback (used when a
 * GPU fails webgl-sdf-generator's trial run, as some tablets do) waits forever: no in-world text ever
 * syncs and L1 stays empty. Refusing blob: workers at construction makes the probe fail in every
 * browser, and troika runs that fallback on the main thread instead.
 */
if (typeof Worker === "function") {
  const Native = Worker;
  const Guarded = function (url: string | URL, options?: WorkerOptions) {
    if (String(url).startsWith("blob:")) throw new Error("blob: worker");
    return new Native(url, options);
  };
  // `instanceof Worker` keeps working for same-origin workers (the pdf.js reader).
  Guarded.prototype = Native.prototype;
  window.Worker = Guarded as unknown as typeof Worker;
}

/**
 * Typeset in-world text on the main thread. The default worker loads blob: scripts, which the
 * production Content-Security-Policy (public/_headers) blocks.
 * Glyph SDFs are still generated on the GPU when it passes the trial run. Must run before the first <Text> mounts.
 *
 * `defaultFontURL` is the fallback troika tries after each Text's own font. The self-hosted
 * latin subsets lack arrows and geometric shapes (for example the Labs tier marks), and without
 * a fallback that covers them troika fetches font data from a CDN, which the CSP blocks.
 */
configureTextBuilder({ useWorker: false, defaultFontURL: troikaFonts.symbols });

/** Count typesetting per floor so the elevator waits for it with the doors closed (tower/textSync.ts, R5 P6). */
trackTextSync(Text.prototype, BatchedText.prototype);

/**
 * Until its first (async) typesetting finishes, a troika glyph geometry keeps three's
 * InstancedBufferGeometry default `instanceCount = Infinity` with no instance attributes. three
 * then issues an instanced draw of Infinity (WebGL draws nothing) and counts Infinity triangles in
 * `renderer.info`, which breaks the per-floor render budget while texts are still syncing (for
 * example the neighbouring floors that mount on idle). Report 0 instances instead: three skips the
 * draw, and every real count (`updateGlyphs`, `applyClipRect`) is finite and passes through.
 */
const INSTANCES = Symbol("instanceCount");
type Counted = { [INSTANCES]?: number };
if (!Object.getOwnPropertyDescriptor(GlyphsGeometry.prototype, "instanceCount")) {
  Object.defineProperty(GlyphsGeometry.prototype, "instanceCount", {
    configurable: true,
    get(this: Counted) {
      return this[INSTANCES] ?? 0;
    },
    set(this: Counted, value: number) {
      this[INSTANCES] = Number.isFinite(value) ? value : 0;
    },
  });
}
