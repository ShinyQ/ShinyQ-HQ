import { describe, expect, it } from "vitest";
import { COUNTRY_POINTS, LAND } from "@/lib/visits/geo-data";
import {
  countryPoint,
  dotMapPath,
  isLand,
  landCells,
  latLonToVec3,
} from "@/lib/visits/geo";

function cellOf(lat: number, lon: number): [number, number] {
  const col = Math.floor(((lon + 180) / 360) * LAND.cols);
  const row = Math.floor(((90 - lat) / 180) * LAND.rows);
  return [col, row];
}

const landAt = (lat: number, lon: number) => isLand(...cellOf(lat, lon));

describe("visits geo data", () => {
  it("has a plausible land share north of -60", () => {
    let total = 0;
    let land = 0;
    for (let row = 0; row < LAND.rows; row++) {
      const lat = 90 - ((row + 0.5) * 180) / LAND.rows;
      if (lat < -60) continue;
      for (let col = 0; col < LAND.cols; col++) {
        total++;
        if (isLand(col, row)) land++;
      }
    }
    const share = land / total;
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.5);
  });

  it("marks cities as land and open oceans as sea", () => {
    expect(landAt(-6.2, 106.8)).toBe(true);
    expect(landAt(48.9, 2.35)).toBe(true);
    expect(landAt(-23.5, -46.6)).toBe(true);
    // Sydney sits on the top edge of a cell that is mostly sea (center -35.6, 151.9),
    // so its dot is the inland neighbour to the west.
    const [col, row] = cellOf(-33.9, 151.2);
    expect(isLand(col, row) || isLand(col - 1, row)).toBe(true);
    expect(landAt(0, -150)).toBe(false);
    expect(landAt(30, -40)).toBe(false);
  });

  it("has label points for every country", () => {
    expect(Object.keys(COUNTRY_POINTS).length).toBeGreaterThanOrEqual(230);
    for (const code of ["ID", "US", "SG", "DE", "JP", "GB", "IN", "AU", "BR", "NL", "MY", "BQ"]) {
      expect(COUNTRY_POINTS[code], code).toBeDefined();
    }
    expect(countryPoint("id")).toEqual([-2.5, 118]);
    expect(countryPoint("zz")).toBeNull();
  });

  it("draws one dot per land cell", () => {
    const cells = landCells();
    expect(dotMapPath(960, 400).match(/h0/g)?.length).toBe(cells.length);
    const lite = landCells(2).length;
    expect(lite).toBeGreaterThan(cells.length * 0.4);
    expect(lite).toBeLessThan(cells.length * 0.6);
  });

  it("places lat and lon on the sphere", () => {
    const [x, y, z] = latLonToVec3(0, 0, 1);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
    expect(latLonToVec3(90, 0, 1)[1]).toBeCloseTo(1);
    expect(latLonToVec3(0, 90, 1)[0]).toBeCloseTo(1);
  });
});
