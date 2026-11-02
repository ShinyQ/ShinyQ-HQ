# Deploy

- Date: 2026-11-02

Owner decision: the site's main address is `shinyq.my.id`, not `kurniadi.my.id`, which is not the owner's domain. This replaces the domain of the 2026-10-31 decision; the rest of it stands (`kurniadi.pages.dev` redirects to the main address last, `kurniadi.dev` stays blocked in Indonesia, the cutover order of `docs/deploy.md` section 7b). The zone on Cloudflare, its nameservers and the Pages custom domain were already in place, so the host lists move to `shinyq.my.id`: the Ask, RUM and visit origins, the Turnstile widget, the stats Worker's Web Analytics hosts and the Ask link origins. No list names a `www` host: it has no record, and if one is added later a zone redirect sends it to the apex.
