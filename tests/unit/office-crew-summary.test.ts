import { describe, expect, it } from "vitest";
import { crewAnnouncement, crewLines } from "@/experience/floors/lobby/office/crewSummary";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES, OFFICE_FIXTURES_V2 } from "@/lib/office/fixtures";
import type { OfficeFeedSnapshot } from "@/lib/office/poll";
import { OFFICE_STATES, type OfficeSnapshotV1 } from "@/lib/office/protocol";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { statesB } from "../../e2e/office-fixtures";
import { makeT } from "../helpers/office-t";

const t = makeT(en.office);
const tId = makeT(id.office, "id");
const BUSY = OFFICE_FIXTURES.busy as OfficeSnapshotV1;
const view = (snapshot: OfficeSnapshotV1 = BUSY) => officeView({ status: "ready", snapshot });
const clock = (ms: number | null, locale = "en") => new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(ms!);
const sinceOf = (slot: number) => BUSY.desks.find((d) => d.slot === slot)!.since;
const withMode = (mode: OfficeSnapshotV1["mode"]) => view({ ...BUSY, mode });
const offline = () => officeView({ status: "offline", snapshot: BUSY });
const withDesk = (slot: number, patch: Partial<OfficeSnapshotV1["desks"][number]>) => view({ ...BUSY, desks: BUSY.desks.map((d) => (d.slot === slot ? { ...d, ...patch } : d)) });

describe("crew summary", () => {
  it("has one line per desk, off-duty desks included", () => {
    const lines = crewLines(view(), t, "en");
    expect(lines).toHaveLength(10);
    expect(lines.map((l) => /^Desk (\d+): /.exec(l)?.[1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(lines.slice(5).every((l) => / off duty$/.test(l))).toBe(true);
    expect(lines[0]).toBe(`Desk 1: Copilot is working, since ${clock(sinceOf(0))}`);
    expect(lines[3]).toBe(`Desk 4: Codex is waiting for Kurniadi, since ${clock(sinceOf(3))}`);
    expect(lines[0]).not.toMatch(/min|ago|just now/);
    const b = crewLines(view(statesB(OFFICE_FIXTURE_NOW)), t, "en");
    expect(b[4]).toBe("Desk 5: off duty");
  });

  it("reads naturally in Indonesian", () => {
    const lines = crewLines(view(), tId, "id");
    expect(lines[3]).toBe(`Meja 4: Codex sedang menunggu Kurniadi, sejak ${clock(sinceOf(3), "id")}`);
    expect(clock(Date.UTC(2026, 0, 1, 14, 2), "id")).toMatch(/^\d{2}\.\d{2}$/);
    expect(crewLines(view(statesB(OFFICE_FIXTURE_NOW)), tId, "id")[4]).toBe("Meja 5: tidak bertugas");
  });

  it("says how many helpers an awake desk has, in both locales", () => {
    const v2 = OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot;
    const helpers = officeView({ status: "ready", snapshot: v2 });
    expect(crewLines(helpers, t, "en")[0]).toBe(`Desk 1: Copilot is working with 3 helpers, since ${clock(sinceOf(0))}`);
    expect(crewLines(helpers, t, "en")[2]).toMatch(/^Desk 3: Copilot is waiting on CI with 6 helpers, since /);
    expect(crewLines(helpers, t, "en")[1]).toBe(`Desk 2: Claude is thinking, since ${clock(sinceOf(1))}`);
    expect(crewLines(helpers, tId, "id")[0]).toBe(`Meja 1: Copilot sedang bekerja dengan 3 asisten, sejak ${clock(sinceOf(0), "id")}`);
    const one = officeView({ status: "ready", snapshot: { ...v2, desks: v2.desks.map((d) => (d.slot === 0 ? { ...d, helpers: 1 } : d)) } });
    expect(crewLines(one, t, "en")[0]).toMatch(/^Desk 1: Copilot is working with 1 helper, since /);
    expect(crewLines(officeView({ status: "offline", snapshot: v2 }), t, "en")[0]).toBe("Desk 1: Copilot is asleep");
  });

  it("drops the time for a sleeping office (no since)", () => {
    expect(crewLines(offline(), t, "en")[0]).toBe("Desk 1: Copilot is asleep");
  });

  it("has a phrase for every state in both locales", () => {
    for (const tr of [t, tId]) for (const s of OFFICE_STATES) expect(tr(`3d.crew.state.${s}`)).not.toMatch(/office\.3d/);
  });

  it("announces only state changes", () => {
    const a = view();
    const b = withDesk(0, { state: "input", activity: "asking" });
    expect(crewAnnouncement(null, a, t)).toBeNull();
    expect(crewAnnouncement(a, a, t)).toBeNull();
    expect(crewAnnouncement(a, b, t)).toBe("Desk 1: Copilot is now waiting for Kurniadi.");
    expect(crewAnnouncement(a, b, tId)).toBe("Meja 1: Copilot kini sedang menunggu Kurniadi.");
  });

  it("ignores activity, title and time-only refreshes, and joins several changes", () => {
    const a = view();
    expect(crewAnnouncement(a, withDesk(0, { activity: "reading", title: "Other", since: OFFICE_FIXTURE_NOW }), t)).toBeNull();
    const both = view({ ...BUSY, desks: BUSY.desks.map((d) => (d.slot === 1 ? { ...d, state: "working" as const } : d.slot === 4 ? { ...d, state: "asleep" as const } : d)) });
    expect(crewAnnouncement(a, both, t)).toBe("Desk 2: Claude is now working. Desk 5: Claude is now asleep.");
  });

  it("says one sentence when the mode changes, never one per desk", () => {
    const live = view();
    const cases = [
      [live, offline(), "The office went offline. Every Rover is asleep.", "Kantor sedang offline. Semua Rover tidur."],
      [live, withMode("off"), "The office is resting.", "Kantor sedang istirahat."],
      [live, withMode("semi-live"), "No agent is reporting right now.", "Belum ada agen yang melapor."],
      [offline(), live, "The office is live again.", "Kantor kembali live."],
      [withMode("off"), withDesk(0, { state: "input" }), "The office is live again.", "Kantor kembali live."],
    ] as const;
    for (const [a, b, en, idText] of cases) {
      expect(a.mode).not.toBe(b.mode);
      expect(crewAnnouncement(a, b, t)).toBe(en);
      expect(crewAnnouncement(a, b, tId)).toBe(idText);
    }
  });

  it("announces desk changes only while the mode stays the same", () => {
    expect(crewAnnouncement(offline(), offline(), t)).toBeNull();
    expect(crewAnnouncement(withMode("semi-live"), withMode("semi-live"), t)).toBeNull();
    expect(crewAnnouncement(view(), withDesk(0, { state: "input" }), t)).toBe("Desk 1: Copilot is now waiting for Kurniadi.");
  });

  it("does not announce a desk that went off duty", () => {
    const a = view();
    const gone = view({ ...BUSY, desks: BUSY.desks.filter((d) => d.slot !== 2) });
    expect(crewAnnouncement(a, gone, t)).toBeNull();
  });
});
