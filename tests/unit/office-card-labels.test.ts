import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { fill } from "@/components/office/labels";
import { hasFirstPerson } from "@/lib/first-person";

describe("office card copy", () => {
  it("has the same classic keys in EN and ID, no em dash, no first person in the title", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v).map((s) => `${k}.${s}`) : [k]));
    expect(keys(id.office.classic)).toEqual(keys(en.office.classic));
    for (const text of [JSON.stringify(en.office.classic), JSON.stringify(id.office.classic)]) expect(text).not.toContain("\u2014");
    expect(hasFirstPerson(en.office.classic.title, "en")).toBe(false);
    expect(hasFirstPerson(id.office.classic.title, "id")).toBe(false);
  });

  it("fills named placeholders and leaves unknown ones", () => {
    expect(fill("Today: {tasks} tasks, {prs} PRs", { tasks: 9, prs: 7 })).toBe("Today: 9 tasks, 7 PRs");
    expect(fill("{a} and {b}", { a: "x" })).toBe("x and {b}");
  });
});
