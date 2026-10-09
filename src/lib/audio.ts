/**
 * Sound stub for Phases 1 and 2: the HUD toggle and the `m` key persist the
 * setting in the store. The Web Audio wrapper arrives in Phase 6.
 */
let enabled = false;

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

export function isSoundEnabled() {
  return enabled;
}
