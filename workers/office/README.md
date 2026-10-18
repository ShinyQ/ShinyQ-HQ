# hq-office: the Agent Office Worker

The backend of the L1 Agent Office (spec `docs/superpowers/specs/2026-10-18-agent-office-design.md`, rules
`docs/agents/office.md`). A Worker with one SQLite-backed Durable Object (`Office`) behind three Pages Functions:

| Route (site origin) | Worker route | Who calls it |
|---|---|---|
| `GET /api/office` | `GET /snapshot` | the 3D office and the Classic card (edge-cached 5 s per data center, ETag and 304) |
| `POST /api/office/beat` | `POST /beat` | `office-relay` on the owner's Mac (`X-Office-Signature`) |
| `POST /api/office/github` | `POST /github` | repository webhooks (`X-Hub-Signature-256`) |

The Worker has no route and no `workers.dev` URL; only the Pages service binding `OFFICE` reaches it.

## Configuration

- `wrangler.toml` here: the `OFFICE_DO` binding, the `v1` migration (`new_sqlite_classes`) and the `[vars]`:
  - `OFFICE_REPO_ALLOWLIST` (`ShinyQ/*`): repositories whose names, branches and titles may show (once a webhook
    reported them public);
  - `OFFICE_GITHUB_ACTORS` (`ShinyQ,Copilot`): GitHub logins whose same-repository pull requests count, besides
    authors with the OWNER, MEMBER or COLLABORATOR association.
- Deploy: `deploy.yml` job "hq-office Worker", after a successful Pages upload (the same gates as the upload); a
  commit without `workers/office/` skips it. Until the Worker first exists, `/api/office` answers mode "off".
  `rollback.yml` redeploys it from the rollback target when its sources differ (the secrets persist).
- Secrets (set by `deploy.yml` from the `production` environment's GitHub secrets of the same name):
  - `OFFICE_INGEST_KEY`: HMAC key of relay beats; the owner's Keychain holds the same value.
  - `GITHUB_WEBHOOK_SECRET`: the secret of every repository webhook.
- Root `wrangler.toml` (Pages): `[[services]] OFFICE = hq-office` and the kill switch `OFFICE_ENABLED`.

## What GitHub events count

- Pull requests only when the head branch is in the same repository (forks are ignored) and the sender is in
  `OFFICE_GITHUB_ACTORS` or the author association is OWNER, MEMBER or COLLABORATOR.
- Workflow runs only when `head_repository` is the same repository (runs from forks are ignored).
- A branch name with a blocklisted term drops the branch: a beat keeps only its repository, a workflow run or pull
  request on it is ignored, and so is a push to a blocked default branch.
- A `repository` event with action `privatized` removes the repository from the known-public set and strips its
  runs, pull requests, feed items and the repository data of its sessions.

## First setup (owner)

1. Generate two keys: `openssl rand -hex 32` twice.
2. GitHub, repository settings, Environments, `production`: add the secrets `OFFICE_INGEST_KEY` and
   `GITHUB_WEBHOOK_SECRET`. The next production deploy sets them on the Worker.
3. Keychain (Mac): `security add-generic-password -s hq-office-ingest -a office-relay -w <OFFICE_INGEST_KEY>`.
4. For each public repository to show (ShinyQ/ShinyQ-HQ first): Settings, Webhooks, Add webhook:
   - Payload URL `https://kurniadi.pages.dev/api/office/github`, content type `application/json`, secret
     `GITHUB_WEBHOOK_SECRET`, SSL verification on;
   - events: Workflow runs, Workflow jobs, Pull requests, Pushes, Deployment statuses, Repositories (the
     `privatized` action hides a repository that turns private).
   GitHub has no user-level webhooks; a GitHub App installed on all repositories (Actions read, Pull requests read,
   Contents read, Deployments read, Metadata read) is the alternative with one webhook.
5. Check: the webhook's Recent Deliveries shows `ping` with 204, and `curl -s https://kurniadi.pages.dev/api/office`
   shows `"mode":"semi-live"`.

## Operations

- Kill switch: set `OFFICE_ENABLED` to `"false"` in the root `wrangler.toml` and deploy; the site hides the office.
- Rotate a key: update the GitHub secret (and the Keychain item or the webhook secret), then redeploy (Actions,
  `deploy.yml`, Run workflow).
- Skip the Worker deploy and its rollback redeploy: repository variable `OFFICE_WORKER_DEPLOY = "false"` (for
  example while deploying by hand, from the repository root:
  `bun scripts/build-knowledge.ts && cd workers/office && bunx wrangler deploy`; the first step writes
  `functions/_generated/safety.json`, which the Worker bundles).
- Logs: Cloudflare dashboard, Workers, `hq-office`, Observability. The Worker logs no beat or webhook body.
- Free plan: Durable Object requests and Workers requests are 100,000 per day each; one row is written per accepted
  beat or webhook (100,000 per day). Spec section 7 has the estimates.
- Reset the office: none needed; sessions leave after 30 minutes without a beat and counters reset at 00:00 WIB.
