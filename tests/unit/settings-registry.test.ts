import { describe, expect, it } from "vitest";
import { defineSetting, settingsByGroup, SETTING_GROUPS } from "@/hud/settings/registry";

const noop = () => () => {};
const toggle = (id: string, group: "general" | "display" | "sound", order: number, available?: () => boolean) =>
  defineSetting({ id, group, order, labelKey: `${id}.label`, control: { kind: "toggle", get: () => true, set: () => {} }, subscribe: noop, available });

describe("settings registry", () => {
  it("groups in a fixed order, sorts by order and drops unavailable rows and empty groups", () => {
    const out = settingsByGroup([toggle("b", "sound", 20), toggle("a", "sound", 10), toggle("x", "general", 10, () => false)]);
    expect(out.map((g) => g.group)).toEqual(["sound"]);
    expect(out[0].items.map((d) => d.id)).toEqual(["a", "b"]);
    expect(SETTING_GROUPS).toEqual(["general", "display", "sound"]);
  });
  it("rejects duplicate ids", () => {
    expect(() => settingsByGroup([toggle("a", "sound", 10), toggle("a", "display", 10)])).toThrow(/duplicate/i);
  });
});
