import fallback from "../_generated/fallback.json";
import pin from "../_generated/pack-meta.json";
import { createAskHandler } from "../_lib/handler";
import { createPackSource } from "../_lib/pack-source";
import type { KnowledgePack, PagesContext } from "../_lib/types";

/**
 * Ask the HQ: `GET /api/ask` (status) and `POST /api/ask` (answer as text/event-stream).
 * `bun scripts/build-knowledge.ts` (part of `bun run build`) generates the inputs. The knowledge pack itself lives in
 * Workers KV (`pack:current` and `pack:v1:<version>`, published by `scripts/ask-pack.ts`); only the bundle's pin and the
 * small fallback pack are bundled here, never served as public files.
 * Design and threat model: docs/superpowers/specs/2026-10-11-ask-hq-design.md and 2026-10-19-ask-kv-pack-and-rover-voice-design.md.
 */
const source = createPackSource({ fallback: fallback as unknown as KnowledgePack, pin });
const handler = createAskHandler({ source });

export const onRequest = (context: PagesContext) => handler(context);
