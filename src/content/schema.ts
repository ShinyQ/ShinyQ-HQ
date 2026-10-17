import { z } from "zod";
import { liveUrlProblem } from "./live-links";
import { LOCALES } from "./locales";

/**
 * Content contracts for ShinyQ HQ. Source of truth: spec appendix 06.
 * Documented additions (see docs/agents/content.md, "Schema additions"): Confidence "self-reported" (C4),
 * Profile.subheadline/currentRole/timezone/story/principles,
 * Certification.code/credentialId/expires/featured and status "expired", TimelineEntry.url/confidence, Pod.client, Pod.liveUrl, Pod.selected, PostRef.url,
 * Contact.medium, SideProject.year, top-level awards[], mission steps
 * "palette" and "surprise", the separate perspectives file (PerspectivesFileSchema), top-level `production`
 * (ProductionSchema).
 */

export { DEFAULT_LOCALE, LOCALES } from "./locales";
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
/** "YYYY-MM", or "YYYY" when the source (the CV) gives only a year; never invent a month. */
export const YearOrYearMonthSchema = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "Expected YYYY or YYYY-MM");
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const ConfidenceSchema = z.enum(["verified", "strongly-inferred", "self-reported"]);
export const TierSchema = z.enum(["hero", "featured", "listed"]);
export const FloorIdSchema = z.enum(["L1", "L2", "L3", "L4", "RF"]);
export const AccentSchema = z.enum(["violet", "pink", "green", "amber", "cyan", "blue", "white"]);
/** L3 wings: `software` (north), `ai` (south) and `data` (the Data and ML annex east of the Tech Reactor, owner request 2026-10-14). */
export const WingSchema = z.enum(["software", "ai", "data"]);
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected kebab-case slug");
export const RoomIdSchema = z
  .string()
  .regex(/^(L1|L2|L3|L4|RF):[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected FloorId:slug");

const httpsUrl = z.url({ protocol: /^https$/ });
/** A public repository of the owner on GitHub (repo root only). */
export const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/ShinyQ\/[A-Za-z0-9._-]+$/;

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

/** Skill groups follow the CV's taxonomy, in CV order (round 5 CV refresh, 2026-10-13). */
export const SkillGroupSchema = z.strictObject({
  id: z.enum(["ai", "azure", "languages", "backend", "frontend", "data", "devops"]),
  label: LocalizedTextSchema,
  items: z.array(nonEmpty).min(1),
});

export const CertificationSchema = z.strictObject({
  id: SlugSchema,
  code: nonEmpty.optional(),
  name: nonEmpty,
  issuer: nonEmpty,
  issued: YearOrYearMonthSchema,
  credentialUrl: httpsUrl.optional(),
  /** Public credential or certificate ID, shown in the preview card. */
  credentialId: nonEmpty.optional(),
  status: z.enum(["earned", "in-progress", "expired"]),
  /** Renewal or expiry month (role-based Microsoft certifications renew yearly). */
  expires: YearMonthSchema.optional(),
  /** Pin to the featured cards (at most 3 are shown; the newest earned fill the rest). */
  featured: z.boolean().optional(),
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
  /** How the number was measured; omitted when there is nothing to add. */
  context: LocalizedTextSchema.optional(),
  /** Internal provenance for content review; never rendered on the site or sent to Ask. */
  confidence: ConfidenceSchema,
});

export const ArchitectureNodeSchema = z.strictObject({
  id: SlugSchema,
  label: nonEmpty,
  sublabel: LocalizedTextSchema.optional(),
  layer: z.number().int().min(0),
  row: z.number().int().min(0),
  kind: z.enum(["client", "service", "ai", "data", "human", "external"]),
  /** Optional frame around related nodes in the drawn diagram (for example a cloud or a platform name). */
  group: nonEmpty.optional(),
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

/** Post-local architecture diagrams (content/blog/diagrams.json): post slug, then diagram id, then a pod-shaped `architecture`. */
export const PostDiagramsSchema = z.record(SlugSchema, z.record(SlugSchema, ArchitectureSchema));

/** Longest `Pod.shortTitle` in either locale (one line on an L3 directory board). */
export const SHORT_TITLE_MAX = 32;

export const PodSchema = z
  .strictObject({
    id: SlugSchema,
    slug: SlugSchema,
    order: z.number().int().min(0),
    /**
     * Owner pick for the landing's "Selected work" (owner decision 2026-10-15): its rank, 1 first. Independent of
     * `tier`, so a hero can stay a key project without being on the landing. Needs a gallery; ranks are unique.
     */
    selected: z.number().int().min(1).max(3).optional(),
    tier: TierSchema,
    accent: AccentSchema,
    wing: WingSchema,
    /**
     * A proper name (employer, or a freelance client the owner allowed, C8) or a
     * localized sector label for a client of an employer, whose name never ships (C3).
     */
    client: z.union([nonEmpty, LocalizedTextSchema]).optional(),
    timelineRef: SlugSchema.optional(),
    title: LocalizedTextSchema,
    /** Board title on the L3 directory (one line); every other surface keeps `title`. At most 32 characters, shorter than `title`. */
    shortTitle: LocalizedTextSchema.optional(),
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
    /** Public live site (R4-J): https, site root only, host in `PUBLIC_LIVE_HOSTS`. Read it through `podLiveLink`. */
    liveUrl: httpsUrl.optional(),
    /** The owner's public repositories for this project (`github.com/ShinyQ/<repo>`, roots only), main repository first. */
    repos: z.array(httpsUrl.regex(GITHUB_REPO_PATTERN, "Expected https://github.com/ShinyQ/<repo>")).min(1).max(4).optional(),
    /** Ids of `floors.library.publications` that come from this project (papers, the thesis, models). */
    publications: z.array(SlugSchema).min(1).optional(),
  })
  .superRefine((pod, ctx) => {
    if (pod.liveUrl) {
      const problem = liveUrlProblem(pod.liveUrl);
      if (problem) ctx.addIssue({ code: "custom", path: ["liveUrl"], message: problem });
    }
    if (pod.shortTitle) {
      for (const locale of LOCALES) {
        const short = pod.shortTitle[locale];
        if (short.length > SHORT_TITLE_MAX) {
          ctx.addIssue({ code: "custom", path: ["shortTitle", locale], message: `Short title is longer than ${SHORT_TITLE_MAX} characters` });
        }
        if (short.length >= pod.title[locale].length) {
          ctx.addIssue({ code: "custom", path: ["shortTitle", locale], message: "Short title must be shorter than the title" });
        }
      }
    }
    if (pod.selected !== undefined && pod.assets.length === 0) {
      ctx.addIssue({ code: "custom", path: ["selected"], message: "Selected work needs at least one gallery image" });
    }
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

/**
 * A paper PDF hosted on this site (`public/papers/{file}.pdf`, page images from `bun run paper:pages`).
 * Rules (README "Paper PDFs"): personal data is redacted by rasterizing the page, and IEEE papers are
 * only ever the authors' manuscript with IEEE's notice, never the publisher's final PDF.
 */
export const PaperDocumentSchema = z.strictObject({
  file: SlugSchema,
  /** `manuscript`: the authors' version; `redacted`: the full text with personal data blacked out; `published`: the publisher's PDF (only where the publisher allows it). */
  version: z.enum(["manuscript", "redacted", "published"]),
  /** Publisher notice shown next to the PDF; `ieee` is IEEE's author posting notice. */
  notice: z.enum(["ieee"]).optional(),
});

export const PublicationSchema = z
  .strictObject({
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
    /** Abstract for the paper preview modal, English only (written for this site, not copied from the publisher). */
    abstract: nonEmpty.optional(),
    /** Page range for citations, written "1-6". */
    pages: z.string().regex(/^\d+(?:-\d+)?$/, "Expected a page range such as 1-6").optional(),
    pdf: httpsUrl.optional(),
    code: httpsUrl.optional(),
    /** Self-hosted PDF, read in the in-site paper reader (papers and the thesis only). */
    document: PaperDocumentSchema.optional(),
  })
  .superRefine((pub, ctx) => {
    const doc = pub.document;
    if (!doc) return;
    if (pub.kind === "model" || pub.kind === "dataset") {
      ctx.addIssue({ code: "custom", path: ["document"], message: "Only papers and theses can have a document" });
    }
    if (pub.publisher === "IEEE" && (doc.version !== "manuscript" || doc.notice !== "ieee")) {
      ctx.addIssue({
        code: "custom",
        path: ["document"],
        message: "IEEE papers may only host the authors' manuscript with the IEEE notice (version manuscript, notice ieee)",
      });
    }
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

/** The owner's CV, committed as-is at `public/cv/{fileName}.pdf` (one file for both locales). */
export const CvConfigSchema = z.strictObject({
  fileName: SlugSchema,
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

/**
 * Kurniadi's written professional perspectives (content/perspectives.json, owner decision
 * 2026-10-12). Kept outside SiteContent so drafts can be reviewed before anything publishes; read
 * entries only through `getPerspectives()` (published) in `@/content/load`.
 */
export const PERSPECTIVE_QUESTION_MAX = 120;
/** 520 until 2026-10-15; the owner's lifestyle, industry and policy answers run up to about 610 characters as written. */
export const PERSPECTIVE_ANSWER_MAX = 640;
export const PERSPECTIVES_MIN = 10;
/** 20 until 2026-10-15, when 30 endorsed answers joined the 15 engineering entries. */
export const PERSPECTIVES_MAX = 50;
/** Hosts a perspective `references` URL may point to: public primary sources for facts from outside the site. */
export const PERSPECTIVE_REFERENCE_HOSTS = ["news.microsoft.com"] as const;

const boundedText = (max: number) => z.strictObject({ en: nonEmpty.max(max), id: nonEmpty.max(max) });

export const PerspectiveSourceSchema = z.strictObject({
  kind: z.enum(["post", "talk", "project"]),
  slug: SlugSchema,
});

/**
 * A public primary source for a fact in an answer that the site itself does not hold (owner request
 * 2026-10-15: "cited to its public URL"). Kept for review and audits; the knowledge pack names the
 * label, never the URL, and Ask never links it (`isAskCite` stays site-only).
 */
export const PerspectiveReferenceSchema = z.strictObject({
  label: nonEmpty.max(200),
  url: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && (PERSPECTIVE_REFERENCE_HOSTS as readonly string[]).includes(url.hostname);
    }, "references must be https URLs on an allowed host (PERSPECTIVE_REFERENCE_HOSTS)"),
});

export const PerspectiveSchema = z.strictObject({
  id: SlugSchema,
  question: boundedText(PERSPECTIVE_QUESTION_MAX),
  answer: boundedText(PERSPECTIVE_ANSWER_MAX),
  tags: z.array(SlugSchema).min(1).max(6),
  asOf: YearMonthSchema,
  sources: z.array(PerspectiveSourceSchema).min(1).max(4).optional(),
  references: z.array(PerspectiveReferenceSchema).min(1).max(2).optional(),
  /** true publishes this entry, false pins it as a draft, absent follows the file `status`. */
  approved: z.boolean().optional(),
});

export const PerspectivesFileSchema = z
  .strictObject({
    $comment: z.string().optional(),
    status: z.enum(["draft", "approved"]),
    entries: z.array(PerspectiveSchema).min(PERSPECTIVES_MIN).max(PERSPECTIVES_MAX),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.entries.forEach((entry, i) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({ code: "custom", path: ["entries", i, "id"], message: `Duplicate perspective id "${entry.id}"` });
      }
      seen.add(entry.id);
    });
  });

/**
 * How ShinyQ HQ itself was built (content/ask/site-build.json, owner request 2026-10-15): Ask the HQ
 * knowledge only; the long form renders on the /build page (content/build-story.json). One knowledge
 * chunk (`site-build`) that answers questions about the site's stack, 3D engine, hosting, the assistant,
 * testing and process, and how visitors use it (Rover, floors, minimap, settings, links; the "This site"
 * pills), cited to the How this site was built page (`/build`), which links the public repository. Facts
 * only, third person, never a client, resource or host name.
 */
export const SITE_BUILD_TEXT_MAX = 2600;
export const SITE_BUILD_SOURCE = "https://github.com/ShinyQ/ShinyQ-HQ";

export const SiteBuildSchema = z.strictObject({
  $comment: z.string().optional(),
  asOf: IsoDateSchema,
  title: LocalizedTextSchema,
  /** The public repository (the footer's source code link); the chunk itself cites the /build page. */
  source: z.literal(SITE_BUILD_SOURCE),
  text: boundedText(SITE_BUILD_TEXT_MAX),
  keywords: z.array(z.string().trim().min(2).max(32).regex(/^[a-z0-9][a-z0-9 .+-]*$/, "Lowercase keywords")).min(4).max(40),
});

/**
 * "How I run AI in production" (owner approved 2026-10-14): the About section `#production`, the L3 Ops
 * Control Room (`L3:ops`) and its Ask chunk. Facts only, aggregated, no client or resource names. Each proof
 * tile fills one Ops Control Room screen (`panel`); `alerts` are the rule families on the Alerts screen.
 */
export const ProductionPanelSchema = z.enum(["metrics", "traces", "alerts"]);

export const ProductionSchema = z.strictObject({
  title: LocalizedTextSchema,
  intro: LocalizedTextSchema,
  points: z.array(z.strictObject({ id: SlugSchema, lead: LocalizedTextSchema, text: LocalizedTextSchema })).min(2).max(6),
  outro: LocalizedTextSchema,
  tiles: z
    .array(
      z.strictObject({
        id: SlugSchema,
        label: LocalizedTextSchema,
        value: LocalizedTextSchema,
        detail: LocalizedTextSchema,
        panel: ProductionPanelSchema,
      }),
    )
    .min(3)
    .max(6),
  alerts: z.array(LocalizedTextSchema).min(1).max(6),
  /** Pod slugs of the case studies that prove it (checked against the pods in tests/content/production.test.ts). */
  caseStudies: z.array(SlugSchema).min(1).max(6),
  /** A masked Bicep excerpt of one alert rule: every resource, client and project name is a neutral placeholder. */
  alertExcerpt: z.strictObject({ caption: LocalizedTextSchema, code: nonEmpty }).optional(),
  /** A masked dashboard screenshot rendered locally with demo traffic (`public/media/production/`). */
  dashboard: AssetSchema.extend({ caption: LocalizedTextSchema }).optional(),
});

/** The dataset shape without cross-reference checks (`validate-fragment.ts` extends it). */
export const SiteContentObjectSchema = z.strictObject({
  profile: ProfileSchema,
  production: ProductionSchema,
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

export const SiteContentSchema = SiteContentObjectSchema.superRefine((content, ctx) => {
  const ranks = new Set<number>();
  content.floors.labs.pods.forEach((pod, i) => {
    if (pod.selected === undefined) return;
    if (ranks.has(pod.selected)) ctx.addIssue({ code: "custom", path: ["floors", "labs", "pods", i, "selected"], message: `Selected rank ${pod.selected} is used twice` });
    ranks.add(pod.selected);
  });
  const ids = new Set(content.floors.library.publications.map((p) => p.id));
  content.floors.labs.pods.forEach((pod, i) => {
    pod.publications?.forEach((id, j) => {
      if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["floors", "labs", "pods", i, "publications", j], message: `Unknown publication "${id}"` });
    });
  });
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
export type Production = z.infer<typeof ProductionSchema>;
export type ProductionPanel = z.infer<typeof ProductionPanelSchema>;
export type Stat = z.infer<typeof StatSchema>;
export type SkillGroup = z.infer<typeof SkillGroupSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;
export type PostDiagrams = z.infer<typeof PostDiagramsSchema>;
export type Pod = z.infer<typeof PodSchema>;
export type PostRef = z.infer<typeof PostRefSchema>;
export type Publication = z.infer<typeof PublicationSchema>;
export type ResearchMetrics = z.infer<typeof ResearchMetricsSchema>;
export type Talk = z.infer<typeof TalkSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type CvConfig = z.infer<typeof CvConfigSchema>;
export type SideProject = z.infer<typeof SideProjectSchema>;
export type RepoRef = z.infer<typeof RepoRefSchema>;
export type Award = z.infer<typeof AwardSchema>;
export type DrawerTab = z.infer<typeof DrawerTabSchema>;
export type MissionStep = z.infer<typeof MissionStepSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type SiteContent = z.infer<typeof SiteContentSchema>;
export type PerspectiveSource = z.infer<typeof PerspectiveSourceSchema>;
export type PerspectiveReference = z.infer<typeof PerspectiveReferenceSchema>;
export type Perspective = z.infer<typeof PerspectiveSchema>;
export type PerspectivesFile = z.infer<typeof PerspectivesFileSchema>;
export type SiteBuild = z.infer<typeof SiteBuildSchema>;
