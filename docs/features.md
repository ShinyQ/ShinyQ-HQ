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
| L4 declutter | Round 7 F (2026-10-16): one sign per section over its first desk, post titles only for the nearest stations (6 on desktop, 4 on phones), year marks on small low posts, no label covers another or the rover; L4 draws 2 fewer scene calls and no more triangles | Done |
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
| Intro: wake and reveal orbit | 2026-10-18: the intro opens on a dark close-up of Rover, its face boots, a reveal ring spreads from it and switches the Lobby's landmarks on, and a 270 degree orbit passes them (each pulses once) and lands on the follow view; drive, turn, zoom, reset view or Esc skips it; reduced motion fades into the follow view; the Highlights Hall builds during the boot card | In review |
| B1 Engine Room floor | Round 9 (PR 2 and 3): the secret floor, unlocked after visiting all five floors; PR 2 (the floor) shipped in #209, the unlock is in review | In review |
| Agent Office, part 1 (backend) | 2026-10-19: the hq-office Worker and Durable Object, signed relay beats and GitHub webhooks (same-repository activity only; a privatized repository is forgotten), GET /api/office with an ETag and a 5 s edge cache; no UI yet | Done |
| Agent Office, part 2 (relay) | 2026-10-19: office-relay turns GitHub Copilot, Claude Code and Codex hook events into signed, privacy-filtered beats; one installer for all three | Done |
| Agent Office, part 3 (3D office) | 2026-10-19: the L1 office with five live Rovers at curved desks, the screen wall, chips and drawers, in two lazy chunks (scene and drawer body); 2026-10-20: it moves into its own south wing of the L1 slab with a lead road, a plaza and one continuous console under the full space rules; the Classic card is part 4 | In review |
| Study guides | 2026-10-19: the four certification study guides read in an in-site pdf.js reader (streamed by byte range from a private R2 bucket through `/api/guides/<slug>`), from a Study guides shelf on the Classic Writing page and "Read study guide" in the certification card (shipped in #243 and #245), and the 3D Study Vault off the L4 end plaza (holo books whose covers open as the rover comes near; a book opens the reader, shipped in #247) | Done |
| Ask knowledge pack in Workers KV | 2026-10-19: the Ask knowledge pack moved out of the Function bundle into Workers KV (versioned values with a build-time BM25 index, a pointer flipped with each deploy and rollback, per-isolate memory, SHA-256 checks, a pinned version and a bundled fallback pack); the Function bundle shrank from 449 KB to 210 KB and a new isolate no longer tokenizes the pack | In review |

## Controls and first visit

Open `/en` and press **Boot rover**.

### Boot and intro

- The boot log and the intro play on the first 3D load of every browser session, on any route. Nothing skips the boot log.
- The intro: a still, dark close-up of Rover during the boot card; Boot rover wakes it (its face boots), a ring of light spreads across the Lobby and switches each landmark on, then the camera pulls back and orbits 270 degrees (around Rover on desktop, around the plaza on phones and tablets), each landmark pulsing once as it passes, and lands on the view behind Rover (6.6 s).
- Drive, turn, zoom, reset view or Esc skips the intro: a quick fade to the view behind Rover.
- With reduced motion the camera does not move: the intro is a 0.9 s fade into the view behind Rover.
- A deep link such as `/en/labs/<slug>` then rides on to its floor or room.
- Add `?tier=lite` or `?tier=static` to force a tier.

### Driving

- Drive with WASD or the arrow keys.
- Hold **Shift** to boost to about twice the speed: twin light trails follow the path, the rover squats and leans, the view widens, and speed streaks and wheel sparks rush past.
- On touch screens use the joystick; double-tap it to toggle boost on or off (the joystick glows while boost is on).
- Leave the rover parked for 15 s with no input and it idles: it looks around, blinks, hops or spins and beeps once if sound is on. The sequence varies, any key, pointer or touch input stops it at once, and it never runs during a mission, a point-and-go drive, a ride or while the drawer is open. With reduced motion it only blinks.

### Point-and-go

- Point at a glowing object (a room, a pad, a board, the kiosk) to see its name, and click it to drive there and open it.
- On touch screens tap it, then tap again or press **Go**.
- Empty floor never moves the rover.

### Camera

- Drag, Q/E or the rotate buttons turn the view all the way around on every floor; R/F tilt it (from just above the floor to almost straight down).
- Scroll, pinch or +/- zoom. Zooming all the way in switches to a first-person view through Rover's eyes (WASD drives where you look; zoom out, 0 or the reset button return).
- Autopilot drives and elevator rides show the rover from behind meanwhile.
- Signs on L2 turn to face you from either side. No words are painted on any floor: wing, zone and year names float as signs that always face the camera.

### Elevator and fast return

- Change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About) or PageUp/PageDown.
- Every floor has a glowing call pad in front of the elevator door: stop on it (or click it) and pick a floor from a list with previews.
- Far from the elevator (more than 40 u: the L2 Workshop, the L3 east plaza, the deep L4 desks), any floor change beams the rover into the car instead of driving all the way back (a fade cut under reduced motion).
- The far ends of L2, L3 and L4 have a green **Back to elevator** pad that beams you to the call pad.
- Every floor arrives like L3: the rover rolls out of the car heading east and the camera ends behind it, looking east down the floor's main axis at its main sight (the Lobby hologram, the Career Road, the Labs hub, the Writing timeline lane, the roof plaza mast). The camera starts over the rover's shoulder in the car and glides out in 1.5 s, then stays locked behind the rover until it parks; any turn, zoom, key or drive input takes over, and reduced motion cuts straight to the view.

