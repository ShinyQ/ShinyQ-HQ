// troika-three-text ships no type entry for its ESM build. We use configureTextBuilder, patch
// GlyphsGeometry's instanceCount (src/experience/text-config.ts) and batch labels with BatchedText
// (src/experience/fx/BatchedLabels.tsx).
declare module "troika-three-text" {
  import type { InstancedBufferGeometry, Material, Mesh } from "three";

  export function configureTextBuilder(config: { useWorker?: boolean; defaultFontURL?: string; sdfGlyphSize?: number; textureWidth?: number }): void;
  export class GlyphsGeometry extends InstancedBufferGeometry {
    updateGlyphs(glyphBounds: Float32Array, glyphAtlasIndices: Float32Array, blockBounds: number[], chunkedBounds?: unknown[], glyphColors?: Uint8Array): void;
  }
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: string | number | null;
    // Narrowed to the values this repo uses (troika also accepts numbers and percentages).
    anchorX: "left" | "center" | "right";
    anchorY: "top" | "middle" | "bottom";
    textAlign: "left" | "right" | "center";
    maxWidth: number;
    lineHeight: number | "normal";
    letterSpacing: number;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
  }
  export class BatchedText extends Text {
    addText(text: Text): void;
    removeText(text: Text): void;
  }
}
