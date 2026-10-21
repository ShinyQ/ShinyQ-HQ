import { getHQStore } from "@/store/useHQStore";
import { officeLive } from "./live";
import { createReplayFeed, linkReplay } from "./replayFeed";
import { officeReplay, publishReplay } from "./replayLink";

const reduced = () => getHQStore().getState().reducedMotion;

/** The replay chunk (loaded by `loadOfficeReplay` in ./replayLink.ts on the idle-loop condition or the drawer's control): one controller per page, tied to the live feed (`linkReplay`). */
export const replayController = linkReplay(createReplayFeed({ fetch: (url) => fetch(url), now: officeLive.now, reduced, publish: publishReplay }), officeLive, reduced);
officeReplay.controller = replayController;
