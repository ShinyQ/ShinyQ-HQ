import { describe, expect, it } from "vitest";
import { parseTopicFilter } from "@/components/page/TopicFilter";

describe("Writing page topic filter", () => {
  const slugs = ["voice-ai", "ui-ux"];
  it("reads a known ?topic= and ignores anything else", () => {
    expect(parseTopicFilter("?topic=voice-ai&tier=lite", slugs)).toBe("voice-ai");
    expect(parseTopicFilter("?topic=nope", slugs)).toBeNull();
    expect(parseTopicFilter("", slugs)).toBeNull();
  });
});