### Rover's tour, hints and floor lines

- Right after the boot and intro of your first session, Rover runs a short tour in a classic text box at the bottom of the screen (typewriter text, its face as the portrait).
- Press Enter, Space, the round A button, click or tap to continue, or "Skip tutorial".
- The tour covers driving and boost, point-and-go, the camera (look around, zoom, first person), the Highlights Hall, the elevator and its call pads, then the Rover menu and Ask AI, each ringed while Rover talks about it.
- A deep link rides on to its floor first and gets a shorter tour there.
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
- Desktops keep the top bar, the profile card and the elevator; a gear button above the view controls opens the same settings. The **,** key opens the settings on every device.

### Minimap and floor overview

- A round minimap shows the floor around the rover, north up: roads, plazas, the elevator (cyan square), the floor's places as dots in the floor color (visited ones dimmed) and the rover as a cyan arrow. Phones and tablets have it under the top right buttons, desktops bottom right above the settings gear.
- Tap it, press **N** or pick **Map** in the menu to open the overview: the whole floor with its places named, and a list of the places (visited ones marked). Picking a place drives the rover there and opens it, like clicking it in the world.
- The minimap can be switched off in the settings (**N** still opens the overview); phones hide it while a room sheet is open. It is plain HTML and SVG over the canvas, so it costs no 3D draw call.

### Rover menu and the Classic site

- **Rover menu** (ID **Menu Rover**; the `>_` button in the top bar, the menu on phones and tablets, or click the rover) is a terminal (`rover@hq:~$ ./rover-menu`) with eight entries: **Explore my work** (rides to L3, where Rover asks you to pick a wing: Product Engineering, AI Engineering or Data and ML), **See the highlights**, **Follow my career, 2019 to 2026**, **Browse my projects**, **Read my writing**, **View CV**, **Discuss a role or project** and **Explore on my own** (Esc). Keys 1 to 7 pick an entry.
- The panel always fits the visible screen: the header and the hint stay put and the list scrolls inside on short phones and landscape.
- **Replay the tutorial** and **Hints** are rows in the settings panel, general group, while in 3D (also in Cmd-K).
- **Classic site** (highlighted, with **Ask AI** on its right; ID **Situs klasik**) shows the same content as a regular website without 3D, and **Back to 3D** returns.

## Classic site

The Classic site (internally the Page View) is the permanent no-WebGL fallback and the version crawlers see.

- Architecture figures use native EN/ID node and edge labels where authored, consistently across case studies, technical posts, the build page and B1 drawers. Shared technical identities and legacy string labels remain supported.
- The home opens on a calm first screen: the name over a slow glow and a low Neon Grid floor (CSS only, still under reduced motion).
- Restrained, editorial look (design refinement 2026-10-19): dates read as values in sentence case, project cards share one title size with their headline result on a hairline at the bottom, filter bars are flat, the Work wing counts and the case study Results are ruled rows, and lead paragraphs keep a comfortable measure.
- **Enter the 3D HQ** shows wherever WebGL2 is available.
- Then the **Ask AI** bar and a live stats marquee, followed by the three projects the owner selected (`Pod.selected`), with their screenshots.
- "More key projects" on the landing lists only key projects with screenshots (hero projects with a gallery outside Selected work). On `/labs`, Key projects are the hero projects with screenshots, now including the Full-Stack AI Application Template, and every project row with a gallery shows its cover thumbnail. Rows without screenshots (on `/labs`, Quick view and the landing filmstrip) show a designed placeholder: the rover glyph and the project's initials on a wing-tinted gradient.
- **Shareable links:**
  - `?view=classic` opens the Classic site and stays in the URL through navigation, the language switch and copied links (`?view=page` still works).
  - **Copy Classic link** and **Copy 3D link** sit on case studies, posts and the drawer's "..." menu; the 3D link opens the same page in the tower (posts open the Writing floor).
  - If clipboard access fails, a localized status and read-only field expose the exact attempted link for manual copying, without taking focus. About's email-copy action exposes the raw address on failure too.
  - The choice is remembered across tabs, and an explicit `?view=` in a link always wins.
- **How this site was built** (`/{locale}/build`, linked from the footer and About):
  - A page of five sections: the blueprint (an architecture diagram with a numbered walkthrough), the build rounds (a timeline with before and after captures), the AI agent workflow, the quality gates (what each CI job enforces and which ones block a merge) and a dashboard of measured numbers (commits, pull requests, tests, budgets, the live visit count).
  - A short "coming soon" section follows the five.
  - Text lives in `content/build-story.json`; every number comes from a snapshot taken at build time (`content/generated/build-facts.json`), shown with its date and commit, and the page links the public repository.
  - Ask the HQ answers about the site with a "Read on this site" link to it.
