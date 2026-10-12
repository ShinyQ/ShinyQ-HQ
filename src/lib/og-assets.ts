/**
 * Inputs of the OG renderer, read at build time only (server route, never a client chunk): the
 * committed tower stills and the owner's photo (public/og-assets, `bun run og:stills`) and pod
 * covers (public/media), resized with sharp to twice their drawn size and inlined as data URLs.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { OG_PHOTO_PATH, type OgStill, ogStillPath } from "@/lib/og-layout";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const cache = new Map<string, Promise<string>>();

function memo(key: string, make: () => Promise<string>): Promise<string> {
  let value = cache.get(key);
  if (!value) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

const dataUrl = (bytes: Buffer, type: string) => `data:${type};base64,${bytes.toString("base64")}`;
const publicFile = (publicPath: string) => path.join(PUBLIC_DIR, publicPath.replace(/^\//, ""));

export function loadStill(still: OgStill): Promise<string> {
  return memo(`still:${still}`, async () => dataUrl(await readFile(publicFile(ogStillPath(still))), "image/jpeg"));
}

export function loadPhoto(size: number): Promise<string> {
  return memo(`photo:${size}`, async () =>
    dataUrl(await sharp(publicFile(OG_PHOTO_PATH)).resize(size * 2, size * 2, { fit: "cover" }).png().toBuffer(), "image/png"),
  );
}

export function loadShot(src: string, width: number, height: number): Promise<string> {
  if (!/^\/media\/[a-z0-9-]+\/[\w.-]+\.(webp|png|jpe?g)$/.test(src)) throw new Error(`OG screenshot must be a pod gallery image under /media: ${src}`);
  return memo(`shot:${src}:${width}x${height}`, async () =>
    dataUrl(
      await sharp(publicFile(src)).resize(width * 2, height * 2, { fit: "cover", position: "top" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
      "image/jpeg",
    ),
  );
}
