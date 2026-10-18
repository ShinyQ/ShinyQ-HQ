"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, MeshBasicMaterial, PlaneGeometry, Vector3, type Mesh, type PerspectiveCamera } from "three";
import { getHQStore } from "@/store/useHQStore";
import { decayVeil } from "../camera/intro";
import { useDispose } from "../fx/useDispose";
import { introRuntime } from "./runtime";

const NO_RAYCAST = () => null;
/** Distance of the veil in front of the camera (past the near plane). */
const VEIL_AHEAD = 0.5;
/** How much larger than the view the veil is, so no edge shows at any aspect or view offset. */
const VEIL_MARGIN = 1.25;
const ahead = new Vector3();

/**
 * A camera-facing quad in the scene's background color over the whole view: it fades the intro out after
 * a skip (`INTRO.skipFade`) and under reduced motion (`INTRO.reduced`, written by the CameraDirector).
 * Drawn last (render order), never depth tested, hidden while `introRuntime.veil` is 0.
 */
export function IntroVeil() {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(geometry);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: "#0a0a0f", transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    [],
  );
  useDispose(material);

  useFrame((three, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (getHQStore().getState().phase !== "intro" && introRuntime.veil > 0) introRuntime.veil = decayVeil(introRuntime.veil, dt);
    const veil = introRuntime.veil;
    m.visible = veil > 0.001;
    if (!m.visible) return;
    const camera = three.camera as PerspectiveCamera;
    const veilMaterial = m.material as MeshBasicMaterial;
    if (three.scene.background instanceof Color) veilMaterial.color.copy(three.scene.background);
    veilMaterial.opacity = veil;
    camera.getWorldDirection(ahead);
    m.position.copy(camera.position).addScaledVector(ahead, VEIL_AHEAD);
    m.quaternion.copy(camera.quaternion);
    const height = 2 * VEIL_AHEAD * Math.tan((camera.fov * Math.PI) / 360) * VEIL_MARGIN;
    m.scale.set(height * camera.aspect, height, 1);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={1e9} frustumCulled={false} raycast={NO_RAYCAST} visible={false} />;
}
