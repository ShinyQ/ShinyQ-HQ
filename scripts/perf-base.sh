#!/usr/bin/env bash
# Downloads artifact $1 of the newest successful run of workflow $3 (default ci.yml) on main into $2,
# optionally only runs of event $4 (for example push or schedule). Used for the "vs main" columns of
# the perf summaries. Never fails: without a baseline the summary just has no main column.
# Needs REPO (owner/name) and GH_TOKEN (actions: read).
set -u
artifact="$1"
dest="$2"
workflow="${3:-ci.yml}"
event="${4:-}"
args=(run list --repo "$REPO" --workflow "$workflow" --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty')
if [ -n "$event" ]; then args+=(--event "$event"); fi
run_id=$(gh "${args[@]}" 2>/dev/null || true)
if [ -z "$run_id" ]; then
  echo "No successful $workflow run on main: no baseline for $artifact."
  exit 0
fi
if gh run download "$run_id" --repo "$REPO" -n "$artifact" -D "$dest" >/dev/null 2>&1; then
  echo "Baseline: $artifact from run $run_id."
else
  echo "Run $run_id has no $artifact artifact: no baseline."
fi
exit 0
