// Generates the Page View mockups from the real dataset. Run from the repo root: bun docs/design/pageview/gen-mockups.ts "$PWD"
// Screenshots: playwright at 1440x900 and 390x844, converted to webp (mobile at 1x).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.argv[2];
const OUT = path.join(ROOT, "docs/design/pageview");
const C = JSON.parse(readFileSync(path.join(ROOT, "content/site-content.json"), "utf8"));
const M = JSON.parse(readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const { getTechLogo } = await import(path.join(ROOT, "src/content/tech.ts"));
const { formatPeriod, formatYearMonth, formatDate } = await import(path.join(ROOT, "src/lib/format.ts"));

const L = "en";
const PUB = "../../../public";
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tr = (t: { en: string } | string) => (typeof t === "string" ? t : t[L]);
const pods = C.floors.labs.pods as any[];
const tierRank: Record<string, number> = { hero: 0, featured: 1, listed: 2 };
const sortedPods = (wing?: string) =>
  pods.filter((p) => !wing || p.wing === wing).sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || (a.order ?? 0) - (b.order ?? 0));
const pod = (slug: string) => pods.find((p) => p.slug === slug);
const timeline = [...C.floors.careerArchive.entries].sort((a: any, b: any) => a.start.localeCompare(b.start));
const posts = [...C.floors.library.posts].sort((a: any, b: any) => b.date.localeCompare(a.date));
const WING = { software: "cyan", ai: "violet" } as Record<string, string>;
const TYPE_COLOR: Record<string, string> = { job: "amber", freelance: "cyan", education: "green", award: "pink", milestone: "violet" };
const media = (src: string) => PUB + src;
const thumb = (src: string) => PUB + src.replace(/\.webp$/, ".thumb.webp");

function splitMetric(r: any) {
  return { value: r.value, label: tr(r.label) };
}
function logos(stack: string[], max = 7) {
  return stack
    .map((s) => getTechLogo(s))
    .filter(Boolean)
    .slice(0, max)
    .map((l: any) => `<img src="${PUB}${l.src}" alt="${esc(l.label)}" title="${esc(l.label)}" width="18" height="18">`)
    .join("");
}
function chip(name: string) {
  const l = getTechLogo(name);
  return `<li class="chip">${l ? `<img src="${PUB}${l.src}" alt="" width="16" height="16">` : ""}${esc(name)}</li>`;
}

const NAV = [
  { key: "work", label: "Work", href: "work.html", floor: "L3", color: "var(--violet)" },
  { key: "journey", label: "Journey", href: "journey.html", floor: "L2", color: "var(--amber)" },
  { key: "writing", label: "Writing", href: "writing.html", floor: "L4", color: "var(--white)" },
  { key: "about", label: "About", href: "about.html", floor: "RF", color: "var(--blue)" },
];

const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

function header(active?: string) {
  const items = NAV.map(
    (n) =>
      `<li><a href="${n.href}" style="--fc:${n.color}"${n.key === active ? ' aria-current="page"' : ""}><span class="fl">${n.floor}</span>${n.label}</a></li>`,
  ).join("");
  const mobile = NAV.map((n) => `<a href="${n.href}" style="--fc:${n.color}"${n.key === active ? ' aria-current="page"' : ""}>${n.label}</a>`).join("");
  return `<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="home.html"><span class="brand-mark" aria-hidden="true">KAW</span><span class="brand-name">${esc(C.profile.name)}<small>ShinyQ HQ · Page view</small></span></a>
    <nav aria-label="Main navigation"><ul class="nav">${items}</ul></nav>
    <div class="tools">
      <button class="icon-btn hide-sm" type="button"><span aria-hidden="true" style="font-family:var(--mono);color:var(--cyan)">&gt;_</span>Missions</button>
      <button class="icon-btn" type="button" aria-label="Search (⌘K)">${searchIcon}<kbd class="hide-sm">⌘K</kbd></button>
      <nav aria-label="Language" class="lang"><a href="#" aria-current="true">EN</a><a href="#">ID</a></nav>
    </div>
  </div>
  <nav aria-label="Main navigation (mobile)" class="mobile-nav">${mobile}</nav>
</header>`;
}

