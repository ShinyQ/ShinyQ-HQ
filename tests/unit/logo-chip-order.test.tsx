import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChipList } from "@/components/Chip";
import { buildExperienceData } from "@/content/experience";
import { buildRoomViews } from "@/content/room-views";
import { LOCALES } from "@/content/schema";

/** True when no logo follows a text chip. */
const logosFirst = (logos: readonly (string | null | undefined)[]) => {
  const firstText = logos.findIndex((l) => !l);
  return firstText === -1 || logos.slice(firstText).every((l) => !l);
};

describe("logo chips render before text chips", () => {
  it("in ChipList with logos, keeping each group's order", () => {
    const html = renderToStaticMarkup(<ChipList items={["RAG", "Python", "SSO", "Docker"]} logos />);
    const order = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    expect(order).toEqual(["Python", "Docker", "RAG", "SSO"]);
    const plain = renderToStaticMarkup(<ChipList items={["RAG", "Python"]} />);
    expect(plain.indexOf("RAG")).toBeLessThan(plain.indexOf("Python"));
  });

  it("in every drawer stack and chip section", () => {
    for (const locale of LOCALES) {
      for (const view of Object.values(buildRoomViews(locale))) {
        if ("stack" in view && Array.isArray(view.stack)) expect(logosFirst(view.stack.map((s) => s.logo)), view.id).toBe(true);
        if ("sections" in view && Array.isArray(view.sections))
          for (const section of view.sections) if (section.chipLogos) expect(logosFirst(section.chipLogos), view.id).toBe(true);
      }
    }
  });

  it("on the Lobby skills wall", () => {
    const data = buildExperienceData("en", { L1: "Lobby", L2: "Career", L3: "Labs", L4: "Library", RF: "Roof" });
    for (const group of data.skills) expect(logosFirst(group.logos), group.id).toBe(true);
  });
});
