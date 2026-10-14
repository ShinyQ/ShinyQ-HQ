/**
 * L3 Tech Reactor rings (owner decision 2026-10-14: "Rings are your CV skill groups (AI and LLM,
 * Azure, Backend, Frontend, Data, DevOps)"). The seven CV skill groups map onto six rings; languages
 * fold into Backend or Frontend by tech. Pod techs that the CV does not list get an explicit ring here,
 * or sit in `MISC_TECH` (third-party integrations that fit no ring). Keys are `normalizeTech` forms.
 * Pure data: the client may import it.
 */
export const REACTOR_RINGS = ["ai", "azure", "backend", "frontend", "data", "devops"] as const;
export type ReactorRingId = (typeof REACTOR_RINGS)[number];

/** CV skill group id (`content/site-content.json` `skills[].id`) to ring; `languages` goes per tech. */
export const GROUP_RING: Readonly<Record<string, ReactorRingId>> = {
  ai: "ai",
  azure: "azure",
  backend: "backend",
  frontend: "frontend",
  data: "data",
  devops: "devops",
};

/** CV languages: server languages to Backend, browser languages to Frontend. */
export const LANGUAGE_RING: Readonly<Record<string, ReactorRingId>> = {
  python: "backend",
  go: "backend",
  java: "backend",
  php: "backend",
  typescript: "frontend",
  javascript: "frontend",
};

/** Spellings of one tech in content: alias key to canonical key (the CV spelling when the CV lists it). */
export const TECH_ALIASES: Readonly<Record<string, string>> = {
  "app service": "azure app service",
  "azure key vault": "key vault",
  "microsoft entra id": "entra id",
  "container apps": "azure container apps",
  "blob storage": "azure blob storage",
  express: "express.js",
  "vue.js": "vue",
  "azure openai realtime": "azure openai",
};

/** Pod techs the CV skill groups do not list, by ring. Every key must be used by some pod (unit test). */
export const EXTRA_RING: Readonly<Record<string, ReactorRingId>> = {
  // AI and LLM
  "azure ai content safety": "ai",
  openai: "ai",
  "azure speech": "ai",
  "azure voice live": "ai",
  xgboost: "ai",
  lightgbm: "ai",
  "onnx runtime web": "ai",
  "microsoft 365 copilot": "ai",
  "github copilot": "ai",
  "claude code": "ai",
  codex: "ai",
  "github spec kit": "ai",
  // AI and LLM: the Data and ML wing's models and NLP tooling (owner request 2026-10-14)
  indobert: "ai",
  indobertweet: "ai",
  pytorch: "ai",
  tensorflow: "ai",
  "scikit-learn": "ai",
  gensim: "ai",
  sastrawi: "ai",
  "n-beats": "ai",
  darts: "ai",
  // Azure
  "entra id": "azure",
  "durable functions": "azure",
  "azure blob storage": "azure",
  "application insights": "azure",
  "azure managed applications": "azure",
  "container apps jobs": "azure",
  "azure vms": "azure",
  "marketplace metering api": "azure",
  "azure resource manager": "azure",
  "log analytics": "azure",
  // Backend
  "node.js": "backend",
  bun: "backend",
  sequelize: "backend",
  "socket.io": "backend",
  jwt: "backend",
  "google oauth": "backend",
  graphql: "backend",
  swagger: "backend",
  prisma: "backend",
  "drizzle orm": "backend",
  hono: "backend",
  kysely: "backend",
  alembic: "backend",
  // Frontend
  "shadcn/ui": "frontend",
  "tanstack table": "frontend",
  "tanstack query": "frontend",
  bootstrap: "frontend",
  jquery: "frontend",
  datatables: "frontend",
  ckeditor: "frontend",
  "chart.js": "frontend",
  // Data
  minio: "data",
  lakehouse: "data",
  "spark notebooks": "data",
  "fabric data pipelines": "data",
  "data api builder": "data",
  // Data: the Data and ML wing's analysis, charting and collection tools (owner request 2026-10-14)
  pandas: "data",
  jupyter: "data",
  matplotlib: "data",
  plotly: "data",
  streamlit: "data",
  scipy: "data",
  pulp: "data",
  yfinance: "data",
  requests: "data",
  openpyxl: "data",
  // DevOps
  opentelemetry: "devops",
  nginx: "devops",
  prometheus: "devops",
  grafana: "devops",
  jest: "devops",
  mocha: "devops",
  chai: "devops",
  sinon: "devops",
  vitest: "devops",
  locust: "devops",
  moonrepo: "devops",
  pnpm: "devops",
  semgrep: "devops",
  bandit: "devops",
  trivy: "devops",
  "osv-scanner": "devops",
  grype: "devops",
  gitleaks: "devops",
  trufflehog: "devops",
  checkov: "devops",
  keda: "devops",
  "arm templates": "devops",
  "arm-ttk": "devops",
  "github apps": "devops",
  digitalocean: "devops",
  "nessus api": "devops",
  "aws s3": "devops",
  "aws lambda": "devops",
  "aws api gateway websocket": "devops",
  "aws ec2": "devops",
};

/** Third-party integrations that fit no ring: left out of the reactor on purpose (explicit allowlist). */
export const MISC_TECH: ReadonlySet<string> = new Set(["ipaymu", "rajaongkir", "brevo", "sap integration", "sftp"]);
