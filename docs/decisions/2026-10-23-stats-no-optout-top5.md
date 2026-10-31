# Stats

- Date: 2026-10-23

Owner request: the "Don't count my visits" switch is removed from the L1:visits drawer, and so is the whole opt-out behind it (the `hq:stats-optout` key, its window event and the checks in the visit beacon, the RUM beacon and the Cloudflare Web Analytics loader). A visitor who opted out before is counted again: the visit client removes a stale `localStorage["hq:stats-optout"]` once when it starts, and no beacon reads the key any more. Do Not Track and Global Privacy Control still stop the first-party visit and performance beacons, automated browsers (`navigator.webdriver`) and crawlers are still never counted, and `?visit=` / `?rum=` still force the beacons in tests. The suggested questions list shows only the top 5 (most picked first, ties by id, after the Topic filter; `TOP_CHIPS` in `src/lib/visits/model.ts`) in both placements, the L1:visits drawer and the Contact Visits section, and its note says "up to five".
