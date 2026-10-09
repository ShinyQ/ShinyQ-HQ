/**
 * Tech logo registry. Maps every stack and skill name used in content (with
 * aliases) to a committed icon under public/tech/. Pure data, safe for client
 * bundles. Sources and licences: public/tech/README.md.
 */

export interface TechLogo {
  /** Path under public/, e.g. "/tech/nextjs.svg". */
  src: string;
  /** Canonical product name for alt text and tooltips. */
  label: string;
}

interface Entry {
  label: string;
  file: string;
  aliases?: readonly string[];
}

const svg = (key: string, label: string, aliases?: readonly string[]): [string, Entry] => [key, { label, file: `${key}.svg`, aliases }];
const webp = (key: string, label: string, aliases?: readonly string[]): [string, Entry] => [key, { label, file: `${key}.webp`, aliases }];

const ENTRIES: readonly [string, Entry][] = [
  svg("nodejs", "Node.js", ["node", "nodejs"]),
  svg("express", "Express", ["express.js", "expressjs"]),
  webp("spring-boot", "Spring Boot"),
  svg("kafka", "Apache Kafka", ["kafka"]),
  webp("redis", "Redis"),
  svg("postgresql", "PostgreSQL", ["postgres"]),
  webp("react", "React"),
  svg("mocha", "Mocha"),
  svg("chai", "Chai"),
  svg("k6", "k6"),
  svg("docker", "Docker", ["docker compose"]),
  webp("jenkins", "Jenkins"),
  webp("aws", "AWS", ["amazon web services", "aws s3", "aws lambda", "aws ec2", "aws websocket apis"]),
  svg("bun", "Bun"),
  svg("sequelize", "Sequelize"),
  svg("socketio", "Socket.IO"),
  svg("jwt", "JWT", ["json web token"]),
  svg("brevo", "Brevo"),
  svg("nginx", "nginx"),
  svg("prometheus", "Prometheus"),
  svg("grafana", "Grafana"),
  svg("jest", "Jest"),
  svg("python", "Python"),
  webp("fastapi", "FastAPI"),
  svg("nextjs", "Next.js"),
  svg("typescript", "TypeScript"),
  svg("github-actions", "GitHub Actions"),
  svg("go", "Go", ["golang"]),
  webp("echo", "Echo"),
  webp("laravel", "Laravel"),
  svg("php", "PHP"),
  webp("mysql", "MySQL"),
  webp("vue", "Vue.js", ["vue"]),
  svg("tailwind", "Tailwind CSS", ["tailwind"]),
  svg("sonarqube", "SonarQube"),
  svg("gin", "Gin"),
  svg("graphql", "GraphQL"),
  svg("sentry", "Sentry"),
  svg("digitalocean", "DigitalOcean"),
  svg("swagger", "Swagger", ["openapi"]),
  svg("prisma", "Prisma"),
  svg("tanstack", "TanStack", ["tanstack table", "tanstack query"]),
  svg("shadcn", "shadcn/ui", ["shadcn"]),
  svg("elasticsearch", "Elasticsearch"),
  svg("langchain", "LangChain"),
  svg("langgraph", "LangGraph"),
  svg("rabbitmq", "RabbitMQ"),
  webp("flask", "Flask"),
  svg("locust", "Locust"),
  svg("hono", "Hono"),
  svg("minio", "MinIO"),
  svg("moonrepo", "moonrepo"),
  svg("pnpm", "pnpm"),
  svg("vitest", "Vitest"),
  svg("bootstrap", "Bootstrap"),
  svg("jquery", "jQuery"),
  svg("chartjs", "Chart.js"),
  svg("livekit", "LiveKit"),
  svg("opentelemetry", "OpenTelemetry"),
  svg("trivy", "Trivy"),
  svg("spark", "Apache Spark", ["spark", "spark notebooks"]),
  svg("github-copilot", "GitHub Copilot"),
  svg("claude", "Claude", ["claude code"]),
  svg("onnx", "ONNX Runtime", ["onnx", "onnx runtime web"]),
  svg("android", "Android"),
  svg("codeigniter", "CodeIgniter"),
  svg("jupyter", "Jupyter"),
  svg("tensorflow", "TensorFlow"),
  svg("pytorch", "PyTorch"),
  webp("streamlit", "Streamlit"),
  svg("kubernetes", "Kubernetes"),
  webp("huggingface", "Hugging Face"),
  svg("scipy", "SciPy"),
  svg("astro", "Astro"),
  svg("cloudflare-pages", "Cloudflare Pages"),
  svg("html", "HTML", ["html5"]),
  svg("javascript", "JavaScript"),
  svg("leaflet", "Leaflet"),
  svg("sqlite", "SQLite"),
  svg("github", "GitHub", ["github apps", "github spec kit"]),
  svg("medium", "Medium"),
  svg("google-scholar", "Google Scholar"),
  svg("ieee", "IEEE", ["ieee xplore"]),
  svg("git", "Git"),
  webp("django", "Django"),
  svg("google", "Google", ["google oauth"]),
  svg("sap", "SAP", ["sap integration"]),
  svg("azure", "Microsoft Azure", ["azure", "azure resource manager", "bicep"]),
  svg("azure-openai", "Azure OpenAI", ["azure openai realtime"]),
  svg("azure-ai-search", "Azure AI Search", ["rag with azure ai search"]),
  svg("azure-speech", "Azure AI Speech", ["azure speech", "azure voice live"]),
  svg("document-intelligence", "Azure AI Document Intelligence", ["document intelligence"]),
  svg("azure-functions", "Azure Functions", ["durable functions"]),
  svg("cosmos-db", "Azure Cosmos DB", ["cosmos db"]),
  svg("app-service", "Azure App Service", ["app service"]),
  svg("azure-vms", "Azure Virtual Machines", ["azure vms"]),
  svg("application-insights", "Application Insights"),
  svg("container-apps", "Azure Container Apps", ["container apps", "container apps jobs"]),
  svg("service-bus", "Azure Service Bus", ["service bus"]),
  svg("content-safety", "Azure AI Content Safety"),
  svg("foundry", "Microsoft Foundry", ["azure ai foundry"]),
  svg("key-vault", "Azure Key Vault", ["key vault"]),
  svg("managed-identity", "Managed Identity"),
  svg("blob-storage", "Azure Blob Storage", ["blob storage"]),
  svg("managed-applications", "Azure Managed Applications"),
  svg("log-analytics", "Log Analytics"),
  svg("azure-monitor", "Azure Monitor"),
  svg("arm-templates", "ARM templates"),
  webp("agent-framework", "Microsoft Agent Framework"),
];

