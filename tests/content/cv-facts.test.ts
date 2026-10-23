import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getContent, getPod, getProfile, getSkills, getTimelineEntry } from "@/content/load";

/**
 * Round 5 CV refresh (owner request 2026-10-13, updated CV 2026-10-23): the CV PDF in public/cv is
 * the source of truth for the CV-derived facts on the site. Each row pairs a marker from the CV text
 * with what the site must say. The site side always runs; the PDF side needs `pdftotext` (poppler,
 * not installed on CI) and proves each marker is in the committed PDF. Markers never name an employer's client (C3).
 * New CV: replace the PDF, run `bun run cv:pages`, then update these rows and the content together.
 */

const content = getContent();
const pdf = path.join(process.cwd(), "public", "cv", `${content.floors.roof.cv.fileName}.pdf`);
const hasPdftotext = !spawnSync("pdftotext", ["-v"]).error;
let cachedText: string | undefined;

/** CV text with whitespace and the zero-width spaces after the bullets collapsed to single spaces. */
function cvText(): string {
  cachedText ??= spawnSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" }).stdout.replace(/[\s\u200b]+/g, " ");
  return cachedText;
}

const siteText = JSON.stringify(content);

function entry(slug: string) {
  const found = getTimelineEntry(slug);
  if (!found) throw new Error(`no timeline entry ${slug}`);
  return found;
}

function pod(slug: string) {
  const found = getPod(slug);
  if (!found) throw new Error(`no pod ${slug}`);
  return found;
}

interface PeriodRow {
  slug: string;
  cv: string;
  start: string;
  end: string;
}
interface RoleRow {
  slug: string;
  cv: string;
  role: string;
}
interface FactRow {
  cv: string;
  site: string[];
}

const PERIODS: PeriodRow[] = [
  { slug: "metrodata-2026", cv: "(Feb 2026 - Now)", start: "2026-02", end: "present" },
  { slug: "jenius-2024", cv: "(June 2024 - Dec 2025)", start: "2024-06", end: "2025-12" },
  { slug: "jatis-2023", cv: "(Mar 2023 - June 2024)", start: "2023-03", end: "2024-06" },
  { slug: "mnc-2022", cv: "(Feb 2022 - Feb 2023)", start: "2022-02", end: "2023-02" },
  { slug: "temmpat-2025", cv: "(Nov 2025 - Dec 2025)", start: "2025-11", end: "2025-12" },
  { slug: "jublia-2023", cv: "(Sep 2023 - Dec 2023)", start: "2023-09", end: "2023-12" },
  { slug: "telkom-university-2019", cv: "(2019 - 2023)", start: "2019-08", end: "2023-02" },
];

const ROLES: RoleRow[] = [
  { slug: "metrodata-2026", cv: "Technical Consultant Software & AI at PT Mitra Integrasi Informatika (Metrodata)", role: "Technical Consultant, Software & AI" },
  { slug: "jenius-2024", cv: "(Jenius)", role: "Software Engineer" },
  { slug: "jatis-2023", cv: "Full Stack Developer at PT Informasi Teknologi Indonesia", role: "Full Stack Developer" },
  { slug: "mnc-2022", cv: "Backend Engineer at PT MNC Asia Holding Tbk", role: "Backend Engineer" },
  { slug: "temmpat-2025", cv: "Backend Engineer Freelance at TEMMPAT-ID", role: "Backend Engineer (freelance)" },
  { slug: "jublia-2023", cv: "Backend Engineer Freelance at Jublia Pte Ltd.", role: "Backend Engineer (freelance, remote)" },
  { slug: "telkom-university-2019", cv: "Telkom University - Bachelor Computer Science", role: "BSc Computer Science (Informatics)" },
];

