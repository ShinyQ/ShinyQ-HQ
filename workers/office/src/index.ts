import safety from "../../../functions/_generated/safety.json";
import { createOfficeWorker } from "./worker";

export { Office } from "./office";

/** hq-office entry (docs/agents/office.md). The blocklist is compiled by scripts/build-knowledge.ts before a deploy. */
export default createOfficeWorker({ blocklist: safety.blocklist });
