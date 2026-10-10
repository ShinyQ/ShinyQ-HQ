import { describe, expect, it } from "vitest";
import { LOADER_MARKER, deferNextScripts, loaderScript } from "../../scripts/defer-scripts";

const PAGE =
  `<html><head><link rel="stylesheet" href="/_next/static/chunks/a.css" data-precedence="next"/>` +
  `<link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/boot.js"/>` +
  `<script src="/_next/static/chunks/one.js" async=""></script>` +
  `<script src="/_next/static/chunks/two.js" async=""></script>` +
  `<script>inline()</script>` +
  `<script src="/_next/static/chunks/legacy.js" noModule=""></script></head>` +
  `<body><p>Hero</p><script id="_R_">boot()</script>` +
  `<script src="/_next/static/chunks/boot.js" async=""></script>` +
  `<script>self.__next_f.push([1,"x"])</script></body></html>`;

describe("deferNextScripts", () => {
  const out = deferNextScripts(PAGE);

  it("removes the chunk tags and the script preload", () => {
    expect(out).not.toMatch(/<script src="\/_next\/static\/chunks\/[^"]+" async="">/);
    expect(out).not.toContain('rel="preload" as="script"');
  });

  it("inserts one loader in the head with every chunk in document order", () => {
    expect(out.split(LOADER_MARKER)).toHaveLength(2);
    expect(out.indexOf(LOADER_MARKER)).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain(JSON.stringify(["/_next/static/chunks/one.js", "/_next/static/chunks/two.js", "/_next/static/chunks/boot.js"]));
  });

  it("keeps inline scripts, the stylesheet and the noModule fallback", () => {
    for (const part of ["inline()", `<script id="_R_">boot()</script>`, "self.__next_f.push", "a.css", 'noModule=""', "<p>Hero</p>"]) {
      expect(out).toContain(part);
    }
  });

  it("is idempotent and leaves pages without chunks alone", () => {
    expect(deferNextScripts(out)).toBe(out);
    const plain = "<html><head></head><body>redirect</body></html>";
    expect(deferNextScripts(plain)).toBe(plain);
  });
});

describe("loaderScript", () => {
  it("waits for the first contentful paint, with frame, hidden-tab and timeout fallbacks", () => {
    const script = loaderScript(["/a.js"]);
    expect(script).toContain('"first-contentful-paint"');
    expect(script).toContain("buffered:true");
    expect(script).toContain("requestAnimationFrame");
    expect(script).toContain('visibilityState!=="visible"');
    expect(script).toMatch(/setTimeout\(go,\d+\)/);
  });

  it("escapes markup in chunk paths", () => {
    expect(loaderScript(["/x</script>.js"])).not.toContain("x</script>");
  });

  it("is valid JavaScript", () => {
    const body = loaderScript(["/a.js"]).replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    expect(() => new Function(body)).not.toThrow();
  });
});