function footer() {
  const c = C.floors.roof.contact;
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="grid cols">
      <div class="c-1-5"><p class="ink" style="font-weight:600">${esc(C.profile.name)}</p><p class="small">${esc(tr(C.floors.roof.availability))}</p><a class="uline" href="mailto:${c.email}">${c.email}</a></div>
      <div style="grid-column:6 / span 3"><p class="data">Pages</p><ul class="stack-2"><li><a href="work.html">Work</a></li><li><a href="journey.html">Journey</a></li><li><a href="writing.html">Writing</a></li><li><a href="about.html">About</a></li><li><a href="#">Quick view</a></li><li><a href="#">CV</a></li></ul></div>
      <div style="grid-column:9 / span 4"><p class="data">Elsewhere</p><ul class="stack-2"><li><a href="#">LinkedIn ↗</a></li><li><a href="#">GitHub ↗</a></li><li><a href="#">Medium ↗</a></li><li><a href="#">Google Scholar ↗</a></li></ul></div>
    </div>
    <div class="base"><p class="small">${esc(M.footer.built)}</p><a class="small uline" href="#">${esc(M.footer.source)}</a></div>
  </div>
</footer>`;
}

const back3d = `<button class="back3d" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>Back to 3D<kbd>3</kbd></button>`;

function page(file: string, title: string, active: string | undefined, body: string, opts: { back3d?: boolean } = {}) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Page View mockup</title>
<link rel="stylesheet" href="pageview.css">
</head>
<body>
<!-- Mockup generated from content/site-content.json (real content, EN). Not shipped. -->
${header(active)}
<main id="main">
${body}
</main>
${footer()}
${opts.back3d ? back3d : ""}
</body>
</html>
`;
  writeFileSync(path.join(OUT, file), html);
}

function feature(p: any, size: "lead" | "pair") {
  const cover = p.assets?.[0];
  const res = p.results.slice(0, 2).map(splitMetric);
  return `<article class="feature ${size === "lead" ? "c-1-8" : ""}">
  ${cover ? `<div class="shot"><img src="${size === "lead" ? media(cover.src) : thumb(cover.src)}" alt="${esc(tr(cover.alt))}" loading="lazy"></div>` : ""}
  <p class="data row-flex"><span class="mark ${WING[p.wing]}">${p.wing === "ai" ? "AI" : "Software"}</span><span>${formatPeriod(p.period.start, p.period.end, L)}</span>${p.client ? `<span>${esc(p.client)}</span>` : ""}</p>
  <h3 class="h3 ${size === "lead" ? "h3-l" : ""}"><a class="stretched" href="case.html">${esc(tr(p.title))}</a></h3>
  <p class="tagline">${esc(tr(p.tagline))}</p>
  ${size === "lead" ? `<div class="outcomes">${res.map((r) => `<div><p class="num">${esc(r.value)}</p><p>${esc(r.label)}</p></div>`).join("")}</div>` : `<p class="small"><span class="num ink" style="font-size:20px">${esc(res[0].value)}</span> ${esc(res[0].label)}</p>`}
</article>`;
}

function indexRow(p: any) {
  const r = p.results[0];
  return `<li class="index-row">
  <div><p class="data row-flex" style="margin-bottom:8px"><span class="mark ${WING[p.wing]}">${p.wing === "ai" ? "AI" : "Software"}</span></p><h3 class="h3"><a href="case.html">${esc(tr(p.title))}</a></h3><p class="tagline">${esc(tr(p.tagline))}</p><div class="logos">${logos(p.stack)}</div></div>
  <p class="small">${p.client ? esc(p.client) : '<span style="color:var(--ink-3)">Internal / product</span>'}</p>
  <p class="data" style="padding-top:4px">${formatYearMonth(p.period.start, L)}</p>
  ${r ? `<div class="metric"><p class="num">${esc(r.value)}</p><p>${esc(tr(r.label))}</p></div>` : "<div></div>"}
</li>`;
}

function tlRow(e: any) {
  const logo = e.logo ? `<img src="${PUB}${e.logo.src ?? e.logo}" alt="" width="24" height="24">` : "";
  return `<li class="tl-row">
  <p class="data" style="padding-top:5px">${formatPeriod(e.start, e.end, L)}</p>
  <div><h3 class="h3"><a href="#">${esc(tr(e.role))}</a></h3><p class="org">${logo}${esc(e.org)}</p><p class="sum">${esc(tr(e.summary))}</p></div>
  <p class="data type" style="padding-top:5px"><span class="mark ${TYPE_COLOR[e.type]}">${esc(M.common.type[e.type])}</span></p>
</li>`;
}

