/**
 * Builds src/lib/visits/geo-data.ts for the visits dot map and globe:
 * a packed land grid and one label point per country, both from
 * Natural Earth (public domain, naturalearthdata.com).
 *
 * Run: bun scripts/visits-geo.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const LAND_URL = `${BASE}/ne_110m_land.geojson`;
const COUNTRIES_URL = `${BASE}/ne_50m_admin_0_countries.geojson`;
const OUT = join(import.meta.dir, "..", "src", "lib", "visits", "geo-data.ts");

const COLS = 96;
const ROWS = 48;
const MIN_LAT = -60;

type Ring = number[][];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };
interface Feature {
  properties: Record<string, unknown>;
  geometry: Geometry | null;
}
interface Collection {
  features: Feature[];
}

interface Poly {
  rings: Ring[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Known points for small states the 50m file may not label. */
const FALLBACKS: Record<string, [number, number]> = {
  BQ: [12.2, -68.3],
  SG: [1.35, 103.8],
  HK: [22.3, 114.2],
  MO: [22.2, 113.5],
  BH: [26.1, 50.6],
  MT: [35.9, 14.4],
  MV: [3.2, 73.2],
  MU: [-20.3, 57.6],
  SC: [-4.7, 55.5],
  BB: [13.2, -59.5],
  LC: [13.9, -61],
  VC: [13.3, -61.2],
  GD: [12.1, -61.7],
  AG: [17.1, -61.8],
  KN: [17.3, -62.7],
  DM: [15.4, -61.4],
  TO: [-21.2, -175.2],
  WS: [-13.8, -172.1],
  KI: [1.4, 173],
  FM: [6.9, 158.2],
  MH: [7.1, 171.4],
  PW: [7.5, 134.6],
  NR: [-0.5, 166.9],
  TV: [-8.5, 179.2],
  AD: [42.5, 1.6],
  MC: [43.7, 7.4],
  SM: [43.9, 12.5],
  LI: [47.2, 9.6],
  VA: [41.9, 12.5],
};

const OVERRIDES: Record<string, [number, number]> = {
  ID: [-2.5, 118],
};

async function fetchJson(url: string): Promise<Collection> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as Collection;
}

function polygonsOf(geometry: Geometry | null): Ring[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function toPoly(rings: Ring[]): Poly {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { rings, minX, maxX, minY, maxY };
}

/** Even-odd ray casting over every ring, so holes subtract. */
function insidePoly(poly: Poly, x: number, y: number): boolean {
  if (x < poly.minX || x > poly.maxX || y < poly.minY || y > poly.maxY) {
    return false;
  }
  let inside = false;
  for (const ring of poly.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function round1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function isoCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : null;
}

/** Vertex average of the feature's largest outer ring. */
function centroid(geometry: Geometry | null): [number, number] | null {
  let best: Ring | null = null;
  for (const rings of polygonsOf(geometry)) {
    const outer = rings[0];
    if (outer && (!best || outer.length > best.length)) best = outer;
  }
  if (!best || best.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of best) {
    sx += x;
    sy += y;
  }
  return [sy / best.length, sx / best.length];
}

function buildLand(land: Collection): { bits: Uint8Array; count: number; total: number } {
  const polys: Poly[] = [];
  for (const feature of land.features) {
    for (const rings of polygonsOf(feature.geometry)) polys.push(toPoly(rings));
  }
  const isLandAt = (lon: number, lat: number) =>
    polys.some((poly) => insidePoly(poly, lon, lat));

  const cw = 360 / COLS;
  const ch = 180 / ROWS;
  const bits = new Uint8Array(Math.ceil((COLS * ROWS) / 8));
  let count = 0;
  let total = 0;
  for (let r = 0; r < ROWS; r++) {
    const lat = 90 - (r + 0.5) * ch;
    if (lat < MIN_LAT) continue;
    for (let c = 0; c < COLS; c++) {
      total++;
      const lon = -180 + (c + 0.5) * cw;
      let land = isLandAt(lon, lat);
      if (!land) {
        let hits = 0;
        for (const dx of [-0.25, 0.25]) {
          for (const dy of [-0.25, 0.25]) {
            if (isLandAt(lon + dx * cw, lat + dy * ch)) hits++;
          }
        }
        land = hits >= 2;
      }
      if (land) {
        const i = r * COLS + c;
        bits[i >> 3] |= 1 << (i & 7);
        count++;
      }
    }
  }
  return { bits, count, total };
}

function buildPoints(countries: Collection): Record<string, [number, number]> {
  const points: Record<string, [number, number]> = {};
  const centroids: Record<string, [number, number]> = {};
  for (const feature of countries.features) {
    const p = feature.properties;
    const code = isoCode(p.ISO_A2_EH) ?? isoCode(p.ISO_A2);
    if (!code) continue;
    const c = centroid(feature.geometry);
    if (c && !centroids[code]) centroids[code] = c;
    const y = p.LABEL_Y;
    const x = p.LABEL_X;
    if (typeof y === "number" && typeof x === "number" && !points[code]) {
      points[code] = [round1(y), round1(x)];
    }
  }
  for (const [code, point] of Object.entries(FALLBACKS)) {
    if (points[code]) continue;
    const c = code === "BQ" ? null : centroids[code];
    points[code] = c ? [round1(c[0]), round1(c[1])] : point;
  }
  Object.assign(points, OVERRIDES);
  return points;
}

function render(bits: string, points: Record<string, [number, number]>): string {
  const entries = Object.keys(points)
    .sort()
    .map((code) => `${JSON.stringify(code)}: [${points[code][0]}, ${points[code][1]}]`);
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i += 6) {
    lines.push(`  ${entries.slice(i, i + 6).join(", ")},`);
  }
  return [
    "// Generated by `bun scripts/visits-geo.ts` from Natural Earth (public domain,",
    "// naturalearthdata.com). Do not edit by hand.",
    "",
    `export const LAND = { cols: ${COLS}, rows: ${ROWS}, bits: ${JSON.stringify(bits)} } as const;`,
    "",
    "export const COUNTRY_POINTS: Readonly<Record<string, readonly [number, number]>> = {",
    ...lines,
    "};",
    "",
  ].join("\n");
}

async function main() {
  const [land, countries] = await Promise.all([
    fetchJson(LAND_URL),
    fetchJson(COUNTRIES_URL),
  ]);
  const grid = buildLand(land);
  const points = buildPoints(countries);
  const bits = Buffer.from(grid.bits).toString("base64");
  writeFileSync(OUT, render(bits, points));
  const share = ((grid.count / grid.total) * 100).toFixed(1);
  console.log(`land cells: ${grid.count} of ${grid.total} north of ${MIN_LAT} (${share}%)`);
  console.log(`countries: ${Object.keys(points).length}`);
  console.log(`wrote ${OUT}`);
}

await main();
