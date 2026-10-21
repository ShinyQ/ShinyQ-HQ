import { officeSignal, subscribeOfficeSignal } from "./officeSignal";
import { loadOfficeBeacon, setOfficeAsks } from "./watchLoader";

export { OfficeCue } from "@/hud/minimap/OfficeCue";
export { officeWatchTick, startOfficeWatch } from "./officeWatch";

let beaconAsked = false;

/**
 * Mirrors the signal into the main path's `officeAsks` (the minimap's label; asks only: a deploy is not a request for
 * Kurniadi) and loads the beacon chunk the first time a Rover needs Kurniadi or a fresh deploy success arrives (the
 * beam; a failed load retries on the next change). Runs at import too: the scene chunk may have fed the signal first.
 */
function sync(): void {
  const on = officeSignal.needsKurniadi;
  setOfficeAsks(on);
  if ((on || officeSignal.deployAt !== null) && !beaconAsked) {
    beaconAsked = true;
    loadOfficeBeacon().catch(() => {
      beaconAsked = false;
    });
  }
}

subscribeOfficeSignal(sync);
sync();
