/** Shared touch state written by the HUD joystick (its double tap toggles boost), polled by the Director each frame. */
export const joystick = { x: 0, y: 0, active: false, boost: false };

export function setJoystick(x: number, y: number, active: boolean) {
  joystick.x = x;
  joystick.y = y;
  joystick.active = active;
}

/** The boost toggle beside the joystick: on with one tap, off with the next, a floor change, a ride or unmount. */
export function setBoost(on: boolean) {
  joystick.boost = on;
}

type Rect = { left: number; top: number; width: number; height: number };

/** The phone's floating stick as the world input sees it (`createStick` in `floatingStick.ts`): each returns true when the touch is the stick's. */
export interface StickHandler {
  down(id: number, x: number, y: number, at: number, rect: Rect, canBoost: boolean): boolean;
  move(id: number, x: number, y: number): boolean;
  up(id: number, at: number, up: boolean): boolean;
}

/** Set by the touch controls chunk once it loads on a coarse pointer (`hud/Joystick.tsx`); null before, so touches look. */
export const stickInput: { handler: StickHandler | null } = { handler: null };
