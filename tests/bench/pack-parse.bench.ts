import { test } from "vitest";
import { buildPackArtifacts } from "@/ask/pack";
import { buildRepoPack } from "@/ask/repo-pack";
import { hydratePack, storePack } from "../../functions/_lib/pack-index";
import type { StoredPack } from "../../functions/_lib/types";

/**
 * Cold-isolate cost of the KV pack (spec 2026-10-19 section 4.6, not a gate): `JSON.parse` of the real stored value,
 * hydrating its index, against tokenizing the text pack as every isolate did before the KV move. Each iteration
 * parses a fresh copy, so the WeakMap cache in `hydratePack` never short-circuits.
 */
const { pack, safety } = buildRepoPack();
const { json } = buildPackArtifacts(pack, safety.blocklist);
const text = JSON.stringify(pack);

test(`ask pack: cold load of the ${(json.length / 1024).toFixed(0)} KB stored value`, async ({ bench }) => {
  await bench.compare(
    bench("parse", () => {
      JSON.parse(json);
    }),
    bench("parse + hydrate", () => {
      hydratePack(JSON.parse(json) as StoredPack);
    }),
    bench("text parse + tokenize (before KV)", () => {
      storePack(JSON.parse(text));
    }),
  );
});
