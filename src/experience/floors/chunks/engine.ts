import { reactorCoreProbe } from "../engine/ReactorCore";
import { reactorTest as liveTest } from "../engine/reactorLive";

/** B1 chunk entry (B1 Engine Room, PR 2). Imported only by floorChunks.ts. */
export { EngineRoom } from "../EngineRoom";
export { EngineBody } from "@/hud/drawer/EngineBody";

/** `__hq.reactor()` once B1 loaded (Playwright): the reactor feed's test hook plus `state()`, what the core shows. */
export const reactorTest = { ...liveTest, state: reactorCoreProbe };
