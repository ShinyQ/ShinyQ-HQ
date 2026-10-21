import { createOfficeHistoryHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `GET /api/office/history` and `?day=YYYY-MM-DD` serve the replay history from the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeHistoryHandler();
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
