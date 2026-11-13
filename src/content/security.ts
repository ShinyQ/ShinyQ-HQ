import raw from "../../content/security.json";
import { getAwards, getPod } from "./load";
import { ArchitectureSchema, DeltaSchema, IsoDateSchema, LocalizedTextSchema, SlugSchema, type Locale } from "./schema";
import { z } from "zod";

/**
 * The security page (`content/security.json`, /[locale]/security; owner decision 2026-11-13). Impact first: the proof,
 * AI and incident rows lead with a before and after (`delta`), counts are small supporting context. Public-safe facts
 * only: never a client, service, host, resource or repository name, and incidents dated by month. Server-side only:
 * never import this module from a client component (it pulls zod and the dataset into the bundle).
 */
/** Section anchors in page order, each with the content key that holds its title. */
export const SECURITY_SECTIONS = [
  ["principles", "principles"],
  ["keyless", "keyless"],
  ["ai", "ai"],
  ["products", "products"],
  ["incidents", "incidents"],
  ["supply-chain", "supplyChain"],
  ["site", "site"],
  ["background", "background"],
] as const;
export type SecuritySectionId = (typeof SECURITY_SECTIONS)[number][0];

/** A measured fact: the plain-text `value` reads the delta's before then after, so Ask and the page agree. */
/** A shown value: one string for numbers and grades ("37 to 15", "A+"), `{ en, id }` when it has words. */
const ValueSchema = z.union([z.string().min(1).max(32), LocalizedTextSchema]);
export type SecurityValue = z.infer<typeof ValueSchema>;
const metric = { id: SlugSchema, value: ValueSchema, delta: DeltaSchema.optional(), label: LocalizedTextSchema };
const readsDelta = (m: { value: SecurityValue; delta?: { before: string; after: string } }) => !m.delta || m.value === `${m.delta.before} to ${m.delta.after}`;
const DELTA_VALUE = { message: "value must read '<before> to <after>'", path: ["value"] };
const MetricSchema = z.strictObject(metric).refine(readsDelta, DELTA_VALUE);
/** An AI result: a metric with how it was measured and the case study it comes from. */
const AiResultSchema = z.strictObject({ ...metric, context: LocalizedTextSchema.optional(), pod: SlugSchema }).refine(readsDelta, DELTA_VALUE);

const section = <T extends z.ZodRawShape>(extra: T) => z.strictObject({ title: LocalizedTextSchema, intro: LocalizedTextSchema, ...extra });
const item = z.strictObject({ title: LocalizedTextSchema, text: LocalizedTextSchema });
const uniqueIds = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;

export const SecurityPageSchema = z.strictObject({
  $comment: z.string().optional(),
  title: LocalizedTextSchema,
  /** ISO date the page first went public (JSON-LD `datePublished`). */
  published: IsoDateSchema,
  lead: LocalizedTextSchema,
  proof: z.array(MetricSchema).length(3),
  principles: section({ items: z.array(item.extend({ id: SlugSchema })).length(5).refine(uniqueIds, "Principle ids must be unique") }),
  keyless: section({
    facts: z.array(MetricSchema).min(2).max(4),
    diagramTitle: LocalizedTextSchema,
    /** One small readable diagram: at most 12 nodes. */
    architecture: ArchitectureSchema.refine((a) => a.nodes.length <= 12, "At most 12 nodes"),
    points: z.array(LocalizedTextSchema).min(1).max(5),
  }),
  ai: section({
    results: z.array(AiResultSchema).min(1).max(4),
  }),
  products: section({ items: z.array(z.strictObject({ pod: SlugSchema, text: LocalizedTextSchema, note: LocalizedTextSchema.optional() })).min(1).max(4) }),
  incidents: section({
    items: z
      .array(
        z
          .strictObject({
            id: SlugSchema,
            /** Month only (owner decision): never a finer date. */
            month: z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
            title: LocalizedTextSchema,
            text: LocalizedTextSchema,
            value: ValueSchema,
            delta: DeltaSchema.optional(),
          })
          .refine(readsDelta, DELTA_VALUE),
      )
      .min(1)
      .max(6),
  }),
  supplyChain: section({ items: z.array(item).min(2).max(6) }),
  site: section({ items: z.array(item).min(2).max(8) }),
  /** Ids of the dataset's `awards`. */
  background: section({ awards: z.array(SlugSchema).min(1).max(4) }),
});

export type SecurityPage = z.infer<typeof SecurityPageSchema>;
export type SecurityMetric = z.infer<typeof MetricSchema>;
export type SecurityAiResult = z.infer<typeof AiResultSchema>;

/** Pod slugs and award ids the page names that the dataset does not have. */
export function securityIssues(page: SecurityPage): string[] {
  const pods = [...page.ai.results.map((r) => r.pod), ...page.products.items.map((p) => p.pod)];
  const awards = new Set(getAwards().map((a) => a.id));
  return [
    ...pods.filter((slug) => !getPod(slug)).map((slug) => `Unknown pod "${slug}"`),
    ...page.background.awards.filter((id) => !awards.has(id)).map((id) => `Unknown award "${id}"`),
  ];
}

/** A value in the reader's language. */
export function securityValue(value: SecurityValue, locale: Locale): string {
  return typeof value === "string" ? value : value[locale];
}

/** The page's contents: each section anchor with its localized title. */
export function securityToc(page: SecurityPage, locale: Locale): { id: SecuritySectionId; label: string }[] {
  return SECURITY_SECTIONS.map(([id, key]) => ({ id, label: page[key].title[locale] }));
}

let cached: SecurityPage | undefined;

/** The parsed security page; throws on a schema error or an unknown pod or award, so `next build` fails. */
export function getSecurity(): SecurityPage {
  if (cached) return cached;
  const page = SecurityPageSchema.parse(raw);
  const issues = securityIssues(page);
  if (issues.length) throw new Error(`content/security.json: ${issues.join("; ")}`);
  cached = page;
  return page;
}
