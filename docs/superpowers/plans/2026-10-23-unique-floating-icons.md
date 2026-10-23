# Unique Floating Icons Implementation Plan

Status: in review

Design: [`2026-10-23-unique-floating-icons-design.md`](../specs/2026-10-23-unique-floating-icons-design.md). Owner
decision 2026-10-23 ([decision](../../decisions/2026-10-23-unique-floating-icons.md)).

**Goal:** every L2 room, L3 pod and L4 item floats its own hologram (Lucide line icons on L2 and L4, semantic box
sculptures on L3), loaded as a per-floor static JSON after the floor's first frame, with today's type icons and kind
holograms as the fallback, at no JS byte, draw call or program cost.

## Tasks

- [ ] Spec, plan and mapping (this file).
- [ ] Vendor the Lucide subset (`assets/icons/lucide/*.svg`, `LICENSE`, `README.md` with the attribution and the
  version) and write the converter `src/lib/svg-strokes.ts` with unit tests.
- [ ] Recipes `content/sculptures.json`, expander `src/content/sculptures.ts` (box cap 16, bounds, uniqueness), `r` on
  `HologramPart`, unit tests.
- [ ] Schema: `icon` on `TimelineEntry`, `PostRef`, `Publication`, `Talk`; `sculpture` on `Pod`; uniqueness in
  `SiteContentSchema`; `shapeIssues` in `src/content/shapes.ts` wired into `validate:content`; ids in the dataset.
- [ ] `src/content/shapes.ts` payloads and hashed names, `scripts/build-shapes.ts` in `build`, `build:web` and `dev`,
  `/public/shapes/` gitignored, `_headers` immutable for `/shapes/*`, `check-client-chunks` guard, unit tests.
- [ ] Experience data: `career.shapes`, `labs.shapes`, `library.shapes` (URLs).
- [ ] Client: `fx/shapes.ts` (`loadShapes`, `useShapes`, probe), batched `HoloIcon` (aColor everywhere), L2
  `CareerRooms`, L4 `ZoneIcons` with desk rows, L3 `PodHolograms` with per-pod parts and the scale morph.
- [ ] E2E `e2e/shapes.spec.ts` (shapes shown on L2, L3, L4; fallback when `/shapes/*` is blocked), `scripts/e2e-plan.ts`
  and perf-plan mappings.
- [ ] Verify: `verify:quick`, `validate:content`, `e2e:changed`, perf `floors` L2/L3/L4 and `bytes-3d` before and
  after, screenshots of L2, L3, L4 before and after.
- [ ] Docs: `floors.md` (icon system), floor L2/L3/L4 docs, `content.md`, `folder-layout.md`, `features.md`,
  `performance.md` if a gate moves; decision file.

## Mapping

Ids are Lucide icon names (L2, L4) or sculpture recipe names (L3). No id names a client.

### L2 Career Road (36 rooms)

Jobs, education and freelance: unique across the three types.

| Item | Type | Icon | Reason |
|---|---|---|---|
| digitiket-2021 | job | `ticket` | backend intern at an online ticketing company |
| techbros-2021 | job | `scan-face` | FastAPI services for a people-detection system |
| kalbe-farma-2021 | job | `stethoscope` | backend of an electronic medical records system |
| mnc-2022 | job | `plane` | travel booking platform |
| bandung-techno-park-2022 | job | `server` | PostgreSQL databases, microservices and single sign-on |
| jatis-2023 | job | `layers` | multi-tenant SaaS products |
| jenius-2024 | job | `landmark` | services and dashboards at a digital bank (employer) |
| metrodata-2026 | job | `brain-circuit` | Azure-native AI projects in the Microsoft AI practice |
| telkom-university-2019 | education | `book-open` | Computer Science studies focused on NLP |
| graduation-2023 | education | `graduation-cap` | graduation |
| shumi-2019 | freelance | `shopping-bag` | storefront and admin APIs for an online store |
| bssn-2023 | freelance | `shield-check` | automated vulnerability scanning |
| jublia-2023 | freelance | `handshake` | search and matchmaking services |
| dariordal-2025 | freelance | `ticket-check` | limited-quota booking that prevents overselling |
| serupa-2025 | freelance | `tickets` | event ticketing platform foundation |
| 370-agency-2025 | freelance | `code-xml` | agency web development and delivery |
| temmpat-2025 | freelance | `gavel` | auction and resale ticket marketplace |
| naremax-2025 | freelance | `monitor-play` | digital products and training e-commerce |

