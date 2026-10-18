import type { Page } from "@playwright/test";
import { asReturningVisitor, waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/** The dev and test unlock: `?unlock=b1` is honoured in a production build only with `debug` (src/experience/b1.ts). */
export const B1_QUERY = "unlock=b1&debug=1";

type StoreWindow = Window & { __hq: { store: { getState: () => { goToFloor: (floor: string) => void } } } };

/** Opens a floor route as a returning visitor with B1 unlocked for this session, and waits for explore. */
export async function enterB1Route(page: Page, path = "/en", tier = "lite") {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}&${B1_QUERY}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

/** Calls the elevator to `floor` through the store and waits for the arrival (`waitForFloor` follows the ride). */
export async function rideTo(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as StoreWindow).__hq.store.getState().goToFloor(f), floor);
  await waitForFloor(page, floor, 90_000);
}

/** Writes `floorsSeen` and `b1Unlocked` into the persisted store (`hq:v1`) before the first load of the tab only (a reload keeps what the session recorded). */
export async function seedFloors(page: Page, floors: string[], unlocked = false) {
  await page.addInitScript(
    ({ floors, unlocked }) => {
      if (sessionStorage.getItem("hq:test-seeded")) return;
      sessionStorage.setItem("hq:test-seeded", "1");
      const raw = localStorage.getItem("hq:v1");
      const saved = raw ? JSON.parse(raw) : { state: { visited: [], firstVisit: false, locale: "en", motion: "full" }, version: 3 };
      localStorage.setItem("hq:v1", JSON.stringify({ ...saved, state: { ...saved.state, floorsSeen: floors, b1Unlocked: unlocked } }));
    },
    { floors, unlocked },
  );
}