// ---------- Home ----------
{
  const p = C.profile;
  const ai = sortedPods("ai").filter((x) => x.tier === "hero");
  const sw = sortedPods("software").filter((x) => x.tier === "hero");
  const latest = timeline.filter((e: any) => e.type === "job" || e.type === "freelance").slice(-4).reverse();
  const body = `
<section class="wrap hero grid" aria-labelledby="hero-title">
  <div class="c-1-9">
    <h1 id="hero-title" class="d-xl">${esc(p.name)}</h1>
    <div class="who stack-4">
      <p class="lead" style="font-weight:600">${esc(tr(p.headline))}. ${esc(tr(p.subheadline))}</p>
      <p class="body">${esc(tr(p.bio))}</p>
    </div>
  </div>
  <aside class="c-9-13 now card status" aria-label="Current status">
    <dl>
      <div><dt class="data">${esc(M.home.currentRole)}</dt><dd>${esc(tr(p.currentRole.title))}<span>${esc(p.currentRole.org)} · since ${formatYearMonth(p.currentRole.since, L)}</span></dd></div>
      <div><dt class="data">${esc(M.contact.location)}</dt><dd>${esc(tr(p.location))}<span>${esc(p.timezone)}</span></dd></div>
      <div><dt class="data">Open to</dt><dd>${esc(tr(C.floors.roof.availability))}</dd></div>
    </dl>
    <div class="actions"><a class="btn btn-primary" href="work.html">See the work</a><a class="btn btn-ghost" href="#">${esc(M.common.downloadCv)}</a></div>
  </aside>
</section>

<section class="wrap sec grid" id="stats" aria-labelledby="stats-title">
  <div class="c-1-5 sidehead"><h2 id="stats-title" class="h2">${esc(M.home.statsTitle)}</h2><p>Numbers from the dataset behind this site and the CV, with the context each one needs.</p></div>
  <ul class="c-5-13 ledger">${C.stats.map((s: any) => `<li><p class="num">${esc(s.value)}</p><p>${esc(tr(s.label))}</p></li>`).join("")}</ul>
</section>

<section class="wrap sec" id="work" aria-labelledby="work-title">
  <div class="grid" style="margin-bottom:40px;align-items:end"><h2 id="work-title" class="h2 c-1-8">Selected work</h2><p class="c-9-13" style="text-align:right"><a class="go" href="work.html">All ${pods.length} projects</a></p></div>
  <div class="work-lead">
    ${feature(ai[0], "lead")}
    <div class="c-8-13 pair">${feature(ai[1], "pair")}${feature(ai[2], "pair")}</div>
  </div>
  <ul class="index" style="margin-top:56px">${sw.map(indexRow).join("")}</ul>
</section>

<section class="wrap sec grid" id="journey" aria-labelledby="journey-title">
  <div class="c-1-5 sidehead"><h2 id="journey-title" class="h2">${esc(M.home.journeyTitle)}</h2><p>${esc(M.journey.intro)}</p><p class="more"><a class="go" href="journey.html">Full journey</a></p></div>
  <ul class="c-5-13">${latest.map(tlRow).join("")}</ul>
</section>

<section class="wrap sec grid" id="writing" aria-labelledby="writing-title">
  <div class="c-1-5 sidehead"><h2 id="writing-title" class="h2">Writing</h2><p>${esc(M.library.intro)}</p><p class="more"><a class="go" href="writing.html">All writing</a></p></div>
  <ul class="c-5-13">${posts.slice(0, 3).map(postRow).join("")}</ul>
</section>

<section class="wrap closing" aria-labelledby="closing-title">
  <h2 id="closing-title" class="statement">${esc(tr(C.floors.roof.availability))}</h2>
  <a class="mail" href="#">${C.floors.roof.contact.email}</a>
  <div class="row-flex" style="margin-top:28px"><a class="btn btn-ghost" href="about.html">About and contact</a><a class="btn btn-ghost" href="#">${esc(M.common.downloadCv)} (PDF)</a></div>
</section>`;
  page("home.html", "Home", undefined, body, { back3d: true });
}

function postRow(post: any) {
  return `<li class="post-row">
  <p class="data" style="padding-top:5px">${formatDate(post.date, L)}</p>
  <div><h3 class="h3"><a href="#">${esc(tr(post.title))}</a></h3><p class="small" style="margin-top:8px;max-width:62ch">${esc(tr(post.excerpt))}</p><p class="tags">${post.tags.slice(0, 4).map((t: string) => `<span>${esc(t)}</span>`).join("")}</p></div>
  <p class="data" style="padding-top:5px;text-align:right">${post.url ? "Medium ↗" : (post.languages ?? ["en"]).map((l: string) => l.toUpperCase()).join(" · ")}</p>
</li>`;
}

