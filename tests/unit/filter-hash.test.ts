import { describe, expect, it } from "vitest";
import { filterFromHash, filterHash } from "@/experience/floors/filterHash";
import { techFromHash, techHash } from "@/experience/floors/labs/techHash";

describe("floor filter deep links (#<key>=<slug>)", () => {
  it("reads a kebab slug for its own key only", () => {
    expect(filterFromHash("#library-topic=voice-ai", "library-topic")).toBe("voice-ai");
    expect(filterFromHash("library-topic=voice-ai", "library-topic")).toBe("voice-ai");
    expect(filterFromHash("#labs-tech=voice-ai", "library-topic")).toBeNull();
    expect(filterFromHash("#library-topic=Voice AI", "library-topic")).toBeNull();
    expect(filterFromHash("#library-topic=%E0%A4%A", "library-topic")).toBeNull();
    expect(filterFromHash("#library-topic=", "library-topic")).toBeNull();
    expect(filterFromHash("", "library-topic")).toBeNull();
  });

  it("builds the hash, or nothing for no pick", () => {
    expect(filterHash("library-topic", "ui-ux")).toBe("#library-topic=ui-ux");
    expect(filterHash("library-topic", null)).toBe("");
  });

  it("keeps the L3 tech hash on the same rules", () => {
    expect(techFromHash("#labs-tech=cosmos-db")).toBe("cosmos-db");
    expect(techHash("cosmos-db")).toBe(filterHash("labs-tech", "cosmos-db"));
  });
});
