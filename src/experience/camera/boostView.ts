/**
 * Camera response to the boost (pure): third person widens the field of view and pulls the follow
 * distance back a little; first person gets a smaller FOV kick (the streaks carry the rest). The level
 * is already eased by the Director and the camera springs its FOV and pose, so there is no shake.
 */
export const BOOST_VIEW = {
  /** FOV kick at boost level 1 (degrees). */
  fovThird: 7,
  fovFirst: 3,
  /** Follow distance grows by this share at boost level 1 (applied before the collision clamp). */
  pull: 0.08,
};

export interface BoostViewOut {
  fovKick: number;
  pull: number;
}

const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

/** Writes the FOV kick (degrees) and the zoom factor for `level` (0 to 1) and the first-person `blend` into `out`. */
export function boostView(level: number, blend: number, enabled: boolean, out: BoostViewOut): BoostViewOut {
  if (!enabled || level <= 0) {
    out.fovKick = 0;
    out.pull = 1;
    return out;
  }
  const k = smooth(level);
  const b = Math.max(0, Math.min(1, blend));
  out.fovKick = k * (BOOST_VIEW.fovThird + (BOOST_VIEW.fovFirst - BOOST_VIEW.fovThird) * b);
  out.pull = 1 + BOOST_VIEW.pull * k * (1 - b);
  return out;
}