// ---------- Work index ----------
{
  const heroes = [...sortedPods("ai"), ...sortedPods("software")].filter((p) => p.tier === "hero");
  const rest = sortedPods().filter((p) => p.tier !== "hero");
  const stackCount = new Map<string, number>();
  for (const p of pods) for (const s of p.stack) stackCount.set(s, (stackCount.get(s) ?? 0) + 1);
  const top = [...stackCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const n = (w: string) => pods.filter((p) => p.wing === w).length;
  const leadGrid = heroes
    .map((p, i) => {
      const span = [7, 5, 5, 7, 7, 5][i] ?? 6;
      const cover = p.assets?.[0];
      const r = p.results.slice(0, 2).map(splitMetric);
      return `<article class="feature" style="grid-column:span ${span}">
  ${cover ? `<div class="shot"><img src="${thumb(cover.src)}" alt="${esc(tr(cover.alt))}"></div>` : `<div class="card" style="padding:24px"><p class="num" style="font-size:44px;line-height:1">${esc(r[0].value)}</p><p class="small" style="margin-top:8px">${esc(r[0].label)}</p></div>`}
  <p class="data row-flex"><span class="mark ${WING[p.wing]}">${p.wing === "ai" ? "AI" : "Software"}</span><span>${formatPeriod(p.period.start, p.period.end, L)}</span>${p.client ? `<span>${esc(p.client)}</span>` : ""}</p>
  <h3 class="h3 h3-l"><a class="stretched" href="case.html">${esc(tr(p.title))}</a></h3>
  <p class="tagline">${esc(tr(p.tagline))}</p>
  <div class="logos">${logos(p.stack, 9)}</div>
</article>`;
    })
    .join("");
  const body = `
<section class="wrap case-head grid" aria-labelledby="work-title">
  <div class="c-1-9"><p class="data"><span class="mark violet">L3 · Labs</span></p><h1 id="work-title" class="d-l" style="margin-top:20px">Work</h1><p class="lead" style="margin-top:24px">${esc(M.labs.intro)}</p></div>
  <dl class="c-9-13" style="align-self:end;display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card" style="padding:16px"><dt class="data"><span class="mark violet">AI</span></dt><dd class="num" style="font-size:36px;margin-top:8px">${n("ai")}</dd><dd class="small">${esc(M.labs.aiIntro)}</dd></div>
    <div class="card" style="padding:16px"><dt class="data"><span class="mark cyan">Software</span></dt><dd class="num" style="font-size:36px;margin-top:8px">${n("software")}</dd><dd class="small">${esc(M.labs.softwareIntro)}</dd></div>
  </dl>
</section>

<div class="wrap" style="margin-top:48px">
  <form class="glass filters" aria-label="Filter projects">
    <div class="grp" role="group" aria-label="Wing"><span class="data lbl">Wing</span>
      <button type="button" class="chip" aria-pressed="true">All <span class="count">${pods.length}</span></button>
      <button type="button" class="chip" aria-pressed="false">Software <span class="count">${n("software")}</span></button>
      <button type="button" class="chip" aria-pressed="false">AI <span class="count">${n("ai")}</span></button>
    </div>
    <span class="sep" aria-hidden="true"></span>
    <label class="grp"><span class="data lbl">Stack</span><select><option>Any stack</option>${top.map(([s, c]) => `<option>${esc(s)} (${c})</option>`).join("")}</select></label>
    <p class="data result" role="status">Showing ${pods.length} of ${pods.length}</p>
  </form>
</div>

<section class="wrap sec" style="padding-top:56px" aria-labelledby="lead-title">
  <h2 id="lead-title" class="h2" style="margin-bottom:32px">Key projects</h2>
  <div class="work-lead">${leadGrid}</div>
</section>

<section class="wrap sec" aria-labelledby="all-title">
  <div class="grid" style="margin-bottom:24px;align-items:end"><h2 id="all-title" class="h2 c-1-8">All projects</h2><p class="data c-9-13" style="text-align:right">${rest.length} more · newest first in each tier</p></div>
  <ul class="index">${rest.map(indexRow).join("")}</ul>
</section>`;
  page("work.html", "Work", "work", body);
}

// ---------- Case study ----------
{
  const p = pod("voice-ai-contact-center");
  const entry = p.timelineRef ? timeline.find((e: any) => e.id === p.timelineRef) : undefined;
  const sib = sortedPods("ai");
  const i = sib.findIndex((x) => x.slug === p.slug);
  const prev = sib[i - 1];
  const next = sib[i + 1];
  const conf = (c?: string) => (c ? `<span class="badge ${c === "verified" ? "ok" : c === "self-reported" ? "self" : "inf"}">${esc(M.common.confidence[c])}</span>` : "");
  const nodes = p.architecture?.nodes ?? [];
  const layers = new Map<string, any[]>();
  for (const nd of nodes) {
    const k = String(nd.layer ?? nd.kind ?? "service");
    layers.set(k, [...(layers.get(k) ?? []), nd]);
  }
  const archHtml = [...layers.entries()]
    .map(
      ([k, list]) =>
        `<div class="arch-layer"><p class="data">Layer ${Number(k) + 1}</p><div class="arch-nodes">${list.map((nd: any) => `<span class="node ${nd.kind ?? ""}"><b style="font-weight:600;color:var(--ink)">${esc(tr(nd.label ?? nd.id))}</b>${nd.sublabel ? `<br><span style="color:var(--ink-3)">${esc(tr(nd.sublabel))}</span>` : ""}</span>`).join("")}</div></div>`,
    )
    .join("");
  const body = `
<article>
<header class="wrap case-head">
  <a class="crumb" href="work.html">← Work</a>
  <div class="grid" style="margin-top:20px">
    <div class="c-1-9">
      <p class="data row-flex"><span class="mark violet">AI</span><span>${esc(M.common.tier[p.tier])}</span><span>L3:${p.slug}</span></p>
      <h1 class="d-l" style="margin-top:20px">${esc(tr(p.title))}</h1>
      <p class="lead" style="margin-top:24px">${esc(tr(p.tagline))}</p>
    </div>
  </div>
  <dl class="facts">
    <div><dt class="data">${esc(M.labs.role)}</dt><dd>${esc(tr(p.role))}</dd></div>
    <div><dt class="data">${esc(M.labs.period)}</dt><dd>${formatPeriod(p.period.start, p.period.end, L)}</dd></div>
    ${p.client ? `<div><dt class="data">${esc(M.labs.client)}</dt><dd>${esc(p.client)}</dd></div>` : ""}
  </dl>
  <section id="results" aria-label="${esc(M.labs.results)}"><ul class="results-ledger">${p.results
    .map((r: any) => `<li><p class="num">${esc(r.value)}</p><p>${esc(tr(r.label))}</p>${r.context ? `<p class="ctx">${esc(tr(r.context))}</p>` : ""}${conf(r.confidence)}</li>`)
    .join("")}</ul></section>
</header>

<div class="wrap grid case-body">
  <div class="c-1-9">
    <section class="chapter" id="problem" aria-labelledby="problem-t"><h2 id="problem-t" class="h2">${esc(M.labs.problem)}</h2><p class="lead" style="color:var(--ink-2)">${esc(tr(p.problem))}</p></section>
    <section class="chapter" id="approach" aria-labelledby="approach-t"><h2 id="approach-t" class="h2">${esc(M.labs.approach)}</h2><ol class="steps">${p.approach.map((s: any, k: number) => `<li><span>${String(k + 1).padStart(2, "0")}</span><span>${esc(tr(s))}</span></li>`).join("")}</ol></section>
    <section class="chapter" id="architecture" aria-labelledby="arch-t"><h2 id="arch-t" class="h2">${esc(M.labs.architecture)}</h2><div class="card arch"><div class="arch-layers">${archHtml}</div></div></section>
    <section class="chapter" id="gallery" aria-labelledby="gal-t"><h2 id="gal-t" class="h2">${esc(M.gallery.title)}</h2><ul class="gallery">${p.assets
      .slice(0, 5)
      .map((a: any, k: number) => `<figure><img src="${k === 0 ? media(a.src) : thumb(a.src)}" alt="${esc(tr(a.alt))}"></figure>`)
      .join("")}</ul><p class="data" style="margin-top:12px">${p.assets.length} images · click to open the viewer</p></section>
    <section class="chapter" id="stack" aria-labelledby="stack-t"><h2 id="stack-t" class="h2">${esc(M.common.stack)}</h2><ul class="row-flex" style="gap:8px">${p.stack.map(chip).join("")}</ul></section>
  </div>
  <aside class="c-9-13">
    <nav class="toc" aria-label="On this page">
      <p class="data" style="margin-bottom:12px">On this page</p>
      <a href="#results">${esc(M.labs.results)}</a><a href="#problem" aria-current="true">${esc(M.labs.problem)}</a><a href="#approach">${esc(M.labs.approach)}</a><a href="#architecture">${esc(M.labs.architecture)}</a><a href="#gallery">${esc(M.gallery.title)}</a><a href="#stack">${esc(M.common.stack)}</a>
      ${entry ? `<div class="aside-block"><p class="data"><span class="mark amber">L2 · ${esc(M.labs.timeline)}</span></p><a class="uline" style="border:0;padding:0;margin-top:10px;color:var(--ink)" href="#">${esc(tr(entry.role))} · ${esc(entry.org)}</a></div>` : ""}
    </nav>
  </aside>
</div>

<section class="wrap sec" aria-labelledby="rel-t">
  <h2 id="rel-t" class="h2" style="margin-bottom:24px">More AI work</h2>
  <nav class="related" aria-label="More AI work">
    ${prev ? `<a class="card" href="#"><p class="data">← ${esc(M.common.previous)}</p><p class="h3" style="margin-top:8px">${esc(tr(prev.title))}</p></a>` : "<span></span>"}
    ${next ? `<a class="card" href="#" style="text-align:right"><p class="data">${esc(M.common.next)} →</p><p class="h3" style="margin-top:8px">${esc(tr(next.title))}</p></a>` : ""}
  </nav>
</section>
</article>`;
  page("case.html", tr(p.title), "work", body);
}

// ---------- Journey ----------
{
  const FIRST = 2019;
  const groups = new Map<number, any[]>();
  for (const e of timeline) {
    const y = Math.max(FIRST, Number(e.start.slice(0, 4)));
    groups.set(y, [...(groups.get(y) ?? []), e]);
  }
  const years = [...groups.entries()].sort((a, b) => b[0] - a[0]);
  const counts = (t: string) => timeline.filter((e: any) => e.type === t).length;
  const types = ["job", "freelance", "education", "award", "milestone"];
  const side = C.sideProjects as any[];
  const repos = [...C.publicRepos].sort((a: any, b: any) => b.stars - a.stars).slice(0, 6);
  const body = `
<section class="wrap case-head grid" aria-labelledby="j-title">
  <div class="c-1-9"><p class="data"><span class="mark amber">L2 · Career Archive</span></p><h1 id="j-title" class="d-l" style="margin-top:20px">Journey</h1><p class="lead" style="margin-top:24px">${esc(M.journey.intro)}</p></div>
  <nav class="c-9-13" aria-label="${esc(M.journey.yearNav)}" style="align-self:end"><p class="data" style="margin-bottom:10px">Jump to</p><ul class="row-flex" style="gap:6px">${years.map(([y]) => `<li><a class="chip" href="#y${y}">${y}</a></li>`).join("")}<li><a class="chip" href="#workshop">${esc(M.journey.workshop)}</a></li></ul></nav>
</section>
<div class="wrap" style="margin-top:40px">
  <div class="glass filters" role="group" aria-label="Filter entries">
    <span class="data lbl">Show</span>
    <button type="button" class="chip" aria-pressed="true">All <span class="count">${timeline.length}</span></button>
    ${types.map((t) => `<button type="button" class="chip" aria-pressed="false"><span class="mark ${TYPE_COLOR[t]}"></span>${esc(M.common.type[t])} <span class="count">${counts(t)}</span></button>`).join("")}
  </div>
</div>
<ol class="wrap" aria-label="Timeline, newest first">
${years
  .map(
    ([y, list]) => `<li class="year-block" id="y${y}"><h2 class="yr">${y}<small class="data">${list.length} ${list.length === 1 ? "entry" : "entries"}</small></h2><ul class="rows">${[...list].reverse().map(tlRow).join("")}</ul></li>`,
  )
  .join("")}
</ol>
<section class="wrap sec grid" id="workshop" aria-labelledby="ws-t">
  <div class="c-1-5 sidehead"><h2 id="ws-t" class="h2">${esc(M.journey.workshop)}</h2><p>${esc(M.journey.workshopIntro)}</p></div>
  <div class="c-5-13">
    <ul>${side
      .slice(0, 5)
      .map(
        (s: any) => `<li class="tl-row" style="grid-template-columns:90px minmax(0,1fr)"><p class="data" style="padding-top:5px">${s.year ?? ""}</p><div><h3 class="h3">${esc(s.title)}</h3><p class="sum">${esc(tr(s.summary)).slice(0, 220)}…</p><div class="logos">${logos(s.stack ?? [])}</div></div></li>`,
      )
      .join("")}</ul>
    <h3 class="h3" style="margin:48px 0 16px">${esc(M.journey.repos)}</h3>
    <ul>${repos.map((r: any) => `<li class="channel"><span><span class="ink" style="font-family:var(--mono);font-size:14px">${esc(r.name)}</span><span class="small" style="display:block">${esc(tr(r.description))}</span></span><span class="data">★ ${r.stars} · ${esc(r.language ?? "")}</span></li>`).join("")}</ul>
  </div>
</section>`;
  page("journey.html", "Journey", "journey", body);
}

// ---------- Writing ----------
{
  const lib = C.floors.library;
  const research = lib.publications.filter((p: any) => ["paper", "thesis"].includes(p.kind));
  const models = lib.publications.filter((p: any) => !["paper", "thesis"].includes(p.kind));
  const lead = posts[0];
  const self = C.profile.name;
  const body = `
<section class="wrap case-head grid" aria-labelledby="w-title">
  <div class="c-1-9"><p class="data"><span class="mark white">L4 · Library</span></p><h1 id="w-title" class="d-l" style="margin-top:20px">Writing</h1><p class="lead" style="margin-top:24px">${esc(M.library.intro)}</p></div>
  <nav class="c-9-13" aria-label="Sections" style="align-self:end"><ul class="row-flex" style="gap:6px"><li><a class="chip" href="#posts">${esc(M.library.posts)} <span class="count">${posts.length}</span></a></li><li><a class="chip" href="#research">${esc(M.library.research)} <span class="count">${research.length}</span></a></li><li><a class="chip" href="#publications">Models <span class="count">${models.length}</span></a></li><li><a class="chip" href="#talks">Talks <span class="count">${lib.talks.length}</span></a></li></ul></nav>
</section>

<section class="wrap sec grid" id="posts" aria-labelledby="posts-t" style="padding-top:72px">
  <div class="c-1-5 sidehead"><h2 id="posts-t" class="h2">${esc(M.library.posts)}</h2><p>Hosted posts are bilingual; Medium posts open in a new tab.</p></div>
  <div class="c-5-13">
    <a class="card post-lead" href="#"><p class="data row-flex"><span>${formatDate(lead.date, L)}</span><span>EN · ID</span></p><h3 class="h3 h3-l" style="margin-top:14px">${esc(tr(lead.title))}</h3><p class="body" style="margin-top:12px">${esc(tr(lead.excerpt))}</p><p class="tags">${lead.tags.map((t: string) => `<span>${esc(t)}</span>`).join("")}</p><p class="go" style="margin-top:12px">Read the post</p></a>
    <ul style="margin-top:24px">${posts.slice(1).map(postRow).join("")}</ul>
  </div>
</section>

<section class="wrap sec grid" id="research" aria-labelledby="r-t">
  <div class="c-1-5 sidehead"><h2 id="r-t" class="h2">${esc(M.library.research)}</h2><p>${esc(M.library.researchIntro)}</p></div>
  <div class="c-5-13">
    <div class="metric-line"><div><p class="num">${lib.researchMetrics.citations}</p><p class="data" style="margin-top:6px">Citations</p></div><div><p class="num">${lib.researchMetrics.hIndex}</p><p class="data" style="margin-top:6px">h-index</p></div><p class="small" style="align-self:end">${esc(lib.researchMetrics.source)}, as of ${formatYearMonth(lib.researchMetrics.asOf, L)}</p></div>
    <ul>${research
      .map(
        (r: any) => `<li class="paper"><p class="data" style="padding-top:5px">${r.year}</p><div><h3 class="h3" style="font-size:19px">${esc(r.title)}</h3><p class="authors">${(r.authors ?? []).map((a: string) => (a === self ? `<b>${esc(a)}</b>` : esc(a))).join(", ")}</p><p class="small" style="margin-top:6px">${esc(r.venue ?? "")}</p></div><p class="data" style="padding-top:5px;text-align:right">${r.citations != null ? `${r.citations} cit.` : ""}${r.doi ? "<br>DOI ↗" : ""}</p></li>`,
      )
      .join("")}</ul>
  </div>
</section>

<section class="wrap sec grid" id="publications" aria-labelledby="m-t">
  <div class="c-1-5 sidehead"><h2 id="m-t" class="h2">${esc(M.library.publications)}</h2></div>
  <ul class="c-5-13">${models.map((r: any) => `<li class="paper"><p class="data" style="padding-top:5px">${r.year}</p><div><h3 class="h3" style="font-size:19px">${esc(r.title)}</h3><p class="small" style="margin-top:4px">${esc(M.library.kind[r.kind] ?? r.kind)}${r.venue ? ` · ${esc(r.venue)}` : ""}</p></div><p class="data" style="padding-top:5px;text-align:right">Open ↗</p></li>`).join("")}</ul>
</section>

<section class="wrap sec grid" id="talks" aria-labelledby="t-t">
  <div class="c-1-5 sidehead"><h2 id="t-t" class="h2">${esc(M.library.talks)}</h2></div>
  <ul class="c-5-13">${lib.talks.map((t: any) => `<li class="paper"><p class="data" style="padding-top:5px">${formatYearMonth(t.date, L)}</p><div><h3 class="h3" style="font-size:19px">${esc(tr(t.title))}</h3><p class="small" style="margin-top:4px">${esc(t.event)}</p></div><p class="data" style="padding-top:5px;text-align:right">${esc(M.library.role[t.role] ?? t.role)}</p></li>`).join("")}</ul>
</section>`;
  page("writing.html", "Writing", "writing", body);
}

// ---------- About ----------
{
  const p = C.profile;
  const c = C.floors.roof.contact;
  const channels = [
    ["LinkedIn", c.linkedin],
    ["GitHub", c.github],
    ["Hugging Face", c.huggingface],
    ["Medium", c.medium],
    ["Google Scholar", c.googleScholar],
    ["IEEE Xplore", c.ieeeXplore],
  ].filter(([, u]) => u);
  const body = `
<section class="wrap case-head grid" aria-labelledby="a-title">
  <div class="c-1-8"><p class="data"><span class="mark blue">RF · Roof</span></p><h1 id="a-title" class="d-l" style="margin-top:20px">About and contact</h1><p class="lead" style="margin-top:24px">${esc(tr(p.story)).split(". ").slice(0, 3).join(". ")}.</p><p class="body" style="margin-top:16px">${esc(tr(p.story)).split(". ").slice(3).join(". ")}</p></div>
  <aside class="c-9-13 card status" style="align-self:start;margin-top:48px" aria-labelledby="beacon">
    <h2 id="beacon" class="h3">${esc(tr(C.floors.roof.availability))}</h2>
    <a class="btn btn-primary btn-mail" style="margin-top:20px" href="mailto:${c.email}">${c.email}</a>
    <button class="btn btn-ghost" style="margin-top:8px;width:100%" type="button">${esc(M.common.copyEmail)}</button>
    <dl style="margin-top:20px"><div><dt class="data">${esc(M.contact.location)}</dt><dd>${esc(tr(p.location))}<span>${esc(p.timezone)}</span></dd></div></dl>
    <ul id="channels" style="margin-top:8px">${channels.map(([n, u]) => `<li><a class="channel" href="${u}"><span class="ink">${n} ↗</span><span class="url">${String(u).replace(/^https:\/\/(www\.)?/, "")}</span></a></li>`).join("")}</ul>
  </aside>
</section>

<section class="wrap sec grid" id="how" aria-labelledby="how-t">
  <div class="c-1-5 sidehead"><h2 id="how-t" class="h2">${esc(M.home.howTitle)}</h2><p>${esc(tr(p.howIWork))}</p></div>
  <ol class="c-5-13 principles">${p.principles.map((x: any) => `<li><h3 class="h3">${esc(tr(x.title))}</h3><p class="body">${esc(tr(x.text))}</p></li>`).join("")}</ol>
</section>

<section class="wrap sec grid" id="skills" aria-labelledby="sk-t">
  <div class="c-1-5 sidehead"><h2 id="sk-t" class="h2">Skills</h2></div>
  <div class="c-5-13">${C.skills.map((g: any) => `<div class="skill-group"><h3 class="data" style="padding-top:8px">${esc(tr(g.label))}</h3><ul>${g.items.map(chip).join("")}</ul></div>`).join("")}</div>
</section>

<section class="wrap sec grid" id="certifications" aria-labelledby="ce-t">
  <div class="c-1-5 sidehead"><h2 id="ce-t" class="h2">${esc(M.home.certsTitle)}</h2></div>
  <ul class="c-5-13">${C.certifications.map((x: any) => `<li class="cert"><p class="num" style="font-size:22px">${esc(x.code ?? "")}</p><div><p class="ink">${esc(x.name)}</p><p class="small">${esc(x.issuer)}${x.issued ? ` · ${formatYearMonth(x.issued, L)}` : ""}</p></div><p class="data" style="text-align:right">${x.status === "earned" ? `<a class="uline" href="#">${esc(M.common.verify)} ↗</a>` : esc(M.common.inProgress)}</p></li>`).join("")}</ul>
</section>

<section class="wrap sec grid" id="cv" aria-labelledby="cv-t">
  <div class="c-1-5 sidehead"><h2 id="cv-t" class="h2">CV</h2><p>${esc(M.contact.cvIntro)}</p></div>
  <div class="c-5-13 row-flex"><a class="btn btn-primary" href="#">${esc(M.common.downloadCv)} (EN, PDF)</a><a class="btn btn-ghost" href="#">${esc(M.common.downloadCv)} (ID, PDF)</a><a class="go" href="#">Read it as a page</a></div>
</section>`;
  page("about.html", "About and contact", "about", body);
}
console.log("ok");
