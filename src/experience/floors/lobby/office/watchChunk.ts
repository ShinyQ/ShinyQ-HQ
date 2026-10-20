import { officeSignal, subscribeOfficeSignal } from "./officeSignal";
import { loadOfficeBeacon, setOfficeAsks } from "./watchLoader";

export { OfficeCue } from "@/hud/minimap/OfficeCue";
export { officeWatchTick, startOfficeWatch } from "./officeWatch";

let beaconAsked = false;

/**
 * Mirrors the signal into the main path's `officeAsks` (the minimap's label) and loads the beacon chunk the first
 * time a Rover needs Kurniadi (a failed load retries on the next ask). Runs at import too: the scene chunk may have
 * fed the signal first.
 */
function sync(): void {
  const on = officeSignal.needsKurniadi;
  setOfficeAsks(on);
  if (on && !beaconAsked) {
    beaconAsked = true;
    loadOfficeBeacon().catch(() => {
      beaconAsked = false;
    });
  }
}

subscribeOfficeSignal(sync);
sync();
