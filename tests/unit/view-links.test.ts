// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { syncViewLinks } from "@/lib/view-links";

const BASE = "https://kurniadi.pages.dev/en/labs";

describe("syncViewLinks", () => {
  it("adds and removes the parameter on internal page links only", () => {
    document.body.innerHTML = `<a id="a" href="/en/journey">J</a><a id="b" href="/cv/x.pdf">CV</a><a id="c" href="/en?tier=lite" data-hq-view="3d">3D</a><a id="d" href="?view=classic" data-hq-page-link>C</a><a id="e" href="https://x.dev/en">X</a>`;
    syncViewLinks(document.body, "page", BASE);
    const href = (id: string) => document.getElementById(id)!.getAttribute("href");
    expect(href("a")).toBe("/en/journey?view=classic");
    expect(href("b")).toBe("/cv/x.pdf");
    expect(href("c")).toBe("/en?tier=lite");
    expect(href("d")).toBe("?view=classic");
    expect(href("e")).toBe("https://x.dev/en");
    syncViewLinks(document.body, "3d", BASE);
    expect(href("a")).toBe("/en/journey");
  });

  it("handles a root that is itself an anchor and skips downloads", () => {
    document.body.innerHTML = `<a id="a" href="/en/labs">L</a><a id="b" href="/en/labs" download>D</a>`;
    syncViewLinks(document.getElementById("a")!, "page", BASE);
    syncViewLinks(document.getElementById("b")!, "page", BASE);
    expect(document.getElementById("a")!.getAttribute("href")).toBe("/en/labs?view=classic");
    expect(document.getElementById("b")!.getAttribute("href")).toBe("/en/labs");
  });
});
