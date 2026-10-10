import { z } from "zod";
import { IsoDateSchema, SlugSchema } from "./schema";

/**
 * Live facts refreshed weekly by `.github/workflows/refresh-facts.yml` into
 * `content/generated/dynamic-facts.json`. Third-party text never enters this file (threat T2 in
 * docs/superpowers/specs/2026-10-11-ask-hq-design.md): numbers, dates, booleans and IDs only.
 */
const LoginSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "Expected a GitHub or Hugging Face login");
const count = z.number().int().nonnegative();

export const DynamicFactsSchema = z.strictObject({
  asOf: IsoDateSchema,
  github: z
    .strictObject({
      login: LoginSchema,
      contributionsLastYear: count,
      publicRepos: count,
    })
    .optional(),
  huggingface: z
    .strictObject({
      user: LoginSchema,
      models: count,
      downloads: count,
    })
    .optional(),
  credentials: z
    .array(
      z.strictObject({
        id: SlugSchema,
        reachable: z.boolean(),
      }),
    )
    .optional(),
});

export type DynamicFacts = z.infer<typeof DynamicFactsSchema>;
