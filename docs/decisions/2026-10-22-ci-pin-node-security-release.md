# CI

- Date: 2026-10-22
- PR: [#282](https://github.com/ShinyQ/ShinyQ-HQ/pull/282)

Node is pinned to 24.22.1 everywhere it runs (owner request "Urgent there is cve related to node update all now"): the 2026-10-21 Node.js security release fixes 10 CVEs (Brotli decoder out-of-bounds write, TLS hostname verification bypasses, DNS, HTTP, permission model). `.nvmrc` and `.node-version` hold the version, `engines.node` requires at least it, and every CI job that runs Node sets it up with `actions/setup-node` instead of the runner's preinstalled Node. Bun moves from 1.4.1 to 1.4.3 for its TLS verification hardening (CVE-2026-48618). Production runs on workerd, so the exposure was CI, builds, scripts and local dev. Next.js stays on 16.4.1 (fixes CVE-2026-96889, GHSA-673q-mjm6-r5xr and GHSA-p3m5-59mp-jv5r) and sharp on 0.35.5. The one high `bun audit` advisory left, braces 3.0.3 (GHSA-vfj7-8cjw-p6xm, through eslint-config-next to micromatch), has no patched release; it is dev-only lint tooling that never sees untrusted patterns.
