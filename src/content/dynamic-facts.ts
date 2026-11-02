import { z } from "zod";
import { IsoDateSchema, SlugSchema } from "./schema";

/**
 * Live facts refreshed weekly by `.github/workflows/refresh-facts.yml` into
 * `content/generated/dynamic-facts.json`. Third-party text never enters this file (threat T2 in
 * docs/superpowers/specs/2026-10-11-ask-hq-design.md): numbers, dates, booleans and IDs only.
 */
const LoginSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "Expected a GitHub or Hugging Face login");
const count = z.number().int().nonnegative();

/** A year from GitHub is 365 to 367 days; anything outside a week of that is a broken response. */
const CALENDAR_MIN_DAYS = 358;
const CALENDAR_MAX_DAYS = 378;

/**
 * The last year of GitHub contributions (`ContributionCalendar` in `@/lib/contributions`): the first
 * day, one level digit (GitHub's 0 to 4) per day and one count per day. Level 0 means no contribution.
 */
export const ContributionCalendarSchema = z
  .strictObject({
    start: IsoDateSchema.refine((d) => new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Expected a real date"),
    levels: z.string().regex(/^[0-4]+$/, "Expected one digit 0 to 4 per day").min(CALENDAR_MIN_DAYS).max(CALENDAR_MAX_DAYS),
    counts: z.array(count),
  })
  .superRefine(({ levels, counts }, ctx) => {
    if (counts.length !== levels.length) {
      ctx.addIssue({ code: "custom", path: ["counts"], message: `Expected ${levels.length} counts, got ${counts.length}` });
      return;
    }
    const bad = counts.findIndex((n, i) => (n === 0) !== (levels[i] === "0"));
    if (bad >= 0) ctx.addIssue({ code: "custom", path: ["levels"], message: `Day ${bad}: level ${levels[bad]} disagrees with count ${counts[bad]}` });
  });

export const DynamicFactsSchema = z.strictObject({
  asOf: IsoDateSchema,
  github: z
    .strictObject({
      login: LoginSchema,
      contributionsLastYear: count,
      publicRepos: count,
      calendar: ContributionCalendarSchema.optional(),
    })
    .superRefine(({ calendar, contributionsLastYear }, ctx) => {
      const sum = calendar?.counts.reduce((s, n) => s + n, 0);
      if (sum !== undefined && sum !== contributionsLastYear) ctx.addIssue({ code: "custom", path: ["calendar"], message: `Calendar counts add up to ${sum}, not ${contributionsLastYear}` });
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
