import { describe, expect, it } from "vitest";
import { askLinkTarget, siteHref } from "@/ask/links";
import { markdownToPlain, parseInline, parseMarkdown } from "@/ask/markdown";
import { ASK_REPO_CITE } from "@/ask/protocol";

const text = (s: string) => ({ type: "text", text: s });

describe("askLinkTarget", () => {
  it("allows site paths with or without a locale, and the site origin", () => {
    expect(askLinkTarget("/labs/voice-ai-contact-center")).toEqual({ kind: "site", path: "/labs/voice-ai-contact-center" });
    expect(askLinkTarget("/id/journey/jenius-2024")).toEqual({ kind: "site", path: "/journey/jenius-2024" });
    expect(askLinkTarget("/contact#how")).toEqual({ kind: "site", path: "/contact#how" });
    expect(askLinkTarget("/")).toEqual({ kind: "site", path: "/" });
    expect(askLinkTarget("/#highlights")).toEqual({ kind: "site", path: "/#highlights" });
    expect(askLinkTarget("/en#highlights")).toEqual({ kind: "site", path: "/#highlights" });
    expect(askLinkTarget("/build")).toEqual({ kind: "site", path: "/build" });
    expect(askLinkTarget("/en/build/")).toEqual({ kind: "site", path: "/build" });
    expect(askLinkTarget("/id/")).toEqual({ kind: "site", path: "/" });
    expect(askLinkTarget("/en/labs/")).toEqual({ kind: "site", path: "/labs" });
    expect(askLinkTarget("/labs/#labs-tech=python")).toEqual({ kind: "site", path: "/labs#labs-tech=python" });
    expect(askLinkTarget("https://kurniadi.pages.dev/en/library")).toEqual({ kind: "site", path: "/library" });
    expect(askLinkTarget("https://preview.example/en/labs", ["https://preview.example"])).toEqual({ kind: "site", path: "/labs" });
  });
  it("allows the public repository and live site roots", () => {
    expect(askLinkTarget(ASK_REPO_CITE)).toEqual({ kind: "external", href: ASK_REPO_CITE });
    expect(askLinkTarget("https://mii-microsoft.azurewebsites.net/")).toEqual({ kind: "external", href: "https://mii-microsoft.azurewebsites.net/" });
  });
  it("blocks everything else", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<b>x</b>",
      "//evil.example/en/labs",
      "http://kurniadi.pages.dev/en/labs",
      "https://evil.example/",
      "https://kurniadi.pages.dev.evil.example/en",
      "https://user@kurniadi.pages.dev/en",
      "/admin",
      "/labs/../../etc",
      "/labs/x?y=1",
      "/labs/x y",
      "\\\\evil.example",
      "https://github.com/ShinyQ/other",
      "https://mii-microsoft.azurewebsites.net/admin",
    ]) expect(askLinkTarget(bad), bad).toBeNull();
  });
  it("builds locale hrefs", () => {
    expect(siteHref("/labs/x", "id")).toBe("/id/labs/x");
    expect(siteHref("/", "en")).toBe("/en");
    expect(siteHref("/#highlights", "en")).toBe("/en#highlights");
  });
});

describe("parseInline", () => {
  it("parses bold, italic, nested emphasis and code", () => {
    expect(parseInline("a **b** c")).toEqual([text("a "), { type: "strong", children: [text("b")] }, text(" c")]);
    expect(parseInline("*a **b** c*")).toEqual([{ type: "em", children: [text("a "), { type: "strong", children: [text("b")] }, text(" c")] }]);
    expect(parseInline("***x***")).toEqual([{ type: "strong", children: [{ type: "em", children: [text("x")] }] }]);
    expect(parseInline("run `bun test` now")).toEqual([text("run "), { type: "code", text: "bun test" }, text(" now")]);
    expect(parseInline("snake_case_name and 2 * 3 * 4")).toEqual([text("snake_case_name and 2 * 3 * 4")]);
  });
  it("keeps unclosed markers literal while streaming", () => {
    expect(parseInline("Hello **wor")).toEqual([text("Hello **wor")]);
    expect(parseInline("see [Voice AI](")).toEqual([text("see [Voice AI](")]);
    expect(parseInline("see [Voice AI](/labs/voice")).toEqual([text("see [Voice AI](/labs/voice")]);
    expect(parseInline("tick `code")).toEqual([text("tick `code")]);
    expect(parseInline("[x](javascript:alert(1)")).toEqual([text("[x](javascript:alert(1)")]);
  });
  it("links allowed targets and renders blocked ones as their label", () => {
    expect(parseInline("[Voice](/labs/voice-ai-contact-center)")).toEqual([{ type: "link", target: { kind: "site", path: "/labs/voice-ai-contact-center" }, children: [text("Voice")] }]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([text("x")]);
    expect(parseInline("[x](data:text/html,(1)) y")).toEqual([text("x y")]);
    expect(parseInline("[**x**](https://evil.example)")).toEqual([{ type: "strong", children: [text("x")] }]);
    expect(parseInline("[a [b](/labs)](/library)")).not.toContainEqual(expect.objectContaining({ type: "link", children: expect.arrayContaining([expect.objectContaining({ type: "link" })]) }));
  });
  it("never interprets HTML", () => {
    expect(parseInline("<script>alert(1)</script> <img src=x onerror=alert(1)>")).toEqual([text("<script>alert(1)</script> <img src=x onerror=alert(1)>")]);
  });
  it("supports backslash escapes and line breaks", () => {
    expect(parseInline("\\*not em\\*")).toEqual([text("*not em*")]);
    expect(parseInline("a\nb")).toEqual([text("a"), { type: "br" }, text("b")]);
  });
});

describe("parseMarkdown", () => {
  it("builds paragraphs, bullet and numbered lists", () => {
    const blocks = parseMarkdown("Projects:\n- **Voice AI**\n- Fraud review\n  continued\n\n1. One\n2. Two\n\nDone.");
    expect(blocks.map((b) => b.type)).toEqual(["p", "ul", "ol", "p"]);
    expect(blocks[1]).toEqual({ type: "ul", items: [[{ type: "strong", children: [text("Voice AI")] }], [text("Fraud review continued")]] });
    expect(blocks[2]).toMatchObject({ type: "ol", start: 1 });
  });
  it("renders headings as bold paragraphs and leaves tables and images as text", () => {
    expect(parseMarkdown("## Skills")).toEqual([{ type: "p", children: [{ type: "strong", children: [text("Skills")] }] }]);
    expect(parseMarkdown("## Skills: C# and F#")).toEqual([{ type: "p", children: [{ type: "strong", children: [text("Skills: C# and F#")] }] }]);
    expect(parseMarkdown("## Skills ##")).toEqual([{ type: "p", children: [{ type: "strong", children: [text("Skills")] }] }]);
    expect(parseMarkdown("| a | b |")).toEqual([{ type: "p", children: [text("| a | b |")] }]);
    expect(markdownToPlain("![logo](https://evil.example/x.png)")).toBe("!logo");
  });
  it("projects to plain text for the server checks", () => {
    expect(markdownToPlain("Projects:\n- **Voice AI** [page](/labs/voice-ai-contact-center)\n- *Fraud* `review`")).toBe("Projects:\n\nVoice AI page\nFraud review");
    expect(markdownToPlain("Steps:\n1. One\n2. Two\n\n3) Three")).toBe("Steps:\n\n1. One\n2. Two\n\n3. Three");
  });
});
