import { z } from "zod";

/**
 * Content contracts for ShinyQ HQ. Source of truth: spec appendix 06.
 * Documented additions (see AGENTS.md): Confidence "self-reported" (C4),
 * Profile.monogram/subheadline/currentRole/timezone/story/principles,
 * Certification.code, TimelineEntry.url/confidence, Pod.client, PostRef.url,
 * Contact.medium, SideProject.year, top-level awards[], mission steps
 * "palette" and "surprise".
 */

export const LOCALES = ["en", "id"] as const;
export const DEFAULT_LOCALE = "en";
export const LocaleSchema = z.enum(LOCALES);

const nonEmpty = z.string().trim().min(1);

export const LocalizedTextSchema = z.strictObject({
  en: nonEmpty,
  id: nonEmpty,
});

export const YearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");
export const YearMonthOrPresentSchema = z.union([YearMonthSchema, z.literal("present")]);
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const ConfidenceSchema = z.enum(["verified", "strongly-inferred", "self-reported"]);
export const TierSchema = z.enum(["hero", "featured", "listed"]);
export const FloorIdSchema = z.enum(["L1", "L2", "L3", "L4", "RF"]);
export const AccentSchema = z.enum(["violet", "pink", "green", "amber", "cyan", "blue", "white"]);
export const WingSchema = z.enum(["software", "ai"]);
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected kebab-case slug");
export const RoomIdSchema = z
  .string()
  .regex(/^(L1|L2|L3|L4|RF):[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected FloorId:slug");

const httpsUrl = z.url({ protocol: /^https$/ });

export const AssetSchema = z.strictObject({
  src: z.string().startsWith("/", "Asset src must be a path under public/"),
  alt: LocalizedTextSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  redacted: z.boolean(),
});

export const PrincipleSchema = z.strictObject({
  id: SlugSchema,
  title: LocalizedTextSchema,
  text: LocalizedTextSchema,
});

export const ProfileSchema = z.strictObject({
  name: nonEmpty,
  handle: nonEmpty,
  monogram: nonEmpty,
  headline: LocalizedTextSchema,
  subheadline: LocalizedTextSchema,
  currentRole: z.strictObject({
    title: LocalizedTextSchema,
    org: nonEmpty,
    since: YearMonthSchema,
  }),
  location: LocalizedTextSchema,
  timezone: nonEmpty,
  bio: LocalizedTextSchema,
  story: LocalizedTextSchema,
  howIWork: LocalizedTextSchema,
  principles: z.array(PrincipleSchema).min(1).max(6),
  photo: AssetSchema.optional(),
});

export const StatSchema = z.strictObject({
  id: SlugSchema,
  value: nonEmpty,
  label: LocalizedTextSchema,
  source: nonEmpty,
  confidence: ConfidenceSchema,
});

export const SkillGroupSchema = z.strictObject({
  id: z.enum(["software", "ai", "cloud", "data"]),
  label: LocalizedTextSchema,
  items: z.array(nonEmpty).min(1),
});

export const CertificationSchema = z.strictObject({
  id: SlugSchema,
  code: nonEmpty.optional(),
  name: nonEmpty,
  issuer: nonEmpty,
  issued: YearMonthSchema,
  credentialUrl: httpsUrl.optional(),
  status: z.enum(["earned", "in-progress"]),
});

export const TimelineEntrySchema = z.strictObject({
  id: SlugSchema,
  slug: SlugSchema,
  type: z.enum(["job", "freelance", "education", "award", "milestone"]),
  org: nonEmpty,
  role: LocalizedTextSchema,
  start: YearMonthSchema,
  end: YearMonthOrPresentSchema,
  summary: LocalizedTextSchema,
  highlights: z.array(LocalizedTextSchema).max(4),
  stack: z.array(nonEmpty),
  discipline: z.enum(["software", "ai", "data", "other"]),
  podRef: SlugSchema.optional(),
  url: httpsUrl.optional(),
  confidence: ConfidenceSchema.optional(),
  logo: AssetSchema.optional(),
});

export const ResultSchema = z.strictObject({
  value: nonEmpty,
  label: LocalizedTextSchema,
  context: LocalizedTextSchema,
  confidence: ConfidenceSchema,
});

export const ArchitectureNodeSchema = z.strictObject({
  id: SlugSchema,
  label: nonEmpty,
  sublabel: LocalizedTextSchema.optional(),
  layer: z.number().int().min(0),
  row: z.number().int().min(0),
  kind: z.enum(["client", "service", "ai", "data", "human", "external"]),
});

export const ArchitectureEdgeSchema = z.strictObject({
  from: SlugSchema,
  to: SlugSchema,
  label: nonEmpty.optional(),
  async: z.boolean().optional(),
});

export const ArchitectureSchema = z
  .strictObject({
    nodes: z.array(ArchitectureNodeSchema).min(1),
    edges: z.array(ArchitectureEdgeSchema),
  })
  .superRefine((arch, ctx) => {
    const ids = new Set(arch.nodes.map((n) => n.id));
    arch.edges.forEach((edge, i) => {
      for (const end of ["from", "to"] as const) {
        if (!ids.has(edge[end])) {
          ctx.addIssue({
            code: "custom",
            path: ["edges", i, end],
            message: `Unknown architecture node "${edge[end]}"`,
          });
        }
      }
    });
  });

export const PodSchema = z
  .strictObject({
    id: SlugSchema,
    slug: SlugSchema,
    order: z.number().int().min(0),
    tier: TierSchema,
    accent: AccentSchema,
    wing: WingSchema,
    client: nonEmpty.optional(),
    timelineRef: SlugSchema.optional(),
    title: LocalizedTextSchema,
    tagline: LocalizedTextSchema,
    period: z.strictObject({ start: YearMonthSchema, end: YearMonthOrPresentSchema }),
    role: LocalizedTextSchema,
    problem: LocalizedTextSchema,
    approach: z.array(LocalizedTextSchema).min(2).max(5),
    architecture: ArchitectureSchema.optional(),
    results: z.array(ResultSchema).min(1).max(4),
    stack: z.array(nonEmpty).min(1),
    hologram: z.enum(["waveform", "shield", "documents", "graph", "chart", "template", "pipeline"]),
    assets: z.array(AssetSchema),
  })
  .superRefine((pod, ctx) => {
    if (pod.tier === "hero" && (!pod.architecture || pod.architecture.nodes.length < 3)) {
      ctx.addIssue({
        code: "custom",
        path: ["architecture"],
        message: "Hero pods need an architecture with at least 3 nodes",
      });
    }
  });

export const PostRefSchema = z.strictObject({
  slug: SlugSchema,
  title: LocalizedTextSchema,
  date: IsoDateSchema,
  tags: z.array(nonEmpty),
  languages: z.array(LocaleSchema).min(1),
  excerpt: LocalizedTextSchema,
  url: httpsUrl.optional(),
});

export const PublicationSchema = z.strictObject({
  id: SlugSchema,
  title: nonEmpty,
  venue: nonEmpty.optional(),
  year: z.number().int().min(2000).max(2100),
  url: httpsUrl.optional(),
  kind: z.enum(["paper", "thesis", "model", "dataset"]),
  // Research metadata (papers and the thesis); all optional and additive.
  authors: z.array(nonEmpty).min(1).optional(),
  publisher: nonEmpty.optional(),
  date: z.union([IsoDateSchema, YearMonthSchema]).optional(),
  doi: z.string().regex(/^10\.\d{4,9}\/\S+$/, "Expected a DOI such as 10.1109/abc.2021.123").optional(),
  /** Citation count from `library.researchMetrics.source`, as of `library.researchMetrics.asOf`. */
  citations: z.number().int().nonnegative().optional(),
  summary: LocalizedTextSchema.optional(),
  pdf: httpsUrl.optional(),
  code: httpsUrl.optional(),
});

/** Scholar profile metrics shown on the Research shelf, always with their date. */
export const ResearchMetricsSchema = z.strictObject({
  source: nonEmpty,
  citations: z.number().int().nonnegative(),
  hIndex: z.number().int().nonnegative(),
  asOf: YearMonthSchema,
});

export const TalkSchema = z.strictObject({
  id: SlugSchema,
  title: LocalizedTextSchema,
  event: nonEmpty,
  date: YearMonthSchema,
  role: z.enum(["speaker", "author", "trainer"]),
});

export const ContactSchema = z.strictObject({
  email: z.email(),
  linkedin: httpsUrl,
  github: httpsUrl,
  huggingface: httpsUrl.optional(),
  medium: httpsUrl.optional(),
  googleScholar: httpsUrl.optional(),
  ieeeXplore: httpsUrl.optional(),
});

export const CvSectionSchema = z.enum([
  "summary",
  "experience",
  "projects",
  "education",
  "certifications",
  "awards",
  "skills",
]);

export const CvConfigSchema = z.strictObject({
  fileName: SlugSchema,
  sections: z.array(CvSectionSchema).min(1),
});

export const SideProjectSchema = z.strictObject({
  id: SlugSchema,
  title: nonEmpty,
  summary: LocalizedTextSchema,
  stack: z.array(nonEmpty),
  year: z.number().int().min(2016).max(2100).optional(),
  url: httpsUrl.optional(),
  repo: httpsUrl.optional(),
});

export const RepoRefSchema = z.strictObject({
  name: nonEmpty,
  url: httpsUrl,
  description: LocalizedTextSchema,
  language: nonEmpty,
  stars: z.number().int().min(0),
});

export const AwardSchema = z.strictObject({
  id: SlugSchema,
  title: nonEmpty,
  placement: LocalizedTextSchema,
  organizer: nonEmpty.optional(),
  date: YearMonthSchema,
});

const Vec2Schema = z.strictObject({ x: z.number(), z: z.number() });
export const DrawerTabSchema = z.enum(["overview", "architecture", "results", "stack"]);

export const MissionStepSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("elevator"), floor: FloorIdSchema }),
  z.strictObject({ kind: z.literal("drive"), to: z.union([RoomIdSchema, Vec2Schema]) }),
  z.strictObject({ kind: z.literal("open"), room: RoomIdSchema, tab: DrawerTabSchema.optional() }),
  z.strictObject({ kind: z.literal("say"), text: LocalizedTextSchema, ms: z.number().int().positive().optional() }),
  z.strictObject({ kind: z.literal("palette"), filter: z.enum(["pods", "rooms", "posts"]) }),
  z.strictObject({ kind: z.literal("surprise") }),
]);

