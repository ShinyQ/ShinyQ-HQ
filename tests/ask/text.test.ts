import { describe, expect, it } from "vitest";
import { normalizeDashes } from "../../functions/_lib/text";

describe("normalizeDashes", () => {
  it.each([["hyphen", "\u2010"], ["non-breaking hyphen", "\u2011"], ["figure dash", "\u2012"], ["minus sign", "\u2212"]])("turns the %s into a hyphen", (_name, dash) => {
    expect(normalizeDashes(`state${dash}of${dash}the${dash}art`)).toBe("state-of-the-art");
  });

  it("closes an en dash between digits", () => {
    expect(normalizeDashes("2019\u20132021")).toBe("2019-2021");
    expect(normalizeDashes("5 \u2013 7")).toBe("5-7");
    expect(normalizeDashes("2019 \u20132021")).toBe("2019-2021");
  });

  it("keeps the spaces of an en dash elsewhere", () => {
    expect(normalizeDashes("Mei 2026 \u2013 Juni")).toBe("Mei 2026 - Juni");
    expect(normalizeDashes("Jenius \u2013 data")).toBe("Jenius - data");
    expect(normalizeDashes("pre\u2013trained")).toBe("pre-trained");
  });

  it("turns an em dash or horizontal bar into a comma", () => {
    expect(normalizeDashes("He built it \u2014 and shipped it")).toBe("He built it, and shipped it");
    expect(normalizeDashes("He built it\u2014and shipped it")).toBe("He built it, and shipped it");
    expect(normalizeDashes("A \u2015 B")).toBe("A, B");
  });

  it("collapses commas around an em dash", () => {
    expect(normalizeDashes("one, \u2014 two")).toBe("one, two");
    expect(normalizeDashes("one \u2014, two")).toBe("one, two");
    expect(normalizeDashes("one,\u2014\u2014two")).toBe("one, two");
  });

  it("drops an em dash at the start, at the end and before a newline", () => {
    expect(normalizeDashes("\u2014 Hello")).toBe("Hello");
    expect(normalizeDashes("Hello \u2014")).toBe("Hello");
    expect(normalizeDashes("Hello \u2014\nWorld")).toBe("Hello\nWorld");
    expect(normalizeDashes("Hello\u2014\nWorld")).toBe("Hello\nWorld");
  });

  it("never leaves an em dash and is idempotent", () => {
    const text = "A \u2014 B \u2013 C 2019\u20132021 \u2010 \u2014\n\u2014 end \u2014";
    const once = normalizeDashes(text);
    expect(once).not.toContain("\u2014");
    expect(normalizeDashes(once)).toBe(once);
  });

  it("leaves everything else unchanged", () => {
    const text = "Plain - hyphen, 90,9% and a list:\n- one\n- two";
    expect(normalizeDashes(text)).toBe(text);
  });
});
