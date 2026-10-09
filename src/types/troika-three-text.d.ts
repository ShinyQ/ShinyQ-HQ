// troika-three-text ships no type entry for its ESM build; we only use configureTextBuilder.
declare module "troika-three-text" {
  export function configureTextBuilder(config: { useWorker?: boolean; defaultFontURL?: string; sdfGlyphSize?: number; textureWidth?: number }): void;
}