/** Numbers and wording from the CV; `site` strings must appear somewhere in site-content.json. */
const FACTS: FactRow[] = [
  { cv: "4+ years", site: ["4+ years", "4+ tahun"] },
  { cv: "12+ enterprise clients", site: ["12+ enterprise clients", "12+ klien enterprise"] },
  { cv: "10+ client projects", site: ["10+ client projects", "10+ proyek klien"] },
  { cv: "cutting prompt tokens by 23%", site: ["-23%"] },
  { cv: "(2s to 0.2s)", site: ["~0.2 s"] },
  { cv: "8 scanning engines", site: ["8 scanning engines"] },
  { cv: "100+ repositories", site: ["100+ repositories"] },
  { cv: "45% CV screening failure rate", site: ["45%"] },
  { cv: "90.9% to 36.4%", site: ["90.9%", "36.4%"] },
  { cv: "270+ automated tests", site: ["270+"] },
  { cv: "21s production stall", site: ["21 s"] },
  { cv: "6 weeks", site: ["6 weeks"] },
  { cv: "reducing manual workloads by 90%", site: ["about 90%"] },
  { cv: "five insurance partners", site: ["five insurance partners"] },
  { cv: "99% uptime", site: ["99% uptime"] },
  { cv: "500+ users", site: ["500+ users"] },
  { cv: "Reduced SonarQube-reported technical debt by 60%", site: ["SonarQube-reported technical debt by 60%"] },
  { cv: "AWS API Gateway WebSocket and Redis, cutting latency by 15%", site: ["AWS API Gateway WebSocket and Redis"] },
  { cv: "search relevance by 40%", site: ["search relevance by 40%"] },
  { cv: "96% accuracy", site: ["96% accuracy"] },
  { cv: "GPA: 3.88 / 4.00", site: ["GPA 3.88 / 4.00"] },
  { cv: "200+ software engineering students", site: ["200+ students"] },
  { cv: "Evaluating 21 teams", site: ["21 teams"] },
  { cv: "It has reviewed 540+ PRs organization-wide", site: ["541 PRs"] },
  { cv: "TOEFL ITP - 547 (2024)", site: ["TOEFL ITP (score 547)"] },
  { cv: "Agentic AI Systems GH-600 (2026)", site: ["GH-600", "GitHub Certified: Agentic AI Developer"] },
  { cv: "Google Generative AI Leader (2026)", site: ["Google Certified: Generative AI Leader"] },
];

describe("CV-derived facts on the site", () => {
  it.each(PERIODS)("$slug runs $start to $end", ({ slug, start, end }) => {
    expect([entry(slug).start, entry(slug).end]).toEqual([start, end]);
  });

  it.each(ROLES)("$slug is titled $role", ({ slug, role }) => {
    expect(entry(slug).role.en).toBe(role);
  });

  it.each(FACTS)("states the CV fact: $cv", ({ site }) => {
    for (const marker of site) expect(siteText, marker).toContain(marker);
  });

  it("leads with the CV's title, Forward Deployed AI Engineer, in both locales (owner decision 2026-10-23)", () => {
    const { headline, bio, currentRole } = getProfile();
    expect(headline).toEqual({ en: "Forward Deployed AI Engineer", id: "Forward Deployed AI Engineer" });
    expect(bio.en.startsWith("I am a Forward Deployed AI Engineer based in Jakarta")).toBe(true);
    expect(bio.id.startsWith("Saya Forward Deployed AI Engineer di Jakarta")).toBe(true);
    // One title, never stacked with an older one.
    expect(siteText).not.toMatch(/Software Engineer (and|dan) AI Engineer|AI (and|dan) Software Engineer|Software & AI Engineer/);
    // The job title stays the real one.
    expect(currentRole.title.en).toBe("Technical Consultant, Software & AI");
  });

  it("lists the TOEFL ITP score with the year the CV gives", () => {
    const toefl = content.certifications.find((c) => c.id === "toefl-itp");
    expect(toefl).toMatchObject({ name: "TOEFL ITP (score 547)", issued: "2024" });
  });

  it("states the summary numbers in both locales", () => {
    const { bio } = getProfile();
    expect(bio.en).toContain("4+ years");
    expect(bio.en).toContain("12+ enterprise clients");
    expect(bio.id).toContain("4+ tahun");
    expect(bio.id).toContain("12+ klien enterprise");
    const summary = entry("metrodata-2026").summary;
    expect(summary.en).toContain("12+ enterprise clients");
    expect(summary.en).toContain("10+ client projects");
    expect(summary.id).toContain("12+ klien enterprise");
    expect(summary.id).toContain("10+ proyek klien");
  });

  it("gives the TEMMPAT case study the CV period and role, with no later date", () => {
    const ticket = pod("ticket-marketplace-backend");
    expect(ticket.period).toEqual({ start: "2025-11", end: "2025-12" });
    expect(ticket.role.en.startsWith("Backend Engineer (freelance)")).toBe(true);
    expect(ticket.role.id.startsWith("Backend Engineer (freelance)")).toBe(true);
    expect(JSON.stringify(ticket)).not.toMatch(/Feb 2026|Lead Backend/);
    expect(entry("temmpat-2025").role.id).toBe("Backend Engineer (freelance)");
  });

  it("counts the AI app template in client projects, as the CV does", () => {
    expect(pod("ai-app-accelerator").results[0].value).toBe("10+");
  });

  it("names the API Gateway WebSocket in the MNC case study", () => {
    const mnc = pod("payments-realtime-backend");
    expect(mnc.stack).toContain("AWS API Gateway WebSocket");
    expect(mnc.architecture?.nodes.find((n) => n.id === "websocket")?.label).toBe("API Gateway WebSocket");
    expect(mnc.approach[0].en).toContain("AWS API Gateway WebSocket");
  });

  it("shows only the BSc: the Master's degree is not on the CV (C7)", () => {
    const education = content.floors.careerArchive.entries.filter((e) => e.type === "education");
    expect(new Set(education.map((e) => e.org))).toEqual(new Set(["Telkom University"]));
    const theses = content.floors.library.publications.filter((p) => p.kind === "thesis");
    expect(theses.map((p) => p.venue)).toEqual(["Telkom University"]);
    expect(siteText).not.toMatch(/Sepuluh Nopember|\bITS\b|Magister|\bMaster'?s\b/);
  });
});

describe.skipIf(!hasPdftotext)("CV markers in the committed PDF", () => {
  it("carries every period, role and fact marker", () => {
    const text = cvText();
    const markers = [...PERIODS, ...ROLES, ...FACTS].map((row) => row.cv);
    const missing = [...markers, "AI and Software Engineer with 4+ years"].filter((marker) => !text.includes(marker));
    expect(missing).toEqual([]);
  });

  it("carries the site headline as its header title", () => {
    expect(cvText()).toContain(`${getProfile().headline.en} - Jakarta, Indonesia`);
  });

  it("no longer lists the Master's degree", () => {
    expect(cvText()).not.toMatch(/Sepuluh Nopember|Master/);
  });
});

/** The CV's skills taxonomy: CV label, then items as "site name|CV name" where the site writes the full product name. */
const CV_SKILLS: { id: string; cv: string; items: string[] }[] = [
  {
    id: "ai",
    cv: "AI/LLM:",
    items: ["Microsoft Agent Framework", "LangGraph", "LangChain", "Azure OpenAI (incl. Realtime)", "RAG", "Hybrid/Vector Search", "Prompt Shields", "LLM evaluation|LLM Evaluation", "Hugging Face"],
  },
  {
    id: "azure",
    cv: "Azure:",
    items: [
      "Azure AI Foundry|AI Foundry",
      "Azure AI Search|AI Search",
      "Cosmos DB",
      "Document Intelligence",
      "Azure Container Apps|Container Apps",
      "Azure App Service|App Service",
      "Azure Functions|Functions",
      "Service Bus",
      "Key Vault",
      "Managed Identity",
      "Microsoft Fabric",
      "Azure Monitor|Monitor",
    ],
  },
  { id: "languages", cv: "Languages:", items: ["Python", "TypeScript", "JavaScript", "Go", "Java", "PHP"] },
  { id: "backend", cv: "Backend:", items: ["FastAPI", "Spring Boot", "Express.js", "Gin", "Echo", "Laravel", "Flask", "Django"] },
  { id: "frontend", cv: "Frontend:", items: ["Next.js", "React", "Vue", "Nuxt", "Tailwind CSS|Tailwind"] },
  { id: "data", cv: "Data and messaging:", items: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "RabbitMQ", "Elasticsearch"] },
  { id: "devops", cv: "DevOps:", items: ["Docker", "Bicep", "GitHub Actions", "Jenkins", "AWS", "LiveKit", "k6", "SonarQube", "Sentry"] },
];
/** Site-only groups the CV does not list (owner, 2026-10-17: Data science and ML, after AI and LLM). */
const SITE_ONLY_SKILLS: { id: string; after: string; items: string[] }[] = [
  {
    id: "ds",
    after: "ai",
    items: ["pandas", "NumPy", "Matplotlib", "Seaborn", "Plotly", "Streamlit", "Jupyter", "scikit-learn", "PyTorch", "Hugging Face Transformers", "Keras", "Sastrawi"],
  },
];
const siteName = (item: string) => item.split("|")[0];
const cvName = (item: string) => item.split("|").pop()!;

