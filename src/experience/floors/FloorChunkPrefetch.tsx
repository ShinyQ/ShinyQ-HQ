"use client";

import { useEffect } from "react";
import { getHQStore } from "@/store/useHQStore";
import { afterFirstFrameIdle } from "../boot-signals";
import { floorChunks } from "./floorChunks";
import { prefetchFor, rideRetry } from "./floorPrefetch";

/**
 * Loads the L3, L4 and RF chunks before they are needed (Round 7 B): every lazy floor once the first
 * frame is drawn and the page is idle, the ride target at once, and every floor when the floor picker
 * opens or an elevator call pad is targeted. Renders nothing.
 */
export function FloorChunkPrefetch() {
  useEffect(() => afterFirstFrameIdle(() => floorChunks.prefetchAll()), []);
  useEffect(() => {
    const store = getHQStore();
    let rideKey: string | null = null;
    const apply = () => {
      const state = store.getState();
      const { need, soon } = prefetchFor(state);
      // A failed chunk is retried once at ride start, so the car holds for it (rideChunkHold).
      const retry = rideRetry(rideKey, state.ride, state.ride ? floorChunks.state(state.ride.to) : "idle");
      rideKey = retry.key;
      if (retry.retry) floorChunks.ensure(retry.retry);
      // Only idle floors: this runs on every store change, and ensure on a failed floor would restart its import.
      for (const id of need) if (floorChunks.state(id) === "idle") floorChunks.ensure(id);
      for (const id of soon) if (floorChunks.state(id) === "idle") floorChunks.prefetch(id);
    };
    apply();
    return store.subscribe(apply);
  }, []);
  return null;
}
