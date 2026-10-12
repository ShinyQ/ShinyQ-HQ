// Landing mockup for the owner's sign-off (not shipped). Run from the repo root:
//   bun docs/design/landing/gen-landing.ts
// Real dataset, real messages and the real stylesheets (src/app/pageview.css, src/app/landing.css).
// The markup mirrors src/components/page/{Hero,HeroTower,StatTicker,Featured}.tsx.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import { DYNAMIC_STATS, getDynamicFacts, getPods, getProfile, getStats } from "../../../src/content/load";
import { toGalleryImages } from "../../../src/content/media";
import type { Pod } from "../../../src/content/schema";
import { clientLabel } from "../../../src/content/selectors";
import { ACCENT_TEXT, FLOOR_ACCENT, WING_ACCENT } from "../../../src/lib/accent";
import { formatDate, formatPeriod } from "../../../src/lib/format";

const L = "en" as const;
const PUB = "../../../public";
const OUT = path.join(import.meta.dir, "home.html");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const t = createTranslator({ locale: L, messages: en });
const profile = getProfile();
const pods = getPods();
const featured = pods.filter((pod) => pod.assets.length > 0).slice(0, 3);
// Mirrors PRIMARY_NAV in src/components/SiteHeader.tsx.
const NAV = [
  { key: "work", floor: "L3" },
  { key: "journey", floor: "L2" },
  { key: "writing", floor: "L4" },
  { key: "about", floor: "RF" },
] as const;

const CUBE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>`;
const SPARK = `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5c.5 3.9 2.1 5.5 6 6-3.9.5-5.5 2.1-6 6-.5-3.9-2.1-5.5-6-6 3.9-.5 5.5-2.1 6-6Z"/></svg>`;

const header = `<header class="site-header"><div class="wrap bar">
<a class="brand" href="#"><span class="brand-mark" aria-hidden="true">${esc(profile.monogram)}</span><span class="brand-name">${esc(profile.name)}<small>${esc(t("meta.siteName"))}</small></span></a>
<nav aria-label="${esc(t("nav.label"))}"><ul class="nav">${NAV.map((n) => `<li><a href="#" style="--fc:var(--${FLOOR_ACCENT[n.floor]})"><span class="fl">${n.floor}</span>${esc(t(`nav.${n.key}`))}</a></li>`).join("")}</ul></nav>
<div class="tools"><button class="icon-btn hide-sm" type="button"><span aria-hidden="true" style="font-family:var(--mono);color:var(--cyan)">&gt;_</span>${esc(t("hud.launcher.missions"))}</button><nav aria-label="${esc(t("nav.language"))}" class="lang"><a href="#" aria-current="true">EN</a><a href="#">ID</a></nav></div>
</div><nav aria-label="${esc(t("nav.mobile"))}" class="mobile-nav">${NAV.map((n) => `<a href="#" style="--fc:var(--${FLOOR_ACCENT[n.floor]})">${esc(t(`nav.${n.key}`))}</a>`).join("")}</nav></header>`;

// Elevator floor names (hud.floorLabel), as in src/components/page/Hero.tsx.
const tower = [
  ...(["RF", "L4", "L3", "L2"] as const).map((floor) => ({ floor, label: t(`hud.floorLabel.${floor}`), current: false })),
  { floor: "L1" as const, label: t("hud.floorLabel.L1"), current: true },
];
const towerHtml = `<nav aria-label="${esc(t("home.directoryTitle"))}" class="hx-tower"><p class="pv-data" style="margin-bottom:24px">${esc(t("home.directoryTitle"))}</p><ol class="hx-floors">${tower
  .map(
    (f) =>
      `<li class="${ACCENT_TEXT[FLOOR_ACCENT[f.floor]]}"><a href="#" class="hx-level"${f.current ? ' aria-current="page"' : ""}><span aria-hidden="true" class="hx-slab"></span><span class="pv-data hx-code">${f.floor}</span><span class="hx-level-name">${esc(f.label)}</span>${f.current ? `<span class="pv-data">${esc(t("home.hero.here"))}</span>` : ""}</a></li>`,
  )
  .join("")}</ol></nav>`;

const askBar = `<div class="m-ask"><label class="pv-data m-ask-label">${SPARK}${esc(t("ask.hero.label"))}</label><form class="m-ask-form" role="search"><input class="m-ask-input" placeholder="${esc(t("ask.hero.placeholder"))}"><button type="button" class="m-ask-send">${esc(t("ask.hero.submit"))}</button></form><div class="m-row" style="margin-top:12px"><span class="pv-small">${esc(t("ask.hero.topicsLabel"))}</span>${(["work", "ai", "career", "contact"] as const).map((k) => `<button type="button" class="chip">${esc(t(`ask.topics.${k}`))}</button>`).join("")}</div></div>`;

