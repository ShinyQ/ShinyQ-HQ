import type { Page } from "@playwright/test";

/**
 * A double tap on the joystick's center: two 50 ms still taps, 120 ms apart (inside the 300 ms window).
 * The four touch events go out at once with their own input times, as a real finger's would: the
 * joystick times the gesture from them, so a slow SwiftShader frame between handlers cannot stretch it
 * (`page.touchscreen.tap` waits for each tap to be handled, which can take a second under load).
 */
export async function doubleTapJoystick(page: Page) {
  const b = (await page.getByTestId("joystick").boundingBox())!;
  const touchPoints = [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }];
  const t = Date.now() / 1000;
  const cdp = await page.context().newCDPSession(page);
  await Promise.all([
    cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints, timestamp: t }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t + 0.05 }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints, timestamp: t + 0.17 }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t + 0.22 }),
  ]);
  await cdp.detach();
}
