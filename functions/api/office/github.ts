import { createOfficeForwardHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `POST /api/office/github` forwards a signed GitHub webhook to the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeForwardHandler("github");
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
