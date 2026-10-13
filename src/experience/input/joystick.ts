/** Shared touch state written by the HUD joystick and boost button, polled by the Director each frame. */
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