export const MissionSchema = z.strictObject({
  id: SlugSchema,
  order: z.number().int().min(0),
  label: LocalizedTextSchema,
  steps: z.array(MissionStepSchema).min(1),
});

export const SiteContentSchema = z.strictObject({
  profile: ProfileSchema,
  stats: z.array(StatSchema).min(4).max(6),
  skills: z.array(SkillGroupSchema).min(1),
  certifications: z.array(CertificationSchema),
  awards: z.array(AwardSchema),
  floors: z.strictObject({
    careerArchive: z.strictObject({ entries: z.array(TimelineEntrySchema).min(1) }),
    labs: z.strictObject({ pods: z.array(PodSchema).min(1) }),
    library: z.strictObject({
      posts: z.array(PostRefSchema),
      publications: z.array(PublicationSchema),
      talks: z.array(TalkSchema),
      researchMetrics: ResearchMetricsSchema.optional(),
    }),
    roof: z.strictObject({
      contact: ContactSchema,
      availability: LocalizedTextSchema,
      cv: CvConfigSchema,
    }),
  }),
  sideProjects: z.array(SideProjectSchema),
  publicRepos: z.array(RepoRefSchema),
  missions: z.array(MissionSchema).min(1),
});

export type Locale = z.infer<typeof LocaleSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type YearMonth = z.infer<typeof YearMonthSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type FloorId = z.infer<typeof FloorIdSchema>;
export type Accent = z.infer<typeof AccentSchema>;
export type Wing = z.infer<typeof WingSchema>;
export type RoomId = z.infer<typeof RoomIdSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Principle = z.infer<typeof PrincipleSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Stat = z.infer<typeof StatSchema>;
export type SkillGroup = z.infer<typeof SkillGroupSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;
export type Pod = z.infer<typeof PodSchema>;
export type PostRef = z.infer<typeof PostRefSchema>;
export type Publication = z.infer<typeof PublicationSchema>;
export type ResearchMetrics = z.infer<typeof ResearchMetricsSchema>;
export type Talk = z.infer<typeof TalkSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type CvSection = z.infer<typeof CvSectionSchema>;
export type CvConfig = z.infer<typeof CvConfigSchema>;
export type SideProject = z.infer<typeof SideProjectSchema>;
export type RepoRef = z.infer<typeof RepoRefSchema>;
export type Award = z.infer<typeof AwardSchema>;
export type DrawerTab = z.infer<typeof DrawerTabSchema>;
export type MissionStep = z.infer<typeof MissionStepSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type SiteContent = z.infer<typeof SiteContentSchema>;
