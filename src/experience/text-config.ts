import { configureTextBuilder } from "troika-three-text";

/**
 * Typeset in-world text on the main thread. The default worker loads blob: scripts, which the
 * production Content-Security-Policy (public/_headers, script-src without blob:) blocks.
 * Glyph SDFs are still generated on the GPU. Must run before the first <Text> mounts.
 */
configureTextBuilder({ useWorker: false });
