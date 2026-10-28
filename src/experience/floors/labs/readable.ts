import type { Wing } from "@/content/schema";
import { signPlate, type SignSpec } from "../../fx/signLayout";
import { headingTo, type Readable } from "../../readable";
import type { Vec2 } from "../../types";
import { interWidth } from "../../fx/interWidth";
import { fitTitle, panelRows, PANEL, textWidth, wrapWords } from "./directory";
import { LABS, LABS_WINGS, type LabsLayout } from "./layout";
import { OPS, opsFrame, type OpsPlacement } from "./ops";
import { reactorStop } from "./techReactor";

/**
 * As the L3 chunk draws them (copies: the runtime keeps its own literals, so this test-only list stays off every bundle).
 * Pod titles over each pod (`Pods.tsx`): height over the pod walls, type size and wrap width; hero pods get the larger set.
 */
export const POD_LABEL = {
  hero: { lift: 2.3, fontSize: 0.62, maxWidth: 9 },
  pod: { lift: 1.7, fontSize: 0.46, maxWidth: 7 },
} as const;
/** The Ops Control Room's floating sign (`OpsRoom.tsx`): type size. */
export const OPS_SIGN_FONT = 0.6;

/** The Ops Control Room's sign over its back wall, clear of the screens as seen from the wing road (plate middle, as `OpsRoom.tsx` places it). */
export function opsSign(ops: OpsPlacement, text: string): Pick<SignSpec, "text" | "x" | "y" | "z" | "fontSize"> {
  const { h } = signPlate({ text, fontSize: OPS_SIGN_FONT });
  const f = opsFrame(ops);
  return { text, x: ops.center.x, y: OPS.h + 1 + h / 2, z: f.back - f.n * 0.6, fontSize: OPS_SIGN_FONT };
}

/** Widest line of a pod title wrapped at its `maxWidth` (u; the bold cut runs about 5 percent wider than Inter 400). */
function podTitleWidth(title: string, s: (typeof POD_LABEL)[keyof typeof POD_LABEL]): number {
  const bold = 1.05;
  return Math.max(...wrapWords(title, s.maxWidth / (s.fontSize * bold)).map((line) => interWidth(line) * s.fontSize * bold));
}

/**
 * Every L3 title and name with the pose a visitor reads it from (the phone reading rule, `src/experience/readable.ts`):
 * each directory board's title from its board stop, each pod's name from its door, the Ops sign from its door, and the
 * reactor's ring names and count sign (`reactorSigns`, as drawn on portrait phones) from the reactor stop.
 */
export function readableLabels({
  layout,
  wings,
  reactor,
  ops,
}: {
  layout: LabsLayout;
  wings: Record<Wing, string>;
  /** `reactorSigns(...)` (ReactorCore.tsx) with a tech picked so the count sign shows, as drawn on desktops and on portrait phones. */
  reactor: { desktop: readonly SignSpec[]; phone: readonly SignSpec[] };
  ops: string;
}): Readable[] {
  const out: Readable[] = [];
  const rows = panelRows();
  for (const wing of LABS_WINGS) {
    const b = layout.boards[wing];
    const title = fitTitle(wings[wing], textWidth());
    const front = LABS.board.w / 2 + PANEL.out;
    out.push({
      id: `board:${wing}`,
      text: title.text,
      at: [b.center.x + b.normal.x * front, rows.titleTop - title.size / 2, b.center.z + b.normal.z * front],
      fontSize: title.size,
      width: title.text.length * 0.6 * title.size,
      yaw: b.yaw,
      flips: true,
      reading: { at: b.stop, heading: headingTo(b.stop, b.center) },
    });
  }
  for (const p of layout.placed) {
    const s = p.pod.tier === "hero" ? POD_LABEL.hero : POD_LABEL.pod;
    out.push({ id: `pod:${p.pod.slug}`, text: p.pod.title, at: [p.center.x, LABS.wallHeight + s.lift + s.fontSize * 0.575, p.center.z], fontSize: s.fontSize, width: podTitleWidth(p.pod.title, s), billboard: true, reading: { at: p.door, heading: headingTo(p.door, p.center) } });
  }
  const sign = opsSign(layout.ops, ops);
  out.push({ id: "ops:sign", text: sign.text, at: [sign.x, sign.y, sign.z], fontSize: sign.fontSize, width: signPlate(sign).w, reading: { at: layout.ops.door, heading: headingTo(layout.ops.door, layout.ops.center) } });
  const c: Vec2 = layout.reactor.center;
  const stop = reactorStop(c);
  const desktop = reactor.desktop;
  reactor.phone.forEach((r, i) =>
    out.push({
      id: `reactor:${i}`,
      text: r.text,
      at: [c.x + r.x, r.y, c.z + r.z],
      fontSize: desktop[i].fontSize,
      ...(r.fontSize !== desktop[i].fontSize && { phoneFontSize: r.fontSize }),
      width: signPlate(desktop[i]).w,
      phoneWidth: signPlate(r).w,
      reading: { at: stop, heading: headingTo(stop, c) },
    }),
  );
  return out;
}
