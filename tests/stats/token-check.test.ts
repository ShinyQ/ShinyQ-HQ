import { describe, expect, it } from "vitest";
import { readRestProbe, readSettingsProbe, readSqlProbe } from "../../scripts/stats-token-check";

const settings = (dataset: unknown) => ({ data: { viewer: { accounts: [{ settings: { rumPageloadEventsAdaptiveGroups: dataset } }] } }, errors: null });
const GOOD = { enabled: true, maxDuration: 8_035_200, maxPageSize: 10_000, notOlderThan: 15_897_600 };

describe("stats token checks", () => {
  it("accepts a token that can read Web Analytics with the limits the Worker needs", () => {
    const result = readSettingsProbe(200, settings([GOOD]));
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Web Analytics readable: maxDuration 93 days, maxPageSize 10000, history 184 days.");
    expect(readSettingsProbe(200, settings(GOOD)).ok).toBe(true);
  });

  it.each([
    [401, {}, "HTTP 401"],
    [200, null, "no JSON body"],
    [200, { data: null, errors: [{ message: "not authorized" }] }, "the API answered with errors"],
    [200, settings(null), "no settings"],
    [200, settings([{ ...GOOD, enabled: false }]), "not enabled"],
    [200, settings([{ ...GOOD, maxDuration: 86_400 }]), "limits too small"],
  ])("fails loudly on HTTP %i (%j)", (status, body, why) => {
    const result = readSettingsProbe(status, body);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("CF_EVAL_TOKEN cannot read Web Analytics");
    expect(result.message).toContain(why);
    expect(result.message).toContain("Account Analytics > Read");
  });

  it("checks Analytics Engine SQL access", () => {
    expect(readSqlProbe(200).ok).toBe(true);
    expect(readSqlProbe(403)).toEqual({ ok: false, message: expect.stringContaining("HTTP 403") });
  });

  it("names the missing deploy permission and the fallback", () => {
    expect(readRestProbe(200, { success: true }, "Workers Scripts (read)").ok).toBe(true);
    const missing = readRestProbe(403, { success: false, errors: [{ code: 10000 }] }, "Workers Scripts (read)");
    expect(missing.ok).toBe(false);
    expect(missing.message).toContain("Account > Workers Scripts Edit");
    expect(missing.message).toContain("STATS_WORKER_DEPLOY");
  });
});