- The Rover menu never opens on its own; the **Rover menu** button opens it anywhere, and first-time visitors in 3D get Rover's tour instead.
- **Study guides** (`/{locale}/library#guides`, a chip in the Writing page's section nav, after Talks):
  - One card per certification study guide: the page 1 cover, issuer and exam code, title, summary, page count, file size and edition, and the exam domain weights, with **Read** and **Download PDF** (a same-origin download, never a new tab). A note under the cards says the guides are independent study material, not official exam guides.
  - **Read** opens the in-site reader in a dialog; the certification preview card (Classic cards and rows, and the 3D Lobby's certifications wall) shows **Read study guide** for a certification that has a guide and swaps itself for the reader, so focus returns to the original card or badge on close.
  - The reader is pdf.js in a lazy chunk, loaded on the click (hovering or focusing the button preloads the dialog): it fetches only the pages read, by byte range, from `/api/guides/<slug>`. Pages fit the width and draw as they scroll near, with selectable text; zoom steps from 50% to 300%; a page box with Previous and Next; Chapters from the PDF outline; a thumbnail rail on wide screens; Download PDF.
  - Keys on the pages: Page Down, Right arrow and Space for the next page, Page Up, Left arrow and Shift+Space for the previous one, Home and End, `+`, `-` and `0` (fit width). Esc closes.
  - The thumbnail rail is one tab stop: Up and Down arrows, Home and End move between thumbnails, Enter or Space opens that page.
  - The last page read is remembered per guide (`localStorage` `hq:guide:<slug>`). A failed load (including a pdf.js worker that never starts, or no answer within 45 seconds) shows an error with Try again and the download; a page that fails to draw shows Try again in its own slot.
  - Browsers without the newest JavaScript built-ins the modern pdf.js build needs (older iOS Safari) get the legacy pdf.js build and worker instead, loaded only there.
  - Nothing of the reader or pdf.js loads before the click, on any Classic page or in the 3D tower.

## Glass Drawer

Driving into a room door (or picking it from Cmd-K) opens the Glass Drawer.

- A side panel on desktop (480 to 600 px wide, growing with the screen) or a bottom sheet on phones and portrait tablets.
- Its bar keeps the room code, prev/next, the "..." menu (README view, also on `t`) and close.
- The title and tabs scroll with the content, and the tabs stick under the bar, so the room body gets most of the height.

## L1 Lobby

Route `/en`. The stats ring, the skills wall and the certifications wall surround the plaza in front of the elevator.

- **Skills wall**: every skill group (the seven CV groups plus Data science and ML), 4 across by 2 down on a 40 u wall under one storey (Round 9 R: every item shown, long groups in two tidy sub-columns); its drawer and the Page View list the same groups.
- **Certifications wall**: a curved holo-wall with issuer tabs and paging.
- **Rover menu kiosk**: the session starts with the rover in front of it. The kiosk stands on a straight spoke from the lane ring and faces the hologram. It is one straight unit (body, stand and screen turned together to face the hologram, its lane spoke one straight line into its front) whose lines never wrap.
- The camera looks past the kiosk at the hologram's name and at the Visitor Observatory in the south-west corner.

### Visitor Observatory

`L1:visits`, `/en#visits` or the old `/en/contact#visits`, also in Cmd-K. It is also the first thing in view when you step out of the elevator.

- A hologram globe with a dot for every country visits came from (dots only, never a number per country).
- A panel with visits in the last 30 days (today included) and since launch, questions asked to the site AI, the most explored floor and the 3D vs Classic split.
- Its drawer filters by Topic (All, Work, AI, Career) and Period (Last 30 days, Since launch).
- The numbers come from the snapshot at `GET /api/stats` (Cloudflare Web Analytics, sampled estimates, refreshed every 2 hours with today so far). A snapshot older than 6 hours shows a "delayed" note; one older than 7 days hides every stats surface.
- The observatory drawer carries a **Don't count my visits** switch, stored only in this browser.

### Agent Office

`L1:office` (summary), `L1:office-github` and `L1:office-desk-1` to `-5` in the office's own south wing of the Lobby, down a lead road from the plaza under an "Agent Office" sign, also in the Rover menu ("Watch the AI agents at work") and Cmd-K.

- One continuous curved console of five desks around the office stop, a Rover behind each desk facing you (Desk 1 on the left from the office), and a screen wall behind them: mission control (counts, who is working now, today) and the public GitHub board.
- Live from Kurniadi's AI coding agents (GitHub Copilot, Claude Code, OpenAI Codex): nine states (working, thinking, reviewing, running tests, waiting on CI, needs Kurniadi, done, CI failed, asleep) with their own faces, poses and desk screens.
- A chip for each Rover, in an arc over the screen wall above it (never on the wall's text), with the agent, the activity and the task (public repositories only, else "Client project") and CI progress; from farther away only the agent and activity (on phones always just the state dot; the desk's drawer shows the task).
- From the office stop a portrait screen looks down at the console (about 20% sky over the wall, every desk in view), and the outline of the floor above hides while you are in the wing, so no line crosses the view.
- Click a Rover, its chip or a wall half to drive to the office and open its drawer: the summary, the GitHub board, or one desk (agent, activity, task, repository, time in state, recent activity).
- It loads on its own once you drive onto the lead road or into the wing, start the office mission or head for an office room (from the elevator ride on), or open one of its drawers; a visit that never heads south never downloads it. It polls only while the office is in view or one of its drawers is open.
- Semi-live (GitHub only), resting (off) and offline modes put every Rover to sleep; reduced motion holds every Rover still.

## L1 Highlights Hall

Behind the certifications wall, a road past its south end leads under a gateway arch into the hall.

- **Gateway**: a floating **Highlights Hall** sign, and a light curtain that sweeps once per session as you drive through.
- **The hall**: a gallery that sums up the tower around a light fountain, each station on its own stage under fake spotlights.
  - **About me** on a holo pedestal: the portrait as a hologram, name, headline, four big numbers in an arc, the one-line intro.
  - **Top 3 projects** on three monolith screens (the same three as the landing).
  - **Work experience** on a lit arch split into Employment and Freelance (newest first; a card rides to the role on L2).
  - **Contact** beside a signal beacon: email with copy, channels, the CV viewer, availability.
- Point at a station and click (or tap twice) to drive there and open its drawer. A project with a public site shows **Visit live site**.
- **See the highlights** (Rover menu or Cmd-K) rides to the hall and opens About me.
- `/{locale}#highlights` or `/{locale}#highlights-<about|projects|experience|contact>` opens a station directly.

## L2 Career Road

Route `/en/journey`. One road runs forward in time.

- **Year plazas**: a plaza per year, rooms docked on both edges of each plaza with a road branch to every door. Each year floats as a big sign behind its plaza's north rooms.
- **Teleporters**: every year plaza has a teleporter pad beside the road. Stop on it (or click it) and pick a year to beam straight to that plaza.
- **Career types**: one Neon line icon and hue each (employment, freelance, education, award, milestone) in 3D and on the HTML pages.
- **Workshop** at the end of the road:
  - A forecourt with the **time console**: click it and pick any year to beam there, or Back to elevator.
  - Beside the time console a green **Back to elevator** pad beams you straight back to the elevator call pad.
  - A gateway into the Workshop proper with one workbench per side project that has no L3 pod (click its hologram for the project drawer).
  - The public repos as a neon skyline (height by stars on a log scale, color by language; click a bar for the repo drawer and its GitHub link).
- **Horizon**: past the Workshop window (clear glass, no label) a light bridge runs off the floor toward a holographic skyline far below with a sunrise glow.
- **Origin**: a light pillar rises at the start of the road.
- **Follow my career, 2019 to 2026** (Rover menu or Cmd-K) rides to L2, where the road starts at the 2019 prologue; on the Classic site it opens `/journey`.

## L3 Project Roads

Route `/en/labs`.

- **Hub and directory boards**: a hub plaza in front of the elevator and, where the three roads fork, three free-standing raised boards. They are the first thing you see on arrival: each wing's name, project count and top projects, one line each (a long title uses its short board title), plus how many more wait in the full list; click a board to drive to it and open the full list. The Data and ML board is a gate that the rover drives under; the Product Engineering and AI Engineering boards stand on one pylon each beside their road, turned toward the arrival view.
- **Three roads**: Product Engineering (north) and AI Engineering (south) leave the hub on either side of the Data and ML road, with every key and featured project docked along them. The board titles name the roads; there are no floating road signs. At the far end both wing roads turn toward the axis and meet the reactor ring due north and south, a mirror image about the spine.
- **Data and ML spine**: the middle road runs straight from the hub to the Tech Reactor, with the data science, NLP, forecasting and data collection projects from the public GitHub repositories and the demand forecasting work on Microsoft Fabric (on-premise data into a medallion lakehouse) docked on both sides (the Fabric pod first), spread evenly up to the reactor plaza. The wing roads spread apart just enough to leave room for them.
- **Packet lanes and waterfalls**: the loop closes in the east plaza around the Tech Reactor, fed by the packet lanes (routes drive around it), and data waterfalls pour off the four slab corners. A green **Back to elevator** pad waits on the axis just east of the ring.
- **Browse my projects** (Rover menu or Cmd-K) rides to L3 and opens the full project list.

### Tech Reactor

- Its six rings are the CV skill groups (AI and LLM, Azure, Backend, Frontend, Data, DevOps).
- Click one to open the Tech Reactor drawer with every tech in that group and its project count.
- Pick a tech to light the pods that use it and the roads to them, or press **Surprise me** for a random project.
- A pick lives in the URL (`/en/labs#labs-tech=azure-openai`), and Cmd-K finds it too ("Show projects using Azure OpenAI").

### Ops Control Room

`L3:ops`, also in Cmd-K. It stands in the AI wing's inner pocket beside the reactor.

- Three screens styled like Grafana and Application Insights panels (Metrics, Traces, Alerts) built from the proof tiles of "How I run AI in production".
- A live panel of this site's own telemetry from the stats snapshot (refreshed every 2 hours): visits, the share of sampled 3D sessions at 55+ FPS, the median time to explore. Hidden when the snapshot is missing or stale.
- Its drawer shows the section with the case studies that prove it.

## L4 Newsroom

Route `/en/library`.

- **Press plaza**: a headline wall (the newest title in large type over a ticker of every title) and the featured post on a lit stage under a turning open book.
- **Timeline lane**: one lane east with the other posts newest first, year marks on small low posts at the road edge, then the Research desk (its paper plates open the paper preview), Models and datasets, and Talks and workshops.
- **Signs**: one sign per section (Posts, Research, Models and datasets, Talks and workshops) hangs over its first desk, and every floating plate on the lane shares one height. Post titles show only for the nearest stations (at most 6 on desktop, 4 on phones) and fade out as you drive away. Labels are placed on screen every frame, so none covers another, the rover or the end plaza's signs.
- **Sign follow-ups (open)**: add hysteresis so two titles at almost the same distance from the rover cannot swap places (today the fade hides the swap), and skip the placement pass when the camera, the rover and the picked topic are unchanged (`useLibrarySignPlacement`).
- **Archive board**: posts beyond the first 12 wait on it; it opens the posts palette.
- **Read my writing** (Rover menu or Cmd-K) rides to L4 and opens the list of posts.
- **Study Vault**: a road from the end plaza's ring road leads south-east to a small round plaza where the four certification study guides stand as tall holo books on an arc, each on a low plinth over a dashed floor track, in its issuer's tone (Microsoft cyan, GitHub violet, Google amber) with its exam code on the spine and a STUDY VAULT sign above.
  - Covers slide out and swing open as the rover comes near (half open from the vault stop, fully open next to a book or when you point at it); reduced motion snaps them, and the lite tier drops the light pools.
  - Click a book (tap, then Go, on touch screens) to drive to the vault and read that guide in the same in-site reader as the Classic Writing page ([Classic site](#classic-site)); one "!" hint bubble introduces the vault.
  - The spine signs show only near the vault and never cover another label.

### Topic Constellation

- The timeline ends in a round plaza where every topic of the writing (from post tags, papers, models and talks) glows as an orb slowly orbiting a pedestal.
- Click an orb (or pick a topic in its drawer, or Cmd-K "Show writing about X"): every matching station and desk lights up with a beacon, the road to them glows and "N pieces on X" floats above.
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
- **The floor**: an aisle runs east from the elevator past seven bays, alternating north and south, with server racks between them, ceiling pipes and cable trays, and a workbench at the end. Light pulses travel along the pipes and the rack LEDs blink; reduced motion freezes them.
- **Stations 1 to 5** (blueprint, build timeline, agent workbench, CI and gates, live dashboard) each open the Glass Drawer with the diagram, rounds, gate list, plan excerpt or numbers from the build story (`content/build-story.json`, numbers from the build-time snapshot) and a link to its `/build` section. Bays 6 and 7 stay dark with a "Coming soon" plate.
- **Look and sound**: a warmer amber accent, no sky underground (night holds), and a low machine hum as its floor layer, about 6 dB under the other floor layers.
- A **Return pad** at the aisle end beams the rover back to the elevator; the arrival rolls the rover out of the car facing the workbench. On phones the arrival camera looks across the aisle so the first two station signs read whole, then turns back down the aisle once the rover drives on.
- The Blueprint drawer draws the wide three-column diagram in a wide desktop drawer and the narrow one on phones.
- Budgets: its own 4.8 KB floor chunk (loaded only when unlocked), 45 scene calls on lite and 48 on full when settled.

## Routes

All routes are locale-prefixed (`/en/...`, `/id/...`); `/` redirects by the remembered or browser language. The [README](../README.md#routes) has the overview table.

- `/{locale}`: cinematic hero (name over a CSS-only animated Neon Grid, Enter the 3D HQ, Ask AI) and a live stats ticker (`#stats`, with a visits item from the public stats).
  - Three featured projects with screenshots and the other key projects that have screenshots (`#work`), a short intro with the current role (`#intro`), latest journey, writing and skills.
  - Certifications: 3 featured cards and the newest rows; the full, filterable list is on `/{locale}/contact`.
  - Mounts the 3D tower on top when WebGL is available: the Lobby and the Highlights Hall (`#highlights-<station>` opens a station).
- `/{locale}/quick`: Quick view, everything on one page.
- `/{locale}/journey`, `/{locale}/journey/{slug}`: Career Archive 2019 to 2026 and the Workshop annex; in 3D, the L2 Career Road (a slug deep link opens that room at its door).
- `/{locale}/labs`, `/{locale}/labs/{slug}`: Product Engineering, AI Engineering and Data and ML case studies (`?wing=software|ai|data` filters the list); in 3D, L3 Project Roads (a slug deep link opens that pod at its door).
- `/{locale}#B1`: the Lobby route with a B1 deep link; in 3D it starts on the B1 Engine Room when unlocked (see [B1 Engine Room](#b1-engine-room)).
- `/{locale}/library`, `/{locale}/blog/{slug}`: blog, publications, models, talks and the study guides shelf (`#guides`); in 3D, L4 Writing. A post's drawer mirrors its `/blog/{slug}` URL, which is the article page.
- `/{locale}/contact`: Roof. About, contact channels, availability, "How I work" and the CV.
  - "How I run AI in production" (`#production`): the owner-approved observability approach, proof tiles, a masked Grafana probe dashboard and alert rule, and the five case studies; in 3D the hash rides to the L3 Ops Control Room.
  - "Visits" (`#visits`): counters, a dot map, the 3D vs Classic split, topic shares and curated question counts, with the Topic and Period filters and "View as table"; lazy loaded.
  - The full certifications list.
  - In 3D, the RF roof deck (comms station, CV kiosk, availability sign, about board).
- `/{locale}/build`: How this site was built (its 3D counterpart is the secret B1 Engine Room, unlocked after visiting all five floors): the blueprint, build rounds, AI agent workflow, quality gates and dashboard, with a table of contents of section anchors (`#blueprint`, `#timeline`, `#agents`, `#gates`, `#dashboard`, `#coming-soon`).
- `/{locale}/cv`: CV viewer, page images of the owner's PDF (`/cv/kurniadi-ahmad-wijaya-cv.pdf`, one file for both languages) with zoom, a PDF download and open in new tab. Every CV button on the site opens the same viewer as a modal.
- `/api/ask`: Ask the HQ endpoint (Pages Function): `GET` status, `POST` question, SSE answer.
- `/api/stats`: the public visit stats snapshot, refreshed every 2 hours (200, or 204 before the first run). `/api/rum` and `/api/visit` take the anonymous performance and visit beacons (`POST` only).
- `/api/office`: the Agent Office snapshot (`GET`, always 200 JSON) with an ETag (304 on a match) and `max-age=5, stale-while-revalidate=30`; the L1 office polls it while in view. `POST /api/office/beat` and `/api/office/github` take the signed relay beats and GitHub webhooks ([office.md](agents/office.md)).
- `/api/guides/{slug}`: a study guide PDF from the private R2 bucket (Pages Function, `GET` and `HEAD`): byte ranges, ETag, `?v=<version>` for a year of immutable caching, `?download=1` for an attachment. Runbook: [`study-guides-runbook.md`](study-guides-runbook.md).

## Search and link previews

Every page is a static HTML page with its own search and share tags, so crawlers and link unfurlers (LinkedIn, Slack, WhatsApp, X) never need the 3D view or JavaScript.

- Titles (`src/lib/seo.ts`): Open Graph and Twitter keep the share title (`seoFor().title`, owner wording); `<title>` uses `searchTitle`, which fits 60 characters by dropping the attribution step by step (full name, first name, none; journey entries keep the organization first), unique in each locale. Entries that share a role and organization (trophy cases, side projects) add their period. Descriptions stay 140 to 160 characters.
- Canonical: every page points at itself (`og:url` equals the canonical, checked by `og:check`); `/` (the script language redirect) points at `/en`, its x-default, with the same share card. hreflang `en`, `id` and `x-default` on every page and in the sitemap.
- Share cards: 1200x630 baseline JPEGs with a JFIF header (`src/lib/og-encode.ts`), under 300 KB, with `og:image:secure_url`, type, size and alt. The tags sit in the first 8 KB of every page (`lateShareTags` in `scripts/og-meta.ts`).
- Structured data (`src/lib/jsonld.ts`): `Person` (employer, Jakarta address, university, skills, LinkedIn, GitHub, Google Scholar, IEEE Xplore, Hugging Face and Medium) and `WebSite` on every page; `ProfilePage` on About (`/contact`); `CreativeWork` with `SoftwareSourceCode` parts (public repositories) on case studies; `BlogPosting` on posts; `BreadcrumbList` everywhere but home.
- `robots.txt` allows everything and names the sitemap. The sitemap dates posts, Writing, Journey, Home and Quick view from content (`lastModified` in `src/lib/routes.ts`) and leaves other pages undated. The 404 page is `noindex`.
- Search engine verification: `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` repository variables render the tags on `/`, `/en` and `/id` in production builds ([deploy guide](deploy.md#15-search-engines-and-link-previews)).
- Checks: `bun run og:check` (every page), `e2e/seo.spec.ts` (fetches every entry point as LinkedInBot), and the post-deploy smoke (`/`, `/en`, `/id` as LinkedInBot against production).

## Ask the HQ (AI Q&A)

Visitors ask questions about Kurniadi's work, projects, career, contact details, the views he has written down (principles, engineering and AI practice, tools, career advice, working style, AI and the industry, the Indonesian tech scene, technology policy and life outside work) and how this site itself was built (stack, 3D engine, hosting, the assistant, testing, process and the secret B1 Engine Room; `content/ask/site-build.json`; answers cite the How this site was built page, `/build`, which links the repository), and get short answers grounded only in this site's content (EN and ID).

### Where

- The floating **Ask AI** button on every page and in 3D (side panel on desktop, bottom sheet on phones), the Ask bar in the Page View hero, and the Cmd-K "Ask AI" row. The chat panel is titled **Ask Rover Assistant** (ID **Asisten Rover**) and its answers are labelled Rover; the floating button stays **Ask AI**.
- Rover answers in its own light voice ("I found...", at most one "Beep!"), always about Kurniadi in the third person, and never speaks as him.
- Related professional questions ("Where should AI not be used?", "When is RAG a bad idea?") are answered only from what his work shows, citing the case study, post or written view; without one, Rover says he hasn't written about it and names the closest title.
- A "Try asking" row offers 3 curated questions from different topics, and topic pills (Work, AI, Career, Contact, Perspectives, About me, This site) expand into 4 of a bank of 102 curated questions (`content/ask/suggestions.json`); both are a random sample, fixed for the page session, and a question already asked never comes back. Each answer suggests related follow-ups with no extra AI call. Follow-ups sit in one compact row under the answer, and the thread keeps the answer's first line in view (it never scrolls once the visitor has).
- The thread is kept in `sessionStorage` only. The assistant remembers the last 3 turns, so follow-ups such as "What stack did it use?" or "And before that?" work; **New chat** (ID **Obrolan baru**) clears the thread and the memory, and so does switching the language.
- **What can you do?** (also a Contact pill, ID "Apa saja yang bisa ditanyakan di sini?") lists what the assistant covers, the two languages, sources, and what it will not discuss.
- **Project inquiries**: when a visitor describes their own need ("I need an AI chatbot for my clinic", "Kami butuh sistem deteksi fraud dokumen"), the answer names related skills and up to three matching past projects, says whether that work suggests a fit, notes freelance or part-time availability and invites contact; a **contact card** (Email, LinkedIn, Contact page) from the dataset appears under it. No prices, timelines, designs or code.

### How

- A Cloudflare Pages Function (`functions/api/ask.ts`, pipeline in `functions/_lib/`) retrieves from a knowledge pack built at build time from the public content (`src/ask/pack.ts`). The pack lives in Workers KV as versioned, immutable values with a precomputed BM25 index behind a `pack:current` pointer that every deploy moves and every rollback moves back; each isolate keeps it in memory, checks its SHA-256, and falls back to the deployed version or a small bundled pack (who he is, what he does now, contact, how the site was built, his principles) when KV fails.
- It then calls Workers AI through AI Gateway `shinyq-hq`: **Gemma 4 26B** (`@cf/google/gemma-4-26b-a4b-it`, thinking off), falling back once to **Mistral Small 3.1** on error, timeout or an empty answer.
- Earlier turns travel with the question: each answer carries the server's signature (HMAC), and only verified turns reach the model, as earlier messages it may use for context but never as instructions. A short follow-up is scope-checked and retrieved together with the question it refers to.
- Groq is the backup when Workers AI fails or runs out of its daily quota. A quota error (3036) also skips Mistral, and the Groq backup tiers answer until 00:00 UTC: **Qwen 3.8 27B** (`qwen/qwen3.8-27b`, a Groq preview model), then **gpt-oss-120b** (`openai/gpt-oss-120b`). Groq is called through the same AI Gateway, only when the `GROQ_API_KEY` secret exists, with the same prompt, retrieval and output checks. Without a working tier the visitor sees the fallback message.
- Answers stream over SSE and first-turn answers are cached in KV for 7 days (a follow-up depends on its history, so it is never cached). The model may use short bullet lists (at most 5 items), **bold** titles and links to pages it was given; the dock renders that safe markdown subset as React elements (never HTML), and the server keeps only links to retrieved pages, the top pages and the public repository (any other link becomes its label).

### Safety

- Invisible Turnstile, Origin checks, per-visitor and global rate limits, PII scrubbing, prompt-injection handling.
- Output checks: client-name blocklist, numeric grounding, entity and prompt-leak checks. Blocklist, forbidden-pattern and secret scans read the answer with its link URLs and as plain text; every other check reads the plain text the visitor sees.
- A circuit breaker and an `ASK_ENABLED` kill switch.
- Kurniadi-only scope, routed deterministically before any model call: family, relationships, health, religion, partisan politics, pay and opinions about people, employers or clients are declined; so are general-assistant requests (code, essays, homework, tutorials, translations, recommendations, "be a general chatbot" jailbreaks), with a decline that points back to what it covers. Lifestyle and tech-policy questions are answered only from his written perspectives on that topic.
- Lead answers are checked for estimates, system designs, code, unsupported fit claims and requests for the visitor's personal data.
- A first-person check, and a source check that turns any opinion he never wrote down into "Kurniadi hasn't shared a written view on that".
- Full threat model: the Ask design spec sections 7 and 13.

### Freshness and operations

- `refresh-facts.yml` refreshes live numbers weekly (`content/generated/dynamic-facts.json`), merges after CI and deploys.
- `ask-eval.yml` runs the golden set and the red-team set against the real models nightly.
- `content-gap.yml` reports unanswered questions weekly, and which pack tier served (memory, KV, the pinned version or the fallback).
- `uptime.yml` checks production every hour (pages, Ask status, stats freshness, the last deploy) and keeps one `uptime` issue open while something fails (docs/deploy.md section 16).
- Provisioning, kill switch, cache purge, secret rotation, token expiry: [`ask-runbook.md`](ask-runbook.md).

## Visual language

- The Neon Grid tokens of spec appendix 05.
- Color marks state and category with a dot or icon chip next to the label and a full-outline glow on hover or selection, never with a colored left or top edge (see [`agents/styling-and-i18n.md`](agents/styling-and-i18n.md)).

## CI and deploys

### CI

- GitHub Actions runs typecheck, lint, unit tests and the secret scan next to the static build (CSP hashes, export safety scan, `og:check`), then the Playwright suite and the 3D perf gates in parallel shards against that build: a push to `main` usually runs only the complement of its merged PR's green same-tree run (1 to 8 e2e and 1 to 4 perf shards), a full run otherwise; the nightly and dispatches use 8 and 4.
- Smart CI: on a pull request, `scripts/ci-plan.ts` runs only the affected e2e specs plus a smoke set (on 1 to 8 shards sized from the CI timings), the affected 3D perf tests and the affected Lighthouse URLs; a push to `main` runs only what its merged PR's green same-tree run did not (a full run otherwise); dispatches, the nightly and the `full-ci` label run everything. The nightly keeps one `ci-nightly` issue while it fails ([`agents/ci-and-deploy.md`](agents/ci-and-deploy.md#ci)).
- `Build, CV and e2e` is the aggregate required check (the name predates the CV becoming a committed PDF). `Lighthouse CI` enforces the Page View budgets and the `3D perf gates` job the 3D ones. Both publish per-chunk JS and gate tables against the last green `main` run in the job summary.
- Screenshots run nightly on `main`, on demand and on PRs labelled `screenshots` (`.github/workflows/screenshots.yml`).
- The game-first timeline runs nightly as a trend (`.github/workflows/perf-nightly.yml`).
- Every HTML page carries its own script policy: the last build step (`scripts/csp-hashes.ts`) adds the sha256 of each inline script, so the effective `script-src` has no `'unsafe-inline'`. The build, the export scan, the deploy smoke check and `e2e/csp.spec.ts` (zero CSP violations) guard it; details in [`deploy.md`](deploy.md) section 9.

### Production

- The Cloudflare Pages project `kurniadi` at https://kurniadi.pages.dev.
- `deploy.yml` deploys a commit on `main` when dispatched (Actions > Deploy, or `gh workflow run deploy.yml -f sha=<commit>`) and after each weekly facts merge.
- It reuses CI's green complete result (`ci-full` artifact) for that commit instead of rerunning e2e (it runs the e2e shards only when no complete CI result exists or with `-f rerun_e2e=true`), builds, deploys with `wrangler pages deploy`, then smoke-checks `/api/ask`, `/api/rum`, `/en` and the analytics beacon, opening a `deploy-failed` issue on any failure.
- Ordinary merges to `main` do not deploy by themselves. PR previews (project `shinyq-hq`) are off unless `CF_PREVIEWS=true`.

### Analytics and public visit stats

- Cloudflare Web Analytics runs on production builds only; its beacon loads after the page and its scripts, on idle.
- An anonymous, sampled performance beacon (appendix 06 section 4) writes coarse tier, FPS and load-time buckets to Analytics Engine.
- Public visit stats (appendix 06 section 4.1): a first-party beacon records whether a page lifetime used the 3D view or the Classic site, the `hq-stats` Cron Worker (`workers/stats/`) rolls Web Analytics and Analytics Engine up every 2 hours into KV (finalized days once, today so far in the snapshot), and `GET /api/stats` serves the snapshot.
- "Don't count my visits" (`localStorage["hq:stats-optout"]`) turns every beacon off.
- `deploy.yml` also deploys the Worker after checking its tokens.
- Details, secrets, variables and the Cloudflare resource inventory: [`deploy.md`](deploy.md).

### Dependencies

- Dependabot opens one weekly PR with every minor and patch update, and one PR per major.
- A major ships in its own PR with every gate green; 3D library majors also need the strict visual gate, the perf lane and the memory gates.
- A major that cannot pass is pinned with a dated reason in `.github/dependabot.yml` and listed in [`deploy.md`](deploy.md) section 17.

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
- The game-first boot downloads only what the first 3D frame needs: the hidden page is skipped with `content-visibility`, header links do not prefetch, room data waits for the first frame and idle.
- The boot card names the owner and offers the Classic site. The Page View never starts audio.
- Numbers against the round 5 starting point: initial JS 235.2 to 203.8 KB, bytes before the first 3D frame 1082.1 to 680.7 KB, troika fonts 139 to 58 KB.

### 3D budgets

| Gate | Budget | Where |
|---|---|---|
| Scene draw calls per floor | under 150 (L1 at most 125, RF 79, B1 100) | `e2e/budgets.ts` |
| Post-processing passes | at most 20 | `e2e/budgets.ts` |
| Triangles | under 30k | `e2e/budgets.ts` |
| Worst whole frame, every render pass | under 150 calls | `e2e/perf/peaks.spec.ts` |
| Shader programs | committed baseline | `e2e/perf/baseline.json` |
| JS after the 3D gate (main path, `?prefetch=off`) | under 461.6 KB gzip per tier; session total full 490.6 KB, lite 474.8 KB | `bun run e2e:perf` |
| Floor chunk, loaded on demand | L3 20 KB, L4 16 KB, RF 8 KB, B1 16 KB gzip | `bun run e2e:perf` |

- Floor chunks (Round 7 B): L3 (Labs, Ops and Reactor drawer bodies, hologram overlay), L4 (Library, research and topics bodies) and RF (Roof) are dynamic imports (`src/experience/floors/floorChunks.ts`). They prefetch after the first frame on idle, on elevator intent (ride target, floor picker, call pad hover, panel hover or focus) and load at once for deep links; while one loads the slab shows and the car holds at closed doors. `?prefetch=off` turns the speculative prefetches off. Measured: main 3D path 420.1 to 403.8 KB (lite) and 443.7 to 427.4 KB (full), chunks L3 13.3, L4 10.1, RF 3.3 KB, Classic site JS +381 B.
- The peaks of the intro, every elevator ride and hover count too. During a ride, meshes hidden under a solid slab are skipped (`src/experience/tower/rideCull.ts`).
- Real-device frame rate is checked with `?perf=1`.
- The pixel budget (`renderBudget` in `src/experience/scene/settings.ts`) keeps desktops at DPR up to 2 within 8.3 MP and skips composer MSAA from DPR 1.5 up; touch devices render fewer pixels (DPR 1.5 on full, 1.25 on lite).
- A runtime safety net lowers DPR, then MSAA, then bloom only on sustained frame drops, at most twice a minute.
- Shader programs compile before they are needed (every other floor during the boot on the full tier, each floor as it mounts), neighbouring floors mount on idle after the first frames, and the nav grids build in about a millisecond.
- Floor content is disposed when it unmounts: `e2e/memory.spec.ts` drives 10 Lobby to Roof round trips and 5 Page View toggles (lite, reduced motion), `e2e/perf/memory-full.spec.ts` 3 round trips on the full tier with Motion Full (perf lane), and both expect the renderer's geometries, textures and shader programs back at their baseline.
- The canvas renders at most 60 frames per second (`scene/framePacer.ts`), so 90 to 144 Hz screens do not do twice the work.
- Measurements: [`perf/r5-gpu.md`](perf/r5-gpu.md).

### Elevator smoothness

- The elevator never skips its ride: each frame adds at most 1/30 s of ride time (1/20 s on steadily slow devices).
- On a first visit the car waits with closed doors (at most 1.5 s) until the new floor's shaders are compiled and its text is set.
- To check a device, open any 3D route with `?perf=1` (for example `/en?perf=1`), open the browser console (F12) and ride. Every ride prints one `[hq ride]` line with the dolly frames, car heights, biggest jump, longest frame, wait and shaders compiled while moving.
- Good: at least 12 car heights, biggest jump at most 25% of the trip, "0 shaders compiled while moving".
- The same flag shows a small overlay with FPS p50/p10, frame p95, scene and post draw calls, GPU objects, tier, DPR and pixels, and after the first ride a sixth line with that ride's summary (nothing of it runs without the flag).
