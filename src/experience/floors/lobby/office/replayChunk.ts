import { getHQStore } from "@/store/useHQStore";
import { officeLive } from "./live";
import { createReplayFeed } from "./replayFeed";
import { officeReplay, publishReplay } from "./replayLink";

/** The replay chunk (loaded by `loadOfficeReplay` in ./replayLink.ts on the idle-loop condition or the drawer's control): one controller per page. */
export const replayController = createReplayFeed({ fetch: (url) => fetch(url), now: officeLive.now, reduced: () => getHQStore().getState().reducedMotion, publish: publishReplay });
officeReplay.controller = replayController;
