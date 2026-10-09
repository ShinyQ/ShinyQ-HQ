import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { getContent } from "@/content/load";
import { collectStrings } from "@/content/safety";

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{([a-zA-Z]\w*)(?:\}|,)/g)].map((match) => match[1]))].sort();

describe("bilingual UI copy", () => {
  it("keeps message keys and interpolation variables aligned", () => {
    const english = collectStrings(en);
    const indonesian = new Map(collectStrings(id).map(({ path, value }) => [path, value]));
    expect(english.map(({ path }) => path).sort()).toEqual([...indonesian.keys()].sort());
    for (const { path, value } of english) {
      const translation = indonesian.get(path)!;
      expect(translation.trim(), path).not.toBe("");
      expect(placeholders(translation), path).toEqual(placeholders(value));
    }
  });

  it("keeps rover dialogue within 40 characters per line", () => {
    const dialogue = [
      ...getContent().missions.flatMap((mission) =>
        mission.steps.flatMap((step) => step.kind === "say" ? collectStrings(step.text, mission.id) : []),
      ),
      ...[en, id].flatMap((messages) => [
        ...collectStrings(messages.hud.terminal.greeting),
        { path: "terminal.question", value: messages.hud.terminal.question },
        { path: "statusHello", value: messages.hud.statusHello },
      ]),
    ];
    for (const { path, value } of dialogue) {
      for (const line of value.split("\n")) expect(line.length, path).toBeLessThanOrEqual(40);
    }
  });

  it("keeps site and section metadata descriptions within 160 characters", () => {
    for (const messages of [en, id]) {
      for (const description of [
        messages.meta.description,
        messages.quick.intro,
        messages.journey.intro,
        messages.labs.intro,
        messages.library.intro,
        messages.contact.intro,
      ]) expect(description.length).toBeLessThanOrEqual(160);
    }
  });
});
