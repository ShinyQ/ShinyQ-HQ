import type { FaceFrame } from "./faces";

export const FACE_W = 128;
export const FACE_H = 96;

/** Draws the rover screen (appendix 03: 128 x 96, green on #03140e). */
export function drawFace(ctx: CanvasRenderingContext2D, frame: FaceFrame, fontFamily: string) {
  ctx.fillStyle = "#03140e";
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.fillStyle = "rgba(52, 211, 153, 0.07)";
  for (let y = 0; y < FACE_H; y += 3) ctx.fillRect(0, y, FACE_W, 1);
  ctx.fillStyle = "#34d399";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const [main, status] = frame.lines;
  ctx.font = `700 38px ${fontFamily}`;
  ctx.fillText(main, FACE_W / 2, status ? 38 : 48);
  if (status) {
    ctx.fillStyle = "#ecfdf5";
    ctx.font = `500 14px ${fontFamily}`;
    ctx.fillText(status, FACE_W / 2, 76);
  }
}

/** Soft radial blob used as the rover's contact shadow. */
export function drawBlob(ctx: CanvasRenderingContext2D, size: number) {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(0, 0, 0, 0.75)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}
