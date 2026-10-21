import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { fill } from "@/components/office/fill";
import { hasFirstPerson } from "@/lib/first-person";

describe("office card copy", () => {
  it("has the same classic keys in EN and ID, no em dash, no first person in the title", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v).map((s) => `${k}.${s}`) : [k]));
    expect(keys(id.office.classic)).toEqual(keys(en.office.classic));
    for (const text of [JSON.stringify(en.office.classic), JSON.stringify(id.office.classic)]) expect(text).not.toContain("\u2014");
    expect(hasFirstPerson(en.office.classic.title, "en")).toBe(false);
    expect(hasFirstPerson(id.office.classic.title, "id")).toBe(false);
  });

  it("has an offline line for a failed first request that promises no activity, and a today line without CI", () => {
    for (const m of [en, id]) {
      expect(m.office.classic.offlineEmpty).not.toBe(m.office.classic.offline);
      expect(m.office.classic.todayNoCi).not.toMatch(/\{green\}|\{runs\}|CI/);
      expect(m.office.classic.todayNoCi).toMatch(/\{tasks\b.*\{prs\b/);
    }
  });

  it("fills named placeholders and leaves unknown ones", () => {
    expect(fill("Today: {tasks} tasks, {prs} PRs", { tasks: 9, prs: 7 })).toBe("Today: 9 tasks, 7 PRs");
    expect(fill("{a} and {b}", { a: "x" })).toBe("x and {b}");
    expect(fill("{n, plural, one {# x} other {# xs}} and {b}", {})).toBe("{n, plural, one {# x} other {# xs}} and {b}");
  });

  it("fills ICU plurals: English singular for one, plural otherwise, and =N branches", () => {
    const f = "{n, plural, =0 {none} one {# item} other {# items}}";
    expect([0, 1, 2, 21].map((n) => fill(f, { n }))).toEqual(["none", "1 item", "2 items", "21 items"]);
    expect(fill("{n, plural, one {# sesi} other {# sesi}}", { n: 1 }, "id")).toBe("1 sesi");
  });

  it("fills the helpers count: one helper, 3 helpers, 3 asisten", () => {
    expect(fill(en.office.helpers, { n: 1 }, "en")).toBe("1 helper");
    expect(fill(en.office.helpers, { n: 3 }, "en")).toBe("3 helpers");
    expect(fill(id.office.helpers, { n: 1 }, "id")).toBe("1 asisten");
    expect(fill(id.office.helpers, { n: 3 }, "id")).toBe("3 asisten");
    for (const text of [en.office.helpers, id.office.helpers]) expect(text).not.toContain("\u2014");
  });

  it("says one session, task, PR and CI run in English and keeps Indonesian unchanged", () => {
    const c = en.office.classic;
    expect(fill(c.extra, { count: 1 }, "en")).toBe("+1 more session");
    expect(fill(c.extra, { count: 2 }, "en")).toBe("+2 more sessions");
    expect(fill(c.today, { tasks: 1, prs: 1, green: 1, runs: 1 }, "en")).toBe("Today: 1 task done, 1 PR merged, 1 of 1 CI run green");
    expect(fill(c.today, { tasks: 9, prs: 7, green: 13, runs: 14 }, "en")).toBe("Today: 9 tasks done, 7 PRs merged, 13 of 14 CI runs green");
    expect(fill(c.todayNoCi, { tasks: 1, prs: 0 }, "en")).toBe("Today: 1 task done, 0 PRs merged");
    expect(fill(id.office.classic.extra, { count: 1 }, "id")).toBe("+1 sesi lainnya");
    expect(fill(id.office.classic.today, { tasks: 1, prs: 1, green: 1, runs: 1 }, "id")).toBe("Hari ini: 1 tugas selesai, 1 PR di-merge, 1 dari 1 CI run hijau");
  });
});
