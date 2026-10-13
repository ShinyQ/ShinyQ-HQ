import { Object3D, Quaternion, Vector3 } from "three";
import type { FloorId } from "@/content/schema";
import { renderProbe } from "../scene/renderProbe";

/**
 * Scene facts for Playwright (`window.__hq.probes`), written by scene components in `useFrame`, never
 * read during render. `flippedSigns`: `Readable` groups turned around because the camera is behind
 * them. `signs`: floating signs (`fx/FloatingSign.tsx`). `ghosts`: floors above the rover whose ghost slab is drawn this frame (none in first person).
 */
export const sceneProbes = {
  flippedSigns: 0,
  ghosts: {} as Partial<Record<FloorId, boolean>>,
  /** Floating signs drawn this frame per `FloatingSigns` group: text and how square it faces the camera (1 = square, below 0 = its back). */
  signs: {} as Record<string, { text: string; facing: number }[]>,
  /** Spectacle effects (L2 horizon, L3 reactor and waterfalls): their shader clock and the reactor ring angle; frozen under reduced motion. */
  spectacle: {} as Record<string, number>,
  /** Texts drawn flat on a floor right now (spectacle round: there should be none, `flatTexts`). */
  flatText: (): string[] => (renderProbe.scene ? flatTexts(renderProbe.scene) : []),
};

type TextLike = Object3D & { text?: unknown; textRenderInfo?: unknown; _members?: Map<Object3D & { text?: string }, unknown> };

const UP_DOT = 0.9;
const FRONT = new Vector3();
const Q = new Quaternion();

function shown(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * Every visible troika text (plain or a member of a BatchedText) whose face points up or down, so it
 * lies flat on a floor. Read by e2e/spectacle.spec.ts; a list of texts, none expected (the L1 hall sign
 * excepted until its gateway arch lands).
 */
export function flatTexts(root: Object3D): string[] {
  const out: string[] = [];
  root.updateMatrixWorld();
  root.traverse((o) => {
    const t = o as TextLike;
    if (!shown(t)) return;
    if (t._members instanceof Map) {
      t.getWorldQuaternion(Q);
      for (const member of t._members.keys()) {
        if (!member.text) continue;
        FRONT.set(0, 0, 1).applyQuaternion(member.quaternion).applyQuaternion(Q);
        if (Math.abs(FRONT.y) > UP_DOT) out.push(member.text);
      }
      return;
    }
    if (typeof t.text !== "string" || !t.text || t.textRenderInfo === undefined) return;
    t.getWorldQuaternion(Q);
    FRONT.set(0, 0, 1).applyQuaternion(Q);
    if (Math.abs(FRONT.y) > UP_DOT) out.push(t.text);
  });
  return out;
}
