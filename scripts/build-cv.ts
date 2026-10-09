/**
 * Prints /{locale}/cv to PDF after `next build`.
 * Output: out/cv/kurniadi-ahmad-wijaya-cv-{locale}.pdf (file name from content).
 * Set SKIP_CV=1 to skip (e.g. when Chromium is not installed).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { LOCALES } from "../src/content/schema";
import { getContent } from "../src/content/load";
import { startStaticServer } from "./serve-static";

async function main() {
  if (process.env.SKIP_CV === "1") {
    console.log("SKIP_CV=1, skipping CV PDF generation");
    return;
  }
  const { fileName } = getContent().floors.roof.cv;
  const outDir = path.resolve("out", "cv");
  mkdirSync(outDir, { recursive: true });

  const server = startStaticServer({ dir: "out" });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const locale of LOCALES) {
      const target = path.join(outDir, `${fileName}-${locale}.pdf`);
      await page.goto(`${server.url}/${locale}/cv`, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts.ready);
      await page.pdf({
        path: target,
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
      });
      console.log(`CV written: ${path.relative(process.cwd(), target)}`);
    }
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
