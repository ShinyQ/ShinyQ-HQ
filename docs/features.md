# Feature reference

What every part of ShinyQ HQ does, floor by floor. The [README](../README.md) is the short overview; implementation rules live in [`AGENTS.md`](../AGENTS.md) and [`agents/`](agents/), content rules in [`content.md`](content.md).

## Contents

- [Status](#status)
- [Controls and first visit](#controls-and-first-visit)
- [Classic site](#classic-site)
- [Glass Drawer](#glass-drawer)
- [L1 Lobby](#l1-lobby)
- [L1 Highlights Hall](#l1-highlights-hall)
- [L2 Career Road](#l2-career-road)
- [L3 Project Roads](#l3-project-roads)
- [L4 Newsroom](#l4-newsroom)
- [RF Roof deck](#rf-roof-deck)
- [B1 Engine Room](#b1-engine-room)
- [Routes](#routes)
- [Search and link previews](#search-and-link-previews)
- [Ask the HQ (AI Q&A)](#ask-the-hq-ai-qa)
- [Visual language](#visual-language)
- [CI and deploys](#ci-and-deploys)
- [Performance](#performance)

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, content schema, public-safe dataset, static pages, CV PDF, CI | Done |
| 1 | Tower shell: five floors, glass elevator, camera rigs, input intents, store, GPU tiers | Done |
| 2 | Screen Rover (keyboard, click/tap-to-move, joystick) and the L1 Lobby | Done |
| 3 to 5 | Career Archive, Labs and the Glass Drawer, Library and Roof, missions | Done |
| 6 | Launch on Cloudflare Pages (`kurniadi.pages.dev`), SEO, Lighthouse CI | Done |
| Ask | Ask the HQ: grounded AI Q&A (Gemma 4 with Mistral and Groq fallbacks), chat dock, weekly live facts | Done |
| Ask: leads and lifestyle | "What can you do?", project inquiries with a contact card, 30 endorsed lifestyle, industry and policy answers, deterministic scope routing | Done |
| Ask: hybrid retrieval and longer memory | 2026-10-24: multilingual semantic search (Workers AI bge-m3 vectors built into the knowledge pack, fused with BM25, BM25 alone on any failure) finds his written views that share no word with the question, in English and Indonesian; the same vectors re-route clear learning, civic and off-topic paraphrases; Ask remembers 5 turns and spoken Indonesian follow-ups | In review |
| Ask: answerable questions | 2026-10-24: political-view and civic questions answered from his written policy views with a partisan note, mixed questions answered in part, learning and team questions answered from his path and teamwork views, trivia redirected without a model call, source tags with up to two "Read on this site" links, over-refusals in the weekly report | In review |
| Ask: bring your problem | 2026-10-25: owner decision: a visitor who describes a problem, or asks how he would approach one, gets an outline of how he approached similar problems in up to two matching past projects (past tense, by title, cited, at most one written view) and the contact card; still no estimates, timelines, designs, stack picks or code; four problem pills in the Contact topic | In review |
| Walkable floors | Road kit, L2 Career Road, L3 Project Roads, Neon line type icons | Done |
| Content and UI | Galleries from the live apps, certifications at scale, CV viewer and paper previews, roomier drawer, named elevator, Title Case titles, gallery-first ordering, cinematic Page View landing, elevator call pads and L2 teleporters | Done |
| Walkable floors 2 | L4 Writing as the walkable Newsroom | Done |
| HUD polish | Shift boost (touch toggle; trails, lean, camera kick, streaks, sparks), Rover menu, unskippable intro (the 2026-10-18 wake and reveal orbit intro is skippable), top bar without Quick view, bottom band, drawer footer, centered Lobby | Done |
| Walkable floors 3 | RF as a walkable roof deck: Signal Garden with the courier drone | Done |
| Highlights Hall | L1 summary behind the certifications wall: about me, top 3 projects, work experience (employment and freelance), contact | Done |
| Onboarding | Rover's dialog (handheld RPG text box), first-session tour, "!" hint bubbles, first-visit floor lines | Done |
| Point-and-go | Hover or tap a glowing object (room doors, elevator pads, Return pads, teleporters, stations, the Rover menu kiosk, boards) to see its name and drive there; no free click-to-move | Done |
| SEO and link previews | Search titles within 60 characters, unique titles, `/` canonical to `/en`, baseline JFIF share cards with `og:image:secure_url`, Person, ProfilePage and SoftwareSourceCode structured data, content-dated sitemap, Search Console and Bing verification, LinkedInBot checks in e2e and the deploy smoke | Done |
| Fast return | Any floor change more than 40 u from the elevator call pad beams the rover into the car; green "Back to elevator" pads at the far ends of L2 and L3 beam it to the call pad | Done |
| Floor chunks | Round 7 B: L3, L4 and RF are separate chunks, prefetched after the first frame and on elevator intent, loaded at once on deep links; the car waits at closed doors for a slow chunk; the main 3D path is 16 KB gzip smaller | Done |
| L3 three paths | Round 7 G: three roads leave the hub (Product Engineering north, Data and ML straight to the reactor, AI Engineering south), a raised three-board directory wall with a gate over the spine, smaller board text and one floating sign per road | Done |
| L3 neat entrance | 2026-10-16: three free-standing directory boards at the fork (one name per path, no floating road signs), one line per project with optional short titles and "+N more", quieter board text; both wing roads meet the reactor ring north and south, mirrored about the spine, with the Return pad on the axis; the Fabric forecasting pod moves to Data and ML | Done |
| L4 declutter | Round 7 F (2026-10-16): one sign per section over its first desk, post titles only for the nearest stations (6 on desktop, 4 on phones), year marks on small low posts, no label covers another or the rover; L4 draws 2 fewer scene calls and no more triangles (replaced by the L4 reader tracks, 2026-10-25) | Done |
| Guided walks removed | Owner request 2026-10-16: no tours on any floor (the walk bar, its launcher pill and the URL flag are gone); missions ride to a floor and, for most, open a room or a list, and first-visit floor lines stay without the walk choice | Done |
| Visit stats fix | 2026-10-16: a finalized day is stored only from an unsampled, consistent Web Analytics answer; Pages Web Analytics stays off (its injected beacon took every page load from the site's own beacon and ignored the opt-out), and deploy-smoke and uptime fail if it comes back | Done |
| Blog architecture figures | 2026-10-16: the four technical posts show architecture figures through an `<Architecture>` MDX tag (a case study's diagram or a post-local one from `content/blog/diagrams.json`), each with a caption and a numbered walkthrough; every architecture diagram (posts and case studies) is a real box and arrow drawing (build-time SVG: left to right from 1100 px, top to bottom below and on phones), and the Clearbox post's two figures use it too | Done |
| Deep Space Ambient | 2026-10-16: the ambient hum becomes procedural background music (drones, random pentatonic glass bells, a long reverb) while sound is on, at the hum's loudness so the effects stay clear | Done |
| Day and night | 2026-10-17: Round 8 K: the tower cycles every 4 minutes (2026-10-18; 8 at first) from clock time between neon night (today's look plus a moon and stars) and a deep twilight day (indigo to teal sky, a sun glow on the horizon), with a sun and moon that rise and set up and down (2026-10-18), lights, fog and bloom following the phase; the cycle follows Motion (reduced motion holds night); the "Day and night" switch is registered in the settings registry (`day-night`, display group, order 30), and its panel UI comes with the HUD settings work; +2 scene calls, no new shader program | Done |
| Build story page | Round 9 (2026-10-17): the Classic page `/{locale}/build` ("How this site was built") tells the build from the blueprint to the quality gates, with numbers measured at build time (`content/build-story.json`, `content/generated/build-facts.json`); Ask the HQ now cites it for questions about the site | Done |
| Floor ambience | Round 9 O (2026-10-17): each floor has its own procedural soundtrack (L1 chime pad, L2 warm analog pulse, L3 light arpeggio, L4 typewriter and paper, RF wind and a distant radio beacon) that crossfades over 2 s on a floor change; a "Floor ambience" toggle in the settings sound group. Fix (2026-10-18): the floor layer replaces the music instead of playing on top of it (one soundtrack at a time) | Done |
| Corners HUD | Round 8 I (2026-10-17): phones and tablets keep controls in the corners (floor chip, menu, joystick double-tap boost, Reset view), a settings panel (language, Open links in, motion, graphics quality, day and night, minimap, sound, music and its volume, floor ambience), a round minimap with a floor overview, a slim Rover toast on phones | Done |
| L3-style arrivals | Round 8 J (2026-10-17): every floor's elevator arrival rolls the rover east to a per-floor arrival point (L1 hologram, L2 Career Road, L3 hub, L4 timeline lane, RF plaza mast) with the camera behind it, after a 1.5 s glide out of the car | Done |
| Rover idle | Round 9 O (2026-10-17): after 15 s with no input and the rover parked, it looks around, blinks, hops or spins and beeps once (sound on); the sequence varies and stops at once on any input; never during missions, point-and-go, rides, the elevator picker or the drawer; reduced motion blinks only; no new mesh, material or shader program | Done |
| Ask: Rover's voice | 2026-10-19: Ask answers as Rover, the HQ's guide robot (light voice, Kurniadi always in the third person); requests to speak as Kurniadi or to drop the rules are declined; related professional questions such as "Where should AI not be used?" are answered only from his case studies, posts and written views, with a "Read on this site" link | Done |
| Ask memory | 2026-10-17: Ask remembers the last 3 turns of a conversation (signed by the server, so a visitor cannot forge an answer), a short follow-up like "What stack did it use?" is understood from the previous question, and a **New chat** button starts over | Done |
| Case-study metric strip | Round 9 P (2026-10-17): every case study (Classic page and the 3D drawer's Overview tab) opens with up to 3 headline results, a big value and its label (the first three, or results flagged `headline`); no confidence marker; the full results stay in a Results chapter when they add more | Done |
| Camera fixes | Round 9 M (2026-10-17): a low camera never looks off the slab into the void (no black band); the hover highlight stands just outside the L3 boards (no z-fighting); the intro flies down to the rover in one 1.7 s move with a landing blink and beep, and input takes over (replaced by the wake and reveal orbit intro, 2026-10-18) | Done |
| Black frame fix | 2026-10-18: no more single pure-black frames on L1 at a low camera (a NaN from the glass shader blacked out the bloomed frame); `?gfx=probe` logs any black frame and its cause on the device | Done |
| Intro: wake and reveal orbit | 2026-10-18: the intro opens on a dark close-up of Rover, its face boots, a reveal ring spreads from it and switches the Lobby's landmarks on, and a 270 degree orbit passes them (each pulses once) and lands on the follow view; drive, turn, zoom, reset view or Esc skips it; reduced motion fades into the follow view; the Highlights Hall builds during the boot card (#227) | Done |
| L1 more room | 2026-10-19: the Lobby grows to 54 u deep (lane ring r 13.5, stats ring r 11, cert arc r 23.5, kiosk at 22.5 u, skills wall flush north), every L1 obstacle pair 6 u apart, hall 5 u east; intro and spawn views retuned | Done |
| B1 Engine Room floor | Round 9 (PR 2 and 3): the secret floor, unlocked after visiting all five floors; the floor shipped in #209, the unlock in #213 | Done |
| Agent Office, part 1 (backend) | 2026-10-19: the hq-office Worker and Durable Object, signed relay beats and GitHub webhooks (same-repository activity only; a privatized repository is forgotten), GET /api/office with an ETag and a 5 s edge cache; no UI yet | Done |
| Agent Office, part 2 (relay) | 2026-10-19: office-relay turns GitHub Copilot, Claude Code and Codex hook events into signed, privacy-filtered beats; one installer for all three | Done |
| Agent Office, part 3 (3D office) | 2026-10-19: the L1 office with five live Rovers at curved desks, the screen wall, chips and drawers, in two lazy chunks (scene and drawer body); 2026-10-20: it moves into its own south wing of the L1 slab with a lead road, a plaza and one continuous console under the full space rules; the Classic card is part 4 | Done |
| Agent Office, part 4 (Classic and Ask) | 2026-10-20: the Live Agent Office card on the Classic home page (lazy, polls only near the screen, honest live, semi-live, resting and offline states), and Ask Rover Assistant explains the office and its privacy rule (#264) | Done |
| Agent Office: a higher wall | 2026-10-20: a taller screen wall raised over the console and set 4.5 u behind the Rovers in a deeper wing, the office view retuned on every screen (the chips wait for the camera to settle, stay shown through a zoom, and show as dots where the office view does not apply), and no privacy note on the Classic card or in the drawers (#270) | Done |
| Study guides | 2026-10-19: the four certification study guides read in an in-site pdf.js reader (streamed by byte range from a private R2 bucket through `/api/guides/<slug>`), from a Study guides shelf on the Classic Writing page and "Read study guide" in the certification card (shipped in #243 and #245), and the 3D Study Vault off the L4 end plaza (holo books whose covers open as the rover comes near; a book opens the reader, shipped in #247) | Done |
| Ask knowledge pack in Workers KV | 2026-10-19: the Ask knowledge pack moved out of the Function bundle into Workers KV (versioned values with a build-time BM25 index, a pointer flipped with each deploy and rollback, per-isolate memory, SHA-256 checks, a pinned version and a bundled fallback pack); the Function bundle shrank from 449 KB to 210 KB and a new isolate no longer tokenizes the pack (#241, #254) | Done |
| Agent Office: living crew | 2026-10-21: the office Rovers act out their state (a thought trail while thinking, a spin toward the camera when done), sub-agents show as helper drones over their desk (snapshot v2 `helpers`), and a Rover that waits for Kurniadi raises a "Needs Kurniadi" beacon seen from the Lobby (#274) | Done |
| Agent Office: always live, ten desks | 2026-10-21: the office loads at idle on every Lobby visit and lives whenever it is in view from anywhere in the Lobby (a far level of detail at about 4 fps past 40 u, a 30 s poll from afar, the fast poll only near it or with a drawer open); its scene chunk joins the 3D session total. Ten desks on two console rows (the back row on a riser), ten Rovers and chips, snapshot v3 with ten seats, and the Classic card over ten seats (#276) | Done |
| Agent Office: day replay | 2026-10-22: the Durable Object keeps a privacy-safe log of the last 8 WIB days (`GET /api/office/history`); on a quiet L1 visit the office plays the latest busy day back as a 30 to 60 s time-lapse (the same Rovers, effects and wall, labelled "Replay"), the drawer replays any of the 8 days with a day picker, play and pause and a scrubber, and a floor of 24 tiles in the wing lights one per merged pull request (#284) | Done |
| Agent Office: ship-it pipeline | 2026-10-21: the CI tower shows one lane per CI job (snapshot v4, the 3D office only), packets fly from a desk to the tower when a run starts, bursts mark finished jobs, merged pull requests fly as packages onto the ship dock's stack, a production deploy fires a green beam over the dock for 8 s (seen from the Lobby too), and the CI tower opens a CI drawer with the runs and their jobs as text (#279) | Done |
| Ask pills and Groq tiers | 2026-10-17 to 2026-10-18: curated question pills in seven topics with a seeded random sample (#187); free Groq backup tiers (Qwen 3.8 27B, then gpt-oss-120b) answer when Workers AI fails or runs out of quota (#210) | Done |
| Deploy on merge | 2026-10-18: a merge to `main` deploys (at once when the merged PR was green on the same tree) and a red `main` CI rolls production back (#200); pull requests run only the affected tests, `main` and the nightly 8 e2e and 4 perf shards (#202) | Done |
| Content refresh | 2026-10-18: the Google Generative AI Leader certification (#208) and a bilingual editorial copy refresh with localized diagram labels (#223) | Done |
| Ride and path fixes | 2026-10-18: a beam that jumps and ends on the same frame latches its landing pad (#222); 2026-10-20: Rover brakes for the end of its path, not only its last leg (#269) | Done |
| Classic design refinement | 2026-10-19: a calmer Classic site without a redesign: a quieter landing hero, dates as tabular values, project cards that scan (one title size, results as value over label), flat filter and contents bars, ruled Work wing counts (#240) | Done |
| Hallmark Classic redesign | 2026-10-27: the Classic site redesigned with Hallmark, keeping the Neon Grid brand (system locked in `DESIGN.md`): labels in the body face instead of tracked mono capitals, View CV in solid cyan, a still landing (the stats marquee became a ruled ledger), Selected work as a Feature Stack, "ShinyQ HQ" as the header brand and a footer of links and the copyright line (the owner's name stays in the hero, titles and share cards); part 1 (#331) the system, the header and footer and the landing; part 2 /labs (Key projects as a Feature Stack, a flat filter, the wing ledger) and the case studies (a breadcrumb in place of the eyebrow, project type and 3D room in the facts, a contents column from 1280 px); part 3 the other pages: Journey and its entries, Writing and posts, About, the CV (View CV in the first screen), the build story, Quick view and the 404 | In review |
| Performance fixes A to E | 2026-10-19 to 2026-10-20: Classic links prefetch on intent, lighter CV images, a lazy HUD and the beacon after load (#244); the boot card owner block stays the game-first LCP (#246); floor layouts out of the Classic bundle, 3D page data as static versioned JSON (#257); weak integrated GPUs start on lite and a parked scene drops to an idle frame cadence (#259); one prebuilt logo atlas and room data per floor (#260); the 3D chunk mounts without a Suspense retry, first frame about 250 ms sooner (#268) | Done |
| Smart CI round 2 | 2026-10-18 to 2026-10-19: a push to `main` runs only the complement of its merged PR's green run (#214), PR perf gates follow the 3D files that import a shared module (#216), budget sweeps run nightly only (#221), Lighthouse on the affected URLs plus the home page and two CI runs in flight (#225), worker-aware e2e shard packing (#228), and functional specs run animations 4x faster (#231) | Done |
| Ask evals on Groq | 2026-10-19 to 2026-10-20: a dispatch-only ask-samples workflow (#250); the nightly evals fit the free Groq daily token limits (#256) and run on Groq models production never uses, with model-agnostic checks (#267); the first findings fixed: prompt extraction declined before the model, Rover may invite (#273) | Done |
| Visit stats every 2 hours | 2026-10-19: the hq-stats Worker refreshes the public stats every 2 hours (delayed after 6 h, 3 missed runs) (#237); 2026-10-22: automated browsers never load the beacon and their questions stay out of the stats, with plural forms and sampling copy fixed (#280) | Done |
| HUD rail clears the minimap | 2026-10-21: the desktop elevator rail sits between the top bar and the minimap stack instead of centring on its own (#278) | Done |
| Office relay throttle | 2026-10-21 to 2026-10-22: Copilot sub-agent starts count as helpers (#275); per session a change goes out at most once per 10 s with a trailing send, final states at once, and an awake session sends a 15 s keepalive (#281) | Done |
| Office chips under drawers | 2026-10-22: the office chip row hides while a drawer sheet is open (#287) | Done |
| Toolchain | 2026-10-22: Node 24.22.1 and Bun 1.4.3 pinned (#282); next 16.4.2, eslint 10.13 and wrangler 4.151.3, TypeScript 7 skipped until 2027-01-15 (#283) | Done |
| Safety blocklist removed | 2026-10-22: owner decision: the public-safety blocklist and every check built on it are gone; client names are kept out by review, and the forbidden patterns lint, the export script policy check and the Ask entity allowlist stay (#288) | Done |
| B1 detailed story | 2026-10-22 (B1 living machine, PR 1 of 2): the build story runs to round 13, the Blueprint shows the office, R2, the KV pack and Groq, the Agents and Gates stations describe today's workflow and CI, and the two dark bays open as Rover's Brain and Rejected Designs (#290) | Done |
| B1 reactor hall | 2026-10-22 (B1 living machine, PR 2 of 2): the aisle ends in a reactor hall with a live core (rings from the CI runs, a deploy flash, sparks for awake agents, a pulse from the visits and Ask questions, a counter plate), its station and drawer, a B1-only poller and a hum that rises near the core (#291) | Done |
| B1 WOW pass | 2026-10-23: a data-driven hologram in every B1 bay (the nearest wakes) and the Stack Halo, the build stack and the coding agents orbiting the reactor; B1-only logo atlas, no cap change | Done |
| Stats: no opt-out, top 5 questions | 2026-10-23: owner decision: the "Don't count my visits" switch and the opt-out are gone (a stale key is cleared so those visitors count again; Do Not Track, GPC and automation still skip), and the suggested questions list shows the top 5 in the drawer and the Contact section | Done |
| Stats: since launch by default | 2026-10-23: owner decision: every visits number shows the all-time total since launch by default (the Visits panel opens on Since launch, listed first, with Last 30 days one click away; the home ticker, the `/build` tile, the L1 ring tile and observatory panel, the L3 Ops live panel and the B1 counter plate, reactor pulse and drawer), with "since launch" copy in both languages | In review |
| Dead code sweep | 2026-10-23: the walkable floors and L4 concepts dev prototypes, the unpicked L4 concepts, the `proto` messages (about 370 B gzip less on every 3D gate page), unused message keys and exports, and helpers only their own tests called are gone; no visible change | Done |
| Forward Deployed AI Engineer | 2026-10-23: owner decision: the headline is "Forward Deployed AI Engineer" in both languages, the title on the updated CV (which also adds GH-600 and Google Generative AI Leader); the bio opens with it, the current-role line keeps "Technical Consultant, Software & AI", and the home `<title>` drops the city to stay within 60 characters | Done |
| Accurate visit counting | 2026-10-24: owner decision: visits are the site's own count (a ping as soon as a page is shown, once per browser tab session, Do Not Track and GPC included, automation and crawlers skipped), today's count is live within about a minute, the Worker runs every hour (delayed after 3 h), and Web Analytics keeps countries, page views and the history before the switch with no visit counted twice | In review |
| Elevator camera diagonal | 2026-10-23: going into the elevator and coming out of it, the camera stands behind the rover and 35 degrees to its right ("serong kanan"); every floor's arrival view, the L3 overview and the B1 phone view included; phone views aim sideways so each floor's main sight stays in frame | In review |
| One PDF reader | 2026-10-24: owner decision: every PDF opens in the study guide reader (the CV from every entry point and the paper PDFs too, not page images any more): one compact header, the floating page and zoom pill, thumbnails, chapters, selectable text, the last page read; `/cv` is a cover card (page 1, View CV, Download) |
| Touch controls and tablet text | 2026-10-24: owner decision: a vertical finger swipe tilts the view and never rides the elevator, a visible Boost button sits next to the joystick (the double tap stays), phones move the controls hint into the menu (Controls); the L1 Lobby no longer stays empty on GPUs that fail the text SDF trial run (blob: workers refused, troika generates glyphs on the main thread; `worker-src 'self'`) | Done |
| Unique floating icons | 2026-10-23: every L2 job, education and freelance room floats its own line icon (milestones and awards cycle a few), every L4 post, paper, model and talk its own icon, and every L3 pod its own box sculpture; shapes load after the floor's first frame and crossfade in | In review |
| Content refresh, October | 2026-10-24: Metrodata-era claims re-checked against the evidence: 1,190+ merged pull requests, Pris.AI on 628 PRs in 24 repositories, consumer health in the client sectors, a Marketplace highlight; the Marketplace pod rewritten as readiness (packages validated by real test installs, offers not yet created, metering off); test-install results on the ARIA, Pris.AI and E-Recruitment pods (MII Fraud Detection's on the Marketplace pod); the Node.js October CVE sweep on Azure AI Operations; the Fabric pod retitled "OTF Forecasting for a Bakery Company" (real client data since 8 Oct, rule-based briefing, no in-app data agent, no Copilot agent claim, its two agent screenshots removed, the merged five-page UI and uplift layer); the E-Recruitment and MII Fraud Detection redesigns of 22 Oct, with their galleries replaced by five masked screenshots each of the new UI; a new listed Product Engineering pod for a consumer health company's outreach dashboard rebuild (live in production, its own box sculpture, a five-screenshot masked gallery in the original green and black theme) | In review |
| Time Travel | 2026-10-25: `/journey` opens with a skyline of the journey (Before 2019 to 2026), a slider and Play, the owner's caption, running tally and highlights per year; Classic only, no 3D bytes; the journey HTML grows about 8.6 KB gzip, accepted (no cap rises) | In review |
| B1 material pass | 2026-10-25: gunmetal panels with lit seams on the B1 bay walls, bay floors and deck, vent grilles on the bay side walls, the reactor plinth cladding; the B1 cap reset to measured + 0.6 KB (17.1 KB) | In review |
| LinkedIn alignment | 2026-10-31: owner decision: the site picks up LinkedIn items the owner approved one by one: the LILT AI freelance role on L2 and in Journey, the Telkom University honors, the Sentiboard DJKI copyright registration, a Jenius synchronizer result, a "How I work" sentence, and GraphQL, CodeIgniter and Firebase on the skills wall (skills may come from any source; the CV skills all stay) | Done |
| L4 reader tracks | 2026-10-25: owner decision: the L4 timeline of single-post stations, the archive board and the year posts are replaced by one bookshelf bay per reader track (4 today, 1 to 6 in content), each led by its best post face-out with the others as spines; a pulled spine shows its title, a spine click drives to the bay and opens the post, a bay door opens the track drawer, one hint per bay; bay camera views; all posts in-world (tested to 120) | In review |
| Phone-first 3D | 2026-10-26: owner decision: on a portrait phone the boot card docks at the bottom with one rolling log line and Rover's close-up above it, L1 opens on a phone landing view (Rover, the name hologram and the stats ring, no sky) at every session start, and a 6-step phone tour docks its choice lines at the bottom while the joystick, Boost and Reset view step aside; the tour script loads as its own chunk, no cap rises | In review |
| GH-300 study guide | 2026-10-29: owner decision: the GH-300 (GitHub Copilot) study guide joins the Study guides shelf, the certification card and the L4 Study Vault (a fifth book, right after GH-600); GH-300 itself is listed as in progress (planned November 2026, no credential yet) and stays out of the Time Travel certification tally until earned | Done |
| GH-300 earned, AB-100 guide, ten-book vault | 2026-10-31: owner decision: GH-300 is earned (credential linked, valid to October 2028) and counts everywhere an earned certification does; AB-100 (Agentic AI Business Solutions Architect Expert) is listed as in progress (planned November 2026) with its study guide on the shelf, the certification card and the L4 Study Vault; the vault holds up to ten books, five on one arc and six to ten as two staggered tiers (a raised back row), with phone views that keep every spine readable | In review |
| Phone-first 3D, part 2 | 2026-10-28: owner decision: on a phone Rover's lines without choices show whole at the top (below the minimap row in portrait, between the floor chip and the buttons in landscape), never over the rover, Boost or the joystick; every title and name on L2, L3, L4 and RF reads at least 10 px tall on a 390 x 844 phone from where a visitor stops (9 px at 375 x 667); touch screens no longer see keyboard keys ("Rotate left (Q)" is "Rotate left", pad pickers say "Tap a floor"); the menu sheet and the pad picker sheet load on first use as their own chunks, so the first frame and both session totals stay below main | In review |
| Phone-first 3D, part 3 | 2026-10-29: owner decision: a phone held sideways gets its own closer camera, so every title and name on L2 to RF reads at least 10 px tall at 844 x 390 (9 px at 667 x 375), larger than on a portrait phone, and L1 opens with Rover, the name and the stats ring in frame; on phones the joystick floats (drag anywhere on the lower left to drive, the rest of the screen looks) and Boost sits above Reset view; after the tour, a portrait phone or tablet hears once that sideways gives a wider view (never a lock); the first frame and both session totals stay at or below main | In review |

## Controls and first visit

Open `/en` and press **Boot rover**.

### Boot and intro

- The boot log and the intro play on the first 3D load of every browser session, on any route. Nothing skips the boot log.
- The intro: a still, dark close-up of Rover during the boot card; Boot rover wakes it (its face boots), a ring of light spreads across the Lobby and switches each landmark on, then the camera pulls back and orbits 270 degrees (around Rover on desktop, around the plaza on phones and tablets), each landmark pulsing once as it passes, and lands on the view behind Rover (6.6 s).
- On a portrait phone the boot card docks at the bottom in thumb reach with the boot log as one rolling line, and Rover's close-up shows above it.
- Drive, turn, zoom, reset view or Esc skips the intro: a quick fade to the view behind Rover.
- With reduced motion the camera does not move: the intro is a 0.9 s fade into the view behind Rover.
- A deep link such as `/en/labs/<slug>` then rides on to its floor or room.
- Add `?tier=lite` or `?tier=static` to force a tier.
- Known-weak integrated GPUs (Intel HD and UHD Graphics, low-end Mali, Adreno 5xx and below) start on lite; the graphics quality setting can still pick full.

### Driving

- Drive with WASD or the arrow keys.
- Hold **Shift** to boost to about twice the speed: twin light trails follow the path, the rover squats and leans, the view widens, and speed streaks and wheel sparks rush past.
- On touch tablets use the joystick; tap the Boost button (the bolt) next to it, or double-tap the joystick, to toggle boost on or off (both glow while boost is on).
- On phones the joystick floats: put a thumb anywhere on the lower left (the left half of the bottom 40% in portrait, the left 40% under the floor chip in landscape) and drag to drive; the stick appears under the thumb. A still tap there still picks a glowing object, a double tap on open floor toggles boost, and the Boost button sits above Reset view on the right.
- A phone held sideways gets its own closer camera: titles read at least as large as on a portrait phone, with a wider view.
- After the tour, a portrait phone or tablet hears once: "Tip: turn your screen sideways for a wider view of the tower." A tap or turning the screen clears it.
- One finger turns and tilts the view; no swipe changes floors (use the floor chip, the elevator or the call pads).
- Phones show no controls bar at the bottom: the menu's Controls entry lists every touch control.
- Leave the rover parked for 15 s with no input and it idles: it looks around, blinks, hops or spins and beeps once if sound is on. The sequence varies, any key, pointer or touch input stops it at once, and it never runs during a mission, a point-and-go drive, a ride or while the drawer is open. With reduced motion it only blinks.

### Point-and-go

- Point at a glowing object (a room, a pad, a board, the kiosk) to see its name, and click it to drive there and open it.
- On touch screens tap it, then tap again or press **Go**.
- Empty floor never moves the rover.

### Camera

- Drag, Q/E or the rotate buttons turn the view all the way around on every floor; R/F tilt it (from just above the floor to almost straight down).
- Scroll, pinch or +/- zoom. Zooming all the way in switches to a first-person view through Rover's eyes (WASD drives where you look; zoom out, 0 or the reset button return).
- Autopilot drives and elevator rides show the rover from behind meanwhile.
- Signs on L2 turn to face you from either side. No words are painted on any floor: wing, zone and year names float as signs that always face the camera (on L2 the year sits on top of each year gate).

### Elevator and fast return

- Change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About, plus a B1 row that stays locked until all five floors are visited) or PageUp/PageDown. On desktops the panel stays centred on the right edge and rises only on short screens, so it never covers the minimap, the settings gear or the top bar.
- Every floor has a glowing call pad in front of the elevator door: stop on it (or click it) and pick a floor from a list with previews.
- Far from the elevator (more than 40 u: the L2 Workshop, the L3 east plaza, the deep L4 desks), any floor change beams the rover into the car instead of driving all the way back (a fade cut under reduced motion).
- The far ends of L2, L3 and L4 have a green **Back to elevator** pad that beams you to the call pad.
- Every floor arrives like L3: the rover rolls out of the car heading east and the camera ends behind it and 35 degrees to its right ("serong kanan"), so the floor's main axis runs off to the upper right toward its main sight (the Lobby hologram, the Career Road, the Labs hub, the Writing timeline lane, the roof plaza mast). The camera starts over the rover's right shoulder in the car and glides out in 1.5 s, then stays locked on the rover until it parks; any turn, zoom, key or drive input takes over, and reduced motion cuts straight to the view.
- On the way in the camera turns to the same diagonal behind the rover as it drives to the door and holds it through the ride; any turn takes over, and reduced motion keeps the view as it is.

### Rover's tour, hints and floor lines

- Right after the boot and intro of your first session, Rover runs a short tour in a classic text box at the bottom of the screen (typewriter text, its face as the portrait).
- Press Enter, Space, the round A button, click or tap to continue, or "Skip tutorial".
- The tour covers driving and boost, point-and-go, the camera (look around, zoom, first person), the elevator and its call pads, then the Rover menu and Ask AI, each ringed while Rover talks about it. The tour never drives the rover anywhere by itself (owner decision 2026-10-27).
- A deep link rides on to its floor first and gets a shorter tour there.
- On a phone the tour is shorter (6 steps): welcome, tap-to-go (try it), the floor chip, the menu, Ask AI when shown, and the closing line.
- On a phone a Rover line with choices (the tour's, the B1 unlock offer, a try-it's Continue) docks at the bottom in thumb reach with full-width choices, and the joystick, Boost and Reset view step aside until it ends; lines without choices show whole as a slim toast at the top (below the minimap in portrait, between the floor chip and the buttons in landscape), so they never cover the rover, Boost or the joystick.
- The tour's script loads only for a session that plays it or on Replay the tutorial, so returning visitors never download it.
- Near anything you can use, a "!" bubble floats over it: press Enter or tap it for a one-line tip with a Go choice.
- The first time you reach L2, L3, L4 or RF, Rover introduces the floor in one line. Driving, a point-and-go action or a swipe dismisses it, and it never comes back on that floor.

### Sound

- While sound is on, the tower plays procedural "Deep Space Ambient" background music (drones, random pentatonic bells, a long reverb), quiet enough to keep the effects clear; muting or leaving the 3D view stops it.
- Each floor has its own soundtrack layer (L1 chime pad, L2 warm analog pulse, L3 light arpeggio, L4 typewriter ticks and paper rustle, RF wind and a distant radio beacon, and a low machine hum with soft relay ticks in the unlockable B1 Engine Room) that replaces the background music while it plays, so two soundtracks never overlap; it crossfades over 2 seconds when you change floor and follows the same mute and pause rules. The **Floor ambience** switch (settings, sound group) turns it off and crossfades back to the music.
- A short three-note chime (an effect, so the sound effects setting applies) marks the unlock of the B1 Engine Room, once per unlock.

### Motion setting

- The **Motion** button right of Sound (on phones and tablets in the menu's settings, and in Cmd-K) picks System, Full or Reduced.
- Full is the default on every device (owner decision 2026-10-14; Windows reports reduced motion whenever its animation effects are off), so the device's reduced motion setting no longer applies by default.
- Pick System to follow it again, or Reduced to keep rides as a short cut and the intro a short fade.

### Day and night

- The 3D tower runs a 4 minute cycle driven by clock time (`Date.now() % 4 min`), so every visitor sees the same phase and a reload continues.
- Night is the neon look with a moon and twinkling stars; "day" is a deep twilight, an indigo to teal sky with a sun glow on the horizon. Dawn and dusk blend the two.
- The sun and the moon rise and set up and down in the open sky of the default view, opposite each other: the sun comes up over the horizon on the left at dawn, stands highest at midday and sinks straight down on the right at dusk, and the moon does the same through the night. Only one shows near the horizon at a time: the moon fades out before the sun rises and comes back after the sun has set. The lights, the fog and the bloom follow the phase, and the neon glows brighter at night.
- The cycle follows the Motion setting: it runs unless reduced motion is on, and reduced motion holds night. A "Day and night" switch is registered in the settings registry (`src/hud/settings/defs/day-night.ts`, id `day-night`, display group, order 30) and shows in the settings panel (Menu on phones and tablets, the gear or `,` on desktops); the choice is kept in this browser (`localStorage["hq:day-night"]`).
- Automated browsers hold a still night (today's exact frame: no stars, moon, sun or drawn sky, so visual baselines stay valid); a visitor's held night keeps the moon and stars; `?sky=night|dawn|day|dusk|<0..1>` pins a phase and `?sky=cycle` runs the clock.
- The Classic site is unchanged. Rules: [`agents/3d-experience.md`](agents/3d-experience.md).
### Phones and tablets ("Corners" HUD)

- The four corners hold the controls: the floor chip top left (tap it to pick a floor), Ask AI, search (tablets) and the **Menu** top right, the joystick bottom left and **Reset view** bottom right.
- **Menu** opens a sheet with the profile (name, title and current floor), the actions (**Classic site**, Search, Rover menu, Rotate left and right, Map) and every setting (language, Open links in, motion, graphics quality, day and night, minimap, sound and music, plus **Replay the tutorial** and **Hints** while in 3D).
- Touch screens see no keyboard keys: labels read "Rotate left" and "Reset view", key caps show only with a mouse or trackpad, and the pad pickers say "Tap a floor" or "Tap a year".
- On a portrait phone every sign title and name on L2 to RF is readable from where you stop (at least 10 px tall on a 390 x 844 screen): the camera comes closer at a few stops and some signs use larger type on phones only.
- Desktops keep the top bar, the profile card and the elevator; a gear button above the view controls opens the same settings. The **,** key opens the settings on every device.

### Minimap and floor overview

- A round minimap shows the floor around the rover, north up: roads, plazas, the elevator (cyan square), the floor's places as dots in the floor color (visited ones dimmed) and the rover as a cyan arrow. Phones and tablets have it under the top right buttons, desktops bottom right above the settings gear.
- Tap it, press **N** or pick **Map** in the menu to open the overview: the whole floor with its places named, and a list of the places (visited ones marked). Picking a place drives the rover there and opens it, like clicking it in the world.
- The minimap can be switched off in the settings (**N** still opens the overview); phones hide it while a room sheet is open. It is plain HTML and SVG over the canvas, so it costs no 3D draw call.

### Rover menu and the Classic site

- **Rover menu** (ID **Menu Rover**; the `>_` button in the top bar, the menu on phones and tablets, or click the rover) is a terminal (`rover@hq:~$ ./rover-menu`) with nine entries: **Explore the work** (rides to L3, where Rover asks you to pick a wing: Product Engineering, AI Engineering or Data and ML), **See the highlights**, **Career timeline, 2019 to 2026**, **Browse projects**, **Read the writing**, **View CV**, **Discuss a role or project**, **Watch the AI agents at work** (drives to the L1 Agent Office and opens it) and **Explore on my own** (Esc). Keys 1 to 8 pick an entry.
- The panel always fits the visible screen: the header and the hint stay put and the list scrolls inside on short phones and landscape.
- **Replay the tutorial** and **Hints** are rows in the settings panel, general group, while in 3D (also in Cmd-K).
- **Classic site** (highlighted, with **Ask AI** on its right; ID **Situs klasik**) shows the same content as a regular website without 3D, and **Back to 3D** returns.

## Classic site

The Classic site (internally the Page View) is the permanent no-WebGL fallback and the version crawlers see.

- Architecture figures use native EN/ID node and edge labels where authored, consistently across case studies, technical posts, the build page and B1 drawers. Shared technical identities and legacy string labels remain supported.
- The home opens on a still first screen: the Neon Grid field above, and the portrait, the name, the role, the motto, the proof and the actions resting at its base beside the Ask bar, under one fixed indigo bloom (no loops, no entrance).
- Restrained, editorial look (design refinement 2026-10-19): dates read as values in sentence case, project cards share one title size with their headline result under the title on landing cards and on a hairline at the bottom elsewhere, filter bars are flat, the Work wing counts and the case study Results are ruled rows, and lead paragraphs keep a comfortable measure.
- **Enter the 3D HQ** shows wherever WebGL2 is available.
- Header, nav and hero links prefetch the next page when you point at, focus or touch them, never just because they are on screen.
- Beside the actions the **Ask AI** bar; below the first screen the three projects the owner selected (`Pod.selected`) as a Feature Stack: one project a row, its title, headline result in large type, tagline and facts held beside its screenshots.
- **Recruiter-first landing** (2026-10-25): under the motto a quiet proof strip shows three numbers (12+ enterprise clients, PRs merged in 2026, cloud and AI certifications), **View CV** is the one primary button (solid cyan) before See the work and Enter the 3D HQ, the stats ledger skips the three proof numbers, and the sections follow the recruiter path: work, about (with the stats ledger), journey, certifications and skills (one band), the Live Agent Office, writing, contact. Each Selected work row shows its headline result right under the title.
- **Story case studies**: the six featured case studies read as a story: Situation, Role and key decisions (each with why), Results, and a Lesson in the owner's own words; the other case studies keep Problem and Approach. Chapter anchors are unchanged, so drawer and mission links still land.
- **404**: "Rover took a wrong turn" (English with one Indonesian line) with three ways out, the CV first, then the work and home in either language, plus a "Did you mean" link to the closest page for a mistyped URL (the only part that needs JavaScript). Every empty or offline state (no filter match, a room that did not load, Ask, visit stats, the office card) names a next step.
- **Live Agent Office** (`/#office`, after the skills): the L1 office as a card: counts, the agents at their desks with their state, activity (and helpers, "Editing · 3 helpers") and task ("Client project" for private work), the latest public GitHub activity, and today's numbers. Of the ten desks it lists the awake ones, front row first, in five rows (past five, the fifth row reads "+N more desks"), with asleep and empty desks counted on one line ("3 desks idle"); it always draws those five rows and four GitHub slots, so it keeps one height in every state (no layout shift): Live, Paused (no update for a minute), Semi-live (no agent reporting), Resting or Offline (the last known rows, dimmed, "as of" their time). It hides when the office is switched off (once it is off screen), and loads and polls only while it is near the screen.
- "More key projects" on the landing lists only key projects with screenshots (hero projects with a gallery outside Selected work). On `/labs`, Key projects are the hero projects with screenshots, now including the Full-Stack AI Application Template, and every project row with a gallery shows its cover thumbnail. Rows without screenshots (on `/labs`, Quick view and the landing filmstrip) show a designed placeholder: the rover glyph and the project's initials on a wing-tinted gradient.
- **Shareable links:**
  - `?view=classic` opens the Classic site and stays in the URL through navigation, the language switch and copied links (`?view=page` still works).
  - **Copy Classic link** and **Copy 3D link** sit on case studies, posts and the drawer's "..." menu; the 3D link opens the same page in the tower (posts open the Writing floor).
  - If clipboard access fails, a localized status and read-only field expose the exact attempted link for manual copying, without taking focus. About's email-copy action exposes the raw address on failure too.
  - The choice is remembered across tabs, and an explicit `?view=` in a link always wins.
- **How this site was built** (`/{locale}/build`, linked from the footer and About):
  - A page of seven sections: the blueprint (an architecture diagram with a numbered walkthrough), the build rounds (a timeline with before and after captures), the AI agent workflow, the quality gates (what each gate enforces, where it runs and which ones block a merge), a dashboard of measured numbers (commits, pull requests, tests, budgets, the live visit count), Rover's Brain (the Ask pipeline diagram and its steps) and Rejected Designs (ideas that were dropped, with the reasons).
  - Text lives in `content/build-story.json`; every number comes from a snapshot taken at build time (`content/generated/build-facts.json`), shown with its date and commit, and the page links the public repository.
  - Ask the HQ answers about the site with a "Read on this site" link to it.
- The Rover menu never opens on its own; the **Rover menu** button opens it anywhere, and first-time visitors in 3D get Rover's tour instead.
- **Study guides** (`/{locale}/library#guides`, a chip in the Writing page's section nav, after Talks):
  - One card per certification study guide: the page 1 cover, issuer and exam code, title, summary, page count, file size and edition, and the exam domain weights, with **Read** and **Download PDF** (a same-origin download, never a new tab). A note under the cards says the guides are independent study material, not official exam guides.
  - **Read** opens the in-site reader in a dialog; the certification preview card (Classic cards and rows, and the 3D Lobby's certifications wall) shows **Read study guide** for a certification that has a guide and swaps itself for the reader, so focus returns to the original card or badge on close.
  - The reader is pdf.js in a lazy chunk, loaded on the click (hovering or focusing the button preloads the dialog): it fetches only the pages read, by byte range, from `/api/guides/<slug>`. Pages fit the width and draw as they scroll near, with selectable text; zoom steps from 50% to 300%; Chapters from the PDF outline; a thumbnail rail on wide screens; Download PDF.
  - Layout: one compact header row (Close, title, Chapters, Download PDF), so the pages get most of the height; the page box with its count, Previous and Next, Zoom out, Zoom in and Fit width float in a pill at the bottom center of the pages (never over the thumbnail rail), in one row down to a 360 px phone, and the last page scrolls clear of it.
  - Keys on the pages: Page Down, Right arrow and Space for the next page, Page Up, Left arrow and Shift+Space for the previous one, Home and End, `+`, `-` and `0` (fit width). Esc closes.
  - The thumbnail rail is one tab stop: Up and Down arrows, Home and End move between thumbnails, Enter or Space opens that page.
  - The last page read is remembered per guide (`localStorage` `hq:guide:<slug>`). A failed load (including a pdf.js worker that never starts, or no answer within 45 seconds) shows an error with Try again and the download; a page that fails to draw shows Try again in its own slot.
  - Browsers without the newest JavaScript built-ins the modern pdf.js build needs (older iOS Safari) get the legacy pdf.js build and worker instead, loaded only there.
  - Nothing of the reader or pdf.js loads before the click, on any Classic page or in the 3D tower.
- **One PDF reader**: the study guide reader is the site's only PDF reader. The CV (every CV button, `/cv`'s View CV, the RF kiosk) and the paper PDFs ("Read the paper") open in it with the same header, pill, thumbnails, keys and text layer; the paper reader adds **Abstract and citation** (Back) after Close and keeps the version line and the IEEE notice under the pages. The last page read is remembered per document (`hq:reader:cv`, `hq:reader:paper:<id>`). The CV and paper PDFs are static files, so pdf.js loads each in one fetch (the study guides by byte range).

## Glass Drawer

Driving into a room door (or picking it from Cmd-K) opens the Glass Drawer.

- A side panel on desktop and landscape screens at least 900 px wide (480 to 600 px wide, growing with the screen) or a bottom sheet (55% and 92% snap points) on phones, portrait tablets and narrower landscape screens.
- Its bar keeps the room code, prev/next, the "..." menu (README view, also on `t`) and close.
- The title and tabs scroll with the content, and the tabs stick under the bar, so the room body gets most of the height.

## L1 Lobby

Route `/en`. The stats ring, the skills wall and the certifications wall surround the plaza in front of the elevator.

- **Room to drive** (owner, 2026-10-19): the Lobby and the Highlights Hall share one 54 u deep slab centred on the elevator; every walkway between the lane ring and the walls, the kiosk and the Visitor Observatory is at least 6 u wide, and every pair of L1 obstacles stays 6 u apart.
- **Agent Office wing**: south of the plaza, reached by its own lead road (see [Agent Office](#agent-office)); the Highlights Hall's lead road starts 6 u east of it.

- **Skills wall**: every skill group (the seven CV groups plus Data science and ML), 4 across by 2 down on a 40 u wall under one storey (every item shown, long groups in two tidy sub-columns); its drawer and the Page View list the same groups.
- **Certifications wall**: a curved holo-wall with issuer tabs and paging. An in-progress certification (AB-100 today) shows in amber with "In progress" instead of its month.
- **Rover menu kiosk**: the session starts with the rover in front of it. The kiosk stands on a straight spoke from the lane ring and faces the hologram. It is one straight unit (body, stand and screen turned together to face the hologram, its lane spoke one straight line into its front) whose lines never wrap.
- The camera looks past the kiosk at the hologram's name and at the Visitor Observatory in the south-west corner.
- **Phone landing view**: on a portrait screen (phones and portrait tablets) every session starts on a higher, wider view that frames Rover, the full name over the hologram and the stats ring between the top bar and the controls, with no empty sky; after the intro and for a returning visitor alike. The first drive away eases back to the view behind Rover.

### Visitor Observatory

`L1:visits`, `/en#visits` or the old `/en/contact#visits`, also in Cmd-K. It is also the first thing in view when you step out of the elevator.

- A hologram globe with a dot for every country with at least one page view (dots only, never a number per country).
- A panel with visits since launch (today included) and in the last 30 days, then (since launch) the countries, questions asked to the site AI, the most explored floor and the 3D vs Classic split.
- Its drawer filters by Topic (All, Work, AI, Career) and Period (Since launch, the default, and Last 30 days).
- The numbers come from `GET /api/stats`: an hourly snapshot plus today's visits counted live (a new visit shows within about a minute). Visits are the site's own anonymous count, one per browser tab session with no cookie or identifier, from late October 2026 (Cloudflare Web Analytics estimates before); countries, page views and the most explored floor are Cloudflare Web Analytics sampled estimates. A snapshot older than 3 hours shows a "delayed" note; one older than 7 days hides every stats surface.
- The suggested questions list shows the top 5, most picked first, in the drawer and the Contact section.
- There is no opt-out switch: Do Not Track and Global Privacy Control visitors are counted as visits (nothing identifying is sent) and still stop the performance beacon.
- Automated browsers (Playwright, Lighthouse, headless checks; `navigator.webdriver`) are never counted: no visit, performance or Cloudflare beacon, and their Ask questions stay out of the question totals (still answered).
- The 3D vs Classic split comes from the site's own beacon's mode ping (one per page load, sent on leave), so its base is page loads, not visits; its note says so.

### Agent Office

`L1:office` (summary), `L1:office-github`, `L1:office-ci` and `L1:office-desk-1` to `-10` in the office's own south wing of the Lobby, down a lead road from the plaza under an "Agent Office" sign, also in the Rover menu ("Watch the AI agents at work") and Cmd-K.

- Two curved consoles of five desks around the office stop (ten seats): the front row on the floor, a Rover behind each desk facing you (Desk 1 on the left from the office), and the back row (Desks 6 to 10) raised on a riser behind it, every back-row face and desk screen in clear sight over the front row; a few steps behind them, a tall screen wall raised over their heads: mission control (counts, who is working now, today) and the public GitHub board.
- Live from Kurniadi's AI coding agents (GitHub Copilot, Claude Code, OpenAI Codex): nine states (working, thinking, reviewing, running tests, waiting on CI, needs Kurniadi, done, CI failed, asleep) with their own faces, poses and desk screens.
- Privacy: hooks on Kurniadi's machine send only the agent, a hashed session, the state, the activity type and a helper count (never prompts, commands, paths or output); a task title and repository show only for allowlisted public repositories (everything else reads "Client project"), and the GitHub board and CI tower show only allowlisted public repositories.
- Helpers (sub-agents) show as small drones orbiting their Rover's head, each with a glowing core in its Rover's state colour (at most four drawn, a "+N" on the chip for more).
- Ship-it pipeline: the slim CI tower in the south-east corner lights one lane per job of the latest public CI runs (running runs at the bottom: queued dim and steady, running violet and brighter with a chasing dot, done green, failed red); a new run sends a packet of cyan dots from its desk (a back-row desk's from over the riser) to the tower, a finished job bursts a ring on its lane, a finished run flashes the tower's crown, and a merged pull request flies as a small box with a violet glow onto the ship dock in the south-west corner, where today's merges stack up (at most 12). A production deploy that just succeeded fires a green beam up from the dock for 8 s, seen from the Lobby too (even with the office out of view), and a green ring pulses at the dock on the minimap meanwhile; the dock ring shimmers while a deploy runs and pulses red when one fails. Nothing flies higher than the screen wall's top, so the chip row stays clear. With reduced motion the lanes and the stack update at once and nothing flies (a steady beam, running lanes steady but brighter than queued, a steady green ring on the minimap).
- Day replay: after 30 s of an idle office in view (every desk asleep, or no agent reporting), the office plays the latest day with activity back as a 30 to 60 s time-lapse on a loop with a 6 s rest, through the same Rovers, pipeline effects and wall, and a live event (a desk waking or asking, a new production deploy) ends it at once. It is always labelled: a "Replay" pill leads the chip row ("Replay · 14:05", the clock alone on a phone), the chips' dots are rings and their names read "Replay of Mon 19 Oct: ...", the wall's status line becomes a violet banner ("Replay · Mon 19 Oct · 14:05"), and every drawer panel shows a "Replay" badge with "Back to live" (the summary and desk footers read "Replay of Mon 19 Oct. Live updates return when an agent starts working." in place of the hooks note, and "Show day replay" hides while a replay is active). The summary drawer's "Day replay" section ("Show day replay") picks any of the last 8 days (empty days disabled), plays or pauses and scrubs a time range ("14:05 WIB"); "Partial day" marks a truncated day and "Replay unavailable" a missing history. During a replay there is no beacon, minimap cue or deploy beam (those read the live feed only) and replayed deploys show only on the dock ring. With reduced motion there is no idle loop: a picked day starts paused and "Next hour" steps through it. A 6 x 4 grid of floor tiles on the wing's approach lights one per merged pull request, in order (the next 24 brighten), live for today and during a replay for the day so far; from the desktop stop it is behind the camera, where the wall and the dock's stack carry the merges.
- When a Rover needs Kurniadi, a pink beacon rises behind it over the wing, flat rings pulsing up its lower part (held still with reduced motion), and the minimap's office marker pulses; at the office stop only faint rings stay, and the Rover's raised flag carries the signal.
- A chip for each of the ten desks at the office stop (or with an office drawer open), in one compact row just under the top bar (on a phone ten dots in two rows beside the minimap), each above its Rover with a thin line in its state colour down to the screen wall's top (a small tick there, so it never crosses the screens' text; where the row runs past the wall's ends the line still stops at the wall-top level, its tick above the end Rover; faded where a chip sits over the screens), nudged sideways only to keep clear of its neighbours and the HUD; an off-duty desk's chip is a dim dot: a state dot and the agent's name (with a small drone ring and the helpers total, "3", while it has helpers), the activity and its helpers added when you zoom in ("Copilot · Editing · 3 helpers", with a "+2" pill for the helpers past the four drones drawn; when that does not fit, the activity ends in an ellipsis ("Copilot · Asking Kur…"), then the word "helpers" goes ("Claude · Watc… · 6"); the pill, the helpers count and the agent's name always stay whole), CI progress while CI runs (on phones always just the state dot; the name only where the row leaves no room for the activity, ten sessions on a desktop included; dots where it leaves no room for the names; screen readers hear the agent, activity, task (public repositories only, else "Client project") and CI progress). They appear once the camera has swung into the office view and stay through a zoom (zooming in on a desktop also lifts the view so the screen wall's top sits under the chip row); with reduced motion, or after turning the view by hand at the stop, they show as state dots. While a drawer sheet is open (tablets and phones) the row, its lines and the Replay pill hide, and return when it closes; beside a desktop's side panel the row stays clear of the panel.
- From the office stop the office fills the frame: the wall's top near the top edge, both console rows and their Rovers below it (on desktops the CI tower and the ship dock in view, on a portrait screen every desk), and the outline of the floor above and the tower frame hide while you are in the wing, so no line crosses the view; the wing sign fades out at the stop, and the live Rovers fade in when the office loads.
- Click a Rover, its chip, a wall half or the CI tower to drive to the office and open its drawer: the CI drawer (`L1:office-ci`: the latest runs with each job's name and status, and the latest merges and production deploys; the tower's text alternative), the summary (with a crew summary for screen readers: one sentence per desk with its helpers and the clock time its state began, and a polite live region that announces state changes, or one sentence when the office goes live, quiet, resting or offline, at most once per 10 s), the GitHub board, or one desk (agent, activity with its helpers, task, repository, time in state, recent activity).
- Always live: it loads on its own on every Lobby visit once the first frame is idle (or when one of its drawers opens), so the Rovers, their drones and the screens move whenever the office is in view from anywhere in the Lobby, without driving there. From afar (past 40 u) the crew and its effects step about 4 times a second and the faces and desk screens at most twice; out of view nothing runs. It polls every 30 s while in view from afar, at its fast pace (10 s while a desk is awake) near it or with a drawer open, and not at all out of view (the small 30 s beacon check takes over); input keeps it going, 10 minutes idle stops it.
- Semi-live (GitHub only), resting (off) and offline modes put every Rover to sleep; reduced motion holds every Rover still.
- On the Classic site the same office is the **Live Agent Office** card on the home page (`/#office`, see [Classic site](#classic-site)), and Ask Rover Assistant can explain what it shows and its privacy rule.

## L1 Highlights Hall

Behind the certifications wall, a road past its south end leads under a gateway arch into the hall.

- **Gateway**: a floating **Highlights Hall** sign, and a light curtain that sweeps once per session as you drive through.
- **The hall**: a gallery that sums up the tower around a light fountain, each station on its own stage under fake spotlights.
  - **About me** on a holo pedestal: the portrait as a hologram, name, headline, four big numbers in an arc, the one-line intro.
  - **Top 3 projects** on three monolith screens (the same three as the landing).
  - **Work experience** on a lit arch split into Employment and Freelance (newest first; a card rides to the role on L2).
  - **Contact** beside a signal beacon: email with copy, channels, the CV reader, availability.
- Point at a station and click (or tap twice) to drive there and open its drawer. A project with a public site shows **Visit live site**.
- **See the highlights** (Rover menu or Cmd-K) rides to the hall and opens About me.
- `/{locale}#highlights` or `/{locale}#highlights-<about|projects|experience|contact>` opens a station directly.

## L2 Career Road

Route `/en/journey`. One road runs forward in time.

- **Year plazas**: a plaza per year, rooms docked on both edges of each plaza with a road branch to every door. The year gate in front of each plaza carries its year on the top beam (no separate floating year board).
- **Teleporters**: every year plaza has a teleporter pad beside the road. Stop on it (or click it) and pick a year to beam straight to that plaza.
- **Career types**: one Neon line icon and hue each (employment, freelance, education, award, milestone) on the HTML pages; in 3D the hue stays and each job, school and freelance room floats its own icon (a ticket for the ticketing intern role, a stethoscope for the medical records backend, a gavel for the auction marketplace...), milestones and awards cycle a few (flag, flask, badge, rocket; medal, award, trophy).
- **Workshop** at the end of the road:
  - A forecourt with the **time console**: click it and pick any year to beam there, or Back to elevator.
  - Beside the time console a green **Back to elevator** pad beams you straight back to the elevator call pad.
  - A gateway into the Workshop proper with one workbench per side project that has no L3 pod (click its hologram for the project drawer).
  - The public repos as a neon skyline (height by stars on a log scale, color by language; click a bar for the repo drawer and its GitHub link).
- **Horizon**: past the Workshop window (clear glass, no label) a light bridge runs off the floor toward a holographic skyline far below with a sunrise glow.
- **Origin**: a light pillar rises at the start of the road.
- **Career timeline, 2019 to 2026** (Rover menu or Cmd-K) rides to L2, where the road starts at the 2019 prologue; on the Classic site it opens `/journey`.

## L3 Project Roads

Route `/en/labs`.

- **Hub and directory boards**: a hub plaza in front of the elevator and, where the three roads fork, three free-standing raised boards. They are the first thing you see on arrival: each wing's name, project count and top projects, one line each (a long title uses its short board title), plus how many more wait in the full list; click a board to drive to it and open the full list. The Data and ML board is a gate that the rover drives under; the Product Engineering and AI Engineering boards stand on one pylon each beside their road, turned toward the arrival view.
- **Three roads**: Product Engineering (north) and AI Engineering (south) leave the hub on either side of the Data and ML road, with every key and featured project docked along them. The board titles name the roads; there are no floating road signs. At the far end both wing roads turn toward the axis and meet the reactor ring due north and south, a mirror image about the spine.
- **Data and ML spine**: the middle road runs straight from the hub to the Tech Reactor, with the data science, NLP, forecasting and data collection projects from the public GitHub repositories and the demand forecasting work on Microsoft Fabric (on-premise data into a medallion lakehouse) docked on both sides (the Fabric pod first), spread evenly up to the reactor plaza. The wing roads spread apart just enough to leave room for them.
- **Pod sculptures**: every pod spins its own hologram sculpture hinting at the project (a microphone for the voice agent, a padlock for GenAI governance, candlesticks for the stock optimizer, a dress form for the sewing patterns...).
- **Packet lanes and waterfalls**: the loop closes in the east plaza around the Tech Reactor, fed by the packet lanes (routes drive around it), and data waterfalls pour off the four slab corners. A green **Back to elevator** pad waits on the axis just east of the ring.
- **Browse projects** (Rover menu or Cmd-K) rides to L3 and opens the full project list.

### Tech Reactor

- Its six rings are the CV skill groups (AI and LLM, Azure, Backend, Frontend, Data, DevOps).
- Click one to open the Tech Reactor drawer with every tech in that group and its project count.
- Pick a tech to light the pods that use it and the roads to them, or press **Surprise me** for a random project.
- A pick lives in the URL (`/en/labs#labs-tech=azure-openai`), and Cmd-K finds it too ("Show projects using Azure OpenAI").

### Ops Control Room

`L3:ops`, also in Cmd-K. It stands in the AI wing's inner pocket beside the reactor.

- Three screens styled like Grafana and Application Insights panels (Metrics, Traces, Alerts) built from the proof tiles of "How I run AI in production".
- A live panel of this site's own telemetry from the stats snapshot (refreshed every hour, today's visits live), all since launch: visits, the share of sampled 3D sessions at 55+ FPS, the median time to explore. Hidden when the snapshot is missing or stale.
- Its drawer shows the section with the case studies that prove it.

## L4 Newsroom

Route `/en/library`.

- **Press plaza**: a headline wall (the newest title in large type over a ticker of every title) and the featured post on a lit stage under a turning open book.
- **Reader tracks**: the timeline lane east holds one bookshelf bay per reader track (today AI in Production, Cloud Platform and Security, Engineering with AI Agents, Earlier Writing), alternating north and south, so a visitor picks an interest first. Each bay's best post stands face-out as a tall book with its cover half open (the owner's pick, else the newest), the other posts as spines beside it; every post sits on exactly one track, and the featured post keeps its place on its shelf too. Then the Research desk (its paper plates open the paper preview), Models and datasets, and Talks and workshops.
- **Shelves**: the spine nearest the rover in a bay (or the one you point at) slides out and shows its title; click a spine or the lead (tap, then Go, on touch screens) to drive to the bay's door and open that post. Posts opened from Cmd-K, missions or a `/blog/<slug>` link park at their bay (the featured post at its stage). Reduced motion snaps the spines.
- **Track drawer**: each bay's door opens a drawer with the track's posts, the best one first, each with its date; an item rides to its post. One "!" hint bubble per bay, whose Go opens it; Cmd-K finds each track too.
- **Item icons**: each bay's lead floats its own icon (an inbox, a microphone, a bug...) in the track's color, and the Research, Models and Talks desks show one icon per paper, model and talk in the zone's color.
- **Signs**: each bay carries its track name and its lead's title, the desks one section sign each, and only the pulled spine shows its title. Labels are placed on screen every frame by priority (a picked topic's titles, the pulled spine, track names, lead titles, sections), so none covers another, the rover or the end plaza's signs.
- **Sign follow-ups (open)**: add hysteresis so two labels at almost the same distance from the rover cannot swap places (today the fade hides the swap), and skip the placement pass when the camera, the rover and the picked topic are unchanged (`useLibrarySignPlacement`).
- **Read the writing** (Rover menu or Cmd-K) rides to L4 and opens the list of posts.
- **Study Vault**: a road from the end plaza's ring road leads south-east to a small round plaza where the certification study guides (six today, up to ten) stand as tall holo books, up to five on one arc and more as two staggered tiers (the back row on a riser, between the front books), each on a low plinth over a dashed floor track, in its issuer's tone (Microsoft cyan, GitHub violet, Google amber) with its exam code on the spine and a STUDY VAULT sign above.
  - Covers slide out and swing open as the rover comes near (half open from the vault stop, fully open next to a book or when you point at it); reduced motion snaps them, and the lite tier drops the light pools.
  - Click a book (tap, then Go, on touch screens) to drive to the vault and read that guide in the same in-site reader as the Classic Writing page ([Classic site](#classic-site)); one "!" hint bubble introduces the vault.
  - The spine signs show only near the vault and never cover another label.

### Topic Constellation

- The timeline ends in a round plaza where every topic of the writing (from post tags, papers, models and talks) glows as an orb slowly orbiting a pedestal.
- Click an orb (or pick a topic in its drawer, or Cmd-K "Show writing about X"): every matching desk and every bay holding a matching post lights up with a beacon, the road to them glows and "N pieces on X" floats above.
- The pick lives in the URL (`#library-topic=<slug>`). The Classic Writing page has the same topics as a filter (`/library?topic=<slug>`).
- The research metrics stand on a monument on the plaza's north rim (citations, h-index, the source and its date; a click opens the Research desk), and a **Back to elevator** pad waits south of it.

## RF Roof deck

Route `/en/contact`. A walkable deck: a road from the elevator into a round plaza.

- **Comms mast**: a lattice mast in the middle carries the availability as a large neon sign.
- **Comms station** (north): all contact channels and the email, an antenna per channel ringing in its own hue.
- **CV kiosk** (east) and an **about board** with location and timezone (south-west).
- **Courier drone**: patrols the mast and flies over the comms station or the CV kiosk while that room is open.

## B1 Engine Room

The basement under the Lobby: a workshop where each station explains one part of how this site was built. Its Classic counterpart is `/{locale}/build`; B1 has no route of its own (the URL stays `/{locale}`).

- **Unlock**: B1 opens after the rover has reached all five floors (L1 to RF); the progress is remembered on the device. Until then every floor picker (the elevator rail, the floor sheet and the pad picker) lists a locked "B1" row with a padlock and "Visit all 5 floors (n/5)", and nothing else of B1 shows, loads or rides.
  - The moment the fifth floor is reached a short chime plays, the B1 row lights up and pulses (no pulse under reduced motion), and Rover offers "Take me there" or "Later". The offer is shown once; a reload before answering drops it, and the row stays open.
  - `/{locale}#B1` (and Cmd-K "Go to B1 Engine Room", in the 3D tower only) goes straight to the floor once unlocked; locked, the link stays in the Lobby (and the action stays put) and Rover says how many floors are left.
  - `?unlock=b1` (in production `?unlock=b1&debug=1`) unlocks a session for development and tests only: it is never remembered and does not start the moment.
- **The floor**: an aisle runs east from the elevator past seven bays, alternating north and south, with server racks between them, ceiling pipes and cable trays, into a reactor hall with the reactor core and a workbench by the north wall. Light pulses travel along the pipes and the rack LEDs blink; reduced motion freezes them.
- **Seven stations** each open the Glass Drawer with content from the build story (`content/build-story.json`, numbers from the build-time snapshot) and a link to its `/build` section:
  - **The Blueprint**: the whole system on one diagram (the agents and the office relay on the owner's Mac, GitHub and its webhook, Cloudflare Pages and Functions, Workers AI with the Groq backup tiers, KV with the Ask knowledge pack, the hq-office Worker and its Durable Object, R2 study guides, the stats Cron Worker) and how each part runs.
  - **The Build Timeline**: thirteen rounds of merged pull requests, from the foundation to the office revamp, with dates and links (pull requests whose diff shows a client name are counted but not linked).
  - **Working with AI Agents**: the multi-agent loop (a coordinator chat, one session per feature in its own worktree, spec, plan, sub-agent tasks, review, owner gates, CI, deploy), the agents used (GitHub Copilot, Claude Code, Codex) and a real plan excerpt.
  - **The Gates**: the current CI (selective pull request runs, complement runs on main, shard packing, the 3D size, render and memory gates with the measured plus 0.6 KB cap rule, Lighthouse on affected pages, the local visual gate, the nightly full run).
  - **The Dashboard**: the repository numbers and the enforced budgets.
  - **Rover's Brain**: how Ask Rover Assistant answers, as a pipeline diagram (gatekeeper, answer cache, scope router, hybrid retrieval (BM25 and bge-m3 embeddings) over the knowledge pack, the model chain, output checks, the streamed answer) and eight steps, including the nightly evals.
  - **Rejected Designs**: thirteen ideas that were tried or proposed and dropped, each with the reason and, where it is linkable, the pull request.
- **The reactor hall**: the aisle ends at a live reactor core, the site's heartbeat:
  - four rings of segments colored by the jobs of the CI runs in the Agent Office tower's order and colors (violet running with a light chasing around the ring, green done, red failed, dim grey queued), turning slowly in alternating directions;
  - a bright energy column open to the top (a coolant shell, a brighter inner beam rising past the ceiling pipes, a thin crown ring and two thin rails instead of a cap) with bands flowing up it, and a soft glow pool on the platform under it;
  - a white flash when a new successful production deploy shows up;
  - sparks orbiting inside the rings, one per AI agent awake in the Agent Office (full quality);
  - a coolant pulse whose speed follows the visits and Ask questions since launch, and a counter plate with both numbers;
  - offline or stale it shows amber segments, no sparks and no flash, with a slow idle pulse; reduced motion also stops the turn (and holds the glow steady). Lite quality draws half the segments and no sparks.
  - It checks for new data only while the rover is on B1 (every 10 s while agents are awake, 30 s otherwise), stops after 10 minutes without input and picks up again on the next input; the visit numbers come from the page's one stats fetch.
- **Holograms and the Stack Halo**: every bay has a projector (a glowing disc and a light cone) and a hologram of its story, drawn from the build story's numbers:
  - The Blueprint: the tower itself turning, one slab per floor over an amber B1, with a scan ring; The Build Timeline: one bar per round sized by its pull requests, the open round amber with a pulsing "now"; Working with AI Agents: a violet core beaming to the GitHub Copilot, Claude Code and Codex tiles; The Gates: one arch per gate (CI green, nightly violet, local grey) lighting as a build packet passes; The Dashboard: a turning skyline of the snapshot numbers under a gauge ring; Rover's Brain: a gyroscope with one node per step and chunks streaming into the answer core; Rejected Designs: crossed red panels tumbling up a vortex, the last one amber.
  - The bays idle dim; the one the rover drives up to wakes in about half a second and plays its motion. Reduced motion shows every hologram lit and still.
  - Over the reactor crown the logos of the tools the site is built with (Next.js, React, Three.js, TypeScript, Tailwind CSS, Bun, Cloudflare Pages and Workers, GitHub Actions, Vitest, Playwright) and the coding agents orbit, always upright and facing the camera; they turn faster as the reactor pulses faster and flare white with its deploy flash.
- **The Reactor**: the core at the aisle's end opens its own drawer with the live numbers it shows (jobs running, done and failed in the latest CI runs, AI agents awake in the Agent Office, the time since the last production deploy, visits and Ask questions since launch) and how to read it, in plain words; offline it says so and shows the idle glow, and an open drawer turns offline by itself once the feed goes stale. It has no `/build` section and checks for new data only while the rover is on B1.
- **Look and sound**: a warmer amber accent on gunmetal machinery: dark panels with faintly lit amber seams clad the bay walls, the bay floors and the deck, cyan-seamed panels clad the reactor plinth and a ring round it, and vent grilles on the bay side walls pulse slowly like moving air; no sky underground (night holds), and a low machine hum as its floor layer, about 6 dB under the other floor layers, that rises (up to about 6 dB) as the rover nears the reactor core.
- A **Return pad** at the aisle end beams the rover back to the elevator; the arrival rolls the rover out of the car looking down the aisle at the reactor. On phones the arrival camera, on the same diagonal as every floor, frames the Working with AI Agents station across the aisle with its sign whole, then levels out once the rover drives on.
- The Blueprint and Rover's Brain drawers draw the wide three-column diagram in a wide desktop drawer and the narrow one on phones.
- Budgets: its own 16.5 KB floor chunk (16,946 B, cap 17.1 KB, loaded only when unlocked), 53 scene calls on lite and 55 on full when settled.

## Routes

All routes are locale-prefixed (`/en/...`, `/id/...`); `/` redirects by the remembered or browser language. The [README](../README.md#routes) has the overview table.

- `/{locale}`: a still hero (the name at the base of the Neon Grid, View CV, See the work, Enter the 3D HQ, Ask AI).
  - Three featured projects with screenshots and the other key projects that have screenshots (`#work`), a short intro with the current role and the stats ledger (`#intro`, `#stats`, with a visits item from the public stats: visits since launch), latest journey, certifications and skills, the Live Agent Office card (`#office`) and writing.
  - Certifications: 3 featured cards and the newest rows; the full, filterable list is on `/{locale}/contact`.
  - Mounts the 3D tower on top when WebGL is available: the Lobby, the Highlights Hall (`#highlights-<station>` opens a station) and the Agent Office wing.
- `/{locale}/quick`: Quick view, everything on one page.
- `/{locale}/journey`, `/{locale}/journey/{slug}`: Career Archive 2019 to 2026 and the Workshop annex; in 3D, the L2 Career Road (a slug deep link opens that room at its door). The page opens with Time Travel: the journey as a skyline of years with a slider and Play, the owner's caption, a running tally and highlights per year.
- `/{locale}/labs`, `/{locale}/labs/{slug}`: Product Engineering, AI Engineering and Data and ML case studies (`?wing=software|ai|data` filters the list); in 3D, L3 Project Roads (a slug deep link opens that pod at its door).
- `/{locale}#B1`: the Lobby route with a B1 deep link; in 3D it starts on the B1 Engine Room when unlocked (see [B1 Engine Room](#b1-engine-room)).
- `/{locale}/library`, `/{locale}/blog/{slug}`: blog, publications, models, talks and the study guides shelf (`#guides`); in 3D, L4 Writing. A post's drawer mirrors its `/blog/{slug}` URL, which is the article page.
- `/{locale}/contact`: Roof. About, contact channels, availability, "How I work" and the CV.
  - "How I run AI in production" (`#production`): the owner-approved observability approach, proof tiles, a masked Grafana probe dashboard and alert rule, and the five case studies; in 3D the hash rides to the L3 Ops Control Room.
  - "Visits" (`#visits`): counters, a dot map, the 3D vs Classic split, topic shares and curated question counts, with the Topic and Period filters and "View as table"; lazy loaded.
  - The full certifications list.
  - In 3D, the RF roof deck (comms station, CV kiosk, availability sign, about board).
- `/{locale}/build`: How this site was built (its 3D counterpart is the secret B1 Engine Room, unlocked after visiting all five floors): the blueprint, build rounds, AI agent workflow, quality gates, dashboard, Rover's Brain and Rejected Designs, with a table of contents of section anchors (`#blueprint`, `#timeline`, `#agents`, `#gates`, `#dashboard`, `#brain`, `#rejected`).
- `/{locale}/cv`: page 1 of the owner's CV (`/cv/kurniadi-ahmad-wijaya-cv.pdf`, one file for both languages) with **View CV** (opens the CV in the shared PDF reader, the same as the study guides) and **Download PDF**. Every CV button on the site opens the same reader as a modal.
- `/api/ask`: Ask the HQ endpoint (Pages Function): `GET` status, `POST` question, SSE answer.
- `/api/stats`: the public visit stats snapshot, refreshed every hour with today's visits added live (200, or 204 before the first run). `/api/rum` and `/api/visit` take the anonymous performance and visit beacons (`POST` only).
- `/api/office/history` (`GET` and `HEAD`): the Agent Office replay history, the 8-day index or `?day=YYYY-MM-DD` (one WIB day inside the window; events, merges, finished runs and deploys as numbers, no session ids or branches, titles cleaned again at read time), with an ETag (304 on a match), `max-age=30` for the index and today and `max-age=3600` for past days; a day outside the window is a fixed 404, a missing or older Worker a 503 for the index (a day request, the fixed 404).
- `/api/office`: the Agent Office snapshot (`GET`, always 200 JSON) with an ETag (304 on a match) and `max-age=5, stale-while-revalidate=30`; the L1 office polls `?v=4` (snapshot v4: v3 plus the CI pipeline: the latest runs with their jobs, merges and production deploys), the Classic card and the beacon check `?v=3` (snapshot v3: up to ten desks with helper counts; v1 and v2 keep five desks plus the rest in `extra`, v1 never changes): the office while in view (every 30 s from afar, its fast pace near it or with a drawer open), the beacon check every 30 s while it is out of view. `POST /api/office/beat` and `/api/office/github` take the signed relay beats and GitHub webhooks ([office.md](agents/office.md)).
- `/api/guides/{slug}`: a study guide PDF from the private R2 bucket (Pages Function, `GET` and `HEAD`): byte ranges, ETag, `?v=<version>` for a year of immutable caching, `?download=1` for an attachment. Runbook: [`study-guides-runbook.md`](study-guides-runbook.md).

## Search and link previews

Every page is a static HTML page with its own search and share tags, so crawlers and link unfurlers (LinkedIn, Slack, WhatsApp, X) never need the 3D view or JavaScript.

- Titles (`src/lib/seo.ts`): Open Graph and Twitter keep the share title (`seoFor().title`, owner wording); `<title>` uses `searchTitle`, which fits 60 characters by dropping the attribution step by step (full name, first name, none; journey entries keep the organization first; home is the name and headline, with the city in its description), unique in each locale. Entries that share a role and organization (trophy cases, side projects) add their period. Descriptions stay 140 to 160 characters.
- Canonical: every page points at itself (`og:url` equals the canonical, checked by `og:check`); `/` (the script language redirect) points at `/en`, its x-default, with the same share card. hreflang `en`, `id` and `x-default` on every page and in the sitemap.
- Share cards: 1200x630 baseline JPEGs with a JFIF header (`src/lib/og-encode.ts`), under 300 KB, with `og:image:secure_url`, type, size and alt. The tags sit in the first 8 KB of every page (`lateShareTags` in `scripts/og-meta.ts`).
- Structured data (`src/lib/jsonld.ts`): `Person` (employer, Jakarta address, university, skills, LinkedIn, GitHub, Google Scholar, IEEE Xplore, Hugging Face and Medium) and `WebSite` on every page; `ProfilePage` on About (`/contact`); `CreativeWork` with `SoftwareSourceCode` parts (public repositories) on case studies; `BlogPosting` on posts; `TechArticle` on How this site was built (`/build`, dated by the build story and its facts snapshot); `BreadcrumbList` everywhere but home.
- `robots.txt` allows everything and names the sitemap. The sitemap dates posts, Writing, Journey, Home, Quick view and `/build` from content (`lastModified` in `src/lib/routes.ts`; `/build` by its facts snapshot) and leaves other pages undated. The 404 page is `noindex`.
- Search engine verification: `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` repository variables render the tags on `/`, `/en` and `/id` in production builds ([deploy guide](deploy.md#15-search-engines-and-link-previews)).
- Checks: `bun run og:check` (every page), `e2e/seo.spec.ts` (fetches every entry point as LinkedInBot), and the post-deploy smoke (`/`, `/en`, `/id` as LinkedInBot against production).

## Ask the HQ (AI Q&A)

Visitors ask questions about Kurniadi's work, projects, career, contact details, the views he has written down (principles, engineering and AI practice, tools, career advice, working style, AI and the industry, the Indonesian tech scene, technology policy and life outside work) and how this site itself was built (stack, 3D engine, hosting, the assistant, testing, process, the secret B1 Engine Room and the Agent Office; `content/ask/site-build.json`; answers cite the How this site was built page, `/build`, which links the repository), and get short answers grounded only in this site's content (EN and ID).

### Where

- The floating **Ask AI** button on the Classic pages, the **Ask AI** pill in the 3D top bar, the Ask bar in the Page View hero, and the Cmd-K "Ask AI" row; the chat opens as a side panel on desktop and a bottom sheet on phones. The chat panel is titled **Ask Rover Assistant** (ID **Asisten Rover**) and its answers are labelled Rover; the floating button stays **Ask AI**.
- Rover answers in its own light voice ("I found...", at most one "Beep!"), always about Kurniadi in the third person, and never speaks as him.
- Related professional questions ("Where should AI not be used?", "When is RAG a bad idea?") are answered only from what his work shows, citing the case study, post or written view; without one, Rover says he hasn't written about it and names the closest title.
- Questions a keyword list used to refuse are answered from what he wrote: his political view (his technology-policy views, with a note that he shares nothing partisan), how to learn AI or become an engineer like him (his own path), his manager, team or clients (his teamwork views). A mixed question ("his view on AI jobs, and is he religious?") gets the answerable part and one line declining the private part. Trivia such as the weather or a sports result gets a short redirect with suggested questions, and every decline offers next questions. An answer can show two "Read on this site" links.
- A "Try asking" row offers 3 curated questions from different topics, and topic pills (Work, AI, Career, Contact, Perspectives, About me, This site) expand into 4 of a bank of 106 curated questions (`content/ask/suggestions.json`); both are a random sample, fixed for the page session, and a question already asked never comes back. Each answer suggests related follow-ups with no extra AI call. Follow-ups sit in one compact row under the answer, and the thread keeps the answer's first line in view (it never scrolls once the visitor has).
- The thread is kept in `sessionStorage` only. The assistant remembers the last 5 turns, so follow-ups such as "What stack did it use?" or "And before that?" work; **New chat** (ID **Obrolan baru**) clears the thread and the memory, and so does switching the language.
- **What can you do?** (also a Contact pill, ID "Apa saja yang bisa ditanyakan di sini?") lists what the assistant covers, the two languages, sources, and what it will not discuss.
- **Project inquiries**: when a visitor describes their own need ("I need an AI chatbot for my clinic", "Kami butuh sistem deteksi fraud dokumen"), the answer names related skills and up to three matching past projects, says whether that work suggests a fit, notes freelance or part-time availability and invites contact; a **contact card** (Email, LinkedIn, Contact page) from the dataset appears under it. No prices, timelines, designs or code.
- **Bring your problem**: when a visitor describes a problem of their own or asks how he would approach one ("Our call center can't keep up. His approach?", "Review dokumen kami lambat. Pendekatannya?", also four Contact pills), the answer outlines how Kurniadi approached similar problems in up to two matching past projects, in the past tense and by title, with at most one of his written views, a "Read on this site" link to the project and the contact card. It never tells the visitor what to build or use, and gives no estimates, timelines, designs or code; without a matching project it is the project-inquiry answer.

### How

- A Cloudflare Pages Function (`functions/api/ask.ts`, pipeline in `functions/_lib/`) retrieves from a knowledge pack built at build time from the public content (`src/ask/pack.ts`). Retrieval fuses BM25 with multilingual bge-m3 embeddings (one Workers AI call per question; BM25 alone when it fails or takes over 300 ms). The pack lives in Workers KV as versioned, immutable values with a precomputed BM25 index and the chunk embeddings behind a `pack:current` pointer that every deploy moves and every rollback moves back; each isolate keeps it in memory, checks its SHA-256, and falls back to the deployed version or a small bundled pack (who he is, what he does now, contact, how the site was built, his principles) when KV fails.
- It then calls Workers AI through AI Gateway `shinyq-hq`: **Gemma 4 26B** (`@cf/google/gemma-4-26b-a4b-it`, thinking off), falling back once to **Mistral Small 3.1** on error, timeout or an empty answer.
- Earlier turns travel with the question: each answer carries the server's signature (HMAC), and only verified turns reach the model, as earlier messages it may use for context but never as instructions. A short follow-up is scope-checked and retrieved together with the question it refers to.
- Groq is the backup when Workers AI fails or runs out of its daily quota. A quota error (3036) also skips Mistral, and the Groq backup tiers answer until 00:00 UTC: **Qwen 3.8 27B** (`qwen/qwen3.8-27b`, a Groq preview model), then **gpt-oss-120b** (`openai/gpt-oss-120b`). Groq is called through the same AI Gateway, only when the `GROQ_API_KEY` secret exists, with the same prompt, retrieval and output checks. Without a working tier the visitor sees the fallback message.
- Answers stream over SSE and first-turn answers are cached in KV for 7 days (a follow-up depends on its history, so it is never cached). The model may use short bullet lists (at most 5 items), **bold** titles and links to pages it was given; the dock renders that safe markdown subset as React elements (never HTML), and the server keeps only links to retrieved pages, the top pages and the public repository (any other link becomes its label).

### Safety

- Invisible Turnstile, Origin checks, per-visitor and global rate limits, PII scrubbing, prompt-injection handling.
- Output checks: forbidden patterns, secrets, numeric grounding, entity and prompt-leak checks; clients are named only by sector (prompt rule 6). Forbidden-pattern and secret scans read the answer with its link URLs and as plain text; every other check reads the plain text the visitor sees.
- A circuit breaker and an `ASK_ENABLED` kill switch.
- Kurniadi-only scope, routed deterministically before any model call: family, relationships, his health, religion, partisan politics (his vote, parties, candidates, named politicians), pay, personal details and opinions about named people, employers or clients are declined; so are general-assistant requests (code, essays, homework, tutorials, translations, recommendations, "be a general chatbot" jailbreaks), with a decline that points back to what it covers. Lifestyle and tech-policy questions are answered only from his written perspectives on that topic.
- Lead answers are checked for estimates, system designs, code, unsupported fit claims and requests for the visitor's personal data.
- A first-person check, and a source check that turns any opinion he never wrote down into "Kurniadi hasn't shared a written view on that".
- Client names are kept out by review and the sector-label rule; there is no automated blocklist ([decision](decisions/2026-10-22-safety-blocklist-removed.md)).
- Full threat model: the Ask design spec sections 7 and 13.

### Freshness and operations

- `refresh-facts.yml` refreshes live numbers weekly (`content/generated/dynamic-facts.json`), merges after CI and deploys.
- `ask-eval.yml` runs nightly within a budget: a 21-question smoke set on Workers AI (about 840 of the 10,000 daily neurons), and on Groq models production never uses a third of the golden set, a twenty-first of the pills and the red team; a 10-question fidelity set checks production's first Groq backup ([runbook section 9a](ask-runbook.md#9a-eval-neuron-budget-owner-decision-2026-10-19)).
- `ask-samples.yml` (dispatch only) writes sample answers for a branch on the Groq tier; `ask-pack.yml` (dispatch only) proves the deploy token can publish the KV pack.
- `content-gap.yml` reports unanswered questions weekly, and which pack tier served (memory, KV, the pinned version or the fallback).
- `uptime.yml` checks production every hour (pages, Ask status, stats freshness, the last deploy) and keeps one `uptime` issue open while something fails (docs/deploy.md section 16).
- Provisioning, kill switch, cache purge, secret rotation, token expiry: [`ask-runbook.md`](ask-runbook.md).

## Visual language

- The Neon Grid tokens of spec appendix 05.
- Color marks state and category with a dot or icon chip next to the label and a full-outline glow on hover or selection, never with a colored left or top edge (see [`agents/styling-and-i18n.md`](agents/styling-and-i18n.md)).

## CI and deploys

### CI

- GitHub Actions runs typecheck, lint, unit tests and the secret scan next to the static build (CSP hashes, the export script policy check, `og:check`), then the Playwright suite and the 3D perf gates in parallel shards against that build: a push to `main` usually runs only the complement of its merged PR's green same-tree run (1 to 8 e2e and 1 to 4 perf shards), a full run otherwise; the nightly and dispatches use 8 and 4.
- Smart CI: on a pull request, `scripts/ci-plan.ts` runs only the affected e2e specs plus a smoke set (on 1 to 8 shards sized from the CI timings), the affected 3D perf tests (on 1 to 4 shards sized the same way) and the affected Lighthouse URLs plus the home page; a full pull request runs 6 e2e and 4 perf shards; a push to `main` runs only what its merged PR's green same-tree run did not (a full run otherwise); dispatches, the nightly and the `full-ci` label run everything. Tests titled `@nightly` run only in the nightly, which keeps one `ci-nightly` issue while it fails ([`agents/ci-and-deploy.md`](agents/ci-and-deploy.md#ci)).
- E2E shards are packed by measured, runner-speed-normalized test times with two workers per shard, and functional specs run rides, drives, camera eases and the intro 4x faster (never the perf lane).
- At most 2 CI runs in flight, both pull request runs and at most one of them a full run (12 jobs; a selective run 5 to 7); a `main` run (14 jobs plus Deploy) stays alone, under the Free plan's 20 concurrent jobs.
- Setup caches: bun packages keyed on the lockfile, the Playwright browser per version, Playwright's system packages as cached `.deb` files with bounded apt fetches, and the Next build cache saved only on `main`; the Lighthouse warm-up URL runs once.
- Node is pinned to one exact version (`.nvmrc`, `.node-version`, `engines`) and Bun to `packageManager`; every CI job that runs Node sets that version up.
- `Build, CV and e2e` is the aggregate required check (the name predates the CV becoming a committed PDF): it requires every job, each e2e and perf shard included, so no shard is a required check of its own. `Lighthouse CI` enforces the Page View budgets and the `3D perf gates` job the 3D ones. Both publish per-chunk JS and gate tables against the last green `main` run in the job summary.
- Screenshots run nightly on `main`, on demand and on PRs labelled `screenshots` (`.github/workflows/screenshots.yml`).
- The game-first timeline runs nightly as a trend (`.github/workflows/perf-nightly.yml`).
- Every HTML page carries its own script policy: the last build step (`scripts/csp-hashes.ts`) adds the sha256 of each inline script, so the effective `script-src` has no `'unsafe-inline'`. The build, the export scan, the deploy smoke check, `e2e/static-routes.spec.ts` and `e2e/csp.spec.ts` (zero CSP violations) guard it; details in [`deploy.md`](deploy.md) section 9.

### Production

- The Cloudflare Pages project `kurniadi` at https://kurniadi.pages.dev.
- `deploy.yml` deploys every merge to `main`, each weekly facts merge and any dispatched commit on `main` (Actions > Deploy, or `gh workflow run deploy.yml -f sha=<commit>`).
- Fast path: a merge whose pull request was green on the same tree deploys at once (about 4 minutes); otherwise the deploy reuses CI's green complete result (`ci-full` artifact) for the commit, and runs the e2e shards itself only when none exists or with `-f rerun_e2e=true`.
- The deploy job deploys the hq-office Worker, publishes the Ask knowledge pack to Workers KV, uploads with `wrangler pages deploy`, flips the pack pointer and smoke-checks production (`/api/ask`, `/api/rum`, `/api/visit`, `/api/stats`, `/en` with its script policy and the analytics beacon, cache headers, link previews); then the hq-stats Worker deploys. Any failure opens a `deploy-failed` issue.
- A red `main` CI rolls production back automatically (`rollback.yml`: Pages, the Workers and the pack pointer) and blocks the fast path until `main` is green again.
- Cloudflare credentials for deploys live in the main-only `production` environment (the deploy token `hq-ci-deploy`). PR previews (project `shinyq-hq`) are off unless `CF_PREVIEWS=true` and a preview-only token exist.

### Analytics and public visit stats

- Cloudflare Web Analytics runs on production builds only; its beacon loads after the page and its scripts, on idle.
- An anonymous, sampled performance beacon (appendix 06 section 4) writes coarse tier, FPS and load-time buckets to Analytics Engine.
- Public visit stats (appendix 06 section 4.1): a first-party beacon sends a visit ping once per browser tab session (the visit count) and records whether a page lifetime used the 3D view or the Classic site, the `hq-stats` Cron Worker (`workers/stats/`) rolls Web Analytics and Analytics Engine up every hour into KV (finalized days once, today so far in the snapshot), and `GET /api/stats` serves the snapshot plus today's visit pings since the run (through the Worker's service-binding-only `GET /live`).
- No visitor opt-out (owner decision 2026-10-23): Do Not Track and Global Privacy Control turn the performance beacon off but are counted as visits (owner decision 2026-10-24), and a stale `hq:stats-optout` key from the retired switch is removed once. Automated browsers (`navigator.webdriver`) send no beacon either, and their Ask questions stay out of the public question counts.
- `deploy.yml` also deploys the Worker after checking its tokens.
- Details, secrets, variables and the Cloudflare resource inventory: [`deploy.md`](deploy.md).

### Dependencies

- Dependabot opens one weekly PR with every minor and patch update, and one PR per major.
- A major ships in its own PR with every gate green; 3D library majors also need the strict visual gate, the perf lane and the memory gates.
- A major that cannot pass is pinned with a dated reason in `.github/dependabot.yml` and listed in [`deploy.md`](deploy.md) section 17: TypeScript 7 is skipped until 2027-01-15 (TypeScript stays on 6.0).
- GitHub Actions updates come in one weekly group; every action is pinned to a commit SHA.

## Performance

### Page View budgets

The HTML pages paint their text before any JavaScript runs, so Lighthouse's simulated LCP is set by the bytes of the HTML, the CSS and the three preloaded fonts. Budgets are enforced in CI and are authoritative over the spec (appendix 08 section 2; `lighthouserc.json`, `Lighthouse CI` job):

| Metric | Budget |
|---|---|
| LCP | under 2 s |
| CLS | under 0.01 |
| TBT | under 200 ms |
| Fonts per page | at most 60 KB |
| HTML per page | at most 82 KB |
| CSS per page | at most 20 KB |
| JavaScript per page | at most 240 KB |

What keeps them there (subset fonts, deferred Next.js chunks, large client data in `/data/*.json` instead of layout props, small always-loaded islands): [`deploy.md`](deploy.md) section 8.

### Delivery (round 5)

- zod stays on the server (`src/content/locales.ts`); the build fails when `_zod`, `readFileSync` or `site-content` reaches a client chunk.
- Lighthouse CI warms up on a throwaway URL first.
- Unhashed files have explicit cache rules (`public/_headers`); troika fonts are content-hashed and immutable.
- The game-first boot downloads only what the first 3D frame needs: the hidden page is skipped with `content-visibility`, header links do not prefetch, room data waits for the first frame and idle, then loads one floor at a time (the rover's floor, a ride's target, an opened room's floor), versioned by a content hash.
- The boot card names the owner and offers the Classic site. The Page View never starts audio.
- Numbers against the round 5 starting point: initial JS 235.2 to 203.8 KB, bytes before the first 3D frame 1082.1 to 680.7 KB, troika fonts 139 to 58 KB.

### 3D budgets

| Gate | Budget | Where |
|---|---|---|
| Scene draw calls per floor | under 150 (L1 at most 125, RF 79, B1 100) | `e2e/budgets.ts` |
| Post-processing passes | at most 20 | `e2e/budgets.ts` |
| Triangles | under 30k | `e2e/budgets.ts` |
| Worst whole frame, every render pass | under 150 calls | `e2e/perf/peaks.spec.ts` |
| Shader programs | committed baseline plus 2 | `e2e/perf/baseline.json` |
| JS after the 3D gate (main path, `?prefetch=off`) | under 466.4 KB gzip per tier; session total full 531.8 KB, lite 516.0 KB (the office scene and replay chunks included) | `bun run e2e:perf` |
| Floor chunk, loaded on demand | L3 20 KB, L4 16 KB, RF 8 KB, B1 17.1 KB gzip | `bun run e2e:perf` |
| L1 Agent Office chunks | 40 KB gzip for the scene, drawer body and replay chunks together; the watch, beacon and replay controls chunks have their own caps | `bun run e2e:perf` |

- Floor chunks (Round 7 B): L3 (Labs, Ops and Reactor drawer bodies, hologram overlay), L4 (Library, research and topics bodies) and RF (Roof) are dynamic imports (`src/experience/floors/floorChunks.ts`). They prefetch after the first frame on idle, on elevator intent (ride target, floor picker, call pad hover, panel hover or focus) and load at once for deep links; while one loads the slab shows and the car holds at closed doors. `?prefetch=off` turns the speculative prefetches off. Measured today: main 3D path 450.3 KB (lite) and 466.1 KB (full), chunks L3 13.9, L4 13.2, RF 3.3, B1 16.5 KB.
- The peaks of the intro, every elevator ride and hover count too. During a ride, meshes hidden under a solid slab are skipped (`src/experience/tower/rideCull.ts`).
- Real-device frame rate is checked with `?perf=1`.
- The pixel budget (`renderBudget` in `src/experience/scene/settings.ts`) keeps desktops at DPR up to 2 within 8.3 MP and skips composer MSAA from DPR 1.5 up; touch devices render fewer pixels (DPR 1.5 on full, 1.25 on lite).
- A runtime safety net lowers DPR, then MSAA, then bloom only on sustained frame drops, at most twice a minute.
- Shader programs compile before they are needed (every other floor during the boot on the full tier, each floor as it mounts), neighbouring floors mount on idle after the first frames, and the nav grids build in about a millisecond.
- Floor content is disposed when it unmounts: `e2e/memory.spec.ts` drives 10 Lobby to Roof round trips and 5 Page View toggles (lite, reduced motion), `e2e/perf/memory-full.spec.ts` 3 round trips on the full tier with Motion Full (perf lane), and both expect the renderer's geometries, textures and shader programs back at their baseline.
- The canvas renders at most 60 frames per second (`scene/framePacer.ts`), so 90 to 144 Hz screens do not do twice the work.
- A parked scene idles: after 1 s with no input and nothing moving, L2 and B1 drop to 30 fps and the other floors stay at 60 (their parked views show fast motion); with reduced motion the canvas renders only on demand (30 fps on L1, where the profile hologram spins). Any input brings 60 fps back on the next frame.
- The 3D chunk mounts directly once it and the 3D page data are in, with no Suspense retry in between, and the 3D page data is a static versioned JSON file (`/data/experience/{locale}.json`), never part of the page's HTML.
- The L1 skills and certification walls draw their logos from one prebuilt WebP atlas (one request).
- Measurements: [`perf/r5-gpu.md`](perf/r5-gpu.md).

### Elevator smoothness

- The elevator never skips its ride: each frame adds at most 1/30 s of ride time (1/20 s on steadily slow devices).
- On a first visit the car waits with closed doors (at most 1.5 s) until the new floor's shaders are compiled and its text is set.
- To check a device, open any 3D route with `?perf=1` (for example `/en?perf=1`), open the browser console (F12) and ride. Every ride prints one `[hq ride]` line with the dolly frames, car heights, biggest jump, longest frame, wait and shaders compiled while moving.
- Good: at least 12 car heights, biggest jump at most 25% of the trip, "0 shaders compiled while moving".
- The same flag shows a small overlay with FPS p50/p10, frame p95, scene and post draw calls, GPU objects, tier, DPR and pixels, and after the first ride a sixth line with that ride's summary (nothing of it runs without the flag).
