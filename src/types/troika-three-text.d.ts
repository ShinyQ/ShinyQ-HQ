// troika-three-text ships no type entry for its ESM build; we only use configureTextBuilder and
// patch GlyphsGeometry's instanceCount (src/experience/text-config.ts).
declare module "troika-three-text" {
  import type { InstancedBufferGeometry } from "three";

  export function configureTextBuilder(config: { useWorker?: boolean; defaultFontURL?: string; sdfGlyphSize?: number; textureWidth?: number }): void;
  export class GlyphsGeometry extends InstancedBufferGeometry {
    updateGlyphs(glyphBounds: Float32Array, glyphAtlasIndices: Float32Array, blockBounds: number[], chunkedBounds?: unknown[], glyphColors?: Uint8Array): void;
  }
}
