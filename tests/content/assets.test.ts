import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8"));

interface AssetLike {
  src: string;
  redacted: boolean;
}

function collectAssets(value: unknown, at = "$", out: { at: string; asset: AssetLike }[] = []) {
  if (Array.isArray(value)) value.forEach((v, i) => collectAssets(v, `${at}[${i}]`, out));
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.src === "string" && typeof obj.redacted === "boolean" && obj.alt) out.push({ at, asset: obj as unknown as AssetLike });
    else for (const [k, v] of Object.entries(obj)) collectAssets(v, `${at}.${k}`, out);
  }
  return out;
}

describe("assets", () => {
  const assets = collectAssets(content);

  it("only references files committed under public/", () => {
    const missing = assets.filter(({ asset }) => !existsSync(path.join(root, "public", asset.src)));
    expect(missing.map((m) => `${m.at}: ${m.asset.src}`)).toEqual([]);
  });

  it("uses no remote or expiring URLs", () => {
    expect(assets.filter(({ asset }) => /^(https?:)?\/\//.test(asset.src)).map((a) => a.at)).toEqual([]);
  });

  it("only shows client-work assets when redacted", () => {
    const pods = content.floors.labs.pods as { id: string; client?: string; assets: AssetLike[] }[];
    const unredacted = pods.flatMap((p) => (p.client ? p.assets.filter((a) => !a.redacted).map(() => p.id) : []));
    expect(unredacted).toEqual([]);
  });

  it("marks every pod gallery image as privacy reviewed, with a thumbnail and pod-slug folder", () => {
    const pods = content.floors.labs.pods as { slug: string; assets: AssetLike[] }[];
    const problems = pods.flatMap((p) =>
      p.assets.flatMap((a) => {
        const issues: string[] = [];
        if (!a.redacted) issues.push(`${p.slug}: ${a.src} not reviewed`);
        if (!a.src.startsWith(`/media/${p.slug}/`)) issues.push(`${p.slug}: ${a.src} outside /media/${p.slug}/`);
        if (!existsSync(path.join(root, "public", a.src.replace(/\.webp$/, ".thumb.webp")))) issues.push(`${a.src} has no thumbnail`);
        return issues;
      }),
    );
    expect(problems).toEqual([]);
  });

  it("keeps committed media under the size budget", () => {
    const dir = path.join(root, "public", "media");
    const walk = (d: string): number =>
      readdirSync(d, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? walk(path.join(d, e.name)) : statSync(path.join(d, e.name)).size), 0);
    expect(walk(dir) / 1024 / 1024).toBeLessThan(25);
  });

  it("ships the KAW monogram", () => {
    expect(existsSync(path.join(root, "public", "brand", "kaw-monogram.svg"))).toBe(true);
  });
});
