#!/usr/bin/env bun
/**
 * PR review sheets for the OG redesign: the production card before (downloaded in Task 0 to
 * screenshots/og-before/) on top, the new build's card (out/og/) below, each also at 300 px wide.
 *
 *   bun scripts/og-before-after.ts   (after `bun run build`)
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PAIRS = [
  { name: "home-en", before: "en.png", after: "en.jpg" },
  { name: "home-id", before: "id.png", after: "id.jpg" },
  { name: "project-voice-ai-contact-center-en", before: "en/labs/voice-ai-contact-center.png", after: "en/labs/voice-ai-contact-center.jpg" },
  { name: "post-making-a-voice-agent-interruptible-en", before: "en/blog/making-a-voice-agent-interruptible.png", after: "en/blog/making-a-voice-agent-interruptible.jpg" },
  // Before this change the journey page shared the default card.
  { name: "journey-en", before: "en.png", after: "en/page/journey.jpg" },
] as const;

const BEFORE = path.join("screenshots", "og-before");
const AFTER = path.join("out", "og");
const OUT = path.join("screenshots", "og-before-after");
mkdirSync(OUT, { recursive: true });

for (const pair of PAIRS) {
  const before = await sharp(path.join(BEFORE, pair.before)).resize(1200, 630).png().toBuffer();
  const after = await sharp(path.join(AFTER, pair.after)).resize(1200, 630).png().toBuffer();
  const small = (image: Buffer) => sharp(image).resize(300, 158).png().toBuffer();
  const file = path.join(OUT, `${pair.name}.jpg`);
  await sharp({ create: { width: 1540, height: 1290, channels: 3, background: "#111111" } })
    .composite([
      { input: before, left: 10, top: 10 },
      { input: after, left: 10, top: 650 },
      { input: await small(before), left: 1230, top: 10 },
      { input: await small(after), left: 1230, top: 650 },
    ])
    .jpeg({ quality: 85 })
    .toFile(file);
  console.log(file);
}