describe("skills follow the CV taxonomy", () => {
  it("lists the CV groups in CV order with the CV items", () => {
    const siteOnly = new Set(SITE_ONLY_SKILLS.map((g) => g.id));
    const cvGroups = getSkills().filter((g) => !siteOnly.has(g.id));
    expect(cvGroups.map((g) => ({ id: g.id, items: g.items }))).toEqual(CV_SKILLS.map((g) => ({ id: g.id, items: g.items.map(siteName) })));
  });

  it("adds the site-only groups after their anchor group", () => {
    const ids: string[] = getSkills().map((g) => g.id);
    for (const group of SITE_ONLY_SKILLS) {
      expect(ids.indexOf(group.id), group.id).toBe(ids.indexOf(group.after) + 1);
      expect(getSkills().find((g) => g.id === group.id)?.items).toEqual(group.items);
    }
    expect(getSkills().find((g) => g.id === "ds")?.label).toEqual({ en: "Data science and ML", id: "Data science dan ML" });
  });

  it.skipIf(!hasPdftotext)("matches the skills section of the committed PDF", () => {
    const section = cvText().split("SKILLS")[1]?.split("CERTIFICATION")[0] ?? "";
    for (const group of CV_SKILLS) {
      expect(section, group.cv).toContain(group.cv);
      for (const item of group.items) expect(section, item).toContain(cvName(item));
    }
  });
});
