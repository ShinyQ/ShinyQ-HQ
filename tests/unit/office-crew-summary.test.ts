import { describe, expect, it } from "vitest";
import { crewAnnouncement, crewLines } from "@/experience/floors/lobby/office/crewSummary";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { OFFICE_STATES, type OfficeSnapshotV1 } from "@/lib/office/protocol";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { statesB } from "../../e2e/office-fixtures";
import { makeT } from "../helpers/office-t";

const t = makeT(en.office);
const tId = makeT(id.office, "id");
const BUSY = OFFICE_FIXTURES.busy as OfficeSnapshotV1;
const view = (snapshot: OfficeSnapshotV1 = BUSY) => officeView({ status: "ready", snapshot });
const withDesk = (slot: number, patch: Partial<OfficeSnapshotV1["desks"][number]>) => view({ ...BUSY, desks: BUSY.desks.map((d) => (d.slot === slot ? { ...d, ...patch } : d)) });

describe("crew summary", () => {
  it("has one line per desk, off-duty desks included", () => {
    const lines = crewLines(view(), t, "en", OFFICE_FIXTURE_NOW);
    expect(lines).toHaveLength(5);
    expect(lines.every((l) => /^Desk [1-5]: /.test(l))).toBe(true);
    expect(lines[0]).toBe("Desk 1: Copilot is working, since 14 min");
    expect(lines[3]).toBe("Desk 4: Codex is waiting for Kurniadi, since 2 min");
    const b = crewLines(view(statesB(OFFICE_FIXTURE_NOW)), t, "en", OFFICE_FIXTURE_NOW);
    expect(b[4]).toBe("Desk 5: off duty");
  });

  it("reads naturally in Indonesian", () => {
    const lines = crewLines(view(), tId, "id", OFFICE_FIXTURE_NOW);
    expect(lines[3]).toBe("Meja 4: Codex sedang menunggu Kurniadi, sejak 2 mnt");
    expect(crewLines(view(statesB(OFFICE_FIXTURE_NOW)), tId, "id", OFFICE_FIXTURE_NOW)[4]).toBe("Meja 5: tidak bertugas");
  });

  it("drops the time for a sleeping office (no since)", () => {
    const off = officeView({ status: "offline", snapshot: BUSY });
    expect(crewLines(off, t, "en", OFFICE_FIXTURE_NOW)[0]).toBe("Desk 1: Copilot is asleep");
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

  it("does not announce a desk that went off duty", () => {
    const a = view();
    const gone = view({ ...BUSY, desks: BUSY.desks.filter((d) => d.slot !== 2) });
    expect(crewAnnouncement(a, gone, t)).toBeNull();
  });
});
