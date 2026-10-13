import { createRumHandler } from "../_lib/rum";
import type { PagesContext, RumEnv } from "../_lib/types";

/**
 * Anonymous performance beacon: `POST /api/rum` writes one coarse point per sampled 3D session to the
 * Analytics Engine dataset `perf_events` (appendix 06 section 4). Any other method answers 405.
 */
const handler = createRumHandler();

export const onRequest = (context: PagesContext<RumEnv>) => handler(context);
