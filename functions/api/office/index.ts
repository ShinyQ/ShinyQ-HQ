import { createOfficeSnapshotHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `GET /api/office` serves the office snapshot from the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeSnapshotHandler();
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
