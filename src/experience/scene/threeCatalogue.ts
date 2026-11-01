import { extend } from "@react-three/fiber";
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";

/**
 * The three.js classes the 3D tree renders as JSX elements (`<mesh>`, `<boxGeometry>`, ...; drei's `RoundedBox` adds
 * `<extrudeGeometry>`). R3F's `Canvas` would register the whole three namespace (`extend(THREE)`), which keeps every
 * three class on the first-frame path; the bun patch `patches/@react-three%2Ffiber@9.8.2.patch` drops that call, so a
 * new JSX element needs its class here (R3F throws "is not part of the THREE namespace" otherwise).
 * `tests/unit/three-catalogue.test.ts` keeps the list exact: every element the 3D files render, nothing unused.
 */
export const THREE_CATALOGUE = {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
};

let registered = false;

/** Registers THREE_CATALOGUE with R3F once; call it at module scope in every file that renders a `Canvas`. */
export function registerThreeCatalogue(): void {
  if (registered) return;
  registered = true;
  extend(THREE_CATALOGUE);
}
