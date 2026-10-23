# Public visit stats

- Date: 2026-10-24

Visits shown on the site come from the site's own count from now on: a same-origin visit ping sent as soon as a page
is shown, once per browser tab session (a `sessionStorage` flag; no cookie, no identifier, nothing personal), skipping
only automation and crawlers. Do Not Track and GPC visitors are counted too, since nothing identifying is sent. Cloudflare
Web Analytics stays the source for countries, page views and the top floor, and for visits before the switch: each UTC
day has one visit source (Web Analytics before the first visit ping, Web Analytics before that time plus pings after it
on the switch day, pings only after), so the since-launch total never counts a visit twice. Today's count is read live
(`/api/stats` adds the pings since the last run through the hq-stats Worker, about a minute behind) and the Worker runs
every hour instead of every 2 hours (the "delayed" note after 3 hours instead of 6). Why: on 2026-10-23 Web Analytics
counted 9 visits where the old leave-time beacon saw 3, visits needed 2 to 3 hours to show, and friends' visits did not
appear to move the number. Replaces the 2026-10-19 "every 2 hours" cadence and the Do Not Track and GPC skip of the visit beacon.