Milestones (4 variants) and awards (3 variants):

| Item | Type | Icon | Reason |
|---|---|---|---|
| prologue-2016 | milestone | `flag` | the starting point |
| campus-and-community-2019 | milestone | `flag` | campus and community step |
| campus-and-community-2020 | milestone | `flag` | campus and community step |
| campus-and-community-2021 | milestone | `flag` | campus and community step |
| campus-and-community-2022 | milestone | `flag` | campus and community step |
| research-vaccination-sentiment-2020 | milestone | `flask-conical` | independent research |
| research-ewallet-sentiment-2021 | milestone | `flask-conical` | independent research |
| research-covid-forecasting-2021 | milestone | `flask-conical` | independent research |
| sentiboard-2022 | milestone | `flask-conical` | thesis research project |
| certification-desk-2021 | milestone | `badge-check` | certificates earned |
| certification-desk-2026 | milestone | `badge-check` | certifications earned |
| crypto-tracker-2024 | milestone | `rocket` | side project launched |
| sp500-optimizer-2024 | milestone | `rocket` | side project launched |
| portfolio-v1-2025 | milestone | `rocket` | side project launched |
| trophy-case-2019 | award | `medal` | five 2nd places |
| trophy-case-2020 | award | `award` | a season of placings and finalist spots |
| trophy-case-2021 | award | `trophy` | four 1st places |
| trophy-case-2022 | award | `medal` | two 2nd places and a finalist spot |

### L3 Project Roads (39 pods)

| Pod | Kind (fallback) | Sculpture | Reason |
|---|---|---|---|
| digital-banking-integrations | pipeline | `bank-api` | bank columns with integration links on both sides |
| ticket-marketplace-backend | pipeline | `ticket-gavel` | ticket under an auction gavel (resale and auctions) |
| vendor-management-portal | template | `vendor-clipboard` | clipboard with checked rows (vendor approvals) |
| multi-tenant-saas-platform | template | `tenant-stack` | database stack split into tenant slices |
| payments-realtime-backend | pipeline | `card-bolt` | payment card with a lightning bolt (realtime) |
| anime-figure-ecommerce | template | `figure-bag` | shopping bag beside a figure on its base |
| vulnerability-scanning-automation | shield | `shield-scan` | shield crossed by a scanning bar |
| limited-quota-event-ticketing | pipeline | `ticket-gate` | gate with a quota counter and a ticket |
| event-ticketing-platform | pipeline | `ticket-stack` | fanned stack of tickets |
| event-tech-search-backend | chart | `magnifier-match` | magnifier over two linked nodes (search and matchmaking) |
| digital-products-ecommerce | template | `storefront` | shop front with an awning |
| university-alumni-platforms | template | `grad-cap` | mortarboard with tassel over a diploma |
| voice-ai-contact-center | waveform | `microphone` | studio microphone with pulsing voice bars |
| ai-code-security-platform | shield | `code-shield` | shield with code brackets |
| fraud-review-platform | documents | `doc-magnifier` | document stack under a magnifier |
| ai-cv-screening-platform | documents | `cv-card` | profile card with a head and text rows |
| bank-statement-analyzer | documents | `statement-chart` | statement page with a bar chart |
| ai-app-accelerator | template | `rocket` | rocket (an app starter that launches fast) |
| fabric-forecasting-dashboard | chart | `forecast-bars` | bars with a dashed forecast continuing up |
| ai-solutions-assistant | graph | `chat-bubble` | chat bubble with typing dots |
| agent-orchestrated-delivery | graph | `robot-head` | robot head with an antenna (coding agents) |
| marketplace-productization | template | `package-box` | open shipping box (packaged apps) |
| azure-ai-operations | pipeline | `cloud-gear` | cloud over a gear (shared cloud operations) |
| automotive-fraud-dashboard | documents | `dashboard-alert` | dashboard screen with an alert mark |
| ticketing-assistant-replatform | graph | `migrate-arrows` | two platforms joined by a transfer arrow |
| mining-coa-assistant | pipeline | `ledger-book` | open ledger with account columns |
| credit-scoring-poc | chart | `score-gauge` | gauge dial with a needle |
| bank-genai-governance | shield | `padlock` | padlock (governed access) |
| agent-deck-platform | template | `presentation` | slide screen on a stand |
| mii-cowork | template | `window-cards` | app window with fanned slide cards (Deck Studio) |
| clearbox | pipeline | `inbox-tray` | inbox tray with envelopes and a sort arrow |
| solutions-marketing-site | template | `web-globe` | browser window with a globe |
| sewise-fashion-labs | template | `dress-form` | tailor's dress form on a stand |
| insurer-contact-center-architecture | waveform | `headset` | headset with a mic boom and voice bars |
| university-sentiment-indobert | chart | `smiley-bars` | smiling face beside sentiment bars |
| ifest-2021-sentiment-analysis | graph | `network-graph` | social network of linked nodes |
| covid-herd-immunity-forecast | waveform | `virus-curve` | virus particle over a falling curve |
| stock-allocation-optimizer | chart | `candlesticks` | stock candlesticks |
| kampus-merdeka-reports-crawler | documents | `crawler-spider` | spider crawling a page |

