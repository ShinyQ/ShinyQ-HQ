import { createVisitHandler } from "../_lib/visit";
import type { PagesContext, VisitEnv } from "../_lib/types";

/**
 * Public visit stats: `POST /api/visit` writes one point per page lifetime (3D, Classic or both) to the
 * Analytics Engine dataset `visit_events` (appendix 06 section 4). Any other method answers 405.
 */
const handler = createVisitHandler();

export const onRequest = (context: PagesContext<VisitEnv>) => handler(context);
