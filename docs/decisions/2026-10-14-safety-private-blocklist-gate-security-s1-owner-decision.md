# Safety

- Date: 2026-10-14
- PR: [#121](https://github.com/ShinyQ/ShinyQ-HQ/pull/121)

The private blocklist gate (security S1, owner decision 3): `scripts/scan-export.ts` fails main and deploy runs without private terms and warns on pull requests. Reversed on 2026-10-22: the whole blocklist mechanism was removed (`2026-10-22-safety-blocklist-removed.md`).
