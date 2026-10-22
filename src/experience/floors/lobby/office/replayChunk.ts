import { POLL, type OfficeFeedSnapshot } from "@/lib/office/poll";
import { getHQStore } from "@/store/useHQStore";
import { officeLive } from "./live";
import { officeView } from "./officeModel";
import { createReplayFeed, linkReplay, type ReplayState } from "./replayFeed";
import { officeReplay, publishReplay } from "./replayLink";
import { replayUi } from "./ReplayPill";

const reduced = () => getHQStore().getState().reducedMotion;
const locale = () => getHQStore().getState().locale;

/**
 * Publishes with the scene's view of the replay (`officeView` of its snapshot), built again only when the snapshot or `seq`
 * changed; a replay that ends restarts the quiet timer, so the idle loop waits again.
 */
function publish(state: ReplayState, snapshot: OfficeFeedSnapshot | null): void {
  const { state: was, snapshot: before, view } = officeReplay;
  if (state.status === "off" && was.status !== "off") officeReplay.quietSince = officeLive.now();
  const same = snapshot === before && state.seq === was.seq;
  publishReplay(state, snapshot, snapshot && state.day ? (same && view) || officeView({ status: "ready", snapshot }, { day: state.day, seq: state.seq, truncated: state.truncated, label: state.label! }) : null);
}

/** The replay chunk (loaded by `loadOfficeReplay` in ./replayLink.ts on the idle-loop condition or the drawer's control): one controller per page, tied to the live feed (`linkReplay`). */
export const replayController = linkReplay(createReplayFeed({ fetch: (url) => fetch(url), now: officeLive.now, active: () => officeLive.now() - officeLive.touchedAt() < POLL.idleStopMs, reduced, locale, publish }), officeLive, reduced);
officeReplay.controller = replayController;
officeReplay.state = replayController.state();
officeReplay.ui = replayUi;
/** The drawer's controls (their own chunk, imported here so `replay.ts` stays shared with this one): loaded by the drawer's "Show day replay" press. */
export const loadControls = () => import("./ReplayControls");
