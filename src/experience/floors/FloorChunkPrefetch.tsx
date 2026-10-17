"use client";

import { useEffect } from "react";
import { getHQStore } from "@/store/useHQStore";
import { afterFirstFrameIdle } from "../boot-signals";
import { floorChunks } from "./floorChunks";
import { prefetchFor, rideRetry } from "./floorPrefetch";

/**
 * Loads the lazy floor chunks before they are needed (Round 7 B): every public lazy floor (L3, L4, RF) once
 * the first frame is drawn and the page is idle, B1 too once unlocked; the ride target at once; and every
 * floor the visitor may enter when the floor picker opens or an elevator call pad is targeted. A locked
 * session never loads B1. Renders nothing.
 */
export function FloorChunkPrefetch() {
  useEffect(() => {
    const store = getHQStore();
    let idle = false;
    let rideKey: string | null = null;
    const apply = () => {
      const state = store.getState();
      const { need, soon } = prefetchFor({ ...state, idle });
      // A failed chunk is retried once at ride start, so the car holds for it (rideChunkHold).
      const retry = rideRetry(rideKey, state.ride, state.ride ? floorChunks.state(state.ride.to) : "idle");
      rideKey = retry.key;
      if (retry.retry) floorChunks.ensure(retry.retry);
      // Only idle floors: this runs on every store change, and ensure on a failed floor would restart its import.
      for (const id of need) if (floorChunks.state(id) === "idle") floorChunks.ensure(id);
      for (const id of soon) if (floorChunks.state(id) === "idle") floorChunks.prefetch(id);
    };
    const offIdle = afterFirstFrameIdle(() => {
      idle = true;
      floorChunks.prefetchAll();
      apply();
    });
    apply();
    const off = store.subscribe(apply);
    return () => {
      offIdle();
      off();
    };
  }, []);
  return null;
}
