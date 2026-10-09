"use client";

import { useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace } from "three";
import { atlasLayout, quadBuffers, type LogoQuad } from "./logoAtlas";

/** Draws every logo into one canvas; failed images leave their cell empty. */
function useAtlasTexture(srcs: string[], cols: number, rows: number, cell: number) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const key = srcs.join("|");
  useEffect(() => {
    if (srcs.length === 0) return;
    let cancelled = false;
    let built: CanvasTexture | null = null;
    const canvas = document.createElement("canvas");
    canvas.width = cols * cell;
    canvas.height = rows * cell;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pad = Math.round(cell * 0.06);
    Promise.all(
      srcs.map(
        (src, i) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              const x = (i % cols) * cell;
              const y = Math.floor(i / cols) * cell;
              const box = cell - pad * 2;
              const scale = Math.min(box / (img.naturalWidth || box), box / (img.naturalHeight || box));
              const w = (img.naturalWidth || box) * scale;
              const h = (img.naturalHeight || box) * scale;
              ctx.drawImage(img, x + (cell - w) / 2, y + (cell - h) / 2, w, h);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
          }),
      ),
    ).then(() => {
      if (cancelled) return;
      built = new CanvasTexture(canvas);
      built.colorSpace = SRGBColorSpace;
      built.anisotropy = 4;
      setTexture(built);
    });
    return () => {
      cancelled = true;
      built?.dispose();
    };
    // `key` captures srcs; the layout numbers derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cols, rows, cell]);
  return texture;
}

/** Every logo on the skills wall as one mesh (one draw call) over a runtime canvas atlas. */
export function LogoQuads({ quads, z = 0 }: { quads: LogoQuad[]; z?: number }) {
  const layout = useMemo(() => atlasLayout(quads.map((q) => q.src), 128), [quads]);
  const texture = useAtlasTexture(layout.srcs, layout.cols, layout.rows, layout.cell);
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = quadBuffers(layout, quads, z);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [layout, quads, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
