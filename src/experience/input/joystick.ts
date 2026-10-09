/** Shared joystick state written by the HUD joystick and polled by the input loop each frame. */
export const joystick = { x: 0, y: 0, active: false };

export function setJoystick(x: number, y: number, active: boolean) {
  joystick.x = x;
  joystick.y = y;
  joystick.active = active;
}
