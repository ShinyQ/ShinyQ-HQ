# HUD modals

- Date: 2026-10-11
- PR: [#43](https://github.com/ShinyQ/ShinyQ-HQ/pull/43)

Paper, credential and post previews use in-site modals with no third-party iframes (credential, Medium and IEEE pages refuse framing or are paywalled); the CSP keeps `frame-src 'self'`.
