import { createOfficeForwardHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `POST /api/office/beat` forwards a signed relay beat to the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeForwardHandler("beat");
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
