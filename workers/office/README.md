# hq-office: the Agent Office Worker

The backend of the L1 Agent Office (spec `docs/superpowers/specs/2026-10-18-agent-office-design.md`, rules
`docs/agents/office.md`). A Worker with one SQLite-backed Durable Object (`Office`) behind three Pages Functions:

| Route (site origin) | Worker route | Who calls it |
|---|---|---|
| `GET /api/office` | `GET /snapshot` | snapshot v1: the L1 beacon's watch (edge-cached 5 s per data center, ETag and 304) |
| `GET /api/office?v=2` | `GET /snapshot?v=2` | snapshot v2 (v1 plus desk `helpers`): the 3D office and the Classic card (its own cache key, same headers) |
| `POST /api/office/beat` | `POST /beat` | `office-relay` on the owner's Mac (`X-Office-Signature`) |
| `POST /api/office/github` | `POST /github` | repository webhooks (`X-Hub-Signature-256`) |

The Worker has no route and no `workers.dev` URL; only the Pages service binding `OFFICE` reaches it.

## Configuration

- `wrangler.toml` here: the `OFFICE_DO` binding, the `v1` migration (`new_sqlite_classes`) and the `[vars]`:
  - `OFFICE_REPO_ALLOWLIST` (`ShinyQ/*`): repositories whose names, branches and titles may show (once a webhook
    reported them public);
  - `OFFICE_GITHUB_ACTORS` (`ShinyQ,Copilot`): GitHub logins whose same-repository pull requests count, besides
    authors with the OWNER, MEMBER or COLLABORATOR association.
- Deploy: `deploy.yml`, inside the Pages job ("Cloudflare Pages production"), after the gates and before the upload,
  because Pages rejects a deploy whose service binding `OFFICE` names a missing Worker; a commit without
  `workers/office/` skips it. A failed Worker step does not stop the upload; the step "hq-office Worker deploy
  failed" then turns the job red.
  `rollback.yml` redeploys it from the rollback target when its sources differ (the secrets persist).
- Snapshot versions: v1 (`GET /snapshot`) never changes; v2 is only exactly `?v=2` (the Worker forwards no other
  query, and the Function, the Worker and the Durable Object answer v1 for no query, `?v=3` or junk). Rolled back to
  before v2, the Worker rejects beats that carry `helpers` (the relay omits it at 0), so sessions with helpers go
  missing until the roll forward; v2 clients then get that Worker's v1 body (the Function and the client parsers
  read it as v2 without helpers).
- Secrets (set by `deploy.yml` from the `production` environment's GitHub secrets):
  - `OFFICE_INGEST_KEY` (GitHub secret `OFFICE_INGEST_KEY`): HMAC key of relay beats; the owner's Keychain holds the
    same value.
  - `GITHUB_WEBHOOK_SECRET` (GitHub secret `OFFICE_GITHUB_WEBHOOK_SECRET`, because GitHub rejects secret names that
    start with `GITHUB_`): the secret of every repository webhook.
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
   `OFFICE_GITHUB_WEBHOOK_SECRET`. The next production deploy sets them on the Worker (the second as
   `GITHUB_WEBHOOK_SECRET`).
3. Keychain (Mac): `security add-generic-password -s hq-office-ingest -a office-relay -w <OFFICE_INGEST_KEY>`.
4. For each public repository to show (ShinyQ/ShinyQ-HQ first): Settings, Webhooks, Add webhook:
   - Payload URL `https://kurniadi.pages.dev/api/office/github`, content type `application/json`, secret
     the `OFFICE_GITHUB_WEBHOOK_SECRET` value, SSL verification on;
   - events: Workflow runs, Workflow jobs, Pull requests, Pushes, Deployment statuses, Repositories (the
     `privatized` action hides a repository that turns private).
   GitHub has no user-level webhooks; a GitHub App installed on all repositories (Actions read, Pull requests read,
   Contents read, Deployments read, Metadata read) is the alternative with one webhook.
5. Check: the webhook's Recent Deliveries shows `ping` with 204, and `curl -s https://kurniadi.pages.dev/api/office`
   shows `"mode":"semi-live"`.

## Operations

- Kill switch: set `OFFICE_ENABLED` to `"false"` in the root `wrangler.toml` and deploy; the site hides the office.
- Rotate a key: update the GitHub secret (and the Keychain item or the webhook secret), then redeploy (Actions,
  `deploy.yml`, Run workflow on `main`). There is no secrets-only refresh: the run rebuilds and redeploys everything
  with the gates.
- Skip the Worker steps inside the Pages job and its rollback redeploy: repository variable
  `OFFICE_WORKER_DEPLOY = "false"` (for
  example while deploying by hand, from the repository root:
  `bun scripts/build-knowledge.ts && cd workers/office && bunx wrangler deploy`; the first step writes
  `functions/_generated/safety.json`, which the Worker bundles).
- Logs: Cloudflare dashboard, Workers, `hq-office`, Observability. The Worker logs no beat or webhook body.
- Free plan: Durable Object requests and Workers requests are 100,000 per day each; one row is written per accepted
  beat or webhook (100,000 per day). Spec section 7 has the estimates.
- Reset the office: none needed; sessions leave after 30 minutes without a beat and counters reset at 00:00 WIB.
