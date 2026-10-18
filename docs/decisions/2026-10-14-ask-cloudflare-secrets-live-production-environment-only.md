# Ask

- Date: 2026-10-14
- PR: [#130](https://github.com/ShinyQ/ShinyQ-HQ/pull/130)

Cloudflare secrets live in the `production` environment, only jobs that declare it read them, and PR runs never receive one (security S3, H1, owner decision 4).
