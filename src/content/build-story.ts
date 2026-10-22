import raw from "../../content/build-story.json";
import factsRaw from "../../content/generated/build-facts.json";
import { ArchitectureSchema, IsoDateSchema, LocalizedTextSchema, SlugSchema } from "./schema";
import { z } from "zod";

/**
 * The build story (`content/build-story.json`): the secret B1 Engine Room floor and the Classic page
 * /[locale]/build render it. Server-side only: never import this module from a client component
 * (it pulls zod and the schema into the bundle). Counts come from `content/generated/build-facts.json`
 * (`scripts/build-facts.ts`), never from the story text.
 */
export const STATION_IDS = ["blueprint", "timeline", "agents", "gates", "dashboard", "brain", "rejected"] as const;
export type StationId = (typeof STATION_IDS)[number];
/** Where a gate runs: a CI job on every pull request, the nightly full run, or a local check before pushing. */
export const GATE_WHERE = ["ci", "nightly", "local"] as const;

const shot = z.strictObject({
  src: z.string().regex(/^\/build-story\/[a-z0-9-]+\.webp$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: LocalizedTextSchema,
});

export const BuildRoundSchema = z.strictObject({
  id: z.string().regex(/^r[1-9][0-9]?$/),
  number: z.number().int().min(1),
  title: LocalizedTextSchema,
  summary: LocalizedTextSchema,
  prs: z.strictObject({ from: z.number().int().min(1), to: z.number().int().min(1).nullable() }),
  shots: z.strictObject({ before: shot, after: shot, caption: LocalizedTextSchema }).optional(),
});

export const BuildGateSchema = z.strictObject({
  id: SlugSchema,
  title: LocalizedTextSchema,
  /** One line: what the gate checks. */
  text: LocalizedTextSchema,
  /** The number it enforces, for example "Under 450 KB gzip on the first-frame path". */
  budget: LocalizedTextSchema,
  where: z.enum(GATE_WHERE),
  /** Display names of the ci.yml jobs that run it (checked against the facts' ci.jobs); none for a local gate. */
  jobs: z.array(z.string().min(1)),
  /** A required check on main's ruleset. */
  required: z.boolean(),
}).superRefine((gate, ctx) => {
  if (gate.where === "local" && (gate.jobs.length > 0 || gate.required)) ctx.addIssue({ code: "custom", path: ["jobs"], message: "A local gate names no CI job and is not required" });
  if (gate.where !== "local" && gate.jobs.length === 0) ctx.addIssue({ code: "custom", path: ["jobs"], message: "A CI or nightly gate names its jobs" });
});

const step = z.strictObject({ title: LocalizedTextSchema, text: LocalizedTextSchema });

/** One Rejected Designs entry: what was tried or proposed, and the one-line reason it was dropped. */
export const RejectedIdeaSchema = z.strictObject({
  id: SlugSchema,
  title: LocalizedTextSchema,
  tried: LocalizedTextSchema,
  reason: LocalizedTextSchema,
  /** The merged pull request that dropped or replaced it, when there is one. */
  pr: z.number().int().min(1).optional(),
});

const station = <T extends z.ZodRawShape>(extra: T) =>
  z.strictObject({ title: LocalizedTextSchema, summary: LocalizedTextSchema, ...extra });

export const BuildStorySchema = z
  .strictObject({
    $comment: z.string().optional(),
    title: LocalizedTextSchema,
    /** ISO date the page first went public (JSON-LD `datePublished`). */
    published: IsoDateSchema,
    lead: LocalizedTextSchema,
    stations: z.strictObject({
      blueprint: station({ architecture: ArchitectureSchema, steps: z.array(LocalizedTextSchema).min(3).max(10) }),
      timeline: station({
        rounds: z.array(BuildRoundSchema).min(1),
        /** Pull requests that are counted but shown without a link: their diff exposes text the site hides (C3). */
        unlinkedPrs: z.array(z.number().int().min(1)).optional(),
      }),
      agents: station({
        steps: z.array(step).min(4).max(10),
        tools: z.array(z.string().min(1)).min(1),
        excerpt: z.strictObject({
          path: z.string().regex(/^docs\/superpowers\/plans\/[a-z0-9-]+\.md$/),
          text: z.string().min(40).max(1600),
        }),
      }),
      gates: station({ gates: z.array(BuildGateSchema).min(4) }),
      dashboard: station({}),
      /** Rover's Brain: how Ask answers, as a pipeline diagram and its steps. */
      brain: station({ architecture: ArchitectureSchema, steps: z.array(step).min(5).max(10) }),
      rejected: station({
        ideas: z
          .array(RejectedIdeaSchema)
          .min(8)
          .max(12)
          .refine((ideas) => new Set(ideas.map((i) => i.id)).size === ideas.length, "Idea ids must be unique"),
      }),
    }),
  })
  .superRefine((story, ctx) => {
    const rounds = story.stations.timeline.rounds;
    rounds.forEach((round, i) => {
      const at = ["stations", "timeline", "rounds", i];
      if (round.number !== i + 1) ctx.addIssue({ code: "custom", path: [...at, "number"], message: `Expected round number ${i + 1}` });
      if (round.id !== `r${round.number}`) ctx.addIssue({ code: "custom", path: [...at, "id"], message: `Expected id r${round.number}` });
      const { from, to } = round.prs;
      if (to !== null && to < from) ctx.addIssue({ code: "custom", path: [...at, "prs"], message: "Range must ascend" });
      if (to === null && i < rounds.length - 1) ctx.addIssue({ code: "custom", path: [...at, "prs", "to"], message: "Only the last round may be open" });
      const prev = rounds[i - 1]?.prs.to;
      if (i > 0 && prev != null && from !== prev + 1)
        ctx.addIssue({ code: "custom", path: [...at, "prs", "from"], message: `Expected ${prev + 1}, ranges must be contiguous` });
    });
  });

export type BuildStory = z.infer<typeof BuildStorySchema>;
export type BuildRound = z.infer<typeof BuildRoundSchema>;
export type BuildGate = z.infer<typeof BuildGateSchema>;
export type RejectedIdea = z.infer<typeof RejectedIdeaSchema>;

const count = z.number().int().nonnegative();

/** Numbers measured from the repository by `scripts/build-facts.ts` into `content/generated/build-facts.json`. */
export const BuildFactsSchema = z.strictObject({
  /** Date of the HEAD commit, so the output is deterministic per commit. */
  generatedAt: IsoDateSchema,
  commit: z.string().regex(/^[0-9a-f]{7}$/).optional(),
  git: z.strictObject({ commits: count, firstCommit: IsoDateSchema, mergedPrs: count, latestPr: count }).optional(),
  rounds: z
    .array(
      z.strictObject({
        id: z.string(),
        prs: z.array(z.number().int().min(1)),
        first: IsoDateSchema.optional(),
        last: IsoDateSchema.optional(),
      }),
    )
    .optional(),
  tests: z.strictObject({ unitFiles: count, e2e: count.optional(), e2eFiles: count }).optional(),
  docs: z.strictObject({ specs: count, plans: count }).optional(),
  ci: z.strictObject({ jobs: z.array(z.string()).min(1), workflows: count }).optional(),
  budgets: z
    .strictObject({
      js3dKb: z.number(),
      sessionFullKb: z.number(),
      sceneCalls: count,
      triangles: count,
      floorChunkKb: z.record(z.string(), z.number()),
    })
    .optional(),
});

export type BuildFacts = z.infer<typeof BuildFactsSchema>;

let cachedStory: BuildStory | undefined;
export function getBuildStory(): BuildStory {
  return (cachedStory ??= BuildStorySchema.parse(raw));
}

let cachedFacts: BuildFacts | undefined;
export function getBuildFacts(): BuildFacts {
  return (cachedFacts ??= BuildFactsSchema.parse(factsRaw));
}