/**
 * Names used in content that intentionally render as text chips: concepts,
 * models and tools without a usable logo. Normalized form (see normalizeTech).
 */
export const TEXT_ONLY_TECH: ReadonlySet<string> = new Set([
  "sftp",
  "ipaymu",
  "rajaongkir",
  "sinon",
  "alembic",
  "kysely",
  "datatables",
  "ckeditor",
  "openai",
  "semgrep",
  "bandit",
  "osv-scanner",
  "grype",
  "gitleaks",
  "trufflehog",
  "checkov",
  "keda",
  "xgboost",
  "lightgbm",
  "naive bayes",
  "n-beats",
  "indobert",
  "nlp",
  "machine learning",
  "rest apis",
  "sso",
  "ai agents",
  "prompt engineering",
  "llm evaluation",
  "forecasting",
  "marketplace metering api",
  "arm-ttk",
  "lakehouse",
  "data api builder",
  "fabric data pipelines",
  "microsoft fabric",
  "microsoft 365 copilot",
  "nessus api",
  "entra id",
  "microsoft entra id",
]);

/** Lowercases, drops parentheticals and trailing version numbers ("Next.js 14" to "next.js"). */
export function normalizeTech(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+v?\d+(\.\d+)*$/, "");
}

const INDEX = new Map<string, TechLogo>();
for (const [key, entry] of ENTRIES) {
  const logo: TechLogo = { src: `/tech/${entry.file}`, label: entry.label };
  for (const name of [key, entry.label, ...(entry.aliases ?? [])]) INDEX.set(normalizeTech(name), logo);
}

/** Compound names such as "Node.js / Express" resolve to their first part with a logo. */
function parts(name: string): string[] {
  return name.split(/\s+\/\s+/).map(normalizeTech);
}

/** Logo for a stack or skill name (or a kebab-case tag such as "azure-openai"), or null for a text chip. */
export function getTechLogo(name: string): TechLogo | null {
  const whole = INDEX.get(normalizeTech(name)) ?? INDEX.get(normalizeTech(name.replace(/-/g, " ")));
  if (whole) return whole;
  for (const part of parts(name)) {
    const hit = INDEX.get(part);
    if (hit) return hit;
  }
  return null;
}

/** True when a name is deliberately rendered without a logo. */
export function isTextOnlyTech(name: string): boolean {
  return TEXT_ONLY_TECH.has(normalizeTech(name)) || parts(name).every((p) => TEXT_ONLY_TECH.has(p));
}

/** Every committed logo file, for asset tests and the 3D texture atlas. */
export function allTechLogos(): TechLogo[] {
  return ENTRIES.map(([, e]) => ({ src: `/tech/${e.file}`, label: e.label }));
}
