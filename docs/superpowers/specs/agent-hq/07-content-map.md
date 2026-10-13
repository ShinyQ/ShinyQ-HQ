# Appendix 07: Content Map

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

This maps the consolidated career evidence onto the tower. Titles are **public-safe labels**. The source dataset (`site-content.json`) and the private dossier live outside the repo; Phase 0 transforms the public dataset into the schema in appendix 06 (adding `id` translations, `wing`, `timelineRef`/`podRef` links and committed assets).

## 1. Positioning

- **Headline:** AI and Software Engineer (revised 2026-10-13 to the CV's order; revised 2026-10-11: no "(Azure)"; the owner has also shipped on VPS hosting and AWS, so cloud vendors stay in stacks and project details). Newest CV wording: "Software & AI Agent Specialist".
- **Sub-headline:** "I build software and AI on Azure that survives contact with real users."
- **Story arc:** from 2019 backend and full-stack work (e-commerce, payments, fintech, SaaS), through a digital bank, to designing and operating enterprise AI platforms on Azure in 2026, delivered with spec-driven, AI-agent-orchestrated engineering.

## 2. L1 Lobby

| Element | Content |
|---|---|
| Profile hologram | Name, headline, location (Jakarta, GMT+7), current role "Technical Consultant, Software & AI" (employer naming pending C2) |
| Stats ring (6) | Shipping software since 2019 · 800+ PRs merged in 2026 · 7,350 GitHub contributions in the last 365 days (agent-assisted, human-reviewed) · 4 Microsoft and GitHub certifications (GH-600, AI-103, AI-901, AZ-900) · 20 competition placings, 7 first places · 10× faster voice-agent interruption (controlled A/B) |
| Skills wall | The CV's taxonomy (2026-10-13): AI and LLM (Microsoft Agent Framework, LangGraph, LangChain, Azure OpenAI incl. Realtime, RAG, Hybrid/Vector Search, Prompt Shields, LLM evaluation, Hugging Face) · Azure (AI Foundry, AI Search, Cosmos DB, Document Intelligence, Container Apps, App Service, Functions, Service Bus, Key Vault, Managed Identity, Microsoft Fabric, Monitor) · Languages (Python, TypeScript, JavaScript, Go, Java, PHP) · Backend (FastAPI, Spring Boot, Express.js, Gin, Echo, Laravel, Flask, Django) · Frontend (Next.js, React, Vue, Nuxt, Tailwind CSS) · Data and messaging (PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ, Elasticsearch) · DevOps (Docker, Bicep, GitHub Actions, Jenkins, AWS, LiveKit, k6, SonarQube, Sentry). The 3D wall shows Backend, AI and LLM, Azure and DevOps |
| Certifications wall | AI-103 Azure AI Apps and Agents Developer Associate (Sep 2026) · AI-901 Azure AI Fundamentals (May 2026) · AZ-900 Azure Fundamentals (May 2026) · GH-600 GitHub Certified: Agentic AI Developer (earned 13 Oct 2026, expires Oct 2027, credential 6BB32EB2B28BD602; after the CV of 2026-10-13, so the CV does not list it) · HackerRank Problem Solving · Associate Data Scientist microcredential · Digital Talent ML (160 h) · TOEFL ITP, score 547 (2024, shown as expired, no credential link; added 2026-10-13 because the CV lists it). |

## 3. L2 Career Archive (2019 to 2026)

2016 to 2018 items (vocational school, early trainings) appear as a "prologue" plaque inside the 2019 gate. Training, internship, teaching and organization items are grouped into one "Campus and community" room per year to keep the corridor readable.

| Year | Rooms |
|---|---|
| 2019 | BSc Computer Science starts (Telkom University) · Freelance backend: anime figure e-commerce (2019 to 2022, links to the Product Engineering pod) · Campus and community (internship, trainings) · Trophy case 2019 |
| 2020 | Campus and community (VP Internal and SE Lead, bootcamp, Go practicum assistant) · Research: vaccination policy sentiment · Trophy case 2020 |
| 2021 | Internships (backend; backend and AI; IT developer) · Research: e-wallet aspect sentiment (CNN-LSTM), COVID-19 forecasting · Certification desk 2021 · Trophy case 2021 |
| 2022 | Backend Engineer, MNC Asia Holding (links to pod) · Contract software engineer · Sentiboard thesis and IndoBERT model · Campus and community (AI lecturer assistant, hackathon judge) · Trophy case 2022 |
| 2023 | Graduated BSc (GPA 3.88) · Full Stack Developer, Jatis (links to pod) · Freelance: vulnerability-scanning automation (links to pod) · Freelance: event-tech backend, Singapore (links to pod) |
| 2024 | Software Engineer, Jenius / SMBC Indonesia (Jun 2024 to Dec 2025, links to pod) · Side projects: crypto tracker, S&P 500 optimizer |
| 2025 | Freelance: premium event ticketing (links to pod) · Freelance: Serupa event ticketing platform (links to pod) · Freelance: event ticket marketplace backend (links to pod) · Freelance: digital products e-commerce · Portfolio v1 |
| 2026 | Technical Consultant, Software & AI (Feb 2026 to present, links to the Labs) · Certification desk 2026 · Hackathons: partner AI hackathon entry, Agentic AI hackathon (both "entry submitted", see C1) · Upcoming: regional Codex hackathon |

**Workshop annex** (end of corridor): side projects (JagaRupa, CalorIQ, DevLens, AI Jury Council, certification trainers, Sentiboard, e-wallet sentiment, S&P 500 optimizer, crypto tracker, real-estate cluster map, alumni and counseling platforms, Pola.ai upcoming) and a wall of ~20 public repositories plus 3 Hugging Face models.

## 4. L3 Labs

### Product Engineering wing (west; was "Software Wing")

| Tier | Pod | Period | Notes |
|---|---|---|---|
| hero | Digital Banking Integrations: insurance partner microservices and an in-house SFTP service | 2024 to 2025 | Jenius. Metrics follow C4 (qualitative unless verified). |
| hero | Event Ticket Marketplace Backend: auctions, resale, wallet ledger and settlement | 2025 to 2026 | Freelance, anonymized. 61% of commits (verified from git). |
| hero | Vendor Management Portal (eVendor), built for Metrodata, delivered solo in 6 weeks | 2026 | Full-stack (FastAPI, PostgreSQL, Next.js). Moved here from the AI list to show software depth in 2026. `client: "Metrodata"` (R5-P11, owner 2026-10-13); screenshots of the live app are allowed, with private data blurred (not captured yet). |
| featured | Multi-tenant SaaS platform and asset management architecture | 2023 to 2024 | Jatis |
| featured | Payments and real-time backend | 2022 to 2023 | MNC Asia Holding |
| featured | Anime figure e-commerce backend (pre-orders, payments, shipping) | 2019 to 2022 | Shumi, site still live |
| featured | Vulnerability-scanning automation for a national agency | 2023 | Freelance, anonymized |
| featured | Serupa Ticket Hub: event ticketing platform (attendee site, organizer dashboard, Express API) | 2025 | Freelance (Serupa), two-person team; commit shares verified from git (added 2026-10-12) |
| featured | MII Microsoft Solutions Website: MII's public bilingual Microsoft Solutions site, built from 17 specs | 2026 | Metrodata. Live link (R4-J). Moved from the AI list. |
| listed | Limited-quota event ticketing with inventory locking | 2025 | Freelance (DariOrdal); listed since 2026-10-12 to keep 6 featured pods per wing |
| listed | Digital products and training e-commerce platform; University alumni and counseling platforms; Event-tech search relevance and feedback analytics backend (listed since R4-J, at most 6 featured per wing) | | |

### AI Engineering wing (east; was "AI Wing")

| Tier | Pod | Key verified result |
|---|---|---|
| hero | Realtime Voice AI Contact Center | Interruption latency ~2 s to ~0.2 s (controlled A/B, n=4 per arm); node-loss drills passed |
| hero | AI Code Security Platform | 8 scanning engines across a 100+ repository organization; 540+ PRs reviewed |
| hero | AI Fraud Document Review | False positives 90.9% to 36.4% on gold sets (offline); hybrid engine shipped in shadow mode |
| featured | AI CV Screening, Made Reliable | ~45% LLM failure rate eliminated; first test suite and CI-gated evaluation |
| featured | Bank Statement Analyzer PoC | ~20% faster pipeline, accuracy unchanged |
| featured | Full-Stack AI App Accelerator | Adopted across 10+ client projects (CV, 2026-10-13); byte-level lineage measured on 8 client repositories |
| featured | Forecasting on Microsoft Fabric | 21 s stall diagnosed as capacity throttling, ~1 s after the fix |
| featured | MII Microsoft AI Portfolio and Assistant: portfolio site, multi-agent RAG assistant, /dashboard Studio (live link, R4-J) | Prompt tokens -23%, model calls per turn 3 to 2 |
| featured | Spec-Driven, Agent-Orchestrated Delivery | How the work is delivered: specs in, parallel agents, human review gates |
| listed | From Apps to Products (managed-app packaging) · Operating a Shared Azure AI Estate · Fraud Review Dashboard and Security Remediation · AI Ticketing Assistant Re-platform · Chart-of-Accounts AI Assistant · Explainable In-Browser Credit Scoring · Governance for a Bank's GenAI Portal · Agent-Authored Presentations · Enterprise AI Contact Center Architecture | |

Hologram views: the 6 hero pods (3 per wing).

## 5. L4 Library

| Shelf | Items |
|---|---|
| Blog (published) | The Sun, The Moon, and The Dark Sea (ID) · CRUD Node.js with Express and MySQL (ID) · UI/UX case study: baby development monitoring app (ID) |
| Blog (planned, hidden until published) | How we made a voice agent interruptible · Why the better fraud engine shipped in shadow mode · 45% of our LLM calls failed: what the error strings told us · Spec-driven development with AI coding agents |
| Publications | E-wallet sentiment (CNN and LSTM) · COVID-19 herd-immunity dynamics · Sentiboard (IndoBERT) paper · BSc thesis (Sentiboard) · MSc thesis (RAG-LLM app quality recommendations, ISO/IEC 25010) · 3 Hugging Face sentiment models |
| Talks and workshops | Client workshop deck "Transform business performance with Microsoft AI" (author) · Agent Framework walkthrough (author) · Partner hackathon submission · Basic AI study groups · Go practicum · Campus programming club workshops · Hackathon judge |

## 6. RF Roof

| Element | Content |
|---|---|
| Comms | Email, LinkedIn (`/in/kurniadiwijaya`), GitHub (`ShinyQ`), Hugging Face (`ShinyQ`), Medium |
| Beacon | "Open to interesting software and AI engineering conversations" (EN/ID) |
| CV kiosk | The owner's CV PDF, served as-is for both locales (owner decision, Oct 10, 2026; replaces the per-locale export from site data) |

## 7. Owner decisions (resolved 2026-10-09)

These override anything above that conflicts with them.

| # | Topic | Decision |
|---|---|---|
| C1 | Hackathons | Still in progress: **do not show** 2026 hackathon entries anywhere (remove from the 2026 year room and the Library talks). |
| C2 | Current role wording | "Technical Consultant, Software & AI" at "Metrodata (PT Mitra Integrasi Informatika)", Feb 2026 to present |
| C3 | Client names | **Revised 2026-10-10:** client companies of the owner's employers are **never named** on the site (text, alt text, slugs, metadata, OG cards, JSON-LD, search, room views, 3D labels); use sector labels ("a national digital bank", "an automotive manufacturer", "a national bakery brand", "a coal mining group", "a regional lender", "an insurer"). Employers stay named (Jenius (SMBC Indonesia) only for the 2024 to 2025 job). **Product names are allowed**, including MII / Metrodata products (ARIA, Pris.AI, MII Fraud Detection, MII E-Recruitment, eVendor, MII Deck as Deck Studio inside MII Cowork, MII AI Ticketing, MII AI Dashboard Template); client products (ATLAS, FREDDY) keep a sector label. The owner's CV PDF is used as-is. Supersedes the earlier "Allowed" decision. |
| C4 | Pre-2026 metrics | **Allowed**: use the conservative values from the newest CV (Oct 13, 2026), with no confidence label on the site (revised 2026-10-11: the owner removed every Verified / Self-reported / Strongly inferred label and the "Self-reported in my CV" notes; `confidence` stays in the dataset for internal review only). No money amounts. |
| C5 | Photo | Revised 2026-10-13 (owner): the owner's portrait (`public/brand/kurniadi-photo-{160,320,640}.webp`) appears on the Page View landing and About (P1), as the 3D profile card badge and on the Highlights Hall "About me" station (P6), and in the home share image (P9). The "KAW" monogram hologram stays in the Lobby. No other photos. |
| C6 | Jenius | "Software Engineer", Jun 2024 to Dec 2025 |
| C7 | Master's degree | **Do not show** (remove the 2024 education room, the MSc thesis publication and the RAG-LLM thesis prototype room) |
| C8 | Freelance clients | **Named** (e.g. TEMMPAT, DariOrdal, Serupa, Jublia, BSSN, Shumi), unless they are also clients of an employer (then C3 applies) |
| C9 | JagaRupa | Personal side project, **shown** in the Workshop annex (not as an employer project; no hackathon result) |
| C10 | Gallery exclusions | **Revised 2026-10-13:** SITA (`mining-coa-assistant`) and FREDDY (`automotive-fraud-dashboard`) stay text only, no screenshots (owner, 2026-10-11). The vendor portal (eVendor) is no longer excluded: it is Metrodata's own portal and may show a gallery from the live app with vendor and people names, emails, phone numbers, money and amounts, tax IDs, bank accounts, document numbers, Azure hostnames and tenant names blurred. |
| C11 | CV refresh (2026-10-13) | The new CV is the source of truth for CV-derived facts (dates, numbers, roles, skills, education, headline order, certifications); every site fact that differed was updated and listed in the round 5 P5 PR. Facts with stronger evidence that the CV does not contradict stay (TEMMPAT stack from the repository, official credential names, the measured 541 reviewed PRs). `tests/content/cv-facts.test.ts` pairs CV markers with site values |
