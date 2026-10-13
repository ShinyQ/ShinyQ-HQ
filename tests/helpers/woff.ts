import { inflateSync } from "node:zlib";

/** Tables of a WOFF 1.0 font (zlib per table), keyed by tag. */
export function woffTables(file: Buffer): Map<string, Buffer> {
  if (file.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF 1.0 file");
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < file.readUInt16BE(12); i++) {
    const at = 44 + i * 20;
    const tag = file.toString("latin1", at, at + 4);
    const offset = file.readUInt32BE(at + 4);
    const compLength = file.readUInt32BE(at + 8);
    const origLength = file.readUInt32BE(at + 12);
    const raw = file.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? inflateSync(raw) : raw);
  }
  return tables;
}

/** Code points mapped by a cmap table (format 4 and 12 subtables). */
export function cmapCodePoints(table: Buffer): Set<number> {
  const points = new Set<number>();
  for (let r = 0; r < table.readUInt16BE(2); r++) {
    const sub = table.subarray(table.readUInt32BE(4 + r * 8 + 4));
    const format = sub.readUInt16BE(0);
    if (format === 4) {
      const segs = sub.readUInt16BE(6) / 2;
      for (let s = 0; s < segs; s++) {
        const end = sub.readUInt16BE(14 + s * 2);
        const start = sub.readUInt16BE(16 + segs * 2 + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) points.add(c);
      }
    } else if (format === 12) {
      for (let g = 0; g < sub.readUInt32BE(12); g++) {
        for (let c = sub.readUInt32BE(16 + g * 12); c <= sub.readUInt32BE(20 + g * 12); c++) points.add(c);
      }
    }
  }
  return points;
}

export const woffCodePoints = (file: Buffer) => cmapCodePoints(woffTables(file).get("cmap")!);
