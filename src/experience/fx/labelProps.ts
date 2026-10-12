import type { Object3D } from "three";

/** One in-world label for `BatchedLabels` (all labels of a floor in one draw call). */
export interface BatchedLabel {
  text: string;
  /** Relative to the `BatchedLabels` group. */
  position: [number, number, number];
  /** Radians around the vertical axis; 0 faces +z. Batched labels cannot billboard. */
  yaw?: number;
  /** Lean back (radians), for console screens. */
  tilt?: number;
  font: string;
  fontSize: number;
  color: string;
  anchorX?: "left" | "center" | "right";
  anchorY?: "top" | "middle" | "bottom";
  textAlign?: "left" | "center" | "right";
  maxWidth?: number;
  lineHeight?: number;
  letterSpacing?: number;
}

/** The troika `Text` fields `applyLabel` writes (a plain object in tests). */
export interface LabelTarget extends Pick<Object3D, "position" | "rotation"> {
  text: string;
  font: string | null;
  fontSize: number;
  color: string | number | null;
  anchorX: "left" | "center" | "right";
  anchorY: "top" | "middle" | "bottom";
  textAlign: "left" | "center" | "right";
  maxWidth: number;
  lineHeight: number | "normal";
  letterSpacing: number;
}

/** Copies a label onto a troika `Text`: troika's defaults except a centered anchor. */
export function applyLabel(t: LabelTarget, l: BatchedLabel): void {
  t.text = l.text;
  t.font = l.font;
  t.fontSize = l.fontSize;
  t.color = l.color;
  t.anchorX = l.anchorX ?? "center";
  t.anchorY = l.anchorY ?? "middle";
  t.textAlign = l.textAlign ?? "left";
  t.maxWidth = l.maxWidth ?? Infinity;
  t.lineHeight = l.lineHeight ?? "normal";
  t.letterSpacing = l.letterSpacing ?? 0;
  t.position.set(l.position[0], l.position[1], l.position[2]);
  t.rotation.set(l.tilt ? -l.tilt : 0, l.yaw ?? 0, 0, "YXZ");
}