const live = Object.keys(DYNAMIC_STATS);
const track = (hidden: boolean) =>
  `<ul class="hx-tick-track"${hidden ? ' aria-hidden="true"' : ""}>${getStats()
    .map((s) => `<li class="hx-tick-item"><span class="pv-num hx-tick-value">${esc(s.value)}</span><span class="hx-tick-label">${esc(s.label[L])}</span>${live.includes(s.id) ? `<span class="pv-data hx-tick-live">${esc(t("home.ticker.live"))}</span>` : ""}</li>`)
    .join("")}</ul>`;
const ticker = `<section id="stats" aria-labelledby="stats-title" class="hx-tick"><h2 id="stats-title" class="sr-only">${esc(t("home.statsTitle"))}</h2><div class="pv-wrap hx-tick-bar"><p class="pv-data hx-tick-updated"><span class="hx-dot" aria-hidden="true"></span>${esc(t("home.ticker.updated", { date: formatDate(getDynamicFacts().asOf, L) }))}</p><div class="hx-tick-view">${track(false)}${track(true)}</div><label class="pv-data hx-pause"><input type="checkbox" class="hx-pause-box">${esc(t("home.ticker.pause"))}</label></div></section>`;

function card(pod: Pod, lead: boolean) {
  const [cover, ...rest] = toGalleryImages(pod.assets, L);
  const result = pod.results[0];
  const client = pod.client ? clientLabel(pod.client, L) : undefined;
  return `<article class="pv-feature hx-card relative" data-feature-pod="${pod.slug}">
<div class="pv-shot hx-shot"><img src="${PUB}${cover.src}" alt="${esc(cover.alt)}" width="${cover.width}" height="${cover.height}" style="aspect-ratio:16/10"><span class="pv-data hx-shots">${esc(t("home.featuredShots", { count: pod.assets.length }))}</span></div>
${rest.length ? `<ul class="hx-film" aria-hidden="true">${rest.slice(0, 3).map((image) => `<li><img src="${PUB}${image.thumb}" alt="" width="480" height="300"></li>`).join("")}</ul>` : ""}
<p class="pv-data m-meta"><span class="pv-mark ${ACCENT_TEXT[WING_ACCENT[pod.wing]]}">${esc(t(`work.wingShort.${pod.wing}`))}</span><span>${esc(formatPeriod(pod.period.start, pod.period.end, L))}</span>${client ? `<span>${esc(client)}</span>` : ""}</p>
<h3 class="pv-h3 pv-feature-title${lead ? " pv-h3-l" : ""}"><a href="#" class="pv-stretch">${esc(pod.title[L])}</a></h3>
<p class="pv-body">${esc(pod.tagline[L])}</p>
${result ? `<p class="pv-small"><span class="pv-num" style="font-size:22px">${esc(result.value)}</span> ${esc(result.label[L])}</p>` : ""}
</article>`;
}

const html = `<!doctype html>
<html lang="en" data-hq-3d="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Landing mockup</title>
<link rel="stylesheet" href="mock.css">
</head>
<body>
<!-- Landing mockup generated from content/site-content.json and messages/en.json. Not shipped. -->
${header}
<main id="main">
<div class="hx">
<div class="hx-bg" aria-hidden="true"><div class="hx-glow"></div><div class="hx-ground"><div class="hx-ground-grid"></div></div><i class="hx-packet"></i><i class="hx-packet"></i><i class="hx-packet"></i></div>
<section aria-labelledby="hero-title" class="pv-wrap hx-main m-hero">
<div class="m-c8">
<p class="pv-data hx-eyebrow"><span class="hx-dot" aria-hidden="true"></span>${esc(t("home.hero.welcome", { site: t("meta.siteName") }))}</p>
<h1 id="hero-title" class="pv-d-xl hx-name" style="margin-top:24px">${esc(profile.name)}</h1>
<p class="pv-lead" style="margin-top:28px;font-weight:600">${esc(profile.headline[L])}</p>
<p class="pv-lead" style="margin-top:4px;color:var(--ink-2)">${esc(profile.subheadline[L])}</p>
<div class="m-row" style="margin-top:36px"><a href="#" class="pv-btn hx-enter" title="${esc(t("home.hero.enter3dHint"))}">${CUBE}${esc(t("home.hero.enter3d"))}</a><a href="#" class="pv-btn pv-btn-ghost">${esc(t("home.seeWork"))}</a></div>
${askBar}
</div>
<div class="m-c4">${towerHtml}</div>
</section>
${ticker}
</div>
<section id="work" class="pv-wrap pv-sec">
<div class="m-head"><h2 class="pv-h2">${esc(t("home.selectedWork"))}</h2><a href="#" class="pv-go">${esc(t("home.allProjects", { count: pods.length }))}</a></div>
<div class="m-feat"><div class="m-lead">${card(featured[0], true)}</div>${featured
  .slice(1)
  .map((pod) => `<div class="m-side">${card(pod, false)}</div>`)
  .join("")}</div>
</section>
</main>
<button class="back3d" type="button">${CUBE}${esc(t("hud.back3d"))}<kbd>3</kbd></button>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${featured.map((pod) => pod.slug).join(", ")})`);
