import type { Object3D } from "three";
import type { FloorId } from "@/content/schema";
import { textDone, textStarted } from "./ridePrep";

/**
 * Counts troika typesetting per floor (R5 P6, REPORT F5.7): typesetting runs on the main thread (the
 * CSP blocks troika's worker, text-config.ts), so the elevator waits for the destination's texts with
 * the doors closed instead of typesetting them during the dolly. Floors are the `floor-<id>` groups of
 * `FloorLevel`; BatchedText members are not in the scene graph, so `addText` tags them with their batch.
 */
const FLOOR_GROUP = /^floor-(L1|L2|L3|L4|RF)$/;
const BATCH = Symbol.for("hq.textSync.batch");
const WRAPPED = Symbol.for("hq.textSync.wrapped");

type Tagged = Object3D & { [BATCH]?: Object3D };
type Syncing = Object3D & { _needsSync?: boolean; _isSyncing?: boolean };
export type SyncProto = { sync(callback?: () => void): void };
export type BatchProto = { addText(text: Object3D): void };

export function floorOfObject(object: Object3D | null): FloorId | null {
  for (let o: Object3D | null = object; o; o = o.parent ?? (o as Tagged)[BATCH] ?? null) {
    const match = FLOOR_GROUP.exec(o.name);
    if (match) return match[1] as FloorId;
  }
  return null;
}

export function trackTextSync(textProto: SyncProto, batchProto?: BatchProto): void {
  const marked = textProto as SyncProto & { [WRAPPED]?: true };
  if (marked[WRAPPED]) return;
  marked[WRAPPED] = true;
  const sync = textProto.sync;
  textProto.sync = function (this: Syncing, callback?: () => void) {
    const floor = this._needsSync && !this._isSyncing ? floorOfObject(this) : null;
    if (!floor) return sync.call(this, callback);
    textStarted(floor);
    let done = false;
    return sync.call(this, () => {
      if (!done) {
        done = true;
        textDone(floor);
      }
      callback?.();
    });
  };
  if (!batchProto) return;
  const addText = batchProto.addText;
  batchProto.addText = function (this: Object3D, text: Object3D) {
    (text as Tagged)[BATCH] = this;
    return addText.call(this, text);
  };
}
