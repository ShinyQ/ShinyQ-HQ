"use client";

import { useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, SRGBColorSpace, Texture } from "three";
import atlas from "../../logo-atlas.json";
import { atlasTextureFlags, canDecodeAtlasBitmap, quadBuffers, type AtlasLayout, type LogoQuad } from "./logoAtlas";

/** Layout of the prebuilt logo atlas (scripts/logo-atlas.ts): every L1 wall logo, in the order of `wallLogoSrcs`. */
export const LOGO_ATLAS: AtlasLayout = atlas;

interface SharedAtlas {
  texture: Texture;
  users: number;
  ready: Promise<Texture>;
  released: boolean;
}

let shared: SharedAtlas | null = null;

const closeBitmap = (image: unknown) => {
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
};

/**
 * Decodes the atlas off the main thread into a straight-alpha, vertically flipped ImageBitmap: the
 * texels WebGL received from the canvas atlas, without the synchronous re-decode Chrome does when an
 * <img> is uploaded with straight alpha. Browsers without a reliable createImageBitmap (none, Safari
 * before 17, Firefox before 98: `canDecodeAtlasBitmap`) use the <img> and flipY.
 */
async function loadAtlasImage(texture: Texture): Promise<void> {
  const bitmap = canDecodeAtlasBitmap(typeof navigator === "undefined" ? undefined : navigator.userAgent, typeof createImageBitmap === "function");
  Object.assign(texture, atlasTextureFlags(bitmap));
  if (bitmap) {
    const response = await fetch(atlas.file);
    if (!response.ok) throw new Error(`logo atlas: HTTP ${response.status}`);
    texture.image = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none", imageOrientation: "flipY" });
    return;
  }
  const img = new Image();
  img.decoding = "async";
  img.src = atlas.file;
  await img.decode();
  texture.image = img;
}

/**
 * One texture for both walls, decoded before upload. Same texels and settings as the runtime canvas
 * atlas it replaces (sRGB, anisotropy 4, flipped rows, straight alpha, mipmaps).
 */
function acquire(): SharedAtlas {
  if (!shared) {
    const texture = new Texture();
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const entry: SharedAtlas = { texture, users: 0, released: false, ready: Promise.resolve(texture) };
    entry.ready = loadAtlasImage(texture).then(() => {
      if (entry.released) closeBitmap(texture.image);
      else texture.needsUpdate = true;
      return texture;
    });
    shared = entry;
  }
  shared.users++;
  return shared;
}

/** The last wall to unmount disposes the texture (the next mount loads it again, from the HTTP cache). */
function release(entry: SharedAtlas) {
  entry.users--;
  if (entry.users > 0) return;
  entry.released = true;
  entry.texture.dispose();
  closeBitmap(entry.texture.image);
  if (shared === entry) shared = null;
}

/** The shared logo atlas texture, or null until it has loaded (or when it failed to load). */
export function useLogoAtlas(): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let live = true;
    const entry = acquire();
    entry.ready.then(
      (t) => live && setTexture(t),
      () => undefined,
    );
    return () => {
      live = false;
      release(entry);
    };
  }, []);
  return texture;
}

/** Every logo on the skills wall as one mesh (one draw call) over the prebuilt logo atlas. */
export function LogoQuads({ quads, z = 0 }: { quads: LogoQuad[]; z?: number }) {
  const texture = useLogoAtlas();
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = quadBuffers(LOGO_ATLAS, quads, z);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [quads, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
