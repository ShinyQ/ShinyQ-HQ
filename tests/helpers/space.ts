import { expect } from "vitest";
import { padViolations, spaceViolations, SPACE_RULES, type PadSpaceInput, type SpaceInput, type SpaceRules } from "@/experience/nav/space";

/**
 * Asserts the walkable-floor space rules (src/experience/nav/space.ts) on a floor layout. Use it in
 * every layout test of a floor with a road network (pass `pads` to check the floor pads too):
 *
 *   expectSpaceRules({ bounds, obstacles, doors, network, start: approach, pads });
 *
 * Fails with one line per violated rule, so a layout change shows exactly what got too tight.
 */
export function expectSpaceRules(input: SpaceInput, rules: Partial<SpaceRules> = {}) {
  const violations = spaceViolations(input, { ...SPACE_RULES, ...rules });
  expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
}

/** Asserts only the pad rules, for floors with or without a road kit (L1, L4 and RF have none). */
export function expectPadRules(input: PadSpaceInput, rules: Partial<SpaceRules> = {}) {
  const violations = padViolations(input, { ...SPACE_RULES, ...rules });
  expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
}
