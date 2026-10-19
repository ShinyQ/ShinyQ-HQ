import { afterEach, describe, expect, it, vi } from "vitest";
import { loadExperienceData, peekExperienceData, resetExperienceData } from "@/experience/data-client";
import type { ExperienceData } from "@/experience/types";

const fake = (locale: "en" | "id") => ({ locale, years: [2019] }) as unknown as ExperienceData;

function stubFetch(...responses: (ExperienceData | "fail" | number)[]) {
  const fetch = vi.fn(async (url: string) => {
    const next = responses.shift();
    if (next === undefined || next === "fail") throw new TypeError("network down");
    if (typeof next === "number") return new Response("nope", { status: next });
    void url;
    return Response.json(next);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  resetExperienceData();
  vi.unstubAllGlobals();
});

describe("loadExperienceData", () => {
  it("fetches the versioned file once per locale and caches it", async () => {
    const fetch = stubFetch(fake("en"), fake("id"));
    expect(peekExperienceData("en", "abc")).toBeNull();
    const [a, b] = await Promise.all([loadExperienceData("en", "abc"), loadExperienceData("en", "abc")]);
    expect(a).toBe(b);
    expect(await loadExperienceData("en", "abc")).toBe(a);
    expect(peekExperienceData("en", "abc")).toBe(a);
    expect((await loadExperienceData("id", "def")).locale).toBe("id");
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/data/experience/en.json?v=abc", "/data/experience/id.json?v=def"]);
  });

  it("rejects on a network error or a bad status and fetches again on the next call", async () => {
    const fetch = stubFetch("fail", 503, fake("en"));
    await expect(loadExperienceData("en", "abc")).rejects.toThrow();
    expect(peekExperienceData("en", "abc")).toBeNull();
    await expect(loadExperienceData("en", "abc")).rejects.toThrow(/503/);
    expect((await loadExperienceData("en", "abc")).locale).toBe("en");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("a new version (a deploy between client navigations) fetches the new file", async () => {
    const fetch = stubFetch(fake("en"), fake("en"));
    await loadExperienceData("en", "v1");
    await loadExperienceData("en", "v2");
    expect(peekExperienceData("en", "v1")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
