// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BootCard } from "@/components/BootCard";

const lines = ["[ok] one", "[ok] two", "[ok] three", "[ok] four", "[ok] five", "[ok] six"];
const props = { eyebrow: "HQ", title: "Booting the HQ", lines, startLabel: "Boot rover" };

const lastFlags = (shown: number, stagger?: boolean) => {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(<BootCard {...props} shown={shown} stagger={stagger} />), "text/html");
  return [...doc.querySelectorAll(".hq-boot-log li")].map((li) => li.hasAttribute("data-last"));
};

describe("boot card on a portrait phone (one rolling log line)", () => {
  it("marks only the newest shown log line data-last", () => {
    expect(lastFlags(3)).toEqual([false, false, true, false, false, false]);
    expect(lastFlags(6)).toEqual([false, false, false, false, false, true]);
    expect(lastFlags(0)).toEqual([false, false, false, false, false, false]);
    expect(lastFlags(6, true)).toEqual([false, false, false, false, false, true]);
  });

  it("names the mark, the title and the button row for the docked layout", () => {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<BootCard {...props} shown={6} />), "text/html");
    expect(doc.querySelector("img")?.classList.contains("hq-boot-mark")).toBe(true);
    expect(doc.querySelector("p.hq-boot-title")?.textContent).toBe("Booting the HQ");
    expect(doc.querySelector(".hq-boot-actions button")?.textContent).toBe("Boot rover");
  });
});
