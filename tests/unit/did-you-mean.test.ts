import { describe, expect, it } from "vitest";
import { editDistance, suggestRoute, type RouteEntry } from "@/lib/did-you-mean";

const routes: RouteEntry[] = [
  { p: "/en", t: "Kurniadi Ahmad Wijaya" },
  { p: "/id", t: "Kurniadi Ahmad Wijaya" },
  { p: "/en/labs", t: "Work" },
  { p: "/en/labs/voice-ai-contact-center", t: "Realtime Voice AI Contact Center" },
  { p: "/id/labs/voice-ai-contact-center", t: "Contact Center Voice AI Realtime" },
  { p: "/en/cv", t: "CV" },
];

describe("suggestRoute", () => {
  it("fixes a slug typo", () => expect(suggestRoute("/en/labs/voice-ai-contact-centre", routes)?.p).toBe("/en/labs/voice-ai-contact-center"));
  it("adds a missing locale (English by default)", () => expect(suggestRoute("/labs/voice-ai-contact-center", routes)?.p).toBe("/en/labs/voice-ai-contact-center"));
  it("keeps the requested locale", () => expect(suggestRoute("/id/labs/voice-ai-contact-centre", routes)?.p).toBe("/id/labs/voice-ai-contact-center"));
  it("ignores a trailing slash, a query and case", () => expect(suggestRoute("/EN/CV/?x=1", routes)?.p).toBe("/en/cv"));
  it("suggests nothing for a far-off path", () => expect(suggestRoute("/en/totally-unrelated-thing", routes)).toBeNull());
  it("suggests nothing for an existing page", () => expect(suggestRoute("/en/labs", routes)).toBeNull());
});

describe("editDistance", () => {
  it("counts single edits", () => {
    expect(editDistance("centre", "center")).toBe(2);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});
