/** Shared touch state written by the HUD joystick and boost button, polled by the Director each frame. */
export const joystick = { x: 0, y: 0, active: false, boost: false };

export function setJoystick(x: number, y: number, active: boolean) {
  joystick.x = x;
  joystick.y = y;
  joystick.active = active;
}

/** The hold-to-boost button beside the joystick (released on pointer up, cancel or unmount). */
export function setBoost(on: boolean) {
  joystick.boost = on;
}
