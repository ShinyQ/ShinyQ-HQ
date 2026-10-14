import { describe, expect, it } from "vitest";
import { buildOpsData } from "@/content/experience";
import { buildLabsLayout } from "@/experience/floors/labs/layout";
import { OPS, OPS_SCREENS, opsLabels, opsLines, opsLiveLabels, opsSolids } from "@/experience/floors/labs/ops";
import { opsLiveRows } from "@/experience/floors/labs/opsLive";
import { STATS_FIXTURE, STATS_FIXTURE_PERF } from "@/lib/visits/contract";
import en from "../../messages/en.json";

const live = buildOpsData("en").live;

describe("Ops Control Room live panel", () => {
  it("hides while loading, when hidden (missing, invalid or stale) and without a snapshot", () => {
    expect(opsLiveRows("idle", null, live, "en")).toBeNull();
    expect(opsLiveRows("loading", null, live, "en")).toBeNull();
    expect(opsLiveRows("hidden", null, live, "en")).toBeNull();
    expect(opsLiveRows("ready", null, live, "en")).toBeNull();
  });

  it("shows visits and the nightly runs line when the snapshot has no perf block", () => {
    const rows = opsLiveRows("ready", STATS_FIXTURE, live, "en")!;
    expect(rows.map((r) => r.label)).toEqual([en.production.live.visits, en.production.live.nightly]);
    expect(rows[1].value).toBe("");
  });

  it("adds the 55+ FPS share and the median explore bucket from the perf block", () => {
    const rows = opsLiveRows("ready", STATS_FIXTURE_PERF, live, "en")!;
    expect(rows.map((r) => r.label)).toEqual([en.production.live.visits, en.production.live.fps, en.production.live.explore, en.production.live.nightly]);
    expect(rows[1].value).toMatch(/^\d{1,3}%$/);
    expect(Object.values(en.production.explore)).toContain(rows[2].value);
  });
});

describe("Ops Control Room scene parts", () => {
  const ops = buildLabsLayout([]).ops;
  const data = buildOpsData("en");

  it("keeps every solid inside the footprint and under the tall column height", () => {
    for (const b of opsSolids(ops)) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(ops.rect.minX - 1e-9);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(ops.rect.maxX + 1e-9);
      expect(b.z - b.d / 2).toBeGreaterThanOrEqual(ops.rect.minZ - 1e-9);
      expect(b.z + b.d / 2).toBeLessThanOrEqual(ops.rect.maxZ + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(OPS.h + 1e-9);
    }
    for (const s of OPS_SCREENS) expect(s.y + s.h / 2).toBeLessThanOrEqual(OPS.h);
  });

  it("puts every proof tile on its screen and the alert families on the Alerts screen, upright", () => {
    const labels = opsLabels(ops, data);
    for (const tile of data.tiles) expect(labels.some((l) => l.text === tile.value)).toBe(true);
    for (const rule of data.alerts) expect(labels.some((l) => l.text === rule)).toBe(true);
    for (const l of [...labels, ...opsLiveLabels(ops, "This site, live", [{ label: "Visits", value: "12" }])]) {
      expect(l.yaw).toBe(0);
      expect(l.position[2]).toBeGreaterThan(ops.rect.minZ);
      expect(l.position[2]).toBeLessThan(ops.rect.maxZ);
    }
  });

  it("draws fewer lines on lite (rims and markers only)", () => {
    expect(opsLines(ops, "lite").length).toBeLessThan(opsLines(ops, "full").length);
  });
});
