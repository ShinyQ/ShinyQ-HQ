# Deploy

- Date: 2026-10-31

Owner decision: `kurniadi.my.id` becomes the site's main address and `kurniadi.pages.dev` redirects to it (a 308 Bulk Redirect on the exact host, so previews keep working), because `kurniadi.dev` stays on Indonesia's TrustPositif blocklist. The cutover runs in order (`docs/deploy.md` section 7b): the zone on Cloudflare with the apex and `www` pointed at the Pages project and the mail records kept as they were, the owner's nameserver change at the registrar, the Pages custom domains and the Turnstile, origin and stats host lists, a check that the new host serves the site, Ask and visits, then `SITE_URL` and a redeploy, the webhook and relay endpoints, and the redirect last.
