import { expect } from "vitest";
import { spaceViolations, SPACE_RULES, type SpaceInput, type SpaceRules } from "@/experience/nav/space";

/**
 * Asserts the walkable-floor space rules (src/experience/nav/space.ts) on a floor layout. Use it in
 * every layout test of a floor with a road network:
 *
 *   expectSpaceRules({ bounds, obstacles, doors, network, start: approach });
 *
 * Fails with one line per violated rule, so a layout change shows exactly what got too tight.
 */
export function expectSpaceRules(input: SpaceInput, rules: Partial<SpaceRules> = {}) {
  const violations = spaceViolations(input, { ...SPACE_RULES, ...rules });
  expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
}
