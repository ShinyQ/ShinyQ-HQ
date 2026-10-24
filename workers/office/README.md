# hq-office: the Agent Office Worker

The backend of the L1 Agent Office (spec `docs/superpowers/specs/2026-10-18-agent-office-design.md`, rules
`docs/agents/office.md`). A Worker with one SQLite-backed Durable Object (`Office`) behind the Pages Functions:

| Route (site origin) | Worker route | Who calls it |
|---|---|---|
| `GET /api/office` | `GET /snapshot` | snapshot v1 (five desks plus `extra`): clients cached from before v2 (edge-cached 5 s per data center, ETag and 304) |
| `GET /api/office?v=2` | `GET /snapshot?v=2` | snapshot v2 (v1 plus desk `helpers`, five desks plus `extra`): clients cached from before v3 (its own cache key, same headers) |
| `GET /api/office?v=3` | `GET /snapshot?v=3` | snapshot v3 (v2 with up to ten desks, slots 0 to 9): the Classic card and the L1 beacon's watch (its own cache key, same headers) |
| `GET /api/office?v=4` | `GET /snapshot?v=4` | snapshot v4 (v3 plus `pipeline`: the 3 newest runs with their job lanes, the latest merges and production deploys): the 3D office (its own cache key, same headers) |
| `GET /api/office/history` | `GET /history` | the day replay's 8-day index: `{ v: 1, days }` with the counts of each WIB day, newest first (edge-cached 30 s, ETag and 304) |
| `GET /api/office/history?day=YYYY-MM-DD` | `GET /history?day=` | one WIB day of the window (`OfficeHistoryV1`: events, merges, finished runs, deploys), cleaned again at read time; today edge-cached 30 s, past days 1 h; a day outside the window is a 404, any other query a 404 that never reaches the Durable Object |
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
  `workers/office/` or the repository variable `OFFICE_WORKER_DEPLOY = "false"` skips it. A failed Worker step does not stop the upload; the step "hq-office Worker deploy
  failed" then turns the job red. `office-worker.yml` bundles it (`wrangler deploy --dry-run`, no secrets) on pull
  requests that touch `workers/office/`, `src/lib/office/` or `functions/_lib/security.ts` (not a required check).
  `rollback.yml` redeploys it from the rollback target when its sources differ (the secrets persist).
- Snapshot versions: v1 (`GET /snapshot`) never changes; v2 is only exactly `?v=2`, v3 only exactly `?v=3` and v4 only
  exactly `?v=4` (the Worker forwards no other query, and the Function, the Worker and the Durable Object answer v1
  for no query, `?v=5` or junk). v4 is `viewV3` plus `pipelineOf`: a run keeps its laned job ids (`order`, at most 24,
  later jobs folding into the last lane), their names (`names`, cut to 40 characters) and when this attempt was first
  seen (`started`); runs stored before v4 read without them. Rolled back to before v4, the Worker answers v1 to `?v=4`
  (the Function and the scene read it as v4 with an empty pipeline). Ten seats (`assignSlots`, the front row, slots 0 to 4, filling first): v1 and v2 list the front row's five
  desks and count the back row (slots 5 to 9) in `extra`, never a slot above 4; v3 lists all ten. Rolled back to
  before v2, the Worker rejects beats that carry `helpers` (the relay omits it at 0), so sessions with helpers go
  missing until the roll forward; v2 clients then get that Worker's v1 body (the Function and the client parsers
  read it as v2 without helpers). Rolled back to before v3, it answers v1 to `?v=3` (read as v3) and reads the stored
  document as before: a session record keeps a front-row seat (0 to 4) in `slot` and a back-row seat (5 to 9) only in
  `seat` (the seat is `slot ?? seat`; a set `slot` wins and clears `seat`), so the old Worker sees back-row sessions
  as waiting, counts them in `extra` and seats them on a free front desk at the next beat; its snapshots stay valid
  (never mode off). On load the Durable Object moves a back-row seat still stored in `slot` to `seat` and writes the
  document once.
- Replay log: beside the `doc` row the Durable Object keeps one row per WIB day, `log:YYYY-MM-DD` (at most 8), built by diffing the document over every accepted beat or webhook (`logDoc` in `src/history.ts`) and written in the same `put`. It holds, per day, the session hashes (`keys`, never served), each session's agent, its public task (repository and title, allowlisted repositories only), events `[t, ordinal, seat, state, activity, until, helpers]`, merges, finished runs and production deploys; never a branch, prompt text or session hash in served output. Caps per day: 200 sessions, 3,000 events, 200 merges, 500 runs, 50 deploys and 120 KB (past one the row says `truncated`). The first write of a new WIB day starts the row with a carry-in event for each live session, closes the previous row and deletes rows older than the window. A `privatized` repository is scrubbed from every stored row in the same write. The served day is cleaned again in the Worker (`cleanHistory`: the repository allowlist and `cleanTitle`). Free-plan estimates (a busy day writes under about 10,000 rows of 100,000) are in `docs/agents/office.md`. Rolled back to before the replay, the Worker answers 404 to `/history` (the Function then answers the index 503, a day request the fixed 404, and the drawer says "Replay unavailable"); the stored rows wait untouched until a later roll forward prunes those outside the window.
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
- Titles go through `cleanTitle` (one clean line, cut to the cap); the repository allowlist is the privacy boundary
  (client names are kept out by review, with no automated blocklist).
- A `repository` event with action `privatized` or `deleted`, or `renamed` / `transferred` away (the old name),
  removes that name from the known-public set, strips its runs, pull requests, feed items and the repository data of
  its sessions, and records it in `revoked`: a stale public-looking delivery cannot bring it back; only `publicized`
  or a webhook `ping` can (security audit 2026-10-24).
- Deployment statuses only when `deployment.ref` is the default branch (a fork pull request job is ignored).

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
  `cd workers/office && bunx wrangler deploy`).
- Logs: Cloudflare dashboard, Workers, `hq-office`, Observability. The Worker logs no beat or webhook body.
- Free plan: Durable Object requests and Workers requests are 100,000 per day each; one row is written per accepted
  beat or webhook plus a log row per loggable change (100,000 rows per day; a busy day stays under about 10,000). Spec section 7 has the estimates.
- Reset the office: none needed; sessions leave after 30 minutes without a beat and counters reset at 00:00 WIB.
