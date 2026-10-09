import { configureTextBuilder } from "troika-three-text";

/**
 * Typeset in-world text on the main thread. The default worker loads blob: scripts, which the
 * production Content-Security-Policy (public/_headers, script-src without blob:) blocks.
 * Glyph SDFs are still generated on the GPU. Must run before the first <Text> mounts.
 *
 * `defaultFontURL` is the fallback troika tries after each Text's own font. The self-hosted
 * latin subsets lack arrows and geometric shapes (for example the Labs tier marks), and without
 * a fallback that covers them troika fetches font data from a CDN, which the CSP blocks.
 */
configureTextBuilder({ useWorker: false, defaultFontURL: "/fonts/jetbrains-mono-symbols-700.woff" });
