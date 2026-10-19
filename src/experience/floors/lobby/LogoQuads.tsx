"use client";

import { useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, SRGBColorSpace, Texture } from "three";
import { LOGO_ATLAS_FILE } from "../../logo-atlas";
import { atlasFlipY, canDecodeAtlasBitmap, quadBuffers, type AtlasLayout, type LogoQuad } from "./logoAtlas";

// Only an ImageBitmap has close(); the <img> fallback has none.
const closeBitmap = (image: unknown) => (image as { close?: () => void } | null)?.close?.();

/**
 * Decodes the atlas off the main thread into a straight-alpha, vertically flipped ImageBitmap: the
 * texels WebGL received from the canvas atlas, without the synchronous re-decode Chrome does when an
 * <img> is uploaded with straight alpha. Browsers without a reliable createImageBitmap (none, Safari
 * before 17, Firefox before 98: `canDecodeAtlasBitmap`) use the <img> and flipY. Straight alpha is the
 * Texture default (premultiplyAlpha false). Runs in an effect, so `navigator` exists.
 */
async function loadAtlasImage(texture: Texture): Promise<void> {
  const bitmap = canDecodeAtlasBitmap(navigator.userAgent, typeof createImageBitmap === "function");
  texture.flipY = atlasFlipY(bitmap);
  if (bitmap) {
    // An error response is no image, so createImageBitmap rejects it like a failed fetch.
    texture.image = await createImageBitmap(await (await fetch(LOGO_ATLAS_FILE)).blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none", imageOrientation: "flipY" });
    return;
  }
  const img = new Image();
  img.src = LOGO_ATLAS_FILE;
  await img.decode();
  texture.image = img;
}

/**
 * The logo atlas texture both walls share (the Lobby calls this once and passes it down), decoded before
 * upload; null until it has loaded (or when it failed to load). Same texels and settings as the runtime
 * canvas atlas it replaces (sRGB, anisotropy 4, flipped rows, straight alpha, mipmaps). Unmounting
 * disposes it (the next mount loads it again, from the HTTP cache).
 */
export function useLogoAtlas(): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let live = true;
    const t = new Texture();
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    loadAtlasImage(t).then(
      () => {
        if (!live) return closeBitmap(t.image);
        t.needsUpdate = true;
        setTexture(t);
      },
      () => undefined,
    );
    return () => {
      live = false;
      t.dispose();
      closeBitmap(t.image);
    };
  }, []);
  return texture;
}

/**
 * Every logo on the skills wall as one mesh (one draw call) over the prebuilt logo atlas `texture`. `atlas`
 * is `atlasLayout(wallLogoSrcs(data))`, the order scripts/logo-atlas.ts drew the cells in.
 */
export function LogoQuads({ atlas, texture, quads, z = 0 }: { atlas: AtlasLayout; texture: Texture | null; quads: LogoQuad[]; z?: number }) {
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = quadBuffers(atlas, quads, z);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [atlas, quads, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
