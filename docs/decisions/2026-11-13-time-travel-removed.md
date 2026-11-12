# Classic site: Time Travel removed

- Date: 2026-11-13

Owner request: fully remove Time Travel from `/journey` (it replaces [the 2026-10-25 decision](2026-10-25-time-travel-slider.md)). `/journey` now opens straight into the Career Archive (the intro, then the year filter and the years). Gone with it: the server-rendered skyline, the year panels and the `TimeTravelControls` island (`src/components/time-travel/`), the derivation (`src/content/time-travel.ts`), the `floors.careerArchive.timeTravel` stops and their schema, the `timeTravel` UI strings in both locales, and its e2e spec and unit tests. It was Classic only, so the 3D tower (L2 Career Road) is unchanged; the journey HTML drops back by the section and its RSC copy (about 8.6 KB gzip). The `/build` round title that names it stays as a record of that round.
