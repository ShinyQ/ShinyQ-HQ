import { COUNTRY_POINTS, LAND } from "./geo-data";

export interface LatLon {
  lat: number;
  lon: number;
}

const MIN_LAT = -60;
const LAT_SPAN = 90 - MIN_LAT;

let decoded: Uint8Array | null = null;

function landBits(): Uint8Array {
  if (decoded) return decoded;
  const raw = atob(LAND.bits);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  decoded = bytes;
  return bytes;
}

function cellCenter(col: number, row: number): LatLon {
  return {
    lat: 90 - ((row + 0.5) * 180) / LAND.rows,
    lon: -180 + ((col + 0.5) * 360) / LAND.cols,
  };
}

/** Decoded land bits (cached). */
export function isLand(col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= LAND.cols || row >= LAND.rows) return false;
  const i = row * LAND.cols + col;
  return ((landBits()[i >> 3] >> (i & 7)) & 1) === 1;
}

/** Land cell centers, row-major north to south; `step` keeps every step-th column (lite tier). */
export function landCells(step = 1): LatLon[] {
  const every = Math.max(1, Math.floor(step));
  const cells: LatLon[] = [];
  for (let row = 0; row < LAND.rows; row++) {
    for (let col = 0; col < LAND.cols; col += every) {
      if (isLand(col, row)) cells.push(cellCenter(col, row));
    }
  }
  return cells;
}

/** [lat, lon] of a country's label point, case-insensitive ISO 3166-1 alpha-2 code. */
export function countryPoint(code: string): readonly [number, number] | null {
  return COUNTRY_POINTS[code.toUpperCase()] ?? null;
}

/** Point on a sphere of radius r: y up, lon 0 / lat 0 on +z, lon +90 on +x (so a group rotated by yaw = -lon * PI/180 turns that longitude toward +z). */
export function latLonToVec3(lat: number, lon: number, r: number): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const ring = r * Math.cos(phi);
  return [ring * Math.sin(lambda), r * Math.sin(phi), ring * Math.cos(lambda)];
}

/** Equirectangular projection to an SVG box of width w and height h (lat clipped to [-60, 90] mapped over the full height: y = (90 - lat) / 150 * h). */
export function project(lat: number, lon: number, w: number, h: number): [number, number] {
  const clipped = Math.min(90, Math.max(MIN_LAT, lat));
  return [((lon + 180) / 360) * w, ((90 - clipped) / LAT_SPAN) * h];
}

const fmt = (v: number) => String(Math.round(v * 10) / 10 || 0);

/** One SVG path of zero-length segments, one `M x yh0` per land cell (round caps draw the dots), coordinates rounded to 1 decimal, using `project`. */
export function dotMapPath(w: number, h: number): string {
  let d = "";
  for (const { lat, lon } of landCells()) {
    const [x, y] = project(lat, lon, w, h);
    d += `M${fmt(x)} ${fmt(y)}h0`;
  }
  return d;
}
