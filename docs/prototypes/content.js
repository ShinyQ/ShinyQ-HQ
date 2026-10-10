// Shared, public-safe portfolio content for all prototypes.
// No client names, internal codenames or repo names (public labels only).
// Sanitized for this public repo: personal education history and money amounts removed.
window.PORTFOLIO = {
  profile: {
    name: "Kurniadi Ahmad Wijaya",
    handle: "ShinyQ",
    title: "AI Engineer (Azure)",
    role: "Technical Consultant, Microsoft AI @ Metrodata",
    location: "Jakarta, Indonesia",
    tagline:
      "I build AI applications on Microsoft Azure that survive contact with real users: voice agents you can interrupt mid-sentence, document AI that refuses to invent answers, and LLM features with evaluation gates in CI.",
    howIWork:
      "I write the spec and architecture, direct AI coding agents in parallel, and own review, verification on Azure and the merge gate.",
  },

  // 2026, current chapter (AI work). Public labels only.
  aiProjects: [
    { id: "voice", title: "Realtime Voice AI Call Center", year: "2026",
      summary: "Realtime voice agent on Azure OpenAI Realtime + AI Search with natural barge-in, human takeover and an operator console.",
      highlight: "Cut caller interruption latency from ~2 s to ~0.2 s in a controlled A/B test.",
      stack: ["Azure OpenAI Realtime", "AI Search", "FastAPI", "Next.js", "Bicep"] },
    { id: "security", title: "AI Code Security Platform", year: "2026",
      summary: "Org-wide code security reviewer with eight scanning engines, AI triage and a guarded autonomous fix-PR agent.",
      highlight: "Scans a 100+ repository GitHub organization.",
      stack: ["Azure OpenAI", "Container Apps Jobs", "Service Bus", "GitHub App"] },
    { id: "fraud", title: "AI Fraud Document Review", year: "2026",
      summary: "Two-pass document AI that reviews claims for fraud signals, with evidence verification and no-fabrication guards.",
      highlight: "Evaluation-driven false-positive reduction; hybrid rules + LLM engine shipped in shadow mode.",
      stack: ["Document Intelligence", "Agent Framework", "Cosmos DB", "FastAPI"] },
    { id: "hiring", title: "AI CV Screening", year: "2026",
      summary: "LLM-based CV screening with structured outputs, versioned prompts and CI-gated evaluation.",
      highlight: "Eliminated a ~45% LLM screening failure rate.",
      stack: ["Azure OpenAI", "Durable Functions", "Entra ID", "Key Vault"] },
    { id: "bank", title: "AI Bank Statement Analyzer", year: "2026",
      summary: "Document AI pipeline for bank statements with banking-grade auth hardening.",
      highlight: "~20% faster pipeline with accuracy unchanged.",
      stack: ["Document Intelligence", "Azure OpenAI", "App Service"] },
    { id: "template", title: "AI App Accelerator", year: "2026",
      summary: "Reusable full-stack AI dashboard template with a YAML multi-agent registry on Microsoft Agent Framework.",
      highlight: "Base for 5+ client applications.",
      stack: ["Agent Framework", "Next.js", "FastAPI", "Cosmos DB"] },
    { id: "forecast", title: "Demand Forecasting Dashboard", year: "2026",
      summary: "Microsoft Fabric forecasting dashboard taken to production.",
      highlight: "Root-caused a 21 s dashboard stall to capacity throttling.",
      stack: ["Microsoft Fabric", "Next.js", "Private Endpoints"] },
  ],

  // Earlier chapters.
  career: [
    { org: "Metrodata (PT Mitra Integrasi Informatika)", role: "Technical Consultant, Microsoft AI", period: "2026 - Present",
      points: ["Azure AI platforms end to end: voice AI, document AI, agents, evaluation", "838 PRs authored across 21 repositories in 8 months"] },
    { org: "PT SMBC Indonesia Tbk (Jenius)", role: "Software Engineer", period: "2024 - 2026",
      points: ["Microservices integrating 5+ insurance partners", "Custom SFTP service with 99.9% uptime", "+30% performance with Kafka and Redis"] },
    { org: "PT Informasi Teknologi Indonesia (Jatis)", role: "Full Stack Developer", period: "2023 - 2024",
      points: ["Multi-tenant SaaS used by 500+ users", "Golang APIs + Next.js frontend"] },
    { org: "Jublia Pte Ltd (Singapore)", role: "Backend Engineer (part-time)", period: "2023",
      points: ["OpenAI + LangChain sentiment service, 96% accuracy", "+40% search relevance with Elasticsearch"] },
    { org: "BSSN (National Cyber and Crypto Agency)", role: "Backend Engineer (part-time)", period: "2023",
      points: ["Automated vulnerability scanning with Nessus API"] },
    { org: "PT MNC Asia Holding Tbk", role: "Backend Engineer", period: "2022 - 2023",
      points: ["Payment gateway refactor with GraphQL + Lambda, -30% transaction time"] },
    { org: "Shumi", role: "Backend Engineer (part-time)", period: "2019 - 2022",
      points: ["E-commerce REST APIs for 2,000+ daily users"] },
  ],

  education: [
    { school: "Telkom University", degree: "BSc Computer Science", period: "2019 - 2023",
      note: "GPA 3.88. Thesis: IndoBERT sentiment analysis dashboard" },
  ],

  trophies: [
    { title: "IFEST 2021 Data Analysis", place: "1st" },
    { title: "ISFEST UMN 2021 Data Competition", place: "1st" },
    { title: "Foresty CTF 2021", place: "1st" },
    { title: "Business Pitching Competition 2021", place: "1st" },
    { title: "Closer 8th Hackathon 2022", place: "2nd" },
    { title: "International Business Plan Competition 2022", place: "2nd" },
    { title: "Scientific Writing Codig 3.0", place: "2nd" },
  ],

  skills: {
    "AI": ["Azure OpenAI", "AI Foundry", "Agent Framework", "RAG", "AI Search", "Document Intelligence", "Evaluation"],
    "Backend": ["Python", "FastAPI", "Go", "Spring Boot", "Node.js"],
    "Frontend": ["Next.js", "TypeScript", "Tailwind"],
    "Cloud": ["Container Apps", "App Service", "Functions", "Cosmos DB", "Service Bus", "Key Vault", "Bicep"],
  },

  certifications: ["Azure Fundamentals (AZ-900)", "Azure AI Fundamentals"],

  sideProjects: [
    { title: "JagaRupa", summary: "Personal R&D project." },
    { title: "CalorIQ", summary: "AI nutrition pipeline." },
    { title: "ShinyQ Playground", summary: "Experiments and tools." },
  ],

  blog: [
    { title: "The Sun, The Moon, and The Dark Sea", date: "2025-06-06", tag: "Personal Growth",
      excerpt: "Hitam, putih, abu-abu. Rasanya bukan soal keberanian, tapi kehilangan arah di labirin rasa yang tak bernama." },
  ],

  contact: {
    email: "kurniadiahmadwijaya@gmail.com",
    github: "https://github.com/ShinyQ",
    site: "https://kurniadi.dev",
  },
};