### L4 Writing (21 items)

Unique across posts, publications and talks; zones keep their color.

| Item | Zone | Icon | Reason |
|---|---|---|---|
| clearbox-inbox-cleanup-with-microsoft-decision-1 | post | `inbox` | inbox triage |
| making-a-voice-agent-interruptible | post | `mic` | voice agent barge-in |
| why-the-better-fraud-engine-shipped-in-shadow-mode | post | `shield-alert` | fraud engine in shadow mode |
| 45-percent-of-our-llm-calls-failed | post | `bug` | failed LLM calls and their errors |
| spec-driven-development-with-ai-coding-agents | post | `file-code` | specs for coding agents |
| the-sun-the-moon-and-the-dark-sea | post | `moon-star` | personal essay (sun, moon, sea) |
| crud-nodejs-express-mysql | post | `database` | CRUD with MySQL |
| helby-ui-ux-case-study | post | `baby` | baby development tracking app |
| ewallet-sentiment-cnn-lstm | publication (paper) | `wallet` | e-wallet sentiment |
| covid-19-herd-immunity-study | publication (paper) | `syringe` | vaccination and herd immunity |
| sentiboard-paper | publication (paper) | `layout-dashboard` | sentiment dashboard |
| sentiboard-bsc-thesis | publication (thesis) | `book-marked` | the BSc thesis |
| indobert-university-reviews-model | publication (model) | `school` | university reviews model |
| indobertweet-review-sentiment-model | publication (model) | `message-circle` | tweet-trained review model |
| indobert-review-sentiment-model | publication (model) | `star` | app review ratings model |
| microsoft-ai-client-workshop | talk | `workflow` | AI for business workflows |
| agent-framework-walkthrough | talk | `bot` | tool-using agent walkthrough |
| basic-ai-study-groups | talk | `users` | study groups |
| go-programming-practicum | talk | `square-terminal` | Go practicum |
| programming-club-workshops | talk | `code` | programming club workshops |
| hackathon-judge-2022 | talk | `scale` | hackathon judging |

## Numbers

Filled in from the perf lane before and after (both on this machine, same build flags).
