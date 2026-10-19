# Performance

- Date: 2026-10-19

Owner request (perf assessment item 4): "The ExperienceGate data prop is serialized into the RSC payload of every gated page (8.9 KB br on /en, labs, journey, library, contact). Serve it as static versioned JSON fetched with the 3D chunk." The build writes the 3D page data to `/data/experience/{locale}.json` (`src/app/data/[...path]/route.ts`, the same `experienceDataFor(locale)` with localized floor names); the gated pages pass only its content hash (`experienceDataVersion`), and `ExperienceGate` fetches `?v=<hash>` alongside the 3D chunk (`src/experience/data-client.ts`), mounting the tower once it arrived. A failed fetch takes the crash recovery path (one automatic retry, then the static page with "Retry 3D"). Every gated HTML and RSC `.txt` document is about 8 to 9.2 KB gzip smaller (`/en` 55.3 to 46.4 KB gzip); the 3D view downloads the 9.4 KB gzip JSON instead, in parallel with its scripts. No budget changed.
